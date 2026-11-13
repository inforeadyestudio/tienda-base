import { webSellable } from "../web-stock";

/**
 * Decide si se puede agregar `wanted` unidades más de una talla al carrito.
 * `levels` son las filas en vivo de inventory_levels (con on_hand y reserved,
 * que ya incluye lo apartado por otras clientas en el checkout).
 */
export function canAddToCart(levels, inCart, wanted) {
  const sellable = (levels ?? []).reduce((sum, l) => sum + webSellable(l), 0);
  return { sellable, ok: sellable >= (inCart ?? 0) + (wanted ?? 1) };
}
