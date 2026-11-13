import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RefundResult = { status: "refunded" | "refund_pending" | "none"; message: string; refundId?: string };

/**
 * Cancela un pedido y, si se pide, devuelve el dinero por la pasarela original.
 * PayPal y tarjetas de Wompi se devuelven automáticamente; el resto queda como
 * «Devolución pendiente» para hacerla a mano.
 */
export const cancelOrderWithRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid(), refund: z.boolean() }).parse(d))
  .handler(async ({ data, context }): Promise<RefundResult> => {
    const { data: staff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!staff) throw new Error("No autorizado");
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");

    const { data: order } = await db
      .from("orders")
      .select("id, status, payment_method, payment_reference, payment_status, notes")
      .eq("id", data.orderId)
      .maybeSingle();
    if (!order) throw new Error("Pedido no encontrado");

    let result: RefundResult = { status: "none", message: "Pedido cancelado sin devolución" };
    if (data.refund && order.payment_status === "paid") {
      result = await tryRefund(db, order.payment_method ?? "", order.payment_reference ?? "");
    }

    const patch: Record<string, unknown> = { status: "cancelled" };
    if (result.status !== "none") {
      patch.payment_status = result.status;
      const line = result.status === "refunded"
        ? `Dinero devuelto automáticamente (${result.refundId ?? "sin id"})`
        : `Devolución pendiente: ${result.message}`;
      patch.notes = [order.notes, line].filter(Boolean).join("\n");
    }
    const { error } = await db.from("orders").update(patch as never).eq("id", order.id);
    if (error) throw new Error("No se pudo cancelar el pedido");
    return result;
  });

async function secret(db: any, key: string) {
  const { readSecret } = await import("../secrets.server");
  return readSecret(db, key);
}

async function tryRefund(db: any, method: string, reference: string): Promise<RefundResult> {
  const pending = (message: string): RefundResult => ({ status: "refund_pending", message });
  const { data: attempt } = reference
    ? await db.from("payment_attempts").select("provider, external_id, payload, status").eq("reference", reference).maybeSingle()
    : { data: null };
  const provider = String(attempt?.provider ?? method).toLowerCase();
  const { data: setting } = await db.from("app_settings").select("value").eq("key", "payment_settings").maybeSingle();
  const settings = (setting?.value ?? {}) as any;

  try {
    if (provider === "wompi") {
      const payload = attempt?.payload as any;
      const type = String(payload?.data?.payment_method_type ?? "");
      if (type !== "CARD" || !attempt?.external_id) return pending("Wompi solo devuelve automáticamente pagos con tarjeta; hazla desde el panel de Wompi.");
      const base = settings?.wompi?.mode === "live" ? "https://production.wompi.co" : "https://sandbox.wompi.co";
      const key = await secret(db, "wompi_private_key");
      const res = await fetch(`${base}/v1/transactions/${encodeURIComponent(attempt.external_id)}/void`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) return pending(`Wompi rechazó la anulación (${json?.error?.reason ?? res.status}); hazla desde el panel de Wompi.`);
      return { status: "refunded", message: "Dinero devuelto por Wompi", refundId: String(json?.data?.transaction?.id ?? attempt.external_id) };
    }
    if (provider === "paypal") {
      const captureId = (attempt?.payload as any)?.purchase_units?.[0]?.payments?.captures?.[0]?.id;
      if (!captureId) return pending("No se encontró el cobro de PayPal; hazla desde el panel de PayPal.");
      const base = settings?.paypal?.mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
      const clientId = String(settings?.paypal?.clientId ?? "").trim();
      const sec = await secret(db, "paypal_client_secret");
      const tok = await fetch(`${base}/v1/oauth2/token`, {
        method: "POST",
        headers: { Authorization: `Basic ${btoa(`${clientId}:${sec}`)}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=client_credentials",
      });
      const { access_token } = (await tok.json()) as { access_token?: string };
      if (!access_token) return pending("No se pudo conectar con PayPal; hazla desde el panel de PayPal.");
      const res = await fetch(`${base}/v2/payments/captures/${encodeURIComponent(captureId)}/refund`, {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
        body: "{}",
      });
      const json = (await res.json().catch(() => ({}))) as any;
      if (!res.ok) return pending(`PayPal rechazó la devolución (${json?.details?.[0]?.issue ?? res.status}).`);
      return { status: "refunded", message: "Dinero devuelto por PayPal", refundId: String(json?.id ?? "") };
    }
    if (provider === "addi") return pending("Addi aún no tiene devolución automática habilitada; solicítala a Addi.");
    return pending("Este medio de pago no se devuelve automáticamente; haz la devolución a mano.");
  } catch {
    return pending("Error de conexión con la pasarela; haz la devolución a mano.");
  }
}
