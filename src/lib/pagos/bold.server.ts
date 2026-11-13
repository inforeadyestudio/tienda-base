import { boldAmountMatches, boldEventSchema } from "./bold";

/** No browser callback can change a payment state. Only verified provider data enters here. */
export async function applyBoldEvent(db: any, input: unknown) {
  const event = boldEventSchema.parse(input);
  const reference = event.data.metadata.reference;
  const { data: attempt, error } = await db.from("payment_attempts").select("provider,status,amount,currency").eq("reference", reference).maybeSingle();
  if (error) throw new Error("No pudimos consultar el pago");
  if (!attempt || attempt.provider !== "bold") return;
  if (attempt.status !== "paid") {
    // USD can settle as COP. Never compare that COP total to our own exchange rate.
    // A converted total without authenticated original USD evidence stays pending for reconciliation.
    if (event.type !== "SALE_APPROVED" || !boldAmountMatches(Number(attempt.amount), attempt.currency, event.data.amount.total, event.data.amount.currency)) {
      await db.from("payment_attempts").update({ payload: event as never }).eq("reference", reference).eq("status", "pending");
      return;
    }
    const { error: updateError } = await db.from("payment_attempts").update({ status: "paid", external_id: event.data.payment_id, payload: event as never }).eq("reference", reference).eq("provider", "bold").eq("status", "pending");
    if (updateError) throw new Error("No pudimos confirmar el pago");
  }
  const { finalizePaidAttempt } = await import("../checkout/guest-order.server");
  await finalizePaidAttempt(reference);
}

/** Active query is a recovery path; missing transactions or ambiguous data remain pending. */
export async function reconcileBoldPayment(db: any, reference: string, apiKey: string) {
  if (!apiKey) return;
  const { data: attempt, error } = await db.from("payment_attempts").select("provider,status,amount,currency,updated_at,payload").eq("reference", reference).maybeSingle();
  if (error) throw error;
  if (!attempt || attempt.provider !== "bold" || attempt.status !== "pending") return;
  if (Date.now() - new Date(attempt.updated_at).getTime() < 15_000) return;
  const response = await fetch(`https://payments.api.bold.co/v2/payment-voucher/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `x-api-key ${apiKey}` }, signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) return;
  const voucher = await response.json() as Record<string, unknown>;
  if (voucher.reference_id !== reference || voucher.payment_status !== "APPROVED" || typeof voucher.transaction_id !== "string") return;
  // The documented voucher examples omit currency. That is safe for COP-only attempts,
  // not for a USD sale converted to COP: require an explicit original currency there.
  const currency = typeof voucher.currency === "string" ? voucher.currency : attempt.currency === "COP" ? "COP" : "";
  if (!boldAmountMatches(Number(attempt.amount), attempt.currency, Number(voucher.subtotal), currency)) return;
  await applyBoldEvent(db, { id: `voucher-${voucher.transaction_id}`, type: "SALE_APPROVED", data: {
    payment_id: voucher.transaction_id, metadata: { reference }, amount: { total: Number(voucher.subtotal), currency },
  } });
}