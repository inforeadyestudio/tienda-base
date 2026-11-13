/** Never resolve a selection outside the current product/color's size list. */
export function resolveProductVariant<T extends { id: string }>(
  variants: readonly T[],
  pickedId: string | null,
  isSellable: (variant: T) => boolean,
): T | undefined {
  return variants.find((variant) => variant.id === pickedId)
    ?? variants.find(isSellable)
    ?? variants[0];
}