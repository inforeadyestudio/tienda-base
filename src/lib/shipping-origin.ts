type ShippingOrder = {
  dispatch_location_id?: string | null;
  order_items?: Array<{ qty?: number; fulfill_location_id?: string | null }>;
};

/** Resolve the actual dispatch site, never the sales channel or user's store. */
export function shippingOriginLocation(order: ShippingOrder, locationId?: string | null, box?: { location_id: string | null } | null): string {
  if (box) {
    if (!box.location_id) throw new Error("La caja no tiene bodega de salida asignada.");
    if (locationId && locationId !== box.location_id) throw new Error("La bodega seleccionada no coincide con la caja.");
    return box.location_id;
  }
  const items = (order.order_items ?? []).filter((item) => Number(item.qty) > 0);
  const locations = [...new Set(items.map((item) => item.fulfill_location_id).filter((id): id is string => Boolean(id)))];
  if (locationId) {
    if (!locations.includes(locationId)) throw new Error("Esa bodega no tiene prendas del pedido.");
    return locationId;
  }
  if (order.dispatch_location_id) return order.dispatch_location_id;
  if (items.some((item) => !item.fulfill_location_id)) throw new Error("Asigna la bodega de salida de todas las prendas antes de cotizar la guía.");
  if (locations.length === 1) return locations[0];
  if (locations.length > 1) throw new Error("El pedido sale de varias bodegas: genera la guía desde cada bodega o define una bodega de despacho.");
  throw new Error("El pedido no tiene bodega de salida asignada.");
}