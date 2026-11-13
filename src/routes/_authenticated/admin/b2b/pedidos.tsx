import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useDraftState } from "@/hooks/use-draft-state";
import { useB2BOrders } from "@/lib/b2b/admin";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/b2b/portal";
import { AlertTriangle, Copy, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { B2BManualOrder } from "@/components/admin/b2b-manual-order";
import { useOrderInvoices, InvoiceCell } from "@/components/admin/invoice-cell";
import { ConsignmentReportModal } from "@/components/admin/consignment-report-modal";
import { EtaBadge, etaStatus } from "@/components/b2b/order-extras";
import { TrmBadge } from "@/components/b2b/trm-badge";

import { MobileOrderList } from "@/components/admin/mobile-order-list";

export const Route = createFileRoute("/_authenticated/admin/b2b/pedidos")({
  head: () => ({ meta: [
    { title: "Pedidos B2B · Tu Marca" },
    { name: "description", content: "Gestión de pedidos y preventas mayoristas de Tu Marca." },
    { property: "og:title", content: "Pedidos B2B · Tu Marca" },
    { property: "og:description", content: "Gestión de pedidos y preventas mayoristas de Tu Marca." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <B2BPedidos />,
});

const TABS = ["all", "draft", "reserved", "paid", "preparing", "shipped", "delivered"] as const;
const LABEL: Record<string, string> = {
  all: "Todos", draft: "Borradores", reserved: "En proceso", paid: "En proceso", preparing: "En proceso",
  shipped: "Enviados", delivered: "Entregados",
};

export function B2BPedidos({ embedded = false }: { embedded?: boolean }) {
  const { data, isLoading } = useB2BOrders();
  const [creating, setCreating] = useDraftState("draft-b2b-order-open", false);
  const [duplicating, setDuplicating] = useState<{ id: string; customer_id: string | null; currency: string | null; b2b_mode: string | null; order_items: { variant_id: string | null; qty: number }[] } | null>(null);
  const [consig, setConsig] = useState(false);
  const { data: invoices } = useOrderInvoices((data ?? []).map((o: any) => o.id));
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const [kind, setKind] = useState<"direct" | "consignment" | "restock">("direct");
  const isConsigOrder = (o: any) => o.b2b_mode === "consignment" || String(o.notes ?? "").includes("CONSIGNACIÓN");
  const kindOf = (o: any) => (o.b2b_mode === "restock" ? "restock" : isConsigOrder(o) ? "consignment" : "direct");
  const byKind = (data ?? []).filter((o: any) => kindOf(o) === kind);
  const rows = byKind.filter((o: any) => tab === "all" || o.status === tab);
  const etaAlerts = (data ?? []).filter((o: any) => etaStatus(o.b2b_ship_eta, o.status)?.label).length;
  const { data: maxDays } = useQuery({
    queryKey: ["b2b-preliminary-max-days"],
    queryFn: async () => {
      const { data } = await supabase.from("locations").select("b2b_preliminary_max_days").eq("kind", "warehouse").eq("active", true).order("priority", { ascending: false }).limit(1).maybeSingle();
      return (data as any)?.b2b_preliminary_max_days ?? 15;
    },
  });
  const limitMs = (maxDays ?? 15) * 86400000;
  const isStale = (o: any) => o.status === "draft" && Date.now() - new Date(o.created_at).getTime() > limitMs;
  const staleCount = (data ?? []).filter(isStale).length;

  return (
    <div className={embedded ? "w-full min-w-0" : "w-full min-w-0 p-4 md:p-10"}>
       {(creating || duplicating) && <B2BManualOrder key={duplicating?.id ?? "new"} initialOrder={duplicating ?? undefined} onClose={() => { setCreating(false); setDuplicating(null); }} />}
      {consig && <ConsignmentReportModal onClose={() => setConsig(false)} />}
      {staleCount > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-clay/30 bg-clay/10 px-4 py-3 text-xs text-clay">
          <AlertTriangle className="size-4" />
          {staleCount} preventa{staleCount === 1 ? "" : "s"} lleva{staleCount === 1 ? "" : "n"} más de {maxDays} días sin surtir.
        </div>
      )}
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
        {!embedded && <p className="text-[10px] uppercase tracking-[0.2em] text-moss/70">Operación mayorista</p>}
        <div className="flex flex-wrap items-center gap-4">
          {!embedded && <h1 className="font-serif text-3xl md:text-4xl text-ink mt-1">Pedidos B2B</h1>}
          {!embedded && <TrmBadge className="mt-2" />}
        </div>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
        <button onClick={() => setConsig(true)} className="px-5 py-2.5 rounded-full bg-white border border-ink/15 text-xs">
          Reportar ventas de consignación
        </button>
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-ink text-ivory text-xs">
          <Plus className="size-4" /> Nuevo pedido B2B
        </button>
        </div>
      </header>

      {etaAlerts > 0 && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <AlertTriangle className="size-4" /> {etaAlerts} pedido{etaAlerts === 1 ? "" : "s"} con fecha de envío próxima o atrasada.
        </div>
      )}
      <div className="flex max-w-full gap-6 mb-4 overflow-x-auto border-b border-ink/10">
        {([["direct", "Ventas en firme"], ["consignment", "Ventas consignación"], ["restock", "Restock"]] as const).map(([k, l]) => {
          const n = (data ?? []).filter((o: any) => kindOf(o) === k).length;
          return (
            <button key={k} onClick={() => setKind(k)}
              className={"shrink-0 pb-2.5 -mb-px text-sm border-b-2 " + (kind === k ? "border-ink text-ink" : "border-transparent text-ink/50")}>
              {l} <span className="text-ink/40">({n})</span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-2 mb-5">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={
              "px-4 py-2 rounded-full text-xs transition-colors " +
              (tab === t ? "bg-ink text-ivory" : "bg-white border border-ink/10 text-ink/70 hover:border-ink/25")
            }
          >
            {LABEL[t]}
          </button>
        ))}
      </div>

      <div className="max-w-full bg-card rounded-3xl border border-border overflow-x-auto">
        <MobileOrderList orders={rows} loading={isLoading} b2b />
        <table className="hidden w-full text-sm md:table">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-ink/45 border-b border-ink/8">
              <th className="px-5 py-3">Pedido</th>
              <th className="px-5 py-3">Cuenta</th>
              <th className="px-5 py-3">Unidades</th>
              <th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3">Fecha</th>
              <th className="px-5 py-3">Envío estimado</th>
              <th className="px-5 py-3">Total</th>
              <th className="px-5 py-3">Factura</th>
               <th className="px-5 py-3">Acción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o: any) => (
              <tr key={o.id} className="border-b border-ink/5 last:border-0">
                <td className="px-5 py-3 font-medium"><Link to="/admin/b2b/pedido/$id" params={{ id: o.id }} className="underline decoration-ink/20">{o.number}</Link></td>
                <td className="px-5 py-3 text-ink/60">{o.contact_name ?? "—"}</td>
                <td className="px-5 py-3">{(o.order_items ?? []).reduce((s: number, i: any) => s + i.qty, 0)}</td>
                <td className="px-5 py-3">
                  {(() => {
                    const statusLabel = LABEL[o.status] ?? (o.status === "cancelled" ? "Cancelado" : o.status);
                    return <span className="text-[10px] uppercase tracking-[0.15em] bg-ink/5 px-2.5 py-1 rounded-full">{statusLabel}</span>;
                  })()}
                  {isStale(o) && <span className="ml-2 text-[10px] uppercase tracking-[0.15em] text-clay">Vencido</span>}
                  <span className="ml-1 text-[10px] uppercase tracking-[0.15em] bg-ink/5 px-2.5 py-1 rounded-full">{o.currency === "USD" ? "USD" : "COP"}</span>
                </td>
                <td className="px-5 py-3 text-ink/60">{formatDate(o.created_at)}</td>
                <td className="px-5 py-3 text-ink/60 whitespace-nowrap">{o.b2b_ship_eta ? formatDate(o.b2b_ship_eta + "T12:00:00") : "—"} <EtaBadge eta={o.b2b_ship_eta} status={o.status} /></td>
                 <td className="px-5 py-3">{formatMoney(o.currency === "USD" ? Number(o.total_usd ?? 0) : Number(o.total_cop ?? 0), o.currency === "USD" ? "USD" : "COP")}</td>
                <td className="px-5 py-3"><InvoiceCell inv={invoices?.get(o.id)} /></td>
                <td className="px-5 py-3"><button type="button" onClick={() => setDuplicating(o)} className="inline-flex items-center gap-1.5 text-xs text-ink/70 hover:text-ink" aria-label={`Duplicar pedido ${o.number}`}><Copy className="size-3.5" /> Duplicar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading && <div className="hidden px-5 py-8 text-sm text-ink/50 md:block">Cargando…</div>}
        {!isLoading && !rows.length && <div className="hidden px-5 py-8 text-sm text-ink/50 md:block">Sin pedidos en este estado.</div>}
      </div>
    </div>
  );
}
