/**
 * Unidades que la web puede vender de un nivel de inventario.
 * Ecommerce vende todo lo disponible; una tienda física solo presta a la web
 * si tiene el préstamo activo en este horario (`web_lending`) y lo que supere
 * su margen de seguridad. El resto de bodegas no vende online.
 */
export const WEB_LOCATION_FIELDS = "name, kind, city, web_lending, web_safety_stock";

export function webSellable(l: {
  on_hand?: number | null;
  reserved?: number | null;
  locations?: { kind?: string | null; web_lending?: boolean | null; web_safety_stock?: number | null } | null;
}): number {
  const units = Math.max(0, (l.on_hand ?? 0) - (l.reserved ?? 0));
  const loc = l.locations;
  if (!loc) return units;
  if (loc.kind === "ecom") return units;
  if (loc.kind === "store" && loc.web_lending) return Math.max(0, units - (loc.web_safety_stock ?? 0));
  return 0;
}
