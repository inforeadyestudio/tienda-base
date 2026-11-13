import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Printer, Truck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { usePaged } from "@/components/ui/use-paged";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/b2b/envios")({
  head: () => ({ meta: [
    { title: "Control de envíos B2B · Tu Marca" },
    { name: "description", content: "Despachos mayoristas desde Bodega Central: venta en firme, consignación, remisión y trazabilidad de la guía." },
    { property: "og:title", content: "Control de envíos B2B · Tu Marca" },
    { property: "og:description", content: "Despachos mayoristas desde Bodega Central: venta en firme, consignación, remisión y trazabilidad de la guía." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: EnviosPage,
});

const STATUS_LABEL: Record<string, string> = {
  dispatched: "Despachado",
  in_transit: "En tránsito",
  confirmed: "Confirmado por cliente",
};
const NEXT: Record<string, { to: string; label: string } | undefined> = {
  dispatched: { to: "in_transit", label: "Marcar en tránsito" },
  confirmed: undefined,
  in_transit: { to: "confirmed", label: "Confirmar recibido" },
};

type PackingLine = { product?: string; reference?: string; sku?: string; size?: string; color?: string; qty: number };

const esc = (v: unknown) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function printPacking(rawNumber: string, rawClient: string, mode: string, rawLines: PackingLine[], rawCarrier?: string | null, rawTracking?: string | null) {
  const number = esc(rawNumber), client = esc(rawClient), carrier = esc(rawCarrier), tracking = esc(rawTracking);
  const lines = rawLines.map((l) => ({ reference: esc(l.reference), product: esc(l.product), color: esc(l.color), size: esc(l.size), sku: esc(l.sku), qty: Number(l.qty) || 0 }));
  const w = window.open("", "_blank", "width=800,height=900");
  if (!w) return;
  const rows = lines.map((l) => `<tr><td>${l.reference ?? ""}</td><td>${l.product ?? ""}</td><td>${l.color ?? ""}</td><td>${l.size ?? ""}</td><td>${l.sku ?? ""}</td><td style="text-align:right">${l.qty}</td></tr>`).join("");
  const total = lines.reduce((s, l) => s + (l.qty || 0), 0);
  w.document.write(`<html><head><title>Remisión ${number}</title><style>
    body{font-family:Georgia,serif;padding:40px;color:#221f1b}
    h1{font-size:22px;margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:18px;font-size:12px;font-family:Helvetica,Arial}
    th,td{border-bottom:1px solid #ddd;padding:7px 6px;text-align:left}th{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#777}
    .meta{font-family:Helvetica,Arial;font-size:12px;color:#555;line-height:1.7;margin-top:8px}
    .sign{margin-top:60px;font-family:Helvetica,Arial;font-size:12px}.line{margin-top:44px;border-top:1px solid #888;width:280px;padding-top:6px}
  </style></head><body>
    <h1>Remisión de despacho ${number}</h1>
    <div class="meta">Cliente: <b>${client}</b><br/>Modalidad: <b>${mode === "consignment" ? "Consignación" : "Venta en firme"}</b><br/>
    Origen: Bodega Central<br/>Transportadora: ${carrier || "—"} · Guía: ${tracking || "—"}<br/>Fecha: ${new Date().toLocaleString("es-CO")}</div>
    <table><thead><tr><th>Ref</th><th>Prenda</th><th>Color</th><th>Talla</th><th>SKU</th><th style="text-align:right">Cant.</th></tr></thead>
    <tbody>${rows}</tbody><tfoot><tr><td colspan="5"><b>Total unidades</b></td><td style="text-align:right"><b>${total}</b></td></tr></tfoot></table>
    <div class="sign"><div class="line">Recibido por (nombre y firma)</div></div>
  </body></html>`);
  w.document.close();
  w.print();
}

function EnviosPage() {
  const qc = useQueryClient();
  const [dispatching, setDispatching] = useState<any>(null);

  const { data: pending } = useQuery({
    queryKey: ["b2b-pending-dispatch"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "b2b");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (!ids.length) return [];
      const { data } = await supabase
        .from("orders")
        .select("id, number, contact_name, status, b2b_mode, created_at, total_cop, order_items(qty, product_name, variant_label, product_variants(sku, size, color, products(name, reference_code)))")
        .in("customer_id", ids)
         .eq("status", "preparing")
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: shipments } = useQuery({
    queryKey: ["b2b-shipments"],
    queryFn: async () => {
      return await fetchAll((from, to) => supabase
        .from("b2b_shipments")
        .select("*, orders(number, contact_name)")
        .order("dispatched_at", { ascending: false })
        .order("id")
        .range(from, to));
    },
  });

  const { pageItems: shipmentsPage, pager: shipmentsPager } = usePaged((shipments ?? []) as any[]);

  const advance = useMutation({
    mutationFn: async (v: { id: string; status: string }) => {
      const { error } = await supabase.rpc("set_b2b_shipment_status" as never, { _shipment_id: v.id, _status: v.status, _signature_url: "" } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { toast.success("Estado actualizado"); qc.invalidateQueries({ queryKey: ["b2b-shipments"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  return (
    <div className="p-6 md:p-10">
      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-widest text-moss/70">Operación mayorista</p>
        <h1 className="mt-1 font-serif text-4xl italic">Control de envíos</h1>
        <p className="mt-2 max-w-2xl text-sm text-moss">
          Despachos desde Bodega Central. En venta en firme la mercancía sale del inventario y se factura; en consignación se
          traslada a la bodega del cliente y sigue siendo tuya hasta que la venda.
        </p>
      </header>

      <section className="mb-10">
        <h2 className="mb-3 text-sm font-medium text-ink">Pedidos listos para despachar</h2>
        <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-moss/70">
              <tr>
                <th className="px-5 py-3 text-left">Pedido</th>
                <th className="text-left">Cliente</th>
                <th className="text-left">Modalidad</th>
                <th className="text-right">Unidades</th>
                <th className="text-left">Estado</th>
                <th className="px-5 text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {(pending ?? []).map((o: any) => {
                const units = (o.order_items ?? []).reduce((s: number, i: any) => s + i.qty, 0);
                return (
                  <tr key={o.id} className="border-t border-ink/5">
                    <td className="px-5 py-3 font-medium">{o.number}</td>
                    <td className="text-ink/60">{o.contact_name ?? "—"}</td>
                    <td>
                      <span className={"rounded-full px-2.5 py-1 text-[10px] uppercase tracking-widest " + (o.b2b_mode === "consignment" ? "bg-clay/15 text-clay" : "bg-moss/15 text-moss")}>
                        {o.b2b_mode === "consignment" ? "Consignación" : "Venta en firme"}
                      </span>
                    </td>
                    <td className="text-right">{units}</td>
                    <td className="text-ink/60">{o.status}</td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => setDispatching(o)} className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-1.5 text-xs text-ivory">
                        <Truck className="size-3.5" /> Despachar
                      </button>
                    </td>
                  </tr>
                );
              })}
              {(pending ?? []).length === 0 && <tr><td colSpan={6} className="px-6 py-10 text-center text-moss/60">No hay pedidos pendientes de despacho.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-ink">Envíos y trazabilidad</h2>
        <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-moss/70">
              <tr>
                <th className="px-5 py-3 text-left">Pedido</th>
                <th className="text-left">Cliente</th>
                <th className="text-left">Modalidad</th>
                <th className="text-left">Transportadora / guía</th>
                <th className="text-left">Estado</th>
                <th className="text-left">Despacho</th>
                <th className="px-5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {shipmentsPage.map((s: any) => (
                <tr key={s.id} className="border-t border-ink/5">
                  <td className="px-5 py-3 font-medium">{s.orders?.number ?? "—"}{s.note?.startsWith("Caja") ? <span className="ml-2 text-xs text-moss">· {s.note}</span> : null}</td>
                  <td className="text-ink/60">{s.orders?.contact_name ?? "—"}</td>
                  <td>
                    <span className={"rounded-full px-2.5 py-1 text-[10px] uppercase tracking-widest " + (s.mode === "consignment" ? "bg-clay/15 text-clay" : "bg-moss/15 text-moss")}>
                      {s.mode === "consignment" ? "Consignación" : "Venta en firme"}
                    </span>
                  </td>
                  <td className="text-ink/70">{[s.carrier, s.tracking].filter(Boolean).join(" · ") || "—"}</td>
                  <td>
                    <span className={"rounded-full px-2.5 py-1 text-[10px] uppercase tracking-widest " + (s.status === "confirmed" ? "bg-moss/25 text-moss" : s.status === "in_transit" ? "bg-ink/10 text-ink/70" : "bg-cream text-ink/70")}>
                      {STATUS_LABEL[s.status] ?? s.status}
                    </span>
                  </td>
                  <td className="text-ink/60">{formatDate(s.dispatched_at)}</td>
                  <td className="px-5 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => printPacking((s.orders?.number ?? "") + (s.note?.startsWith("Caja") ? " · " + s.note : ""), s.orders?.contact_name ?? "", s.mode, (s.packing_list ?? []) as PackingLine[], s.carrier, s.tracking)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 text-xs"
                      >
                        <Printer className="size-3.5" /> Remisión
                      </button>
                      {NEXT[s.status] && (
                        <button
                          disabled={advance.isPending}
                          onClick={() => advance.mutate({ id: s.id, status: NEXT[s.status]!.to })}
                          className="rounded-full bg-ink px-3 py-1.5 text-xs text-ivory disabled:opacity-40"
                        >
                          {NEXT[s.status]!.label}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {(shipments ?? []).length === 0 && <tr><td colSpan={7} className="px-6 py-10 text-center text-moss/60">Aún no hay envíos registrados.</td></tr>}
            </tbody>
          </table>
          {shipmentsPager}
        </div>
      </section>

      {dispatching && <DispatchModal order={dispatching} onClose={() => setDispatching(null)} />}
    </div>
  );
}

function DispatchModal({ order, onClose }: { order: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const consign = order.b2b_mode === "consignment";

  const submit = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc("dispatch_b2b_shipment" as never, {
        _order_id: order.id, _carrier: carrier, _tracking: tracking, _note: note,
      } as never);
      if (error) throw new Error(error.message);
      toast.success(consign ? "Despachado a la bodega del cliente" : "Despachado y facturación enviada");
      qc.invalidateQueries({ queryKey: ["b2b-pending-dispatch"] });
      qc.invalidateQueries({ queryKey: ["b2b-shipments"] });
      qc.invalidateQueries({ queryKey: ["admin-b2b-orders"] });
      qc.invalidateQueries({ queryKey: ["b2b-matrix"] });
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo despachar");
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-moss/40";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-3xl bg-ivory p-6 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-lg">Generar guía y despachar {order.number}</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-ink/5"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-4 rounded-xl bg-cream px-4 py-3 text-xs text-moss">
          {consign
            ? "Consignación: las prendas se trasladan a la bodega del cliente y siguen en tu inventario. No se factura todavía."
            : "Venta en firme: las prendas salen definitivamente de Bodega Central y se envía la factura a cartera."}
        </p>
        <div className="space-y-3">
          <input className={input} placeholder="Transportadora" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
          <input className={input} placeholder="Número de guía" value={tracking} onChange={(e) => setTracking(e.target.value)} required />
          <textarea className={input} rows={2} placeholder="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="mt-4 rounded-xl border border-ink/10 bg-white p-3 text-xs">
          <p className="mb-2 text-[10px] uppercase tracking-widest text-moss/70">Lista de empaque</p>
          {(order.order_items ?? []).map((i: any, idx: number) => (
            <div key={idx} className="flex justify-between border-b border-ink/5 py-1 last:border-0">
              <span>{i.product_variants?.products?.name ?? i.product_name} · {i.product_variants?.color ?? ""} {i.product_variants?.size ?? ""}</span>
              <span className="font-medium">{i.qty}</span>
            </div>
          ))}
        </div>
        <button onClick={submit} disabled={saving || !tracking.trim() || !carrier.trim()} className="mt-5 w-full rounded-full bg-ink py-3 text-sm text-ivory disabled:opacity-40">
          {saving ? "Despachando…" : consign ? "Despachar a bodega del cliente" : "Despachar y facturar"}
        </button>
      </div>
    </div>
  );
}
