/** Compare each size separately: spare M units cannot cover missing S units. */
export function matrixOverage(ordered: number, capacity: number) {
  return Math.max(0, ordered - capacity);
}

/** Total pedidos: sum of every client's quantities for a size (excludes fixed store/Ecommerce assignments). */
export function matrixClientOrdered(clientQuantities: number[]) {
  return clientQuantities.reduce((sum, qty) => sum + qty, 0);
}
