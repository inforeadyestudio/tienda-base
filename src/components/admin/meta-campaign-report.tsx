import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandLoader } from "@/components/ui/page-loader";
import { latestCampaigns, metaMetrics } from "@/lib/meta-report";
import { formatCOP, formatUSD } from "@/lib/format";
import type { getMetaCampaignReport } from "@/lib/meta-report.functions";

type Report = NonNullable<Awaited<ReturnType<typeof getMetaCampaignReport>>["report"]>;
type StatusFilter = "all" | "ACTIVE" | "PAUSED";

const META_CAMPAIGN_LIMIT = 8;
const fmtDay = (iso: string) => {
  const date = new Date(`${iso}T12:00:00`);
  const parts = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("es-CO", options).format(date).replace(".", "");
  return `${parts({ day: "numeric" })} ${parts({ month: "short" })} ${parts({ year: "numeric" })}`;
};
const tzCity = (tz: string) => {
  const city = (tz.split("/").pop() ?? tz).replace(/_/g, " ");
  return city === "Bogota" ? "Bogotá" : city;
};

export function MetaCampaignReport({ report, hub, error, loading, fetching, refresh, sessions, sessionsError, region }: {
  report?: Report | null; hub?: Record<string, { orders: number; cop: number; usd: number }>; error?: string | null; loading: boolean; fetching: boolean; refresh: () => void;
  sessions?: { label: string; sessions: number }[]; sessionsError: boolean; region: string;
}) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const rows = useMemo(() => {
    if (!report) return [];
    const insights = new Map(report.insights.map((i) => [i.campaign_id, i]));
    return latestCampaigns(report.campaigns, META_CAMPAIGN_LIMIT)
      .filter((campaign) => statusFilter === "all" || campaign.status === statusFilter)
      .map((campaign) => {
        const insight = insights.get(campaign.id);
        const count = (sessions ?? []).filter((r) => r.label === campaign.id || r.label === campaign.name || r.label === insight?.campaign_name)
          .reduce((sum, r) => sum + r.sessions, 0);
        return { id: campaign.id, name: campaign.name, status: campaign.status, sessions: count, metrics: metaMetrics(insight) };
      });
  }, [report, sessions, statusFilter]);
  const money = (value: number) => report?.account.currency === "USD" ? formatUSD(value)
    : report?.account.currency === "COP" ? formatCOP(value)
    : new Intl.NumberFormat("es-CO", { style: "currency", currency: report?.account.currency ?? "COP" }).format(value);
  return (
    <section className="min-w-0 border-y border-border py-6 space-y-4" aria-label="Campañas de Meta">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm uppercase tracking-[0.18em] text-ink/70">Campañas de Meta</h2>
          <p className="text-xs text-muted-foreground mt-1">{report?.account.name ?? "Facebook e Instagram"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1">
            {([["all", "Todas"], ["ACTIVE", "Activas"], ["PAUSED", "Pausadas"]] as const).map(([key, label]) => (
              <button key={key} onClick={() => setStatusFilter(key)}
                className={"px-3 py-1.5 rounded-full text-xs border " + (statusFilter === key ? "bg-ink text-ivory border-ink" : "bg-card border-border text-ink/70")}>
                {label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" disabled={fetching} onClick={refresh}>
            <RefreshCw className={fetching ? "size-4 animate-spin" : "size-4"} /> Actualizar
          </Button>
        </div>
      </div>
      {loading ? <BrandLoader /> : error ? <p role="alert" className="text-sm text-destructive">{error}</p> : (
        <>
          <p className="text-xs text-muted-foreground">
            {report ? `${fmtDay(report.dates.since)} — ${fmtDay(report.dates.until)} · ${tzCity(report.account.timezone)}` : "—"}
          </p>
          <p className="text-xs text-muted-foreground">
            Últimas {META_CAMPAIGN_LIMIT} campañas más recientes. Las compras y su valor corresponden a la atribución de Meta, no al total de pedidos del Hub. «Ventas registradas en el Hub» son los pedidos Online pagados que llegaron por esa campaña (última visita con anuncio en los 7 días previos).
            {" "}Meta usa su configuración de atribución y puede actualizar resultados con retraso.
            {region !== "all" && " Meta muestra todos los países; el filtro nacional/internacional aplica solo a las sesiones de la tienda."}
          </p>
          {rows.length === 0 ? <p className="text-sm text-muted-foreground">Sin datos en este periodo.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>{["Campaña", "Sesiones tienda", "Clics al enlace", "Visitas Meta", "Compras web Meta", "Ventas registradas en el Hub", "Inversión", "Valor compras Meta", "ROAS"].map((label) => (
                    <th key={label} className="px-3 py-3 text-left font-medium whitespace-nowrap">{label}</th>
                  ))}</tr>
                </thead>
                <tbody>{rows.map((row) => (
                  <tr key={row.id} className="border-b border-border/60">
                    <td className="px-3 py-3 min-w-60 max-w-80">
                      <span className="block break-words">{row.name}</span>
                      {row.status === "ACTIVE" ? (
                        <span className="mt-1 inline-flex items-center rounded-full bg-brand-green px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ivory">Activada</span>
                      ) : row.status === "PAUSED" ? (
                        <span className="mt-1 inline-flex items-center rounded-full bg-ink/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink/60">Pausada</span>
                      ) : (
                        <span className="mt-1 inline-flex items-center rounded-full bg-ink/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink/50">Histórica</span>
                      )}
                    </td>
                    <td className="px-3 py-3 tabular-nums">{sessionsError ? "—" : row.sessions.toLocaleString("es-CO")}</td>
                    <td className="px-3 py-3 tabular-nums">{row.metrics.clicks.toLocaleString("es-CO")}</td>
                    <td className="px-3 py-3 tabular-nums">{row.metrics.landingViews.toLocaleString("es-CO")}</td>
                    <td className="px-3 py-3 tabular-nums">{row.metrics.purchases.toLocaleString("es-CO")}</td>
                    <td className="px-3 py-3 tabular-nums whitespace-nowrap">{(() => {
                      const h = hub?.[row.id];
                      if (!h) return "0";
                      const parts = [h.cop ? formatCOP(h.cop) : "", h.usd ? formatUSD(h.usd) : ""].filter(Boolean).join(" + ");
                      return `${h.orders} · ${parts || formatCOP(0)}`;
                    })()}</td>
                    <td className="px-3 py-3 tabular-nums whitespace-nowrap text-destructive">{money(row.metrics.spend)}</td>
                    <td className="px-3 py-3 tabular-nums whitespace-nowrap">{row.metrics.value === null ? "—" : money(row.metrics.value)}</td>
                    <td className="px-3 py-3 tabular-nums">{row.metrics.roas === null ? "—" : `${row.metrics.roas.toFixed(2)}×`}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-muted-foreground">Sesiones tienda: visitas identificadas por campaña en el enlace; sin etiqueta no se pueden asignar. Visitas Meta: cargas de la página de destino reportadas por Meta. Actualizado: {report ? new Date(report.fetchedAt).toLocaleString("es-CO") : "—"}.</p>
        </>
      )}
    </section>
  );
}
