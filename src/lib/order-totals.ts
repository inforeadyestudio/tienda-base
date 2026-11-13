export type OrderTotalRow = {
  status?: string | null;
  currency?: string | null;
  total_cop?: number | null;
  total_usd?: number | null;
  tax_included_cop?: number | null;
  order_items?: readonly { qty?: number | null }[] | null;
};

export type OrderTotals = {
  /** Pedidos que cuentan como venta (sin los cancelados). */
  sales: number;
  /** Pedidos cancelados: se muestran aparte y no suman dinero ni unidades. */
  cancelled: number;
  /** Suma de los pedidos en pesos. */
  cop: number;
  /** Suma de los pedidos en dólares. */
  usd: number;
  /** Unidades de los pedidos que cuentan como venta. */
  units: number;
};

/**
 * Totales de una lista de pedidos ya filtrada.
 *
 * Cada pedido aporta su importe en la moneda en la que se cobró: los pedidos en
 * dólares suman en US$ (y en pesos solo si no tienen total en dólares), el resto
 * en pesos. Así una misma tabla puede mezclar ventas nacionales e internacionales
 * sin inventar una conversión.
 */
export function sumOrderTotals(rows: readonly OrderTotalRow[]): OrderTotals {
  let sales = 0;
  let cancelled = 0;
  let cop = 0;
  let usd = 0;
  let units = 0;

  for (const o of rows) {
    if (o.status === "cancelled") {
      cancelled += 1;
      continue;
    }
    sales += 1;
    units += (o.order_items ?? []).reduce((a, i) => a + (Number(i.qty ?? 0) || 0), 0);
    if (o.currency === "USD") {
      const dollars = Number(o.total_usd ?? 0) || 0;
      if (dollars > 0) usd += dollars;
      else cop += Number(o.total_cop ?? 0) || 0;
    } else {
      cop += Number(o.total_cop ?? 0) || 0;
    }
  }

  return { sales, cancelled, cop, usd, units };
}

const IVA_RATE = 0.19;

/**
 * IVA contenido en el total de un pedido.
 *
 * Los precios de Colombia ya traen el IVA (19%) incluido, así que se extrae
 * del total: IVA = total − total / 1,19. Si el pedido guardó su propio IVA
 * (tax_included_cop) se usa ese. Los internacionales se cobran en dólares y
 * salen como exportación sin IVA, así que aportan cero.
 */
export function orderIvaCop(o: OrderTotalRow): number {
  if (o.status === "cancelled") return 0;
  const stored = Number(o.tax_included_cop ?? 0) || 0;
  if (stored > 0) return stored;
  if (o.currency === "USD") return 0;
  const total = Number(o.total_cop ?? 0) || 0;
  if (total <= 0) return 0;
  return Math.round(total - total / (1 + IVA_RATE));
}

/** Suma del IVA contenido en los pedidos que cuentan como venta. */
export function sumOrderIva(rows: readonly OrderTotalRow[]): number {
  return rows.reduce((sum, o) => sum + orderIvaCop(o), 0);
}
