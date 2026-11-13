import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Ban, Copy, Pencil, Plus, Printer } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { usePaged } from "@/components/ui/use-paged";
import type { Database } from "@/integrations/supabase/types";
import { TransferDiscrepancies } from "@/components/admin/transfer-discrepancies";
import { TransferModal } from "@/components/admin/transfer-modal";

type TransferStatus = Database["public"]["Enums"]["transfer_status"];
type Tab = "pending" | "requested" | "history" | "ajustes";

export const Route = createFileRoute("/_authenticated/admin/traslados")({
  head: () => ({ meta: [
    { title: "Traslados entre bodegas · Tu Marca" },
    { name: "description", content: "Solicitud y seguimiento de traslados de inventario entre tiendas y bodegas." },
    { property: "og:title", content: "Traslados entre bodegas · Tu Marca" },
    { property: "og:description", content: "Solicitud y seguimiento de traslados de inventario entre tiendas y bodegas." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: TransfersPage,
});

const TABS: { id: Tab; label: string }[] = [
  { id: "pending", label: "Pendientes de recibir" },
  { id: "requested", label: "Enviados" },
  { id: "history", label: "Historial" },
  { id: "ajustes", label: "Ajustes" },
];

const STATUS_LABEL: Record<TransferStatus, string> = {
  requested: "Enviado",
  draft: "Borrador",
  approved: "Aprobado",
  in_transit: "En tránsito",
  received: "Recibido",
  cancelled: "Cancelado",
  rejected: "Rechazado",
};

function TransfersPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const qc = useQueryClient();
  const autoDone = useRef<Set<string>>(new Set());
  const [receiving, setReceiving] = useState<any>(null);
  const [creating, setCreating] = useState(false);
  const [duplicating, setDuplicating] = useState<any>(null);
  const [editing, setEditing] = useState<any>(null);

  const { data: products } = useQuery({
    queryKey: ["inventory-tree", "transfers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, reference_code, product_variants(id, sku, barcode, size, quality, color, inventory_levels(location_id, on_hand, reserved))")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: locs } = useQuery({
    queryKey: ["transfer-locs"],
    queryFn: async () => ((await (supabase.from("locations") as any).select("id, name, code, kind, consignment_customer_id")).data ?? []) as any[],
  });

  const isStore = (id: string | null) => locs?.find((l) => l.id === id)?.kind === "store";
  // Bodegas de clientes en consignación: el cliente confirma la recepción desde su portal B2B.
  const isConsignment = (id: string | null) => !!locs?.find((l) => l.id === id)?.consignment_customer_id;
  // Destinos que confirman recepción manualmente: tiendas, la bodega del Hub (Bodega Central) y mayoristas en consignación.
  // Solo Ecommerce se recibe automáticamente.
  const needsManualReceipt = (id: string | null) => {
    const kind = locs?.find((l) => l.id === id)?.kind;
    return kind === "store" || kind === "warehouse" || kind === "wholesale";
  };

  const { data } = useQuery({
    queryKey: ["transfers", tab],
    queryFn: async () => {
      return await fetchAll((from, to) => {
        let q = supabase.from("transfers")
          .select("id, transfer_number, status, note, receipt_note, carrier, tracking, created_at, approved_at, shipped_at, received_at, from_location_id, to_location_id, requested_by, order_id, transfer_items(qty, received_qty, variant_id, product_variants(sku, products(name)))")
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to);
        if (tab === "pending") q = q.eq("status", "in_transit");
        else if (tab === "requested") q = q.eq("status", "requested");
        return q;
      });
    },
  });

  // Nombres de quien hizo cada traslado (se consultan aparte por los permisos de perfiles)
  const requesterIds = [...new Set((data ?? []).map((t) => t.requested_by).filter(Boolean))] as string[];
  const { data: requesters } = useQuery({
    queryKey: ["transfer-requesters", requesterIds.join(",")],
    enabled: requesterIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", requesterIds);
      return data ?? [];
    },
  });
  const requesterName = (id: string | null) =>
    id ? requesters?.find((p) => p.id === id)?.full_name ?? "—" : "—";

  const call = (rpc: "approve_transfer" | "reject_transfer" | "ship_transfer" | "receive_transfer" | "cancel_transfer", args: Record<string, unknown>) =>
    supabase.rpc(rpc as never, args as never);

  const act = useMutation({
    mutationFn: async ({ rpc, args, label }: { rpc: Parameters<typeof call>[0]; args: Record<string, unknown>; label: string }) => {
      const { error } = await call(rpc, args);
      if (error) throw new Error(error.message);
      return label;
    },
    onSuccess: (label) => { toast.success(label); qc.invalidateQueries({ queryKey: ["transfers"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  // Ecommerce y mayorista se reciben automáticamente; solo las tiendas confirman recepción.
  useEffect(() => {
    if (!data || !locs) return;
    const auto = data.filter((t) => ["requested", "approved", "in_transit"].includes(t.status) && !needsManualReceipt(t.to_location_id) && !autoDone.current.has(t.id));
    if (auto.length === 0) return;
    (async () => {
      for (const t of auto) {
        autoDone.current.add(t.id);
        const { error } = await call("receive_transfer", { _transfer_id: t.id, _received_items: null });
        if (error) autoDone.current.delete(t.id);
      }
      qc.invalidateQueries({ queryKey: ["transfers"] });
    })();
  }, [data, locs]);

  const shipAndMaybeReceive = async (id: string, toId: string | null) => {
    const carrier = prompt("Transportadora (opcional):") ?? undefined;
    const tracking = prompt("Guía (opcional):") ?? undefined;
    const { error } = await call("ship_transfer", { _transfer_id: id, _carrier: carrier, _tracking: tracking });
    if (error) { toast.error(error.message); return; }
    if (!isStore(toId)) {
      const { error: e2 } = await call("receive_transfer", { _transfer_id: id, _received_items: null });
      if (e2) { toast.error(e2.message); } else { toast.success("Enviado y recibido automáticamente"); }
    } else {
      toast.success("En tránsito · pendiente de recibir en tienda");
    }
    qc.invalidateQueries({ queryKey: ["transfers"] });
  };

  const cancelTransfer = async (t: any) => {
    const label = t.transfer_number ? `TR-${t.transfer_number}` : t.id.slice(0, 8);
    if (!window.confirm(`¿Cancelar el traslado ${label}? Las unidades vuelven a quedar disponibles en ${locName(t.from_location_id)}.`)) return;
    const reason = window.prompt("Motivo de la cancelación (opcional):") ?? undefined;
    const { error } = await call("cancel_transfer", { _transfer_id: t.id, _reason: reason?.trim() || null });
    if (error) { toast.error(error.message); return; }
    toast.success("Traslado cancelado");
    qc.invalidateQueries({ queryKey: ["transfers"] });
    qc.invalidateQueries({ queryKey: ["inventory"] });
  };

  const editGuide = async (t: any) => {
    const carrier = prompt("Transportadora (deja vacío para quitarla):", t.carrier ?? "");
    if (carrier === null) return;
    const tracking = prompt("Número de guía (deja vacío para quitarla):", t.tracking ?? "");
    if (tracking === null) return;
    const { error } = await supabase
      .from("transfers")
      .update({ carrier: carrier.trim() || null, tracking: tracking.trim() || null })
      .eq("id", t.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Guía actualizada");
    qc.invalidateQueries({ queryKey: ["transfers"] });
  };

  const locName = (id: string | null) => locs?.find((l) => l.id === id)?.name ?? "—";

  // Remisión imprimible (guardar como PDF desde el diálogo de impresión)
  const printRemision = (t: any) => {
    const items = (t.transfer_items ?? []) as any[];
    const totalQty = items.reduce((s, i) => s + i.qty, 0);
    const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    const rows = items.map((i, idx) => `
      <tr>
        <td>${idx + 1}</td>
        <td class="mono">${esc(i.product_variants?.sku)}</td>
        <td>${esc(i.product_variants?.products?.name)}</td>
        <td class="num">${i.qty}</td>
        ${t.received_at ? `<td class="num">${i.received_qty ?? "—"}</td>` : ""}
      </tr>`).join("");
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Remisión de traslado ${esc((t as any).transfer_number ? `TR-${(t as any).transfer_number}` : t.id.slice(0, 8))}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a14; margin: 32px; font-size: 13px; }
        h1 { font-size: 22px; font-style: italic; margin: 0; }
        .brand { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: #6b705c; }
        .meta { margin: 16px 0; display: grid; grid-template-columns: 1fr 1fr; gap: 4px 24px; font-size: 12px; }
        .meta b { display: block; font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #6b705c; font-weight: normal; }
        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #6b705c; text-align: left; border-bottom: 1px solid #1a1a14; padding: 6px 8px; }
        td { border-bottom: 1px solid #e5e0d0; padding: 6px 8px; }
        .num { text-align: right; } th.num { text-align: right; }
        .mono { font-family: 'Courier New', monospace; font-size: 12px; }
        .total { margin-top: 8px; text-align: right; font-weight: bold; }
        .firmas { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 72px; }
        .firma { border-top: 1px solid #1a1a14; padding-top: 6px; font-size: 11px; color: #6b705c; }
        @media print { body { margin: 12mm; } }
      </style></head><body>
      <p class="brand">Tu Marca</p>
      <h1>Remisión de traslado</h1>
      <div class="meta">
        <div><b>Origen</b>${esc(locName(t.from_location_id))}</div>
        <div><b>Destino</b>${esc(locName(t.to_location_id))}</div>
        <div><b>Fecha</b>${new Date(t.created_at).toLocaleDateString("es-CO", { year: "numeric", month: "long", day: "numeric" })}</div>
        <div><b>Estado</b>${esc(STATUS_LABEL[t.status as TransferStatus])}</div>
        <div><b>Hecho por</b>${esc(requesterName(t.requested_by))}</div>
        ${t.carrier || t.tracking ? `<div><b>Transportadora / guía</b>${esc(t.carrier ?? "")} ${esc(t.tracking ?? "")}</div>` : ""}
        ${t.note ? `<div><b>Nota</b>${esc(t.note)}</div>` : ""}
      </div>
      <table>
        <thead><tr><th>#</th><th>SKU</th><th>Producto</th><th class="num">Enviadas</th>${t.received_at ? '<th class="num">Recibidas</th>' : ""}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="total">Total de piezas: ${totalQty}</p>
      <div class="firmas">
        <div class="firma">Entrega (origen)</div>
        <div class="firma">Recibe (destino)</div>
      </div>
      <script>window.onload = () => window.print();</script>
      </body></html>`;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) { toast.error("El navegador bloqueó la ventana de impresión"); return; }
    w.document.write(html);
    w.document.close();
  };

  const visible = tab === "pending" ? (data ?? []).filter((t) => needsManualReceipt(t.to_location_id)) : (data ?? []);
  const { pageItems: visiblePage, pager: visiblePager } = usePaged(visible as any[]);

  return (
    <div className="p-10">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-moss/70">Operación</p>
          <h1 className="font-serif italic text-4xl mt-1">Traslados</h1>
          <p className="text-sm text-moss mt-2 max-w-2xl">
            Las tiendas, Bodega Central y los mayoristas en consignación confirman la recepción; solo los traslados a
            Ecommerce se reciben automáticamente. En Historial ves todos los movimientos.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="shrink-0 inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm text-ivory hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> Nuevo traslado
        </button>
      </header>

      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={"px-4 py-2 rounded-full text-sm border transition-colors " + (tab === t.id ? "bg-ink text-ivory border-ink" : "bg-white text-ink/70 border-ink/10 hover:bg-ink/5")}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "ajustes" ? <TransferDiscrepancies /> : (
      <div className="bg-white border border-ink/10 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-widest text-moss/70">
            <tr>
              <th className="text-left px-4 py-3">Origen → Destino</th>
              <th className="text-left px-4 py-3">Piezas</th>
              <th className="text-left px-4 py-3">Estado</th>
              <th className="text-left px-4 py-3">Hecho por</th>
              <th className="text-left px-4 py-3">Fecha</th>
              <th className="text-right px-4 py-3">Acción</th>
            </tr>
          </thead>
          <tbody>
            {visiblePage.map((t: any) => {
              const totalQty = (t.transfer_items ?? []).reduce((s: number, i: any) => s + i.qty, 0);
              return (
                <tr key={t.id} className="border-t border-ink/5 align-top">
                  <td className="px-4 py-3">
                    <div className="font-serif italic">{(t as any).transfer_number ? <span className="not-italic font-sans text-xs font-semibold mr-2">TR-{(t as any).transfer_number}</span> : null}{locName(t.from_location_id)} → {locName(t.to_location_id)}</div>
                    <ul className="text-xs text-moss mt-1 space-y-0.5">
                      {(t.transfer_items ?? []).map((i: any, idx: number) => (
                        <li key={idx}>{i.qty}× <span className="font-mono">{i.product_variants?.sku}</span> · {i.product_variants?.products?.name}
                          {i.received_qty != null && i.received_qty !== i.qty && (
                            <span className="ml-2 text-destructive font-medium">Llegaron {i.received_qty} ({i.received_qty - i.qty > 0 ? "+" : ""}{i.received_qty - i.qty})</span>
                          )}
                        </li>
                      ))}
                    </ul>
                    {t.note && <p className="text-xs text-ink/50 mt-1">Nota: {t.note}</p>}
                    {t.receipt_note && <p className="text-xs text-destructive/80 mt-1">Reporte de recepción: {t.receipt_note}</p>}
                    {(t.carrier || t.tracking) && <p className="text-xs text-ink/50 mt-1">Guía: {t.carrier} {t.tracking}</p>}
                  </td>
                  <td className="px-4 py-3 leading-5">{totalQty}</td>
                  <td className="px-4 py-3 leading-5">
                    <span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded bg-moss/15 text-moss">
                      {STATUS_LABEL[t.status as keyof typeof STATUS_LABEL]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs leading-5 text-ink/80">{requesterName(t.requested_by)}</td>
                  <td className="px-4 py-3 text-xs leading-5 text-moss">{new Date(t.created_at).toLocaleDateString("es-CO")}</td>
                  <td className="text-right px-4 py-3 leading-5 space-x-2">
                    <button type="button" title="Imprimir remisión" aria-label={`Imprimir remisión del traslado ${t.id}`} onClick={() => printRemision(t)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-ink/70 hover:text-ink"><Printer className="size-3.5" /> Remisión</button>
                    <button type="button" title="Duplicar traslado" aria-label={`Duplicar traslado ${t.id}`} onClick={() => setDuplicating(t)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-ink/70 hover:text-ink"><Copy className="size-3.5" /> Duplicar</button>
                    <button type="button" title="Editar guía" aria-label={`Editar guía del traslado ${t.id}`} onClick={() => editGuide(t)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-ink/70 hover:text-ink"><Pencil className="size-3.5" /> Guía</button>
                    {!t.order_id && ["requested", "approved"].includes(t.status) && (
                      <button type="button" title="Editar unidades" aria-label={`Editar unidades del traslado ${t.id}`} onClick={() => setEditing(t)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-ink/70 hover:text-ink"><Pencil className="size-3.5" /> Unidades</button>
                    )}
                    {!t.order_id && ["requested", "approved", "in_transit"].includes(t.status) && (
                      <button type="button" title="Cancelar traslado" aria-label={`Cancelar traslado ${t.id}`} onClick={() => void cancelTransfer(t)} className="inline-flex items-center gap-1 px-3 py-1.5 text-xs text-destructive hover:text-destructive/80"><Ban className="size-3.5" /> Cancelar</button>
                    )}
                    {t.status === "approved" && (
                      <button onClick={() => shipAndMaybeReceive(t.id, t.to_location_id)} className="px-3 py-1.5 rounded-full bg-ink text-ivory text-xs">Despachar</button>
                    )}
                    {["requested", "approved", "in_transit"].includes(t.status) && needsManualReceipt(t.to_location_id) && (
                      isConsignment(t.to_location_id)
                        ? <span className="px-3 py-1.5 text-xs text-ink/60">El cliente confirma en su portal</span>
                        : <button onClick={() => setReceiving(t)} className="px-3 py-1.5 rounded-full bg-ink text-ivory text-xs">Recibir y verificar</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (<tr><td colSpan={6} className="px-6 py-10 text-center text-moss/60">Sin traslados en este estado.</td></tr>)}
          </tbody>
        </table>
        {visiblePager}
      </div>
      )}
      {editing && (
        <EditItemsModal
          transfer={editing}
          title={`${locName(editing.from_location_id)} → ${locName(editing.to_location_id)}`}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["transfers"] }); qc.invalidateQueries({ queryKey: ["inventory"] }); }}
        />
      )}
      {receiving && (
        <ReceiveModal
          transfer={receiving}
          title={`${locName(receiving.from_location_id)} → ${locName(receiving.to_location_id)}`}
          onClose={() => setReceiving(null)}
          onDone={() => { setReceiving(null); qc.invalidateQueries({ queryKey: ["transfers"] }); qc.invalidateQueries({ queryKey: ["inventory"] }); }}
        />
      )}
       {(creating || duplicating) && (
        <TransferModal
           key={duplicating?.id ?? "new"}
           initialTransfer={duplicating ?? undefined}
          products={(products ?? []).map((p) => ({ id: p.id, name: p.name, reference_code: p.reference_code, variants: p.product_variants ?? [] }))}
          locations={(locs ?? []).map((l) => ({ id: l.id, code: l.code, name: l.name }))}
           onClose={() => { setCreating(false); setDuplicating(null); }}
        />
      )}
    </div>
  );
}

type RecvItem = { qty: number; variant_id: string; received_qty?: number | null; product_variants: { sku: string | null; products: { name: string } | null } | null };

function EditItemsModal({ transfer, title, onClose, onDone }: {
  transfer: { id: string; status: string; transfer_items: RecvItem[] | null };
  title: string; onClose: () => void; onDone: () => void;
}) {
  const items = transfer.transfer_items ?? [];
  const [qtys, setQtys] = useState<Record<string, number>>(() => Object.fromEntries(items.map((i) => [i.variant_id, i.qty])));
  const [saving, setSaving] = useState(false);
  const kept = items.filter((i) => (qtys[i.variant_id] ?? 0) > 0);
  const changed = items.some((i) => (qtys[i.variant_id] ?? 0) !== i.qty);

  const submit = async () => {
    if (kept.length === 0) { toast.error("El traslado debe conservar al menos una prenda; si no va a salir nada, usa Cancelar"); return; }
    setSaving(true);
    const { error } = await supabase.rpc("edit_transfer_items" as never, {
      _transfer_id: transfer.id,
      _items: items.map((i) => ({ variant_id: i.variant_id, qty: qtys[i.variant_id] ?? 0 })),
    } as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Unidades actualizadas");
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card text-card-foreground rounded-2xl w-full max-w-xl max-h-[85vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
        <p className="text-[10px] uppercase tracking-widest text-moss/70">Editar traslado</p>
        <h2 className="font-serif italic text-2xl mt-1">{title}</h2>
        <p className="text-sm text-moss mt-1">
          Ajusta las unidades de cada referencia. Pon 0 para quitarla del traslado.
          {transfer.status === "approved" ? " Las unidades apartadas en la bodega de origen se ajustan solas." : ""}
        </p>
        <table className="w-full text-sm mt-4">
          <thead className="text-[10px] uppercase tracking-widest text-moss/70">
            <tr><th className="text-left py-2">Referencia</th><th className="text-right">Antes</th><th className="text-right">Ahora</th></tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const q = qtys[i.variant_id] ?? 0;
              return (
                <tr key={i.variant_id} className={"border-t border-ink/5 " + (q === 0 ? "opacity-50" : "")}>
                  <td className="py-2"><div>{i.product_variants?.products?.name}</div><div className="font-mono text-xs text-moss">{i.product_variants?.sku}</div></td>
                  <td className="text-right">{i.qty}</td>
                  <td className="text-right">
                    <input type="number" min={0} value={q}
                      onChange={(e) => setQtys((prev) => ({ ...prev, [i.variant_id]: Math.max(0, Number(e.target.value) || 0) }))}
                      className="no-spin w-16 text-right border border-ink/15 rounded-lg px-2 py-1 bg-background" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-sm mt-3">Total: {kept.reduce((s, i) => s + (qtys[i.variant_id] ?? 0), 0)} piezas en {kept.length} referencias</p>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-full border border-ink/15 text-sm">Volver</button>
          <button disabled={saving || !changed} onClick={submit} className="px-4 py-2 rounded-full bg-ink text-ivory text-sm disabled:opacity-50">
            {saving ? "Guardando…" : "Guardar unidades"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ReceiveModal({ transfer, title, onClose, onDone }: {
  transfer: { id: string; transfer_items: RecvItem[] | null };
  title: string; onClose: () => void; onDone: () => void;
}) {
  const items = transfer.transfer_items ?? [];
  const [qtys, setQtys] = useState<Record<string, number>>(() => Object.fromEntries(items.map((i) => [i.variant_id, i.qty])));
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [extraSku, setExtraSku] = useState("");
  const [extras, setExtras] = useState<Record<string, { qty: number; sku: string; name: string }>>({});
  const addExtra = async () => {
    const code = extraSku.trim().replace(/[,()]/g, "");
    if (!code) return;
    const { data: v } = await supabase.from("product_variants").select("id, sku, products(name)").or(`sku.eq.${code},barcode.eq.${code}`).limit(1).maybeSingle();
    setExtraSku("");
    if (!v) { toast.error("SKU no encontrado"); return; }
    if (items.some((i) => i.variant_id === v.id)) { setQtys((q) => ({ ...q, [v.id]: (q[v.id] ?? 0) + 1 })); return; }
    setExtras((p) => ({ ...p, [v.id]: { qty: (p[v.id]?.qty ?? 0) + 1, sku: v.sku, name: (v.products as any)?.name ?? "" } }));
  };
  const hasExtras = Object.keys(extras).length > 0;
  const diffs = items.filter((i) => (qtys[i.variant_id] ?? i.qty) !== i.qty);
  const sent = items.reduce((s: number, i: any) => s + i.qty, 0);
  const got = items.reduce((s, i) => s + (qtys[i.variant_id] ?? 0), 0);

  const submit = async () => {
    if ((diffs.length > 0 || hasExtras) && !note.trim()) { toast.error("Describe la diferencia para reportar el ajuste"); return; }
    setSaving(true);
    const { error } = await supabase.rpc("receive_transfer" as never, {
      _transfer_id: transfer.id,
      _received_items: items.map((i) => ({ variant_id: i.variant_id, qty: qtys[i.variant_id] ?? 0 })),
      _note: note.trim() || null,
      _extra_items: hasExtras ? Object.entries(extras).map(([variant_id, e]) => ({ variant_id, qty: e.qty })) : null,
    } as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(diffs.length || hasExtras ? "Se ingresó lo que llegó bien; el ajuste se notificó a la bodega de origen" : "Recibido completo");
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card text-card-foreground rounded-2xl w-full max-w-xl max-h-[85vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
        <p className="text-[10px] uppercase tracking-widest text-moss/70">Recepción de traslado</p>
        <h2 className="font-serif italic text-2xl mt-1">{title}</h2>
        <p className="text-sm text-moss mt-1">Cuenta lo que llegó y escribe la cantidad real de cada referencia.</p>
        <table className="w-full text-sm mt-4">
          <thead className="text-[10px] uppercase tracking-widest text-moss/70">
            <tr><th className="text-left py-2">Referencia</th><th className="text-right">Enviadas</th><th className="text-right">Recibidas</th><th className="text-right">Dif.</th></tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const r = qtys[i.variant_id] ?? 0; const d = r - i.qty;
              return (
                <tr key={i.variant_id} className="border-t border-ink/5">
                  <td className="py-2"><div>{i.product_variants?.products?.name}</div><div className="font-mono text-xs text-moss">{i.product_variants?.sku}</div></td>
                  <td className="text-right">{i.qty}</td>
                  <td className="text-right">
                    <input type="number" min={0} value={r}
                      onChange={(e) => setQtys((q) => ({ ...q, [i.variant_id]: Math.max(0, Number(e.target.value) || 0) }))}
                      className="no-spin w-16 text-right border border-ink/15 rounded-lg px-2 py-1 bg-background" />
                  </td>
                  <td className={"text-right font-medium " + (d === 0 ? "text-moss/50" : "text-destructive")}>{d > 0 ? "+" : ""}{d}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {hasExtras && (
          <ul className="mt-3 text-xs space-y-1">
            {Object.entries(extras).map(([vid, e]) => (
              <li key={vid} className="text-destructive">{e.qty}× <span className="font-mono">{e.sku}</span> · {e.name} — llegó trocado, no estaba en el envío
                <button onClick={() => setExtras((p) => { const n = { ...p }; delete n[vid]; return n; })} className="ml-2 underline text-ink/50">quitar</button></li>
            ))}
          </ul>
        )}
        <div className="flex gap-2 mt-3">
          <input value={extraSku} onChange={(e) => setExtraSku(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void addExtra(); } }}
            placeholder="¿Llegó algo trocado? Escanea o escribe su SKU" className="flex-1 border border-ink/15 rounded-full px-3 py-1.5 text-xs font-mono bg-background" />
          <button onClick={() => void addExtra()} className="px-3 py-1.5 rounded-full border border-ink/15 text-xs">Agregar</button>
        </div>
        <p className="text-sm mt-3">Total: {got} de {sent} enviadas</p>
        {(diffs.length > 0 || hasExtras) && (
          <label className="block mt-4">
            <span className="text-xs uppercase tracking-widest text-destructive">Reporte de diferencia (obligatorio)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
              placeholder="Ej: llegó 1 pieza menos en la caja, se avisó a bodega"
              className="mt-1 w-full border border-ink/15 rounded-lg p-2 text-sm bg-background" />
          </label>
        )}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-full border border-ink/15 text-sm">Cancelar</button>
          <button disabled={saving} onClick={submit} className="px-4 py-2 rounded-full bg-ink text-ivory text-sm disabled:opacity-50">
            {saving ? "Guardando…" : diffs.length || hasExtras ? "Recibir y reportar ajuste" : "Confirmar recepción"}
          </button>
        </div>
      </div>
    </div>
  );
}
