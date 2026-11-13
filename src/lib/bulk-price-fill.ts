export type PriceColumn = "price" | "compare" | "priceUsd" | "compareUsd";
export type PriceRows = Record<string, { price: string; compare: string; priceUsd?: string; compareUsd?: string }>;

export function normalizePriceInput(value: string, usd: boolean): string {
  if (!usd) return value.replace(/[^\d]/g, "");
  const [whole, ...fraction] = value.replace(/,/g, ".").replace(/[^\d.]/g, "").split(".");
  return fraction.length ? `${whole}.${fraction.join("").slice(0, 2)}` : whole;
}

export function usdPricePatch(row: PriceRows[string], original: { price_usd?: number | null; compare_at_usd?: number | null }) {
  const patch: { price_usd?: number | null; compare_at_usd?: number | null } = {};
  for (const [key, field] of [["priceUsd", "price_usd"], ["compareUsd", "compare_at_usd"]] as const) {
    const value = row[key] ?? "";
    const previous = original[field] ? String(original[field]) : "";
    if (value === previous) continue;
    if (!value) { patch[field] = null; continue; }
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) throw new Error("Los precios en US$ deben ser mayores que cero o quedar vacíos.");
    patch[field] = Math.round(number * 100) / 100;
  }
  return patch;
}

export function fillPriceRange(rows: PriceRows, ids: string[], source: number, target: number, column: PriceColumn): PriceRows {
  const sourceId = ids[source];
  if (!sourceId || !rows[sourceId] || !ids[target]) return rows;
  const value = rows[sourceId][column];
  const next = { ...rows };
  for (let index = Math.min(source, target); index <= Math.max(source, target); index++) {
    const id = ids[index];
    if (rows[id]) next[id] = { ...rows[id], [column]: value };
  }
  return next;
}