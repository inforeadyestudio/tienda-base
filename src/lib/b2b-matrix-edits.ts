type MatrixOrderItem = {
  variant_id: string;
  qty: number;
  orders: { customer_id: string; b2b_store_id?: string | null; status: string; notes?: string | null };
};

// Only the [PREVENTA] draft is editable from the matrix (set_preventa_order_qty writes there).
const isPreventaDraft = (o: MatrixOrderItem["orders"]) =>
  o.status === "draft" && (o.notes ?? "").startsWith("[PREVENTA]");

/** mode: all = every live order; locked = non-editable orders; editable = preventa draft only. */
export function matrixClientQuantity(items: MatrixOrderItem[], client: string, variant: string, lockedOnly: boolean | "editable" = false) {
  return items.reduce((sum, item) => {
    const key = item.orders.b2b_store_id ? `${item.orders.customer_id}~${item.orders.b2b_store_id}` : item.orders.customer_id;
    if (key !== client || item.variant_id !== variant || ["cancelled", "refunded"].includes(item.orders.status)) return sum;
    if (lockedOnly === true && isPreventaDraft(item.orders)) return sum;
    if (lockedOnly === "editable" && !isPreventaDraft(item.orders)) return sum;
    return sum + item.qty;
  }, 0);
}

export function verifyMatrixEdits(items: MatrixOrderItem[], client: string, entries: [string, number][]) {
  for (const [variant, expected] of entries) {
    if (matrixClientQuantity(items, client, variant, "editable") !== expected) {
      throw new Error("La cantidad no coincide con el pedido guardado. Conservamos tu cambio; vuelve a intentarlo.");
    }
  }
}

/** Typed cell total → units for the preventa draft (total minus confirmed). Lowering below confirmed is rejected. */
export function matrixDraftQty(items: MatrixOrderItem[], client: string, variant: string, total: number) {
  const confirmed = matrixClientQuantity(items, client, variant, true);
  const wanted = Math.max(0, Math.round(total || 0));
  if (wanted < confirmed) {
    throw new Error(`Hay ${confirmed} unidades en un pedido confirmado. Para bajar de ahí, modifícalo desde el detalle del pedido.`);
  }
  return wanted - confirmed;
}
