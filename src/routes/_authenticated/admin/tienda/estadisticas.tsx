import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { BrandLoader } from "@/components/ui/page-loader";
import { Button } from "@/components/ui/button";
import { changePct, DataBar, FunnelColumns, MetricCard, TrendChart, type TrendPoint } from "@/components/analytics/shopify-charts";
import { AbandonSummary } from "@/components/admin/abandon-summary";
import { useServerFn } from "@tanstack/react-start";
import { getMetaCampaignReport } from "@/lib/meta-report.functions";
import { resolveMetaName } from "@/lib/meta-report";
import { MetaCampaignReport } from "@/components/admin/meta-campaign-report";
import { normalizePortalStats } from "@/lib/portal-stats";
import { LiveVisitorsMetric } from "@/components/admin/live-visitors-metric";
import { calendarSalesRange, colombiaDate } from "@/lib/ready/sales-period";

export const Route = createFileRoute("/_authenticated/admin/tienda/estadisticas")({
  component: EstadisticasPage,
  head: () => ({
    meta: [
      { title: "Estadísticas y campañas · Tu Marca" },
      { name: "description", content: "Tráfico de Tu Marca, ventas online y resultados atribuidos por campaña de Meta." },
      { property: "og:title", content: "Estadísticas y campañas · Tu Marca" },
      { property: "og:description", content: "Visitas, ventas online y resultados de las campañas de Tu Marca en Meta." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Overview = {
  page_views: number; sessions: number; accounts: number;
  product_sessions: number; cart_sessions: number; checkout_sessions: number;
  payment_sessions: number; purchase_sessions: number;
  orders: number; revenue_cop: number;
};
type Row = { label: string; sessions: number; events: number };
type Series = { day: string; sessions: number; page_views: number; carts: number; purchases: number };
type SalesSeries = { day: string; orders: number; revenue_cop: number; average_order: number };

const RANGES = [
  { label: "7 días", days: 7 },
  { label: "30 días", days: 30 },
  { label: "90 días", days: 90 },
  { label: "12 meses", days: 365 },
];

const money = (v: number) => new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(v || 0);
const pct = (a: number, b: number) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");

const regionNames = new Intl.DisplayNames("es", { type: "region" });
function countryName(label: string): string {
  const code = label.trim().toUpperCase();
  if (/^[A-Z]{2}$/.test(code)) {
    try {
      const name = regionNames.of(code);
      if (name && name.toUpperCase() !== code) return name;
    } catch { /* código no reconocido */ }
  }
  return label;
}
function cityName(label: string): string {
  return label === "Desconocido" ? "Sin detectar" : label;
}

const SECTION_LABELS: Record<string, string> = {
  resumen: "Resumen de la cuenta",
  pedidos: "Mis pedidos",
  wishlist: "Wishlist",
  regalos: "Listas de regalo",
  closet: "Mi clóset",
  cambios: "Cambios y devoluciones",
  puntos: "Puntos",
  perfil: "Perfil",
};

function EstadisticasPage() {
  const readMeta = useServerFn(getMetaCampaignReport);
  const [days, setDays] = useState<number | "custom">(30);
  const [region, setRegion] = useState<"all" | "national" | "international">("all");
  const today = colombiaDate();
  const [customFrom, setCustomFrom] = useState(colombiaDate(-29));
  const [customTo, setCustomTo] = useState(today);
  const range = useMemo(() => {
    let from: Date, to: Date;
    if (days === "custom") {
      const calendar = calendarSalesRange(customFrom, customTo);
      from = new Date(calendar.from);
      to = new Date(calendar.to);
    } else {
      to = new Date(Date.now() + 60000);
      from = new Date(to.getTime() - 60000 - days * 86400000);
    }
    const span = to.getTime() - from.getTime();
    const previousFrom = new Date(from.getTime() - span);
    return { from: from.toISOString(), previousFrom: previousFrom.toISOString(), to: to.toISOString(), region };
  }, [days, customFrom, customTo, region]);

  const overview = useQuery({
    queryKey: ["tienda-stats-overview", range],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("tienda_stats_overview" as never, { p_from: range.from, p_to: range.to, p_region: range.region } as never);
      if (error) throw error;
      return data as unknown as Overview;
    },
  });

  const series = useQuery({
    queryKey: ["tienda-stats-series", range],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("tienda_stats_timeseries" as never, { p_from: range.from, p_to: range.to, p_region: range.region } as never);
      if (error) throw error;
      return (data ?? []) as unknown as Series[];
    },
  });

  const previousOverview = useQuery({
    queryKey: ["tienda-stats-overview-previous", range],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("tienda_stats_overview" as never, { p_from: range.previousFrom, p_to: range.from, p_region: range.region } as never);
      if (error) throw error;
      return data as unknown as Overview;
    },
  });

  const previousSeries = useQuery({
    queryKey: ["tienda-stats-series-previous", range],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("tienda_stats_timeseries" as never, { p_from: range.previousFrom, p_to: range.from, p_region: range.region } as never);
      if (error) throw error;
      return (data ?? []) as unknown as Series[];
    },
  });

  const salesSeries = useQuery({
    queryKey: ["tienda-sales-series", range],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("tienda_sales_timeseries" as never, { p_from: range.previousFrom, p_to: range.to, p_region: range.region } as never);
      if (error) throw error;
      return (data ?? []) as unknown as SalesSeries[];
    },
  });

  const dim = (name: string, limit = 10) =>
    useQuery({
      queryKey: ["tienda-stats-dim", name, range, limit],
      queryFn: async () => {
        const { data, error } = await supabase.rpc("tienda_stats_dimension" as never, { p_from: range.from, p_to: range.to, p_dim: name, p_limit: limit, p_region: range.region } as never);
        if (error) throw error;
        return (data ?? []) as unknown as Row[];
      },
    });

  const countries = dim("country");
  const cities = dim("city");
  const referrers = dim("referrer");
  const campaigns = dim("utm_campaign", 10000);
  const devices = dim("device", 5);
  const pages = dim("path");

  const portal = useQuery({
    queryKey: ["tienda-stats-portal", range],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("tienda_portal_stats" as never, { p_from: range.from, p_to: range.to } as never);
      if (error) throw error;
      return normalizePortalStats(data);
    },
  });

  const o = overview.data;
  const meta = useQuery({
    queryKey: ["tienda-meta-campaigns", range.from, range.to],
    queryFn: () => readMeta({ data: { from: range.from, to: range.to } }),
    staleTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const metaError = meta.data?.error ?? (meta.error instanceof Error ? meta.error.message : null);
  const po = previousOverview.data;
  const webTrend = useMemo(() => combineSeries(series.data ?? [], previousSeries.data ?? [], "sessions"), [series.data, previousSeries.data]);
  const salesTrend = useMemo(() => {
    const current = (salesSeries.data ?? []).filter((r) => r.day >= range.from.slice(0, 10));
    const previous = (salesSeries.data ?? []).filter((r) => r.day < range.from.slice(0, 10));
    const pair = (key: keyof Pick<SalesSeries, "orders" | "revenue_cop" | "average_order">): TrendPoint[] => current.map((r, i) => ({ label: r.day.slice(5), current: Number(r[key]), previous: Number(previous[i]?.[key] ?? 0) }));
    return { revenue: pair("revenue_cop"), orders: pair("orders"), average: pair("average_order") };
  }, [salesSeries.data, range.from]);

  return (
    <div className="p-6 md:p-10 space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif italic text-3xl">Estadísticas</h1>
          <p className="text-sm text-moss mt-1">Solo tráfico y ventas de la tienda online.{region !== "all" && " Nacionales: Colombia (pesos). Internacionales: resto del mundo, incluida Panamá (dólares)."}</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap gap-1 bg-card rounded-lg p-1 border border-border">
            {([["all", "Todas las visitas"], ["national", "Nacionales · COP"], ["international", "Internacionales · USD"]] as const).map(([k, l]) => (
              <Button key={k} size="sm" variant={region === k ? "default" : "ghost"} onClick={() => setRegion(k)}>{l}</Button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1 bg-card rounded-lg p-1 border border-border">
            {RANGES.map((r) => (
              <Button key={r.days} size="sm" variant={days === r.days ? "default" : "ghost"} onClick={() => setDays(r.days)}>
                {r.label}
              </Button>
            ))}
            <Button size="sm" variant={days === "custom" ? "default" : "ghost"} onClick={() => setDays("custom")}>Personalizado</Button>
          </div>
          {days === "custom" && (
            <div className="flex items-center gap-2 text-sm">
              <input type="date" value={customFrom} max={customTo} onChange={(e) => e.target.value && setCustomFrom(e.target.value)} className="rounded-md border border-border bg-card px-2 py-1" />
              <span className="text-ink/50">a</span>
              <input type="date" value={customTo} min={customFrom} max={today} onChange={(e) => e.target.value && setCustomTo(e.target.value)} className="rounded-md border border-border bg-card px-2 py-1" />
            </div>
          )}
        </div>
      </header>

      <LiveVisitorsMetric />

      {overview.isLoading ? (
        <BrandLoader />
      ) : overview.isError ? (
        <div className="text-sm text-red-600">No pudimos cargar las estadísticas.</div>
      ) : (
        <>
          <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
            <MetricCard label="Visitas sitio web" value={(o?.sessions ?? 0).toLocaleString("es-CO")} change={changePct(o?.sessions ?? 0, po?.sessions ?? 0)} />
            <MetricCard label="Carritos" value={(o?.cart_sessions ?? 0).toLocaleString("es-CO")} change={changePct(o?.cart_sessions ?? 0, po?.cart_sessions ?? 0)} />
            <MetricCard label="Pedidos online" value={(o?.orders ?? 0).toLocaleString("es-CO")} change={changePct(o?.orders ?? 0, po?.orders ?? 0)} />
            <MetricCard label="Ventas" value={money(o?.revenue_cop ?? 0)} change={changePct(o?.revenue_cop ?? 0, po?.revenue_cop ?? 0)} />
          </section>

          <section className="bg-white rounded-2xl border border-ink/10 p-5">
            <h2 className="text-base font-medium">Desglose de la tasa de conversión</h2>
            <div className="mb-4 flex items-baseline gap-2">
              <span className="text-3xl tabular-nums">{pct(Math.max(o?.purchase_sessions ?? 0, o?.orders ?? 0), o?.sessions ?? 0).replace(".", ",")}</span>
            </div>
            <FunnelColumns
              steps={[
                { label: "Sesiones", value: o?.sessions ?? 0, previous: po?.sessions },
                { label: "Vieron producto", value: o?.product_sessions ?? 0, previous: po?.product_sessions },
                { label: "Agregaron al carrito", value: o?.cart_sessions ?? 0, previous: po?.cart_sessions },
                { label: "Iniciaron checkout", value: o?.checkout_sessions ?? 0, previous: po?.checkout_sessions },
                { label: "Iniciaron pago", value: o?.payment_sessions ?? 0, previous: po?.payment_sessions },
                { label: "Compraron", value: Math.max(o?.purchase_sessions ?? 0, o?.orders ?? 0), previous: po ? Math.max(po.purchase_sessions ?? 0, po.orders ?? 0) : undefined },
              ]}
            />
          </section>

          <AbandonSummary from={range.from} to={range.to} live={days !== "custom" || customTo === today} />

          <section className="grid lg:grid-cols-2 gap-4">
            <TrendChart title="Ventas totales a lo largo del tiempo" value={money(o?.revenue_cop ?? 0)} change={changePct(o?.revenue_cop ?? 0, po?.revenue_cop ?? 0)} data={salesTrend.revenue} formatter={(v) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)} M` : `$${Math.round(v / 1000)} k`} />
            <TrendChart title="Sesiones a lo largo del tiempo" value={(o?.sessions ?? 0).toLocaleString("es-CO")} change={changePct(o?.sessions ?? 0, po?.sessions ?? 0)} data={webTrend} />
            <TrendChart title="Pedidos a lo largo del tiempo" value={(o?.orders ?? 0).toLocaleString("es-CO")} change={changePct(o?.orders ?? 0, po?.orders ?? 0)} data={salesTrend.orders} />
            <TrendChart title="Valor medio del pedido" value={money((o?.orders ?? 0) ? (o?.revenue_cop ?? 0) / (o?.orders ?? 1) : 0)} change={changePct((o?.orders ?? 0) ? (o?.revenue_cop ?? 0) / (o?.orders ?? 1) : 0, (po?.orders ?? 0) ? (po?.revenue_cop ?? 0) / (po?.orders ?? 1) : 0)} data={salesTrend.average} formatter={(v) => `$${Math.round(v / 1000)} k`} />
          </section>

          <section className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            <TopList title="Países" rows={countries.data} formatLabel={countryName} />
            <TopList title="Ciudades" rows={cities.data} formatLabel={cityName} />
            <TopList title="Origen del tráfico" rows={referrers.data} />
            <TopList title="Campañas · sesiones de la tienda" rows={campaigns.data} formatLabel={(label) => resolveMetaName(label, meta.data?.report?.campaigns ?? [])} />
            <TopList title="Dispositivos" rows={devices.data} />
            <TopList title="Páginas más vistas" rows={pages.data} unit="visitas" />
          </section>

          <MetaCampaignReport report={meta.data?.report} hub={meta.data?.hub} error={metaError} loading={meta.isPending}
            fetching={meta.isFetching} refresh={() => { void meta.refetch(); }} sessions={campaigns.data}
            sessionsError={campaigns.isError} region={region} />

          <section className="bg-white rounded-2xl border border-ink/10 p-5">
            <h2 className="text-sm uppercase tracking-[0.18em] text-ink/50 mb-4">Portal de clientes</h2>
            {portal.isPending ? (
              <BrandLoader />
            ) : portal.isError ? (
              <div role="alert" className="text-sm text-destructive">No pudimos cargar los datos del portal. <Button variant="ghost" size="sm" onClick={() => { void portal.refetch(); }}>Reintentar</Button></div>
            ) : <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
              <Stat label="Clientas con cuenta que entraron" value={portal.data?.accounts ?? 0} />
              <Stat label="Sesiones en el portal" value={portal.data?.sessions ?? 0} />
              <Stat label="Cuentas registradas" value={portal.data?.total_accounts ?? 0} />
              <Stat label="Uso del portal" value={pct(portal.data?.accounts ?? 0, portal.data?.total_accounts ?? 0)} />
            </div>
            {(portal.data?.sections ?? []).length === 0 ? (
              <Empty />
            ) : (
              <div className="space-y-2">
                {(portal.data?.sections ?? []).map((s) => {
                  const max = Math.max(1, ...(portal.data?.sections ?? []).map((x) => x.visits));
                  return (
                    <div key={s.section} className="flex items-center gap-3">
                      <div className="w-52 shrink-0 text-sm text-ink/70 truncate">{SECTION_LABELS[s.section] ?? s.section}</div>
                      <div className="flex-1 h-3 bg-ink/5 rounded-full overflow-hidden">
                        <DataBar width={(s.visits / max) * 100} />
                      </div>
                      <div className="w-36 text-right text-sm tabular-nums">
                        {s.visits} visitas <span className="text-ink/40">· {s.accounts} clientas</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            </>}
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-white rounded-2xl border border-ink/10 p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-ink/50">{label}</div>
      <div className="text-2xl mt-1 tabular-nums">{typeof value === "number" ? value.toLocaleString("es-CO") : value}</div>
    </div>
  );
}

function Empty() {
  return <div className="text-sm text-ink/40 py-6 text-center">Sin datos en este periodo.</div>;
}

function TopList({ title, rows, unit = "sesiones", formatLabel }: { title: string; rows?: Row[]; unit?: string; formatLabel?: (label: string) => string }) {
  const max = Math.max(1, ...(rows ?? []).map((r) => r.sessions));
  return (
    <div className="bg-white rounded-2xl border border-ink/10 p-5">
      <h3 className="text-sm uppercase tracking-[0.18em] text-ink/50 mb-4">{title}</h3>
      {(rows ?? []).length === 0 ? (
        <Empty />
      ) : (
        <div className="space-y-2">
          {(rows ?? []).map((r) => (
            <div key={r.label} className="flex items-center gap-3">
              <div className="w-40 max-w-[55%] shrink-0 text-sm text-ink/70 break-words" title={formatLabel ? formatLabel(r.label) : r.label}>{formatLabel ? formatLabel(r.label) : r.label}</div>
              <div className="flex-1 h-2.5 bg-data-pale rounded-full overflow-hidden">
                <DataBar width={(r.sessions / max) * 100} />
              </div>
              <div className="w-20 text-right text-xs tabular-nums text-ink/60">{unit === "visitas" ? r.events : r.sessions}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function combineSeries(current: Series[], previous: Series[], key: keyof Pick<Series, "sessions" | "page_views" | "carts" | "purchases">): TrendPoint[] {
  return current.map((point, index) => ({ label: point.day.slice(5), current: Number(point[key]), previous: Number(previous[index]?.[key] ?? 0) }));
}
