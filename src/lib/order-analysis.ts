import { sumOrderIva, type OrderTotalRow } from "./order-totals";
import { channelOf } from "./order-channel";

export type AnalysisOrderRow = OrderTotalRow & {
  source?: string;
  number?: string | null;
  b2b_mode?: string | null;
  is_manual?: boolean;
  pos_sales?: unknown[];
  payment_status?: string | null;
  invoices?: readonly { status?: string | null; number?: string | null }[] | null;
};

/** A box invoice qualifies its order once; payment alone is not invoicing. */
export function analysisBillingIncludes(row: AnalysisOrderRow) {
  return channelOf({ ...row, source: row.source ?? "ecom" }) !== "b2b" ||
    (row.invoices ?? []).some(invoice => invoice.status === "issued" && Boolean(invoice.number?.trim()));
}

export type AnalysisDestination = "all" | "nacional" | "internacional";
export function analysisAmount(row: OrderTotalRow, destination: AnalysisDestination = "all") {
  return Number((destination === "internacional" ? row.total_usd : row.total_cop) ?? 0);
}
export function analysisIncludes(row: AnalysisOrderRow, destination: AnalysisDestination = "all", onlyPaid = false) {
  return row.status !== "cancelled" && analysisBillingIncludes(row) && (!onlyPaid || row.payment_status === "paid") &&
    (destination === "all" || (row.currency === "USD") === (destination === "internacional"));
}
export function analysisTotals(rows: readonly AnalysisOrderRow[], destination: AnalysisDestination = "all") {
  const live = rows.filter((row) => analysisIncludes(row, destination));
  const revenue = live.reduce((sum, row) => sum + analysisAmount(row, destination), 0);
  const orders = live.length;
  const units = live.reduce((sum, row) => sum + (row.order_items ?? []).reduce((s, item) => s + Number(item.qty ?? 0), 0), 0);
  const iva = destination === "internacional" ? 0 : sumOrderIva(live);
  return { revenue, orders, units, aov: orders ? Math.round(revenue / orders) : 0, iva, net: revenue - iva };
}