export type Promotion = {
  kind: string; value: number; amount_currency: string; amount_usd: number | null;
  active: boolean; channels: string[] | null; starts_at: string | null; ends_at: string | null; min_subtotal_cop: number | null;
};

export function fixedUsdDiscount(promo: Promotion, currency: string, subtotalCop: number, subtotalUsd: number, now = Date.now()) {
  if (currency !== "USD" || promo.kind !== "amount" || promo.amount_currency !== "USD" || !promo.active || !promo.channels?.includes("ecom_intl")) throw new Error("Ese código no aplica en esta compra.");
  if ((promo.starts_at && Date.parse(promo.starts_at) > now) || (promo.ends_at && Date.parse(promo.ends_at) <= now)) throw new Error("Ese código no está vigente.");
  if (subtotalCop < (promo.min_subtotal_cop ?? 0)) throw new Error("Esta compra no alcanza el mínimo del código.");
  const value = Number(promo.amount_usd);
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(subtotalUsd) || subtotalUsd <= 0) throw new Error("El monto del código no es válido.");
  return Math.min(Math.round(value * 100), Math.round(subtotalUsd * 100)) / 100;
}

export function promotionDiscount(promo: Promotion, currency: string, subtotalCop: number, subtotalUsd: number, now = Date.now()) {
  if (promo.kind !== "percent") {
    const discountUsd = fixedUsdDiscount(promo, currency, subtotalCop, subtotalUsd, now);
    return { discountUsd, discountCop: Math.min(subtotalCop, Math.round(subtotalCop * discountUsd / subtotalUsd)) };
  }
  const channel = currency === "USD" ? "ecom_intl" : "ecom_nacional";
  if (!["COP", "USD"].includes(currency) || !promo.active || !promo.channels?.includes(channel) || !Number.isInteger(promo.value) || promo.value < 1 || promo.value > 100) throw new Error("Ese código no aplica en esta compra.");
  if ((promo.starts_at && Date.parse(promo.starts_at) > now) || (promo.ends_at && Date.parse(promo.ends_at) <= now)) throw new Error("Ese código no está vigente.");
  if (!Number.isFinite(subtotalCop) || subtotalCop <= 0 || subtotalCop < (promo.min_subtotal_cop ?? 0)) throw new Error("Esta compra no alcanza el mínimo del código.");
  if (currency === "USD" && (!Number.isFinite(subtotalUsd) || subtotalUsd <= 0)) throw new Error("Faltan los precios en dólares.");
  return { discountCop: Math.min(subtotalCop, Math.round(subtotalCop * promo.value / 100)), discountUsd: currency === "USD" ? Math.min(subtotalUsd, Math.round(subtotalUsd * promo.value) / 100) : 0 };
}