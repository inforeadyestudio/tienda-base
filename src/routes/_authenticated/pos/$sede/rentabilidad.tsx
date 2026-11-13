import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCOP } from "@/lib/format";
import { SEDES } from "./route";

export const Route = createFileRoute("/_authenticated/pos/$sede/rentabilidad")({
  component: SedeRentabilidad,
});

type Row = {
  variant_id: string;
  qty: number;
  revenue: number;
  cost: number;
  product_id: string;
  product_name: string;
  product_type: string | null;
  reference_code: string | null;
  tags: string[];
  collections: string[];
};

function SedeRentabilidad() {
  const { sede } = useParams({ from: "/_authenticated/pos/$sede/rentabilidad" });
  const info = SEDES[sede as keyof typeof SEDES];
  const [days, setDays] = useState(30);
  const [groupBy, setGroupBy] = useState<"type" | "collection" | "reference" | "tag">("type");
  const [tagFilter, setTagFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");

  const { data: loc } = useQuery({
    queryKey: ["sede-loc", info.code],
    queryFn: async () =>
      (await supabase.from("locations").select("id").eq("code", info.code).maybeSingle()).data,
  });

  const { data: rows } = useQuery({
    queryKey: ["sede-profitability", loc?.id, days],
    enabled: !!loc?.id,
    queryFn: async (): Promise<Row[]> => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data: sessions } = await supabase.from("pos_sessions").select("id").eq("location_id", loc!.id);
      const sids = (sessions ?? []).map((s) => s.id);
      if (!sids.length) return [];
      const { data: sales } = await supabase
        .from("pos_sales")
        .select("order_id")
        .in("session_id", sids)
        .gte("created_at", since);
      const orderIds = Array.from(new Set((sales ?? []).map((s) => s.order_id)));
      if (!orderIds.length) return [];
      const { data: items } = await supabase
        .from("order_items")
        .select("variant_id, qty, unit_price_cop, product_variants(cost_cop, products(id, name, product_type, reference_code, tags, collection_products(collections(title))))")
        .in("order_id", orderIds);
      return (items ?? []).map((i: any) => {
        const p = i.product_variants?.products;
        const cost = i.product_variants?.cost_cop ?? 0;
        return {
          variant_id: i.variant_id,
          qty: i.qty,
          revenue: i.unit_price_cop * i.qty,
          cost: cost * i.qty,
          product_id: p?.id ?? "",
          product_name: p?.name ?? "",
          product_type: p?.product_type ?? null,
          reference_code: p?.reference_code ?? null,
          tags: p?.tags ?? [],
          collections: (p?.collection_products ?? []).map((cp: any) => cp.collections?.title).filter(Boolean),
        };
      });
    },
  });

  const allTags = useMemo(() => Array.from(new Set((rows ?? []).flatMap((r) => r.tags))).sort(), [rows]);
  const allTypes = useMemo(() => Array.from(new Set((rows ?? []).map((r) => r.product_type).filter(Boolean) as string[])).sort(), [rows]);

  const filtered = useMemo(() => {
    return (rows ?? []).filter((r) => {
      if (tagFilter && !r.tags.includes(tagFilter)) return false;
      if (typeFilter && r.product_type !== typeFilter) return false;
      return true;
    });
  }, [rows, tagFilter, typeFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, { key: string; qty: number; revenue: number; cost: number }>();
    for (const r of filtered) {
      const keys: string[] =
        groupBy === "type" ? [r.product_type ?? "Sin tipo"]
        : groupBy === "reference" ? [r.reference_code ?? r.product_name]
        : groupBy === "collection" ? (r.collections.length ? r.collections : ["Sin colección"])
        : (r.tags.length ? r.tags : ["Sin etiqueta"]);
      for (const k of keys) {
        const cur = map.get(k) ?? { key: k, qty: 0, revenue: 0, cost: 0 };
        cur.qty += r.qty;
        cur.revenue += r.revenue;
        cur.cost += r.cost;
        map.set(k, cur);
      }
    }
    return Array.from(map.values()).sort((a, b) => (b.revenue - b.cost) - (a.revenue - a.cost));
  }, [filtered, groupBy]);

  const totals = useMemo(() => {
    const revenue = filtered.reduce((s, r) => s + r.revenue, 0);
    const cost = filtered.reduce((s, r) => s + r.cost, 0);
    const margin = revenue - cost;
    const marginPct = revenue > 0 ? (margin / revenue) * 100 : 0;
    return { revenue, cost, margin, marginPct };
  }, [filtered]);

  return (
    <div className="p-10">
      <header className="mb-8 flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-moss/70">Analítica · {info.label}</p>
          <h1 className="font-serif italic text-4xl mt-1">Rentabilidad</h1>
          <p className="text-sm text-moss mt-2 max-w-xl">Margen del punto físico filtrable por tipo, colección, referencia o etiqueta.</p>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button key={d} onClick={() => setDays(d)} className={"px-4 py-2 rounded-full text-sm border " + (days === d ? "bg-ink text-ivory border-ink" : "bg-white border-ink/15 text-ink/70")}>
              {d}d
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <Kpi label="Ingresos" value={formatCOP(totals.revenue)} />
        <Kpi label="Costo" value={formatCOP(totals.cost)} />
        <Kpi label="Margen" value={formatCOP(totals.margin)} />
        <Kpi label="Margen %" value={`${totals.marginPct.toFixed(1)}%`} />
      </div>

      <div className="bg-white border border-ink/10 rounded-2xl p-5 mb-6 flex flex-wrap gap-3 items-center">
        <span className="text-xs uppercase tracking-widest text-moss/70">Agrupar por</span>
        {(["type", "collection", "reference", "tag"] as const).map((g) => (
          <button key={g} onClick={() => setGroupBy(g)} className={"px-4 py-2 rounded-full text-sm border capitalize " + (groupBy === g ? "bg-ink text-ivory border-ink" : "bg-white border-ink/15 text-ink/70")}>
            {g === "type" ? "Tipo" : g === "collection" ? "Colección" : g === "reference" ? "Referencia" : "Etiqueta"}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-full border border-ink/15 px-4 py-2 bg-ivory text-sm">
            <option value="">Todos los tipos</option>
            {allTypes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} className="rounded-full border border-ink/15 px-4 py-2 bg-ivory text-sm">
            <option value="">Todas las etiquetas</option>
            {allTags.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-white border border-ink/10 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-widest text-moss/70">
            <tr>
              <th className="text-left px-4 py-3">Grupo</th>
              <th className="text-right">Unidades</th>
              <th className="text-right">Ingresos</th>
              <th className="text-right">Costo</th>
              <th className="text-right">Margen</th>
              <th className="text-right px-4">Margen %</th>
            </tr>
          </thead>
          <tbody>
            {grouped.map((g) => {
              const margin = g.revenue - g.cost;
              const pct = g.revenue > 0 ? (margin / g.revenue) * 100 : 0;
              return (
                <tr key={g.key} className="border-t border-ink/5">
                  <td className="px-4 py-3">{g.key}</td>
                  <td className="text-right">{g.qty}</td>
                  <td className="text-right">{formatCOP(g.revenue)}</td>
                  <td className="text-right text-moss/70">{formatCOP(g.cost)}</td>
                  <td className="text-right font-medium">{formatCOP(margin)}</td>
                  <td className="text-right px-4">{pct.toFixed(1)}%</td>
                </tr>
              );
            })}
            {grouped.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-moss/60">Sin datos. Registra costos en las variantes y ventas en el POS.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-ink/10 rounded-2xl p-5">
      <div className="text-[10px] uppercase tracking-widest text-moss/70">{label}</div>
      <div className="font-serif italic text-3xl mt-2">{value}</div>
    </div>
  );
}