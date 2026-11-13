import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const todayBogota = () => new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);

/** Consignación: reporta ventas desde la bodega del cliente (genera pedido B2B con la fecha del reporte)
 *  o devuelve a Bodega Central lo no vendido. */
export function ConsignmentReportModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [loc, setLoc] = useState("");
  const [mode, setMode] = useState<"sale" | "return">("sale");
  const [reportDate, setReportDate] = useState(todayBogota);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const { data: locations } = useQuery({
    queryKey: ["consignment-locations"],
    queryFn: async () => {
      const { data, error } = await (supabase.from("locations") as any)
        .select("id, name, consignment_customer_id").not("consignment_customer_id", "is", null).order("name");
      if (error) throw error;
      const rows = (data ?? []) as { id: string; name: string; consignment_customer_id: string }[];
      const ids = rows.map((r) => r.consignment_customer_id);
      const { data: profiles } = ids.length
        ? await supabase.from("profiles").select("id, full_name").in("id", ids)
        : { data: [] as any[] };
      return rows.map((r) => ({ ...r, customer: (profiles ?? []).find((p: any) => p.id === r.consignment_customer_id)?.full_name ?? "" }));
    },
  });
  const current = locations?.find((l) => l.id === loc);

  const { data: stock, isLoading } = useQuery({
    queryKey: ["consignment-stock", loc],
    enabled: !!loc,
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_levels")
        .select("variant_id, on_hand, reserved, product_variants(sku, color, size, products(name))")
        .eq("location_id", loc).gt("on_hand", 0);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const rows = useMemo(() => (stock ?? []).map((s) => ({
    id: s.variant_id as string,
    avail: (s.on_hand ?? 0) - (s.reserved ?? 0),
    name: s.product_variants?.products?.name ?? "—",
    label: [s.product_variants?.color, s.product_variants?.size].filter(Boolean).join(" / "),
    sku: s.product_variants?.sku ?? "",
  })).sort((a, b) => a.name.localeCompare(b.name)), [stock]);

  const total = Object.values(qty).reduce((a, b) => a + (b || 0), 0);

  const submit = async () => {
    if (!current || !total) return;
    if (mode === "sale" && !reportDate) { toast.error("Escoge la fecha del reporte"); return; }
    const items = Object.entries(qty).filter(([, q]) => q > 0).map(([variant_id, q]) => ({ variant_id, qty: q }));
    setBusy(true);
    const { error } = mode === "sale"
      ? await (supabase.rpc as any)("report_consignment_location_sales", { _location_id: current.id, _items: items, _report_date: reportDate })
      : await (supabase.rpc as any)("return_consignment_stock", { _customer_id: current.consignment_customer_id, _items: items, _note: `Devolución consignación ${reportDate}` });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(mode === "sale" ? "Pedido B2B de consignación generado; lo que sobró sigue en la bodega del cliente" : "Traslado de devolución creado; confírmalo en Traslados al llegar");
    ["admin-b2b-orders", "consignment-stock", "inventory-tree"].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    onClose();
  };

  return createPortal(
    <div className="admin-scope fixed inset-0 z-[140] bg-ink/40 flex items-end md:items-center justify-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="bg-ivory w-full md:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-3xl md:rounded-3xl p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-serif text-2xl">Consignación</h2>
          <button onClick={onClose} aria-label="Cerrar"><X className="size-5" /></button>
        </div>
        <div className="flex gap-2 mb-4">
          {([["sale", "Reportar ventas"], ["return", "Devolver a Bodega Central"]] as const).map(([k, t]) => (
            <button key={k} onClick={() => { setMode(k); setQty({}); }} className={`px-4 py-2 rounded-full text-xs border ${mode === k ? "bg-ink text-ivory border-ink" : "border-ink/15 bg-white"}`}>{t}</button>
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-3 mb-4">
          <select value={loc} onChange={(e) => { setLoc(e.target.value); setQty({}); }} className="border border-ink/15 rounded-xl px-3 py-2.5 text-sm bg-white">
            <option value="">Selecciona el cliente y su bodega…</option>
            {(locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.customer ? `${l.customer} · ${l.name}` : l.name}</option>)}
          </select>
          <label className="flex items-center gap-2 border border-ink/15 rounded-xl px-3 py-1.5 text-sm bg-white">
            <span className="text-ink/50 text-xs whitespace-nowrap">{mode === "sale" ? "Fecha del reporte" : "Fecha"}</span>
            <input type="date" value={reportDate} max={todayBogota()} onChange={(e) => setReportDate(e.target.value)} className="flex-1 bg-transparent py-1 outline-none" />
          </label>
        </div>
        {!locations?.length && <p className="text-sm text-ink/60">Aún no hay clientes con bodega de consignación.</p>}
        {loc && (isLoading ? <p className="text-sm text-ink/60">Cargando…</p> : rows.length === 0 ? (
          <p className="text-sm text-ink/60">Este cliente no tiene unidades en su bodega.</p>
        ) : (
          <table className="w-full text-sm bg-white rounded-2xl border border-ink/10">
            <thead><tr className="text-[10px] uppercase tracking-widest text-ink/50 text-left">
              <th className="px-3 py-2">Referencia</th><th className="px-3 py-2">SKU</th><th className="px-3 py-2 text-right">En bodega</th>
              <th className="px-3 py-2 text-right">{mode === "sale" ? "Vendidas" : "Devolver"}</th>
            </tr></thead>
            <tbody className="divide-y divide-ink/5">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">{r.name}<div className="text-[11px] text-ink/50">{r.label}</div></td>
                  <td className="px-3 py-2 font-mono text-[11px] text-ink/60">{r.sku}</td>
                  <td className="px-3 py-2 text-right">{r.avail}</td>
                  <td className="px-3 py-2 text-right">
                    <input type="number" min={0} max={r.avail} value={qty[r.id] ?? ""} placeholder="0"
                      onChange={(e) => setQty((q) => ({ ...q, [r.id]: Math.min(r.avail, Math.max(0, parseInt(e.target.value) || 0)) }))}
                      className="no-spin w-16 text-center rounded-full border border-ink/15 px-2 py-1" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
        <div className="flex items-center justify-between mt-5">
          <p className="text-sm">{total} prendas</p>
          <button disabled={busy || !total} onClick={submit} className="px-6 py-3 rounded-full bg-ink text-ivory text-xs disabled:opacity-50">
            {busy ? "Guardando…" : mode === "sale" ? "Generar pedido B2B" : "Crear devolución"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
