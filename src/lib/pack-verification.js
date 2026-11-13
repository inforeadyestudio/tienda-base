// Lógica pura de la verificación de empaque (pistolear antes de la guía).

/** Fecha desde la cual la verificación es obligatoria: lunes 9 nov 2026, 00:00 Colombia. */
export const PACK_VERIFY_REQUIRED_FROM = new Date("2026-11-09T05:00:00Z");

export function packVerifyRequired(now = new Date()) {
  return now.getTime() >= PACK_VERIFY_REQUIRED_FROM.getTime();
}

const norm = (s) => String(s ?? "").trim().toUpperCase();

/**
 * lines: [{ variantId, qty, sku, barcode }]
 * counts: { [variantId]: number }
 * Devuelve { ok, variantId?, reason? } sin mutar counts.
 */
export function matchScan(lines, counts, code) {
  const c = norm(code);
  if (!c) return { ok: false, reason: "empty" };
  const hits = lines.filter((l) => norm(l.barcode) === c || norm(l.sku) === c);
  if (!hits.length) return { ok: false, reason: "not_in_order" };
  const open = hits.find((l) => (counts[l.variantId] ?? 0) < l.qty);
  if (!open) return { ok: false, reason: "excess", variantId: hits[0].variantId };
  return { ok: true, variantId: open.variantId };
}

export function isComplete(lines, counts) {
  return lines.length > 0 && lines.every((l) => (counts[l.variantId] ?? 0) >= l.qty);
}

/** Agrupa líneas repetidas de la misma variante sumando cantidades. */
export function mergeLines(lines) {
  const m = new Map();
  for (const l of lines) {
    if (!l.variantId || !(l.qty > 0)) continue;
    const prev = m.get(l.variantId);
    if (prev) prev.qty += l.qty;
    else m.set(l.variantId, { ...l });
  }
  return [...m.values()];
}
