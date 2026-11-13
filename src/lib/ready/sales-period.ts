const OFFSET = 5 * 3600_000;

export function colombiaClock(now = new Date()) {
  const local = new Date(now.getTime() - OFFSET).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 19), timezone: "America/Bogota", offset: "-05:00" };
}

export function colombiaDate(offsetDays = 0, now = new Date()) {
  return colombiaClock(new Date(now.getTime() + offsetDays * 86400_000)).date;
}

/** Inclusive calendar dates, exclusive instant end, including the comparison period. */
export function calendarSalesRange(from: string, to: string) {
  const period = salesPeriod({ from, to });
  const start = Date.parse(period.start);
  const end = Date.parse(period.end);
  const span = end - start;
  return { from: period.start, to: period.end, previousFrom: new Date(start - span).toISOString(), days: span / 86400_000 };
}

export function inSalesRange(createdAt: string, from: string, to: string) {
  const time = Date.parse(createdAt);
  return time >= Date.parse(from) && time < Date.parse(to);
}

function boundary(value: string, end: boolean) {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const stamp = dateOnly ? `${value}T00:00:00-05:00` : /(?:Z|[+-]\d{2}:\d{2})$/.test(value) ? value : `${value}-05:00`;
  const time = Date.parse(stamp);
  if (!Number.isFinite(time)) throw new Error("Fecha u hora inválida; usa YYYY-MM-DD o YYYY-MM-DDTHH:mm:ss-05:00.");
  return new Date(time + (dateOnly && end ? 86400_000 : 0)).toISOString();
}

export function salesPeriod(args: { from?: string; to?: string; days?: number }, now = new Date(), monthly = false) {
  const clock = colombiaClock(now);
  const from = args.from ?? (monthly ? `${clock.date.slice(0, 7)}-01` : new Date(now.getTime() - Math.min(Math.max(args.days ?? 7, 1), 365) * 86400_000).toISOString());
  const to = args.to ?? now.toISOString();
  const start = boundary(from, false);
  const end = boundary(to, true);
  if (start >= end) throw new Error("El inicio debe ser anterior al final del período.");
  return { from, to, start, end, timezone: clock.timezone, consulted_at: now.toISOString() };
}

export function salesTotals(rows: Array<{ currency?: string | null; total_cop?: unknown; total_usd?: unknown }>) {
  return rows.reduce<{ orders: number; cop_orders: number; usd_orders: number; total_cop: number; total_usd: number }>((sum, row) => {
    sum.orders++;
    if (row.currency === "USD") { sum.usd_orders++; sum.total_usd += Number(row.total_usd ?? 0); }
    else { sum.cop_orders++; sum.total_cop += Number(row.total_cop ?? 0); }
    return sum;
  }, { orders: 0, cop_orders: 0, usd_orders: 0, total_cop: 0, total_usd: 0 });
}