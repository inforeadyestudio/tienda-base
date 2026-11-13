import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCOP, formatDate } from "@/lib/format";
import { fetchAll } from "@/lib/fetch-all";
import { usePaged } from "@/components/ui/use-paged";

type Market = "all" | "nacional" | "internacional";

export function EcomFinanzas() {
  const [market, setMarket] = useState<Market>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["ecom-fin", market],
    queryFn: async () => {
      return fetchAll((from, to) => supabase
        .from("orders")
        .select("id, number, total_cop, subtotal_cop, shipping_cop, discount_cop, contact_name, contact_email, status, paid_at, created_at, order_fulfillments(location_id, locations(code, name))")
        .eq("source", "ecom")
        .in("status", ["paid", "preparing", "shipped", "delivered"])
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to));
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    if (market === "all") return data;
    const targetCode = market === "nacional" ? "ecom" : "ecom_intl";
    return data.filter((o: any) =>
      (o.order_fulfillments ?? []).some((f: any) => f.locations?.code === targetCode)
    );
  }, [data, market]);

  const totals = useMemo(() => {
    const subtotal = filtered.reduce((s: number, o: any) => s + (o.subtotal_cop ?? 0), 0);
    const shipping = filtered.reduce((s: number, o: any) => s + (o.shipping_cop ?? 0), 0);
    const discount = filtered.reduce((s: number, o: any) => s + (o.discount_cop ?? 0), 0);
    const total = filtered.reduce((s: number, o: any) => s + (o.total_cop ?? 0), 0);
    return { subtotal, shipping, discount, total, count: filtered.length };
  }, [filtered]);
  const { pageItems, pager } = usePaged(filtered);

  return (
    <div>
      <div className="flex gap-1 bg-white border border-ink/10 rounded-full p-1 mb-6 w-fit">
        {(["all", "nacional", "internacional"] as const).map((m) => (
          <button key={m} onClick={() => setMarket(m)} className={"px-5 py-2 rounded-full text-sm transition " + (market === m ? "bg-ink text-ivory" : "text-ink/60 hover:text-ink")}>
            {m === "all" ? "Todas" : m === "nacional" ? "Nacional" : "Internacional"}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <KPI label="Pedidos" value={String(totals.count)} />
        <KPI label="Subtotal" value={formatCOP(totals.subtotal)} />
        <KPI label="Envíos" value={formatCOP(totals.shipping)} />
        <KPI label="Total" value={formatCOP(totals.total)} strong />
      </div>

      {isLoading ? (
        <p className="text-sm text-ink/50 py-10 text-center">Cargando…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-ink/50 py-16 text-center">Sin pedidos.</p>
      ) : (
        <div className="rounded-3xl bg-white border border-ink/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ivory/60 text-[10px] uppercase tracking-widest text-ink/50">
              <tr>
                <th className="text-left px-6 py-4">Fecha</th>
                <th className="text-left px-4 py-4">Pedido</th>
                <th className="text-left px-4 py-4">Cliente</th>
                <th className="text-left px-4 py-4">Mercado</th>
                <th className="text-left px-4 py-4">Estado</th>
                <th className="text-right px-6 py-4">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {pageItems.map((o: any) => {
                const loc = o.order_fulfillments?.[0]?.locations;
                const isIntl = loc?.code === "ecom_intl";
                return (
                  <tr key={o.id} className="hover:bg-ivory/30">
                    <td className="px-6 py-3.5">{formatDate(o.created_at)}</td>
                    <td className="px-4 py-3.5 font-mono text-xs">{o.number}</td>
                    <td className="px-4 py-3.5">{o.contact_name ?? o.contact_email ?? "—"}</td>
                    <td className="px-4 py-3.5"><span className="text-xs px-2.5 py-1 rounded-full bg-ivory/70 border border-ink/10">{isIntl ? "Internacional" : "Nacional"}</span></td>
                    <td className="px-4 py-3.5 capitalize text-ink/70">{o.status}</td>
                    <td className="px-6 py-3.5 text-right font-medium">{formatCOP(o.total_cop)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pager}
        </div>
      )}
    </div>
  );
}

function KPI({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-2xl bg-white border border-ink/10 p-5">
      <div className="text-[10px] uppercase tracking-widest text-ink/50">{label}</div>
      <div className={"mt-2 " + (strong ? "text-2xl" : "text-xl text-ink/80")}>{value}</div>
    </div>
  );
}
