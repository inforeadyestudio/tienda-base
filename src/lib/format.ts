export function formatCOP(cop: number | null | undefined): string {
  const value = typeof cop === "number" ? cop : 0;
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 0,
  }).format(value);
}

const USD_NUM = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Importe en dólares. Siempre lleva «US$» delante para que nunca se confunda
 * con un valor en pesos.
 */
export function formatUSD(value: number | null | undefined, decimals = 2): string {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const body = decimals === 0
    ? Math.round(Math.abs(n)).toLocaleString("en-US")
    : USD_NUM.format(Math.abs(n));
  return `${n < 0 ? "-" : ""}US$${body}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("es-CO", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}