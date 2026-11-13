import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PackageCheck, Truck, CheckCircle2, Store as StoreIcon, Globe, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { usePaged } from "@/components/ui/use-paged";
import { formatCOP, formatDate } from "@/lib/format";
import { SEDES } from "./route";

export const Route = createFileRoute("/_authenticated/pos/$sede/pedidos")({
  component: SedeDespachos,
});

type Tab = "pendientes" | "empacados" | "despachados" | "entregados";

const TABS: { id: Tab; label: string; statuses: string[] }[] = [
  { id: "pendientes", label: "Por empacar", statuses: ["paid"] },
  { id: "empacados", label: "Empacados", statuses: ["preparing"] },
  { id: "despachados", label: "En camino", statuses: ["shipped"] },
  { id: "entregados", label: "Entregados", statuses: ["delivered"] },
];

function SedeDespachos() {
  const { sede } = useParams({ from: "/_authenticated/pos/$sede/pedidos" });
  const info = SEDES[sede as keyof typeof SEDES];
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("pendientes");
  const [trackModal, setTrackModal] = useState<{ id: string; number: string } | null>(null);

  const { data: loc } = useQuery({
    queryKey: ["sede-loc", info.code],
    queryFn: async () =>
      (await supabase.from("locations").select("id, code, name").eq("code", info.code).maybeSingle()).data,
  });

  const activeStatuses = TABS.find((t) => t.id === tab)!.statuses;

  const { data: rows } = useQuery({
    queryKey: ["dispatches", loc?.id, tab],
    enabled: !!loc?.id,
    refetchInterval: 20_000,
    queryFn: async () => {
      const data = await fetchAll((from, to) => supabase
        .from("order_fulfillments")
        .select("id, created_at, orders!inner(id, number, status, source, total_cop, contact_name, contact_email, contact_phone, ship_to, notes, paid_at, order_items(id, qty, product_name, variant_label, fulfill_location_id))")
        .eq("location_id", loc!.id)
        .eq("orders.source", "ecom")
        .in("orders.status", activeStatuses as any)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to));
      return (data ?? []).filter((r: any) => r.orders);
    },
  });

  const { pageItems, pager } = usePaged((rows ?? []) as any[]);

  const counts = useQuery({
    queryKey: ["dispatch-counts", loc?.id],
    enabled: !!loc?.id,
    refetchInterval: 20_000,
    queryFn: async () => {
      const out: Record<Tab, number> = { pendientes: 0, empacados: 0, despachados: 0, entregados: 0 };
      for (const t of TABS) {
        const { data } = await supabase
          .from("order_fulfillments")
          .select("id, orders!inner(status)")
          .eq("location_id", loc!.id)
          .eq("orders.source", "ecom")
          .in("orders.status", t.statuses as any);
        out[t.id] = (data ?? []).length;
      }
      return out;
    },
  });

  const advance = useMutation({
    mutationFn: async ({ id, next, notes }: { id: string; next: "preparing" | "shipped" | "delivered"; notes?: string }) => {
      const patch: any = { status: next };
      if (notes) patch.notes = notes;
      const { error } = await supabase.from("orders").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      const msg = v.next === "preparing" ? "Marcado como empacado" : v.next === "shipped" ? "Marcado como despachado" : "Marcado como entregado";
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["dispatches"] });
      qc.invalidateQueries({ queryKey: ["dispatch-counts"] });
      qc.invalidateQueries({ queryKey: ["dispatch-count"] });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo actualizar"),
  });

  return (
    <div className="p-10">
      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-widest text-moss/70">Pedidos Web · {info.label}</p>
        <h1 className="font-serif italic text-4xl mt-1">Pedidos Web</h1>
        <p className="text-sm text-moss mt-2 max-w-2xl">
          Prendas vendidas en la tienda online que salen de {info.label} (cuando Ecommerce no tenía la talla). Retíralas del perchero, empácalas y marca el despacho.
        </p>
      </header>

      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {TABS.map((t) => {
          const n = counts.data?.[t.id] ?? 0;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={"flex items-center gap-2 px-4 py-2 rounded-full text-xs uppercase tracking-widest border transition-colors " + (active ? "bg-ink text-ivory border-ink" : "bg-white text-ink/60 border-ink/15 hover:bg-ink/5")}
            >
              {t.label}
              {n > 0 && (
                <span className={"text-[10px] px-2 py-0.5 rounded-full " + (active ? "bg-ivory text-ink" : "bg-ink/10 text-ink")}>{n}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="space-y-4">
        {pageItems.map((r: any) => {
          const o = r.orders as any;
          const mine = (o.order_items ?? []).filter((i: any) => !i.fulfill_location_id || i.fulfill_location_id === loc?.id);
          o.order_items = mine.length ? mine : o.order_items;
          const pieces = (o.order_items ?? []).reduce((a: number, i: any) => a + i.qty, 0);
          const origin = o.source === "ecom" ? { icon: Globe, label: "Tienda online" } : { icon: StoreIcon, label: "POS otra sede" };
          const Icon = origin.icon;
          return (
            <div key={r.id} className="bg-white border border-ink/10 rounded-2xl p-5">
              <div className="flex flex-wrap items-start gap-5">
                <div className="flex-1 min-w-[240px]">
                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-moss/70">
                    <span
                      className={
                        "inline-flex items-center gap-1.5 px-2 py-1 rounded-full " +
                        (o.source === "ecom" ? "bg-ink text-ivory" : "bg-ink/10 text-ink/70")
                      }
                    >
                      <Icon className="size-3.5" /> {o.source === "ecom" ? "Prenda vendida online para despacho" : origin.label}
                    </span>
                    <span className="text-ink/20">·</span>
                    <span className="font-mono text-ink/60">{o.number}</span>
                  </div>
                  <div className="text-lg mt-1">{o.contact_name ?? "Cliente"}</div>
                  <div className="text-xs text-ink/50">
                    {[o.contact_email, o.contact_phone].filter(Boolean).join(" · ")}
                  </div>
                  {o.ship_to && (
                    <div className="text-xs text-ink/60 mt-2">
                      Envío: {(o.ship_to as any).line1 ?? ""}{(o.ship_to as any).city ? `, ${(o.ship_to as any).city}` : ""}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-xs text-moss/70">{formatDate(o.paid_at ?? r.created_at)}</div>
                  <div className="text-lg font-medium mt-1">{formatCOP(o.total_cop)}</div>
                  <div className="text-xs text-ink/50">{pieces} piezas</div>
                </div>
              </div>

              <ul className="mt-4 divide-y divide-ink/5 text-sm">
                {(o.order_items ?? []).map((i: any) => (
                  <li key={i.id} className="py-2 flex items-center gap-3">
                    <span className="text-ink/40 text-xs w-6">×{i.qty}</span>
                    <span className="flex-1">{i.product_name}</span>
                    <span className="text-xs text-ink/50">{i.variant_label}</span>
                  </li>
                ))}
              </ul>

              {o.notes && (
                <p className="mt-3 text-xs text-ink/60 bg-ivory/60 rounded-xl px-3 py-2 border border-ink/10">{o.notes}</p>
              )}

              {(o.status === "paid" || o.status === "preparing" || o.status === "shipped") && (
                <div className="flex flex-wrap items-center gap-2 mt-4">
                  <button
                    onClick={() => printShippingDocs(o, loc?.name ?? info.label)}
                    className="flex items-center gap-2 px-4 py-2 rounded-full bg-white border border-ink/15 text-ink text-xs uppercase tracking-widest hover:bg-ink/5"
                  >
                    <Printer className="size-3.5" /> Guía y lista de empaque
                  </button>
                  {o.status === "paid" && (
                    <button
                      onClick={() => advance.mutate({ id: o.id, next: "preparing" })}
                      disabled={advance.isPending}
                      className="flex items-center gap-2 px-4 py-2 rounded-full bg-ink text-ivory text-xs uppercase tracking-widest hover:bg-ink/85 disabled:opacity-50"
                    >
                      <PackageCheck className="size-3.5" /> Marcar empacado
                    </button>
                  )}
                  {o.status === "preparing" && (
                    <button
                      onClick={() => setTrackModal({ id: o.id, number: o.number })}
                      className="flex items-center gap-2 px-4 py-2 rounded-full bg-ink text-ivory text-xs uppercase tracking-widest hover:bg-ink/85"
                    >
                      <Truck className="size-3.5" /> Marcar despachado
                    </button>
                  )}
                  {o.status === "shipped" && (
                    <button
                      onClick={() => advance.mutate({ id: o.id, next: "delivered" })}
                      disabled={advance.isPending}
                      className="flex items-center gap-2 px-4 py-2 rounded-full bg-moss text-ivory text-xs uppercase tracking-widest hover:opacity-90 disabled:opacity-50"
                    >
                      <CheckCircle2 className="size-3.5" /> Confirmar entregado
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {(rows?.length ?? 0) === 0 && (
          <div className="bg-white border border-ink/10 rounded-2xl px-6 py-16 text-center text-moss/60 text-sm">
            No hay pedidos en esta pestaña.
          </div>
        )}
        {pager}
      </div>

      {trackModal && (
        <TrackModal
          order={trackModal}
          onClose={() => setTrackModal(null)}
          onConfirm={(notes) => {
            advance.mutate({ id: trackModal.id, next: "shipped", notes });
            setTrackModal(null);
          }}
        />
      )}
    </div>
  );
}

function TrackModal({ order, onClose, onConfirm }: { order: { number: string }; onClose: () => void; onConfirm: (notes: string) => void }) {
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const notes = useMemo(() => [carrier && `Transportadora: ${carrier}`, tracking && `Guía: ${tracking}`].filter(Boolean).join(" · "), [carrier, tracking]);
  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-ivory rounded-3xl w-full max-w-md p-6 border border-ink/10">
        <div className="text-[10px] uppercase tracking-widest text-moss/70">Despachar</div>
        <h3 className="font-serif italic text-2xl mt-1">Pedido {order.number}</h3>
        <div className="space-y-4 mt-5">
          <div>
            <label className="text-xs text-ink/60">Transportadora</label>
            <input value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Ej. Servientrega" className="w-full mt-1 px-4 py-3 rounded-2xl border border-ink/15 outline-none focus:border-ink text-sm" />
          </div>
          <div>
            <label className="text-xs text-ink/60">Número de guía</label>
            <input value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Opcional" className="w-full mt-1 px-4 py-3 rounded-2xl border border-ink/15 outline-none focus:border-ink text-sm" />
          </div>
          <button onClick={() => onConfirm(notes)} className="w-full bg-ink text-ivory py-3.5 rounded-full text-sm font-medium hover:bg-ink/85">
            Confirmar despacho
          </button>
        </div>
      </div>
    </div>
  );
}
function esc(v: unknown) { return String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!)); }

function printShippingDocs(o: any, origin: string) {
  const st = (o.ship_to ?? {}) as any;
  const items = (o.order_items ?? []) as any[];
  const pieces = items.reduce((a, i) => a + i.qty, 0);
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) { toast.error("Permite ventanas emergentes para imprimir"); return; }
  const addr = [st.line1, st.line2, st.city, st.region].filter(Boolean).map(esc).join(", ");
  w.document.write(`<html><head><title>Guía ${esc(o.number)}</title><style>
    body{font-family:system-ui,sans-serif;padding:28px;color:#1a1a1a}
    .box{border:2px solid #1a1a1a;padding:18px;margin-bottom:24px}
    h1{font-size:20px;margin:0 0 12px} h2{font-size:16px;margin:0 0 10px}
    .num{font-family:monospace;font-size:26px;letter-spacing:2px}
    table{width:100%;border-collapse:collapse;font-size:13px} td,th{border-bottom:1px solid #ccc;padding:6px;text-align:left}
    .pb{page-break-after:always}
  </style></head><body>
  <div class="box pb"><h1>GUÍA DE ENVÍO</h1><div class="num">${esc(o.number)}</div>
    <p><b>Remite:</b> Tu Marca · ${esc(origin)}</p>
    <p><b>Destinatario:</b> ${esc(o.contact_name ?? "Cliente")}<br/>${addr}<br/>Tel: ${esc(o.contact_phone)}</p>
    <p><b>Piezas:</b> ${pieces}</p><p>Transportadora: ____________ &nbsp; Guía N°: ____________</p></div>
  <div><h2>LISTA DE EMPAQUE · ${esc(o.number)}</h2>
    <table><tr><th>✓</th><th>Cant.</th><th>Prenda</th><th>Talla/Color</th></tr>
    ${items.map((i) => `<tr><td>☐</td><td>${i.qty}</td><td>${esc(i.product_name)}</td><td>${esc(i.variant_label)}</td></tr>`).join("")}
    </table><p style="margin-top:30px">Alistado por: ____________________ &nbsp; Fecha: ____________</p></div>
  <script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}
