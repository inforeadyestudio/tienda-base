import type { ReadyActor } from "./context.server";
import { fetchAll } from "../fetch-all";
import { analysisIncludes, analysisTotals, type AnalysisDestination } from "../order-analysis";
import { channelOf } from "../order-channel";
import { salesPeriod } from "./sales-period";

export type SalesAnalysisArgs = { from?: string; to?: string; days?: number; only_paid?: boolean; source?: "ecom" | "pos" | "assisted"; destination?: AnalysisDestination; store?: string };

export async function readSalesAnalysis(actor: ReadyActor, args: SalesAnalysisArgs, monthly = false) {
  const period = salesPeriod(args, new Date(), monthly);
  const destination = args.destination ?? "all";
  const rows = await fetchAll<any>((a, b) => {
    let q = actor.db.from("orders")
      .select("id, number, status, source, is_manual, b2b_mode, currency, total_cop, total_usd:total_usd_exact, tax_included_cop, payment_status, invoices(status, number), order_items(qty), locations:sold_by_location_id(code, name), pos_sales(pos_sessions(locations(code, name)))")
      .gte("created_at", period.start).lt("created_at", period.end).neq("status", "cancelled")
      .order("created_at").order("id").range(a, b);
    if (args.source) q = q.eq("source", args.source);
    return q;
  });
  const scoped = rows.filter(row => {
    if (actor.locationCode && row.locations?.code !== actor.locationCode) return false;
    const store = row.source === "assisted" ? "assisted" : row.pos_sales?.[0]?.pos_sessions?.locations?.code ?? row.source;
    return (!args.store || args.store === "all" || args.store === store) && analysisIncludes(row, destination, args.only_paid === true);
  });
  const groups = new Map<string, any[]>();
  for (const row of scoped) {
    const channel = channelOf(row);
    const name = channel === "pos" ? `POS ${row.pos_sales?.[0]?.pos_sessions?.locations?.name ?? row.locations?.name ?? ""}`.trim() : { online: "Online", manual: "Pedido Manual", b2b: "B2B" }[channel];
    groups.set(name, [...(groups.get(name) ?? []), row]);
  }
  const totals = analysisTotals(scoped, destination);
  return {
    rango: period, destino: destination, solo_pagados: args.only_paid === true,
    instructions: "Criterios idénticos a Pedidos → Análisis: excluye cancelados y B2B sin factura emitida con número; una factura de caja también cuenta y varias facturas no duplican el pedido. Incluye pendientes de pago salvo solo_pagados=true. No llames dinero cobrado al total que incluye pendientes. Usa total.revenue como cifra principal: en Todos es el equivalente COP guardado de los pedidos incluidos, sin reconvertir dólares. Nacional suma solo COP; Internacional solo US$. Muestra período y destino; los filtros deben coincidir para comparar. No inventes tasas ni reutilices cifras anteriores.",
    total: { ...totals, moneda: destination === "internacional" ? "USD" : "COP", pendientes: scoped.filter(row => row.payment_status !== "paid").length },
    nacionales: analysisTotals(scoped, "nacional"), internacionales: analysisTotals(scoped, "internacional"),
    channels: [...groups].map(([canal, items]) => ({ canal, ...analysisTotals(items, destination) })),
  };
}