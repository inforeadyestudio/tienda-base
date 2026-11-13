export function canAddToCart(
  levels: { on_hand?: number | null; reserved?: number | null; locations?: any }[] | null | undefined,
  inCart: number,
  wanted: number,
): { sellable: number; ok: boolean };
