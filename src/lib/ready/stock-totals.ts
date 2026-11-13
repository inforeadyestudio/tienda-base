/** Totales exactos por bodega calculados en servidor (el modelo no debe sumar filas). */
export function stockTotals(rows: { location?: string | null; on_hand: number; reserved: number; available: number }[]) {
  const map = new Map<string, { location: string; on_hand: number; reserved: number; available: number }>();
  for (const r of rows) {
    const k = r.location ?? "Sin bodega";
    const t = map.get(k) ?? { location: k, on_hand: 0, reserved: 0, available: 0 };
    t.on_hand += r.on_hand; t.reserved += r.reserved; t.available += r.available;
    map.set(k, t);
  }
  return [...map.values()];
}
