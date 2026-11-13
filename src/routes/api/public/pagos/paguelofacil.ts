import { createFileRoute } from "@tanstack/react-router";

/** Retorno de Páguelo Fácil: verifica la operación en el servidor y marca el intento como pagado. */
export const Route = createFileRoute("/api/public/pagos/paguelofacil")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});

async function readParams(request: Request) {
  const url = new URL(request.url);
  const params = new URLSearchParams(url.search);
  if (request.method === "POST") {
    const text = await request.text();
    new URLSearchParams(text).forEach((value, key) => params.set(key, value));
  }
  return { params, origin: url.origin };
}

async function handle(request: Request) {
  const { params, origin } = await readParams(request);
  const reference = params.get("PARM_1") ?? params.get("parm_1") ?? "";
  const oper = params.get("Oper") ?? params.get("codOper") ?? "";
  const back = (state: string) => Response.redirect(`${origin}/pago-retorno?estado=${state}${reference ? `&ref=${encodeURIComponent(reference)}` : ""}`, 303);
  if (!reference) return back("error");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: attempt } = await supabaseAdmin
    .from("payment_attempts")
    .select("reference, amount, status")
    .eq("reference", reference)
    .maybeSingle();
  if (!attempt) return back("error");
  if (attempt.status === "paid") return back("ok");
  if (attempt.status !== "pending") return back("error");

  const [{ data: secret }, { data: setting }] = await Promise.all([
    supabaseAdmin.from("integration_secrets").select("value").eq("key", "paguelofacil_token").maybeSingle(),
    supabaseAdmin.from("app_settings").select("value").eq("key", "international_settings").maybeSingle(),
  ]);
  const live = ((setting?.value ?? {}) as { paguelofacil?: { mode?: string } }).paguelofacil?.mode === "live";
  const base = live ? "https://secure.paguelofacil.com" : "https://sandbox.paguelofacil.com";
  const token = String(secret?.value ?? "").trim();

  let paid = false;
  let payload: unknown = Object.fromEntries(params.entries());
  if (token && oper) {
    try {
      const response = await fetch(`${base}/rest/transaction/status/${encodeURIComponent(oper)}`, {
        headers: { Authorization: token },
      });
      const json = (await response.json()) as any;
      payload = json;
      const data = json?.data ?? json;
      const amount = Number(data?.totalPay ?? data?.total ?? data?.amount ?? 0);
      const approved = String(data?.status ?? data?.estado ?? "").toLowerCase().includes("approved");
      // La operación debe pertenecer a este intento de pago.
      const opRef = String(data?.parm_1 ?? data?.PARM_1 ?? data?.reference ?? data?.customFieldValues?.[0]?.value ?? "");
      paid = response.ok && approved && opRef === reference && Math.abs(amount - Number(attempt.amount)) <= 0.05;
    } catch {
      paid = false;
    }
  }

  // Solo una operación verificada cambia el intento; nunca se marca como fallido desde una visita.
  if (paid) {
    await supabaseAdmin
      .from("payment_attempts")
      .update({ status: "paid", external_id: oper || null, payload: payload as never })
      .eq("reference", reference)
      .eq("status", "pending");
  }

  if (paid) {
    try {
      const { finalizePaidAttempt } = await import("@/lib/checkout/guest-order.server");
      await finalizePaidAttempt(reference);
    } catch (error) { console.error("No se pudo confirmar el pedido de Páguelo Fácil", reference, error); }
  }
  return back(paid ? "ok" : "error");
}
