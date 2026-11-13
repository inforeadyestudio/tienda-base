/** Datos de trazabilidad que acompañan cada ajuste enviado a R-Count. */
export type AdjustmentMeta = { elaborado_por: string | null; elaborado_por_email: string | null; bodega_nombre: string | null };

export function adjustmentMeta(actor: { full_name?: string | null; email?: string | null } | null, location: { name?: string | null } | null): AdjustmentMeta {
  const name = actor?.full_name?.trim() || null;
  const email = actor?.email?.trim() || null;
  return { elaborado_por: name ?? email, elaborado_por_email: email, bodega_nombre: location?.name?.trim() || null };
}

/** Agrega los datos al payload (nivel ajuste y por prenda) sin pisar los ya guardados. */
export function withAdjustmentMeta(payload: any, meta: AdjustmentMeta) {
  const d = payload?.data ?? {};
  const pick = (k: keyof AdjustmentMeta) => d[k] ?? meta[k] ?? undefined;
  const extra: Record<string, string> = {};
  for (const k of ["elaborado_por", "elaborado_por_email", "bodega_nombre"] as const) { const v = pick(k); if (v) extra[k] = v; }
  const bodegaNombre = extra.bodega_nombre;
  const items = (d.items ?? []).map((i: any) => (bodegaNombre && !i.bodega_nombre ? { ...i, bodega_nombre: bodegaNombre } : i));
  return { ...payload, data: { ...d, ...extra, items } };
}
