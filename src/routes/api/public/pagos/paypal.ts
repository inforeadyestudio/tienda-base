import { createFileRoute } from "@tanstack/react-router";

/** Retorno de PayPal: captura la orden en el servidor y marca el intento como pagado. */
export const Route = createFileRoute("/api/public/pagos/paypal")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request) {
  const url = new URL(request.url);
  const reference = url.searchParams.get("ref") ?? "";
  const token = url.searchParams.get("token") ?? "";
  const back = (state: string) => Response.redirect(`${url.origin}/pago-retorno?estado=${state}${reference ? `&ref=${encodeURIComponent(reference)}` : ""}`, 303);
  if (!reference || !token) return back("error");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: attempt } = await supabaseAdmin
    .from("payment_attempts")
    .select("amount, status")
    .eq("reference", reference)
    .maybeSingle();
  if (!attempt) return back("error");
  if (attempt.status === "paid") return back("ok");
  if (attempt.status !== "pending") return back("error");

  const [{ data: setting }, { data: secretRow }] = await Promise.all([
    supabaseAdmin.from("app_settings").select("value").eq("key", "payment_settings").maybeSingle(),
    supabaseAdmin.from("integration_secrets").select("value").eq("key", "paypal_client_secret").maybeSingle(),
  ]);
  const paypal = ((setting?.value ?? {}) as { paypal?: { mode?: string; clientId?: string } }).paypal ?? {};
  const base = paypal.mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
  const clientId = String(paypal.clientId ?? "").trim();
  const { envSecret } = await import("@/lib/secrets.server");
  const secret = envSecret("paypal_client_secret") || String(secretRow?.value ?? "").trim();

  let paid = false;
  let payload: unknown = { token };
  if (clientId && secret) {
    try {
      const tokenResponse = await fetch(`${base}/v1/oauth2/token`, {
        method: "POST",
        headers: { Authorization: `Basic ${btoa(`${clientId}:${secret}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      });
      const tokenJson = (await tokenResponse.json()) as { access_token?: string };
      if (tokenJson.access_token) {
        const capture = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(token)}/capture`, {
          method: "POST",
          headers: { Authorization: `Bearer ${tokenJson.access_token}`, "Content-Type": "application/json" },
        });
        const json = (await capture.json()) as any;
        payload = json;
        const amount = Number(json?.purchase_units?.[0]?.payments?.captures?.[0]?.amount?.value ?? 0);
        paid = capture.ok && String(json?.status ?? "") === "COMPLETED" && Math.abs(amount - Number(attempt.amount)) <= 0.05;
      }
    } catch {
      paid = false;
    }
  }

  // Solo PayPal decide el resultado; una visita sin captura válida no cambia nada.
  if (paid) {
    await supabaseAdmin
      .from("payment_attempts")
      .update({ status: "paid", external_id: token, payload: payload as never })
      .eq("reference", reference)
      .eq("status", "pending");
  }

  if (paid) {
    // Crea el pedido aquí mismo; no depende de que la clienta vuelva a la pestaña original.
    try { const { finalizePaidAttempt } = await import("@/lib/checkout/guest-order.server"); await finalizePaidAttempt(reference); }
    catch (e) { console.error("No se pudo crear el pedido tras PayPal", reference, e); }
  }
  return back(paid ? "ok" : "error");
}
