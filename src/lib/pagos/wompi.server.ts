// Verificación de transacciones de Wompi compartida por el retorno y los eventos.
import type { SupabaseClient } from "@supabase/supabase-js";

export type WompiConfirmation = { reference: string; paid: boolean; pending: boolean; payload: unknown } | null;

/** Base de la API de Wompi según el entorno guardado en los ajustes de pago. */
export async function wompiBase(db: SupabaseClient): Promise<string> {
  const { data: setting } = await db.from("app_settings").select("value").eq("key", "payment_settings").maybeSingle();
  const live = ((setting?.value ?? {}) as { wompi?: { mode?: string } }).wompi?.mode === "live";
  return live ? "https://production.wompi.co" : "https://sandbox.wompi.co";
}

/** Llave privada de Wompi guardada; sin ella la API no deja consultar transacciones. */
async function wompiPrivateKey(db: SupabaseClient): Promise<string> {
  const { readSecret } = await import("../secrets.server");
  return readSecret(db, "wompi_private_key");
}

/**
 * Consulta la transacción directamente en Wompi y marca el intento como pagado
 * solo si el estado es APPROVED y el monto coincide con el registrado.
 */
export async function confirmWompiTransaction(db: SupabaseClient, base: string, transactionId: string): Promise<WompiConfirmation> {
  let payload: unknown = { id: transactionId };
  let reference = "";
  let paid = false;
  let pending = false;
  try {
    const privateKey = await wompiPrivateKey(db);
    const response = await fetch(`${base}/v1/transactions/${encodeURIComponent(transactionId)}`, {
      headers: privateKey ? { Authorization: `Bearer ${privateKey}` } : undefined,
    });
    const json = (await response.json()) as any;
    payload = json;
    const data = json?.data ?? {};
    reference = String(data?.reference ?? "");
    const { data: attempt } = reference
      ? await db.from("payment_attempts").select("amount, status").eq("reference", reference).maybeSingle()
      : { data: null };
    if (!attempt) return null;
    if (!response.ok) return null;
    if (attempt.status === "paid") return { reference, paid: true, pending: false, payload };
    const cents = Number(data?.amount_in_cents ?? 0);
    const validAmount = Math.abs(cents - Number(attempt.amount) * 100) <= 100;
    const state = String(data?.status ?? "");
    paid = response.ok && state === "APPROVED" && validAmount;
    pending = response.ok && state === "PENDING" && validAmount;
  } catch {
    // Un error de red no demuestra que el pago haya fallado.
    return null;
  }
  if (!reference) return null;
  await db
    .from("payment_attempts")
    .update({ status: paid ? "paid" : pending ? "pending" : "failed", external_id: transactionId, payload: payload as never })
    .eq("reference", reference);
  return { reference, paid, pending, payload };
}
