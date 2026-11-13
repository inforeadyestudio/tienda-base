import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCOP } from "@/lib/format";
import { BrandLoader } from "@/components/ui/page-loader";
import { AnalyticsHeader, changePct, DataBar, MetricCard, TrendChart, type TrendPoint } from "@/components/analytics/shopify-charts";
import { SEDES } from "./route";
import { calendarSalesRange, colombiaDate } from "@/lib/ready/sales-period";

export const Route = createFileRoute("/_authenticated/pos/$sede/estadisticas")({
  component: SedeEstadisticas,
  head: () => ({ meta: [
    { title: "Estadísticas · Punto de venta" }, { name: "description", content: "Ventas y tendencias del punto de venta." },
    { property: "og:title", content: "Estadísticas · Punto de venta" }, { property: "og:description", content: "Ventas y tendencias del punto de venta." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
});

type SalesRow = { day: string; channel: string; orders: number; units: number; revenue_cop: number };
type MethodRow = { method: string; sales: number; revenue_cop: number };

function SedeEstadisticas() {
  const { sede } = useParams({ from: "/_authenticated/pos/$sede/estadisticas" }); const info = SEDES[sede as keyof typeof SEDES]; const [days, setDays] = useState<number | "custom">(30);
  const [customFrom, setCustomFrom] = useState(colombiaDate(-29)); const [customTo, setCustomTo] = useState(colombiaDate()); const today = colombiaDate();
  const { data: loc } = useQuery({ queryKey: ["sede-loc", info.code], queryFn: async () => (await supabase.from("locations").select("id, code, name").eq("code", info.code).maybeSingle()).data });
  const bounds = useMemo(() => {
    const calendar = calendarSalesRange(days === "custom" ? customFrom : colombiaDate(1 - days), days === "custom" ? customTo : colombiaDate());
    return { to: new Date(calendar.to), from: new Date(calendar.from), previousFrom: new Date(calendar.previousFrom) };
  }, [days, customFrom, customTo]);
  const query = useQuery({ queryKey: ["sede-stats-comparison", loc?.id, days, customFrom, customTo], enabled: !!loc?.id, queryFn: async () => { if (!loc?.id) return []; const { data, error } = await supabase.rpc("sales_hub_stats" as never, { p_from: bounds.previousFrom.toISOString(), p_to: bounds.to.toISOString(), p_location_id: loc.id } as never); if (error) throw error; return (data ?? []) as unknown as SalesRow[]; } });
  const methods = useQuery({ queryKey: ["sede-payment-methods", loc?.id, days, customFrom, customTo], enabled: !!loc?.id, queryFn: async () => { if (!loc?.id) return []; const { data, error } = await supabase.rpc("pos_payment_method_stats" as never, { p_from: bounds.from.toISOString(), p_to: bounds.to.toISOString(), p_location_id: loc.id } as never); if (error) throw error; return (data ?? []) as unknown as MethodRow[]; } });
  const report = useMemo(() => {
    const current = (query.data ?? []).filter((r) => new Date(`${r.day}T00:00:00-05:00`) >= bounds.from); const previous = (query.data ?? []).filter((r) => new Date(`${r.day}T00:00:00-05:00`) < bounds.from);
    const total = (rows: SalesRow[]) => { const revenue = rows.reduce((s, r) => s + Number(r.revenue_cop), 0), orders = rows.reduce((s, r) => s + Number(r.orders), 0), units = rows.reduce((s, r) => s + Number(r.units), 0); return { revenue, orders, units, average: orders ? revenue / orders : 0 }; };
    const values = (rows: SalesRow[]) => rows.map((r) => ({ label: r.day.slice(5), value: Number(r.revenue_cop) })); const c = values(current), p = values(previous); const series: TrendPoint[] = c.map((x, i) => ({ label: x.label, current: x.value, previous: p[i]?.value ?? 0 }));
    return { current: total(current), previous: total(previous), series };
  }, [query.data, bounds.from]);
  if (query.isLoading) return <BrandLoader />;
  return <div className="p-6 md:p-10 space-y-6 max-w-[1500px]">
    <AnalyticsHeader eyebrow={`Analítica · ${info.label}`} subtitle="Ventas del punto físico comparadas con el periodo anterior." days={days} setDays={setDays} />
    {days === "custom" && (
      <div className="flex items-center gap-2 text-xs">
        <input type="date" value={customFrom} max={customTo || today} onChange={(e) => e.target.value && setCustomFrom(e.target.value)} className="rounded-md border border-border bg-card px-2 py-1" />
        <span className="text-ink/50">a</span>
        <input type="date" value={customTo} min={customFrom} max={today} onChange={(e) => e.target.value && setCustomTo(e.target.value)} className="rounded-md border border-border bg-card px-2 py-1" />
      </div>
    )}
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
      <MetricCard label="Ventas totales" value={formatCOP(report.current.revenue)} change={changePct(report.current.revenue, report.previous.revenue)} />
      <MetricCard label="Tickets" value={String(report.current.orders)} change={changePct(report.current.orders, report.previous.orders)} />
      <MetricCard label="Unidades" value={String(report.current.units)} change={changePct(report.current.units, report.previous.units)} />
      <MetricCard label="Ticket promedio" value={formatCOP(report.current.average)} change={changePct(report.current.average, report.previous.average)} />
    </div>
    <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
      <TrendChart title="Ventas a lo largo del tiempo" value={formatCOP(report.current.revenue)} change={changePct(report.current.revenue, report.previous.revenue)} data={report.series} formatter={(v) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)} M` : `$${Math.round(v / 1000)} k`} />
      <section className="bg-card rounded-xl border border-border p-5 shadow-sm"><h2 className="text-sm font-medium border-b border-dotted border-border inline-block mb-5">Ventas por método</h2><div className="space-y-4">{(methods.data ?? []).map((row) => <div key={row.method}><div className="flex justify-between gap-3 text-xs mb-1.5"><span className="capitalize">{row.method}</span><strong>{formatCOP(Number(row.revenue_cop))}</strong></div><div className="h-2.5 rounded-full bg-data-pale overflow-hidden"><DataBar width={(Number(row.revenue_cop) / Math.max(1, ...(methods.data ?? []).map((r) => Number(r.revenue_cop)))) * 100} /></div></div>)}{!methods.data?.length && <p className="text-sm text-muted-foreground py-8 text-center">Sin ventas en este periodo.</p>}</div></section>
    </div>
  </div>;
}