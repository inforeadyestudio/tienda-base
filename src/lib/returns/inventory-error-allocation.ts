export function allocateSwapAmount(total: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0 || weights.length === 0 || weights.some((w) => !Number.isSafeInteger(w) || w < 0)) {
    throw new Error("Valor inválido para el cambio");
  }
  const sum = weights.reduce((s, w) => s + BigInt(w), 0n);
  const denominator = sum || BigInt(weights.length);
  let cumulative = 0n;
  let previous = 0n;
  return weights.map((weight) => {
    cumulative += sum ? BigInt(weight) : 1n;
    const end = BigInt(total) * cumulative / denominator;
    const amount = Number(end - previous);
    previous = end;
    return amount;
  });
}