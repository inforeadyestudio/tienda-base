export type SaleSettings = { enabled: boolean; endsAt: string | null; showViewers: boolean };
export const DEFAULT_SALE_SETTINGS: SaleSettings = { enabled: false, endsAt: null, showViewers: true };

export function normalizeSaleSettings(raw: unknown): SaleSettings {
  const value = (raw ?? {}) as Partial<SaleSettings>;
  const endsAt = typeof value.endsAt === "string" && Number.isFinite(Date.parse(value.endsAt)) ? new Date(value.endsAt).toISOString() : null;
  return { enabled: value.enabled === true, endsAt, showViewers: value.showViewers !== false };
}

export type SaleVariant = { price_cop: number; price_usd?: number | null; compare_at_cop?: number | null; compare_at_usd?: number | null };
export function hasSalePrice(variant: SaleVariant | undefined, currency: "COP" | "USD") {
  if (!variant) return false;
  const price = currency === "USD" ? variant.price_usd : variant.price_cop;
  const previous = currency === "USD" ? variant.compare_at_usd : variant.compare_at_cop;
  return typeof price === "number" && price > 0 && typeof previous === "number" && Number.isFinite(previous) && previous > price;
}

/** True when active variants are sold at different prices in the given currency. */
export function priceVaries(variants: Array<SaleVariant & { active?: boolean | null }> | null | undefined, currency: "COP" | "USD") {
  const prices = new Set((variants ?? []).filter((v) => v.active !== false).map((v) => (currency === "USD" ? v.price_usd : v.price_cop)).filter((p): p is number => typeof p === "number" && p > 0));
  return prices.size > 1;
}

export function saleSecondsLeft(endsAt: string | null, now: number) {
  const end = endsAt ? Date.parse(endsAt) : NaN;
  return Number.isFinite(end) ? Math.max(0, Math.ceil((end - now) / 1000)) : 0;
}

// datetime-local is explicitly Colombian time, independent of the admin's device.
export function saleBogotaInput(endsAt: string | null) {
  if (!endsAt || !Number.isFinite(Date.parse(endsAt))) return "";
  return new Date(Date.parse(endsAt) - 5 * 3600_000).toISOString().slice(0, 16);
}
export function saleBogotaToISO(input: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(input)) return null;
  const time = Date.parse(`${input}:00-05:00`);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}