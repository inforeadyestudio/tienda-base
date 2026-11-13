/** Lista cerrada de acciones que el agente puede pedirle a la interfaz. */
export const UI_ACTIONS = [
  "show_products",
  "show_product",
  "show_look",
  "show_collection",
  "select_variant",
  "select_size",
  "open_fit",
  "open_texture",
  "open_cross_sell",
  "open_closet",
  "show_order",
  "show_tracking",
  "show_metrics",
  "show_chart",
  "show_inventory",
  "filter_products",
  "open_selection",
  "cart_add",
  "cart_set_qty",
  "cart_remove",
  "show_cart",
] as const;

export type UiActionType = (typeof UI_ACTIONS)[number];
export type ReadyUiAction = { type: UiActionType; payload: Record<string, any> };

/** El frontend nunca ejecuta código del modelo: solo acciones de esta lista. */
export function validateAction(raw: unknown): ReadyUiAction | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as { type?: unknown; payload?: unknown };
  if (typeof a.type !== "string") return null;
  if (!(UI_ACTIONS as readonly string[]).includes(a.type)) return null;
  return { type: a.type as UiActionType, payload: (a.payload as Record<string, any>) ?? {} };
}
