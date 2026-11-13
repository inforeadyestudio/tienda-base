import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";

export type TrendPoint = { label: string; current: number; previous?: number };
const RANGES = [7, 30, 90, 365];

export function AnalyticsHeader({ eyebrow, subtitle, days, setDays }: { eyebrow: string; subtitle: string; days: number | "custom"; setDays: (days: number | "custom") => void }) {
  return <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-[10px] uppercase tracking-widest text-moss/70">{eyebrow}</p><h1 className="font-serif text-3xl mt-1">Informes y estadísticas</h1><p className="text-sm text-moss mt-1">{subtitle}</p></div><div className="flex gap-1 bg-card rounded-lg p-1 border border-border">{RANGES.map((d) => <Button key={d} size="sm" variant={days === d ? "default" : "ghost"} onClick={() => setDays(d)}>{d === 365 ? "12 meses" : `${d} días`}</Button>)}<Button size="sm" variant={days === "custom" ? "default" : "ghost"} onClick={() => setDays("custom")}>Personalizado</Button></div></header>;
}

export function changePct(current: number, previous: number) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

export function Trend({ value }: { value: number }) {
  const rounded = Math.abs(value).toFixed(0);
  if (Math.abs(value) < 0.5) return <span className="inline-flex items-center gap-1 text-xs font-medium text-data-muted"><Minus className="size-3" />0%</span>;
  const positive = value > 0;
  return (
    <span className={"inline-flex items-center gap-1 text-xs font-semibold " + (positive ? "text-data" : "text-clay")}>
      {positive ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}{rounded}%
    </span>
  );
}

export function MetricCard({ label, value, change }: { label: string; value: string; change?: number }) {
  return (
    <div className="bg-card rounded-xl border border-border p-5 shadow-sm min-w-0">
      <div className="text-xs font-medium text-muted-foreground border-b border-dotted border-border inline-block">{label}</div>
      <div className="flex items-baseline gap-2 mt-2 min-w-0">
        <div className="text-2xl font-semibold tabular-nums truncate">{value}</div>
        {change !== undefined && <Trend value={change} />}
      </div>
      {change !== undefined && <div className="text-[10px] text-muted-foreground mt-1">vs. periodo anterior</div>}
    </div>
  );
}

export function TrendChart({ title, value, change, data, formatter = (v) => v.toLocaleString("es-CO") }: {
  title: string; value: string; change: number; data: TrendPoint[]; formatter?: (value: number) => string;
}) {
  return (
    <section className="bg-card rounded-xl border border-border p-5 shadow-sm min-w-0">
      <h3 className="text-sm font-medium text-foreground border-b border-dotted border-border inline-block">{title}</h3>
      <div className="flex items-baseline gap-2 mt-1 mb-4"><span className="text-2xl font-semibold tabular-nums">{value}</span><Trend value={change} /></div>
      <div className="h-48 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
            <defs><linearGradient id={`fill-${title.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--data)" stopOpacity={0.22}/><stop offset="100%" stopColor="var(--data)" stopOpacity={0}/></linearGradient></defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} minTickGap={28} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} tickLine={false} axisLine={false} tickFormatter={formatter} />
            <Tooltip formatter={(v) => formatter(Number(v))} contentStyle={{ borderRadius: 8, borderColor: "var(--border)", fontSize: 12 }} />
            <Area type="monotone" dataKey="previous" stroke="var(--data-muted)" fill="transparent" strokeWidth={2} strokeDasharray="4 5" dot={false} />
            <Area type="monotone" dataKey="current" stroke="var(--data)" fill={`url(#fill-${title.replace(/\W/g, "")})`} strokeWidth={2.5} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-4 text-[10px] text-muted-foreground mt-2">
        <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-data" />Periodo actual</span>
        <span className="inline-flex items-center gap-1.5"><i className="size-2 rounded-full bg-data-muted" />Periodo anterior</span>
      </div>
    </section>
  );
}

export function DataBar({ width }: { width: number }) {
  return <div className="h-full rounded-full bg-data transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, width))}%` }} />;
}
export type FunnelStep = { label: string; value: number; previous?: number };

/** Embudo por columnas estilo Shopify: % del total, conteo, cambio vs periodo anterior y barras con transición. */
export function FunnelColumns({ steps }: { steps: FunnelStep[] }) {
  const base = Math.max(1, steps[0]?.value ?? 0);
  const second = Math.max(1, ...steps.slice(1).map((s) => s.value));
  // La primera barra va completa con corte; las demás se escalan entre sí para que sean legibles.
  const heights = steps.map((s, i) => (i === 0 ? 100 : 12 + 48 * (s.value / second)));
  const fmtPct = (v: number) => {
    const p = (v / base) * 100;
    return `${p >= 10 || p === 0 ? p.toFixed(0) : p.toFixed(p < 1 ? 2 : 1)}%`.replace(".", ",");
  };
  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[640px]" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0,1fr))` }}>
        {steps.map((s, i) => {
          const ch = s.previous == null ? null : s.previous === 0 ? (s.value > 0 ? 100 : 0) : ((s.value - s.previous) / s.previous) * 100;
          const next = heights[i + 1];
          return (
            <div key={s.label} className={`flex flex-col ${i > 0 ? "border-l border-ink/10" : ""}`}>
              <div className="px-3 pb-4">
                <div className="truncate text-sm text-ink/70" title={s.label}>{s.label}</div>
                <div className="mt-1 text-xl tabular-nums">{fmtPct(s.value)}</div>
                <div className="text-lg tabular-nums text-ink/80">{s.value.toLocaleString("es-CO")}</div>
                {ch != null && (
                  <div className={`text-sm tabular-nums ${ch >= 0 ? "text-data" : "text-ink/50"}`}>
                    {ch >= 0 ? "↗" : "↘"} {Math.abs(Math.round(ch))}%
                  </div>
                )}
              </div>
              <div className="relative flex h-56 items-end">
                <div className="relative h-full flex-1 flex items-end">
                  <div className="relative w-full rounded-t-md bg-data transition-[height] duration-500" style={{ height: `${heights[i]}%` }}>
                    {i === 0 && (
                      <div className="absolute inset-x-0 top-[20%] space-y-1">
                        <div className="h-[3px] bg-card" />
                        <div className="h-[3px] bg-card" />
                      </div>
                    )}
                  </div>
                </div>
                {next != null && (
                  <svg className="h-full w-8 shrink-0" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
                    <polygon points={`0,${100 - heights[i]} 100,${100 - next} 100,100 0,100`} className="fill-data-soft" />
                  </svg>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
