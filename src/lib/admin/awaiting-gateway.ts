/** Online checkout saved before the shopper pays at Wompi/Addi/PayPal: not a real order until paid. */
export function isAwaitingGateway(o: { status?: string | null; payment_status?: string | null; is_manual?: boolean | null; source?: string | null; payment_method?: string | null; paid_at?: string | null }) {
  if (o.is_manual || o.source !== "ecom" || o.paid_at) return false;
  if (o.status !== "reserved" || o.payment_status !== "pending") return false;
  const m = String(o.payment_method ?? "").toLowerCase();
  return !m.startsWith("transfer") && !m.startsWith("link_");
}

export const AWAITING_KEY = "esperando_pago";
