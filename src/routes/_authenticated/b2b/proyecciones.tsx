import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { B2BTopBar } from "@/components/b2b/b2b-topbar";
import { formatMoney, useB2BSettings, useMyB2BStats } from "@/lib/b2b/portal";

export const Route = createFileRoute("/_authenticated/b2b/proyecciones")({
  head: () => ({
    meta: [
      { title: "Proyecciones mayoristas · Tu Marca" },
      { name: "description", content: "Simula tu próxima compra con base en tu histórico real." },
      { property: "og:title", content: "Proyecciones mayoristas · Tu Marca" },
      { property: "og:description", content: "Simula tu próxima compra con base en tu histórico real." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: B2BProjections,
});

const SIZES = [
  { label: "Pequeña (menos de 30 m²)", units: 60 },
  { label: "Mediana (30 a 60 m²)", units: 100 },
  { label: "Grande (más de 60 m²)", units: 160 },
];

function B2BProjections() {
  const { data: settings } = useB2BSettings();
  const { data: stats } = useMyB2BStats();
  const [sizeIdx, setSizeIdx] = useState(1);
  const [ticket, setTicket] = useState("120");
  const [margin, setMargin] = useState(2.5);
  const currency = settings?.currency ?? "USD";

  const projection = useMemo(() => {
    const base = SIZES[sizeIdx]?.units ?? 100;
    const history = stats?.orders ? stats.units / stats.orders : 0;
    const units = Math.round(history > 0 ? (history * 0.6 + base * 0.4) : base);
    const retail = Number(ticket) || 0;
    const cost = margin > 0 ? retail / margin : 0;
    return { units, investment: Math.round(units * cost), revenue: Math.round(units * retail) };
  }, [sizeIdx, ticket, margin, stats]);

  return (
    <div className="flex-1 flex flex-col">
      <B2BTopBar />
      <div className="p-4 md:p-6 space-y-5">
        <header>
          <p className="text-[10px] tracking-[0.2em] text-ink/50">PLANEACIÓN</p>
          <h1 className="font-serif italic text-3xl md:text-4xl mt-1">Proyecciones</h1>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Kpi label="Unidades compradas" value={String(stats?.units ?? 0)} />
          <Kpi label="Pedidos aprobados" value={String(stats?.orders ?? 0)} />
          <Kpi label="Inversión histórica" value={formatMoney(stats?.revenue ?? 0, currency)} />
          <Kpi label="Promedio por pedido" value={String(stats?.orders ? Math.round((stats.units ?? 0) / stats.orders) : 0) + " uds"} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
          <div className="bg-white rounded-3xl border border-ink/8 p-5">
            <div className="text-[10px] tracking-[0.2em] text-ink/50">SIMULADOR DE COMPRA</div>
            <div className="mt-4 space-y-3 max-w-md">
              <Field label="Tamaño de tu boutique">
                <select value={sizeIdx} onChange={(e) => setSizeIdx(Number(e.target.value))} className="w-full bg-transparent text-[13px] outline-none">
                  {SIZES.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
                </select>
              </Field>
              <Field label={`Precio de venta promedio (${currency})`}>
                <input value={ticket} onChange={(e) => setTicket(e.target.value)} className="w-full bg-transparent text-[13px] outline-none" />
              </Field>
              <Field label="Margen objetivo">
                <select value={margin} onChange={(e) => setMargin(Number(e.target.value))} className="w-full bg-transparent text-[13px] outline-none">
                  {[2, 2.5, 3].map((m) => <option key={m} value={m}>{m.toFixed(1)}x</option>)}
                </select>
              </Field>
            </div>
          </div>
          <div className="bg-white rounded-3xl border border-ink/8 p-5">
            <div className="text-[10px] tracking-[0.2em] text-ink/50">RECOMENDACIÓN</div>
            <div className="mt-4 space-y-4">
              <Stat label="UNIDADES SUGERIDAS" value={`${projection.units} uds`} />
              <Stat label="INVERSIÓN SUGERIDA" value={formatMoney(projection.investment, currency)} />
              <Stat label="VENTA POTENCIAL" value={formatMoney(projection.revenue, currency)} />
            </div>
            <p className="text-[10px] text-ink/45 mt-4">Calculado con tu histórico real de compra y el tamaño de tu punto de venta.</p>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-ink/8 p-5">
          <div className="text-[10px] tracking-[0.2em] text-ink/50">TU MEZCLA POR CATEGORÍA</div>
          {!stats?.categories.length && <p className="text-[12px] text-ink/45 mt-3">Aún no hay histórico para analizar.</p>}
          <div className="mt-4 space-y-2.5">
            {(stats?.categories ?? []).map((c) => {
              const max = Math.max(1, ...(stats?.categories ?? []).map((x) => x.units));
              return (
                <div key={c.label}>
                  <div className="flex justify-between text-[11px] mb-1"><span>{c.label}</span><span className="text-ink/55">{c.units} uds</span></div>
                  <div className="h-2.5 rounded-full bg-[#f0e6d2] overflow-hidden">
                    <div className="h-full bg-[#a8926a]" style={{ width: `${(c.units / max) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-2xl border border-ink/8 p-4">
      <div className="text-[10px] tracking-[0.16em] text-ink/50">{label.toUpperCase()}</div>
      <div className="font-serif italic text-2xl mt-1">{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.16em] text-ink/50">{label}</div>
      <div className="font-serif italic text-2xl mt-0.5">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border border-ink/10 rounded-xl px-3 py-2 bg-[#faf6ee]">
      <div className="text-[9px] tracking-[0.14em] text-ink/50 mb-1">{label.toUpperCase()}</div>
      {children}
    </div>
  );
}
