import { compareSizes, sizeLabel } from "./size-order";

type MatrixVariant = {
  id: string;
  size?: string | null;
  color?: string | null;
  product: { id: string; name: string; reference_code: string | null };
};

export type MatrixRow = {
  key: string;
  name: string;
  ref: string | null;
  color: string;
  bySize: Record<string, string[]>;
};

/** Group by canonical size without dropping distinct variant IDs or their quantities. */
export function groupMatrixSizes(variants: MatrixVariant[]) {
  const sizes = [...new Set(variants.map(v => sizeLabel(v.size)))].sort(compareSizes);
  const rowMap = new Map<string, MatrixRow>();
  for (const v of variants) {
    const color = v.color || "—";
    const key = `${v.product.id}|${color}`;
    const row = rowMap.get(key) ?? { key, name: v.product.name, ref: v.product.reference_code, color, bySize: {} };
    const size = sizeLabel(v.size);
    const ids = row.bySize[size] ?? [];
    if (!ids.includes(v.id)) ids.push(v.id);
    row.bySize[size] = ids;
    rowMap.set(key, row);
  }
  const rows = [...rowMap.values()].sort((a, b) => a.name.localeCompare(b.name) || a.color.localeCompare(b.color));
  return { sizes, rows };
}

export function sumMatrixVariants(ids: string | string[] | undefined, value: (id: string) => number) {
  return (typeof ids === "string" ? [ids] : ids ?? []).reduce((sum, id) => sum + value(id), 0);
}
const fold = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
/** Reference search: accent/case-insensitive match on name, reference code or color. */
export function matchesMatrixSearch(row: { name: string; ref: string | null; color: string }, q: string) {
  const term = fold(q);
  if (!term) return true;
  return fold(`${row.name} ${row.ref ?? ""} ${row.color}`).includes(term);
}
