/** Adaptador de pago. Hoy es demo; conectar Wompi/MercadoPago solo cambia este archivo. */
export type PaymentMethod = "card" | "wallet" | "transfer" | "cod";

export type PaymentResult = { ok: true; reference: string } | { ok: false; message: string };

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  card: "Tarjeta débito / crédito",
  wallet: "Apple Pay · Google Pay",
  transfer: "Transferencia / PSE",
  cod: "Pago contra entrega",
};

export async function authorizePayment(
  method: PaymentMethod,
  _amountCop: number,
): Promise<PaymentResult> {
  // Placeholder: la pasarela real reemplaza esta función sin tocar la experiencia.
  await new Promise((r) => setTimeout(r, 600));
  return { ok: true, reference: `demo-${method}-${Date.now()}` };
}
