export type SalePriceRow = { sku: string; priceCop: number | null; compareCop: number | null; priceUsd: number | null; compareUsd: number | null };
export type CurrentVariant = { id: string; sku: string; price_cop: number | null; compare_at_cop: number | null; price_usd: number | null; compare_at_usd: number | null };
export type VariantPatch = { price_cop?: number; compare_at_cop?: number; price_usd?: number; compare_at_usd?: number };

const norm = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
export const normSku = (s: unknown) => String(s ?? "").toUpperCase().replace(/\s+/g, "");

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^\d.,-]/g, "").replace(/,/g, "."));
  return Number.isFinite(n) && n > 0 ? n : null;
}
/** Pesos en el Excel vienen en miles (200 = $200.000). */
export function copValue(v: unknown): number | null {
  const n = num(v);
  if (n === null) return null;
  return Math.round(n < 1000 ? n * 1000 : n);
}
const usd = (v: unknown) => { const n = num(v); return n === null ? null : Math.round(n * 100) / 100; };

export function parseSaleRows(raw: Record<string, unknown>[]): SalePriceRow[] {
  const out = new Map<string, SalePriceRow>();
  for (const r of raw) {
    const m: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(r)) m[norm(k)] = v;
    const sku = normSku(m["SKU"]);
    if (!sku) continue;
    out.set(sku, {
      sku,
      priceCop: copValue(m["PRECIO CO"] ?? m["PRECIO COP"]),
      compareCop: copValue(m["COMPARACION CO"] ?? m["COMPARACION COP"]),
      priceUsd: usd(m["PRECIO USD"] ?? m["PRECIO US"]),
      compareUsd: usd(m["COMPARACION US"] ?? m["COMPARACION USD"]),
    });
  }
  return [...out.values()];
}

/** Comparación USD vacía → toma el precio USD que hoy tiene el sistema. */
export function buildPatch(row: SalePriceRow, cur: CurrentVariant): VariantPatch {
  const p: VariantPatch = {};
  if (row.priceCop !== null) p.price_cop = row.priceCop;
  if (row.compareCop !== null) p.compare_at_cop = row.compareCop;
  if (row.priceUsd !== null) p.price_usd = row.priceUsd;
  const cmpUsd = row.compareUsd ?? (cur.price_usd && cur.price_usd > 0 ? Number(cur.price_usd) : null);
  if (cmpUsd !== null) p.compare_at_usd = cmpUsd;
  return p;
}

export function patchWarning(p: VariantPatch, cur: CurrentVariant): string | null {
  const pc = p.price_cop ?? cur.price_cop ?? 0, cc = p.compare_at_cop ?? cur.compare_at_cop ?? 0;
  const pu = p.price_usd ?? cur.price_usd ?? 0, cu = p.compare_at_usd ?? cur.compare_at_usd ?? 0;
  const w: string[] = [];
  if (cc && cc <= pc) w.push("comparación COP no es mayor");
  if (cu && pu && cu <= pu) w.push("comparación US$ no es mayor");
  return w.length ? w.join(" · ") : null;
}

/** SKU sin distinguir mayúsculas ni espacios (en BD hay SKU con minúsculas). */
export function indexBySku<T extends { sku: string | null }>(variants: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const v of variants) if (v.sku) m.set(normSku(v.sku), v);
  return m;
}
