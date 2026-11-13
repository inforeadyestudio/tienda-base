import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeftRight, Download, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { fetchAll } from "@/lib/fetch-all";
import { useServerFn } from "@tanstack/react-start";
import { sendRCountAdjustment } from "@/lib/rcount.functions";

const KIND_LABEL: Record<string, string> = {
  sale: "Venta",
  // Un apartado compromete la prenda pero no la saca de la bodega.
  reservation: "Apartado",
  release: "Liberación",
  adjustment: "Ajuste",
  transfer_out: "Traslado enviado",
  transfer_in: "Traslado recibido",
  count: "Conteo / entrada",
  return: "Devolución",
  exchange: "Cambio",
};
// Tipo mostrado: entradas de producción son "Ingreso"; lo que entra por traslado es "Traslado recibido".
const mvKind = (m: { kind: string; ref_type?: string | null; qty: number }) =>
  m.kind === "transfer_in" ? (m.ref_type === "transfer" ? "ingreso_traslado" : "ingreso")
  // El apartado al crear un traslado es la prenda saliendo en camino, no un apartado de pedido.
  : m.kind === "reservation" && m.ref_type === "transfer" ? "traslado_creado"
  // Toda carga de inventario (entradas, cargas masivas) se muestra como «Ajuste».
  : m.kind === "adjustment" || m.ref_type === "intake" ? "adjustment"
  : m.kind === "count" && m.qty > 0 ? "ingreso"
  : m.kind;
const MV_LABEL: Record<string, string> = { ...KIND_LABEL, ingreso: "Ingreso", ingreso_traslado: "Traslado recibido", transfer_out: "Traslado enviado", traslado_creado: "Traslado creado (en camino)" };
delete (MV_LABEL as Record<string, string>).transfer_in;
delete (MV_LABEL as Record<string, string>).count;
const mvLabel = (k: string) => MV_LABEL[k] ?? k;
// Cantidad con signo: ventas, reservas y traslados enviados restan.
const signedQty = (m: { kind: string; qty: number }) =>
  ["sale", "reservation", "transfer_out"].includes(m.kind) ? -Math.abs(m.qty)
  : ["release", "transfer_in"].includes(m.kind) ? Math.abs(m.qty)
  : m.qty;

// Calidad A si no tiene calidad o termina en "a"; B/C según la letra final
function qualityLetter(q: string | null | undefined): string {
  const t = (q ?? "").trim().toLowerCase();
  if (!t) return "A";
  return t.slice(-1).toUpperCase();
}

type KVariant = { id: string; sku: string; size: string | null; color: string | null; quality?: string | null };
type KLocation = { id: string; code?: string; name: string };

export function KardexModal({ productId, productName, locations: locationsProp, onClose }: { productId: string; productName: string; locations?: KLocation[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [variantF, setVariantF] = useState("");
  const [locF, setLocF] = useState("");
  const [kindF, setKindF] = useState("");
  const [actorF, setActorF] = useState("");
  const [fromF, setFromF] = useState("");
  const [toF, setToF] = useState("");
  const [panel, setPanel] = useState<null | "adjust" | "swap">(null);

  const { data: fetchedLocations } = useQuery({
    queryKey: ["locations", "active"],
    enabled: !locationsProp,
    queryFn: async () => {
      const rows = (await supabase.from("locations").select("id, code, name, kind, priority").eq("active", true)).data ?? [];
      return rows.sort((a, b) => {
        const wa = a.code === "bodega" ? 0 : 1;
        const wb = b.code === "bodega" ? 0 : 1;
        return wa - wb || (a.priority ?? 0) - (b.priority ?? 0);
      });
    },
  });
  const locations: KLocation[] = locationsProp ?? fetchedLocations ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ["kardex", productId],
    queryFn: async () => {
      const { data: variants, error: vErr } = await supabase.from("product_variants").select("id, sku, size, color, quality").eq("product_id", productId);
      if (vErr) throw vErr;
      const ids = (variants ?? []).map((v) => v.id);
      if (!ids.length) return { variants: [] as KVariant[], movements: [], levels: [] };
      const [{ data: moves, error: mErr }, { data: levels }] = await Promise.all([
        fetchAll((from, to) => supabase.from("inventory_movements").select("id, variant_id, location_id, kind, qty, ref_type, ref_id, note, created_at, actor_id").in("variant_id", ids).order("created_at", { ascending: false }).order("id").range(from, to)).then((data) => ({ data, error: null })),
        supabase.from("inventory_levels").select("variant_id, location_id, on_hand, reserved").in("variant_id", ids),
      ]);
      if (mErr) throw mErr;
      // Número de factura R-Count por pedido (movimientos de venta).
      const orderIds = [...new Set((moves ?? []).filter((mm) => mm.ref_type === "order" && mm.ref_id).map((mm) => mm.ref_id as string))];
      const invoiceMap = new Map<string, string>();
      if (orderIds.length) {
        // Fuente principal: facturas emitidas ante la DIAN (se actualiza cuando llega el número).
        for (let i = 0; i < orderIds.length; i += 200) {
          const chunk = orderIds.slice(i, i + 200);
          const { data: invs } = await supabase.from("invoices").select("order_id, number").in("order_id", chunk).eq("status", "issued").not("number", "is", null);
          for (const inv of invs ?? []) if (inv.number && !invoiceMap.has(inv.order_id)) invoiceMap.set(inv.order_id, inv.number);
        }
        const missing = orderIds.filter((id) => !invoiceMap.has(id));
        for (let i = 0; i < missing.length; i += 200) {
          const { data: logs } = await supabase.from("rcount_sync_log").select("order_id, response, status").in("order_id", missing.slice(i, i + 200)).eq("status", "ok");
          for (const lg of logs ?? []) {
            const r = (lg.response ?? {}) as Record<string, unknown>;
            const num = (r.invoice_number ?? r.number ?? r.factura ?? r.consecutivo ?? r.invoice ?? "") as string | number;
            if (num && !invoiceMap.has(lg.order_id)) invoiceMap.set(lg.order_id, String(num));
          }
        }
      }
      // Número de pedido y nombre del cliente para movimientos de venta.
      const orderMap = new Map<string, { number: string; customer: string }>();
      if (orderIds.length) {
        for (let i = 0; i < orderIds.length; i += 200) {
          const chunk = orderIds.slice(i, i + 200);
          const { data: ords } = await supabase.from("orders").select("id, number, contact_name, contact_email").in("id", chunk);
          for (const o of ords ?? []) {
            const customer = ((o.contact_name ?? "") || (o.contact_email ?? "")).trim();
            orderMap.set(o.id, { number: o.number ?? "", customer });
          }
        }
      }
      // Traslados referenciados: creador (quien envía) y ruta origen → destino.
      const transferIds = [...new Set((moves ?? []).filter((mm) => mm.ref_type === "transfer" && mm.ref_id).map((mm) => mm.ref_id as string))];
      const transferMap = new Map<string, { creator: string | null; from: string; to: string }>();
      for (let i = 0; i < transferIds.length; i += 200) {
        const { data: trs } = await supabase.from("transfers").select("id, created_by, requested_by, from_location_id, to_location_id").in("id", transferIds.slice(i, i + 200));
        for (const t of (trs ?? []) as any[]) transferMap.set(t.id, { creator: t.created_by ?? t.requested_by ?? null, from: t.from_location_id, to: t.to_location_id });
      }
      // Nombres de quien registró cada movimiento (ajustes, entradas, devoluciones).
      const actorIds = [...new Set([...(moves ?? []).map((mm) => mm.actor_id), ...[...transferMap.values()].map((t) => t.creator)].filter(Boolean))] as string[];
      const actorMap = new Map<string, string>();
      if (actorIds.length) {
        for (let i = 0; i < actorIds.length; i += 200) {
          const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", actorIds.slice(i, i + 200));
          for (const p of profs ?? []) actorMap.set(p.id, (p.full_name ?? "").trim());
        }
      }
      return { variants: (variants ?? []) as KVariant[], movements: moves ?? [], levels: levels ?? [], invoiceMap: [...invoiceMap.entries()], actorMap: [...actorMap.entries()], orderMap: [...orderMap.entries()], transferMap: [...transferMap.entries()] };
    },
  });

  const variantMap = new Map((data?.variants ?? []).map((v) => [v.id, v]));
  const locMap = new Map(locations.map((l) => [l.id, l]));
  const invoiceMap = new Map(data?.invoiceMap ?? []);
  const actorMap = new Map(data?.actorMap ?? []);
  const orderMap = new Map<string, { number: string; customer: string }>(data?.orderMap ?? []);
  const transferMap = new Map<string, { creator: string | null; from: string; to: string }>((data as any)?.transferMap ?? []);
  // Ventas: "Hecho por" muestra el cliente del pedido; ajustes y demás, el usuario del equipo.
  // Traslados: la salida (creado/enviado) es de quien creó el traslado; la entrada, de quien recibió.
  const doneBy = (m: { kind: string; ref_type?: string | null; ref_id?: string | null; actor_id?: string | null }) => {
    if (m.ref_type === "order" && m.ref_id) {
      const o = orderMap.get(m.ref_id);
      if (o?.customer) return o.customer;
    }
    if (m.ref_type === "transfer" && m.ref_id && m.kind === "transfer_out") {
      const creator = transferMap.get(m.ref_id)?.creator;
      if (creator && actorMap.get(creator)) return actorMap.get(creator)!;
    }
    return m.actor_id ? actorMap.get(m.actor_id) ?? "—" : "—";
  };
  // Nota de ventas: número de pedido en lugar de "order".
  const noteFor = (m: { note?: string | null; ref_type?: string | null; ref_id?: string | null }) => {
    if (m.ref_type === "order" && m.ref_id) {
      const o = orderMap.get(m.ref_id);
      const num = o?.number;
      return m.note ? (num ? `${num} · ${m.note}` : m.note) : num ?? "";
    }
    if (m.ref_type === "transfer" && m.ref_id) {
      const t = transferMap.get(m.ref_id);
      const route = t ? `Traslado ${locMap.get(t.from)?.name ?? "—"} → ${locMap.get(t.to)?.name ?? "—"}` : "Traslado";
      return m.note && m.note !== "transfer" ? `${route} · ${m.note}` : route;
    }
    return m.note ?? m.ref_type ?? "";
  };
  const vLabel = (v?: KVariant) => (v ? [v.color, v.size, v.quality ? `Tipo ${qualityLetter(v.quality)}` : null].filter(Boolean).join(" · ") || "Único" : "—");

  // Saldos corrientes: con una bodega filtrada son por variante+bodega; con
  // «Todas las bodegas» son el total de la variante sumando todas las bodegas.
  // Físico = prendas en bodega. Disponible = físico − apartado (lo que se ve en Inventario).
  const rows = useMemo(() => {
    const keyOf = (variantId: string, locationId: string) => (locF ? `${variantId}|${locationId}` : variantId);
    const phys = new Map<string, number>();
    const avail = new Map<string, number>();
    for (const l of data?.levels ?? []) {
      const k = keyOf(l.variant_id, l.location_id);
      phys.set(k, (phys.get(k) ?? 0) + (l.on_hand ?? 0));
      avail.set(k, (avail.get(k) ?? 0) + (l.on_hand ?? 0) - ((l as { reserved?: number | null }).reserved ?? 0));
    }
    // Una venta online genera primero una reserva y luego la salida definitiva.
    // Si ambas pertenecen al mismo pedido, variante y bodega, el kardex muestra
    // únicamente la salida final para no presentar la misma venta dos veces.
    const completedSales = new Set(
      (data?.movements ?? [])
        .filter((m) => m.kind === "sale" && m.ref_type === "order" && m.ref_id)
        .map((m) => `${m.ref_id}|${m.variant_id}|${m.location_id}`),
    );
    const visibleMovements = (data?.movements ?? []).filter((m) =>
      !(m.kind === "reservation" && m.ref_type === "order" && m.ref_id && completedSales.has(`${m.ref_id}|${m.variant_id}|${m.location_id}`)),
    );
    // Recorrido de lo más reciente a lo más antiguo, revirtiendo cada movimiento.
    const out = visibleMovements.map((m) => {
      const key = keyOf(m.variant_id, m.location_id);
      const p = phys.get(key) ?? 0;
      const a = avail.get(key) ?? 0;
      const sq = signedQty(m);
      if (m.kind === "reservation" || m.kind === "release") {
        // Apartados y liberaciones solo mueven el disponible.
        avail.set(key, a - sq);
      } else {
        // La reserva oculta de una venta se trata junto con la venta: ambos bajan juntos.
        phys.set(key, p - sq);
        avail.set(key, a - sq);
      }
      return { ...m, sq, dk: mvKind(m), balance: p, available: a };
    });
    const fromTs = fromF ? new Date(fromF + "T00:00:00").getTime() : null;
    const toTs = toF ? new Date(toF + "T23:59:59.999").getTime() : null;
    return out.filter((m) =>
      (!variantF || m.variant_id === variantF) &&
      (!locF || m.location_id === locF) &&
      (!kindF || m.dk === kindF) &&
      (!actorF || doneBy(m) === actorF) &&
      (!fromTs || new Date(m.created_at).getTime() >= fromTs) &&
      (!toTs || new Date(m.created_at).getTime() <= toTs),
    );
  }, [data, variantF, locF, kindF, actorF, fromF, toF]);

  // Lista de personas/clientes que aparecen en "Hecho por" para el filtro.
  const actorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of data?.movements ?? []) {
      const d = doneBy(m);
      if (d && d !== "—") set.add(d);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [data]);

  const summary = useMemo(() => {
    const s = new Map<string, number>();
    for (const m of rows) s.set(m.dk, (s.get(m.dk) ?? 0) + m.sq);
    return [...s.entries()];
  }, [rows]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["kardex"] });
    qc.invalidateQueries({ queryKey: ["inventory-tree"] });
  };

  const exportXlsx = () => {
    const sheet = XLSX.utils.json_to_sheet(rows.map((m) => {
      const v = variantMap.get(m.variant_id);
      return { Fecha: new Date(m.created_at).toLocaleString("es-CO"), SKU: v?.sku ?? "", Variante: vLabel(v), Bodega: locMap.get(m.location_id)?.name ?? "", Tipo: mvLabel(m.dk), Factura: m.ref_type === "order" && m.ref_id ? invoiceMap.get(m.ref_id) ?? "" : "", Cantidad: m.sq, "Saldo físico": m.balance ?? "", Disponible: m.available ?? "", "Hecho por": doneBy(m) === "—" ? "" : doneBy(m), Nota: noteFor(m) };
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, "Kardex");
    XLSX.writeFile(wb, `kardex-${productName.replace(/\s+/g, "-").toLowerCase()}.xlsx`);
  };

  const sel = "rounded-xl border border-ink/10 bg-white px-3 py-2 text-xs";

  return createPortal(
    <div className="admin-scope fixed inset-0 z-[140] flex items-center justify-center bg-ink/45 p-6" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="flex max-h-[90vh] w-full max-w-[1700px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-ink/10 px-6 py-5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-moss/70">Kardex</p>
            <h2 className="mt-1 font-serif text-2xl">{productName}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setPanel(panel === "adjust" ? null : "adjust")} className={"rounded-full border border-ink/15 px-4 py-2 text-xs " + (panel === "adjust" ? "bg-ink text-ivory" : "hover:bg-ink/5")}>Ajuste / devolución</button>
            <button type="button" onClick={() => setPanel(panel === "swap" ? null : "swap")} className={"inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-4 py-2 text-xs " + (panel === "swap" ? "bg-ink text-ivory" : "hover:bg-ink/5")}><ArrowLeftRight className="h-3.5 w-3.5" /> Cambio entre ref/tallas</button>
            <button type="button" onClick={exportXlsx} title="Descargar Excel" className="rounded-full p-2 hover:bg-ink/5"><Download className="h-4 w-4" /></button>
            <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-ink/5" aria-label="Cerrar"><X className="h-4 w-4" /></button>
          </div>
        </header>

        {panel === "adjust" && data && (
          <AdjustForm variants={data.variants} locations={locations} vLabel={vLabel} defaultVariant={variantF} onDone={() => { setPanel(null); refresh(); }} />
        )}
        {panel === "swap" && data && (
          <SwapForm variants={data.variants} locations={locations} vLabel={vLabel} productName={productName} defaultVariant={variantF} onDone={() => { setPanel(null); refresh(); }} />
        )}

        <div className="flex flex-wrap items-center gap-2 border-b border-ink/10 px-6 py-3">
          <select value={variantF} onChange={(e) => setVariantF(e.target.value)} className={sel}>
            <option value="">Todas las variantes</option>
            {(data?.variants ?? []).map((v) => <option key={v.id} value={v.id}>{vLabel(v)} · {v.sku}</option>)}
          </select>
          <select value={locF} onChange={(e) => setLocF(e.target.value)} className={sel}>
            <option value="">Todas las bodegas</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select value={kindF} onChange={(e) => setKindF(e.target.value)} className={sel}>
            <option value="">Todos los movimientos</option>
            {Object.entries(MV_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <select value={actorF} onChange={(e) => setActorF(e.target.value)} className={sel}>
            <option value="">Todos los usuarios</option>
            {actorOptions.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <input type="date" value={fromF} onChange={(e) => setFromF(e.target.value)} title="Desde" className={sel} />
          <input type="date" value={toF} onChange={(e) => setToF(e.target.value)} title="Hasta" className={sel} />
          <div className="ml-auto flex flex-wrap gap-1.5">
            {summary.map(([k, q]) => (
              <span key={k} className="rounded-full bg-cream px-2.5 py-1 text-[10px] uppercase tracking-widest text-moss">{mvLabel(k)} <b className={q >= 0 ? "text-moss" : "text-clay"}>{q > 0 ? "+" : ""}{q}</b></span>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <p className="py-10 text-center text-sm text-moss/60">Cargando movimientos…</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-moss/60">Sin movimientos registrados.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-widest text-moss/70">
                <tr>
                  <th className="py-2 pr-4 pl-1 text-left whitespace-nowrap">Fecha</th>
                  <th className="px-4 text-left whitespace-nowrap">SKU</th>
                  <th className="px-4 text-left whitespace-nowrap">Variante</th>
                  <th className="px-4 text-left whitespace-nowrap">Bodega</th>
                  <th className="px-4 text-left whitespace-nowrap">Tipo</th>
                  <th className="min-w-28 px-4 text-left whitespace-nowrap">Factura</th>
                  <th className="min-w-20 px-4 text-right whitespace-nowrap">Cantidad</th>
                  <th className="min-w-20 px-4 text-right whitespace-nowrap">Saldo físico</th>
                  <th className="min-w-20 px-4 text-right whitespace-nowrap" title="Saldo físico menos lo apartado para pedidos">Disponible</th>
                  <th className="min-w-36 px-4 text-left whitespace-nowrap">Hecho por</th>
                  <th className="min-w-32 px-4 text-left whitespace-nowrap">Nota</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const v = variantMap.get(m.variant_id);
                  const positive = m.sq >= 0;
                  return (
                    <tr key={m.id} className="border-t border-ink/5">
                      <td className="py-2 pr-4 pl-1 text-xs whitespace-nowrap text-moss/80">{formatDate(m.created_at)}</td>
                      <td className="px-4 font-mono text-[11px] whitespace-nowrap text-ink/60">{v?.sku ?? "—"}</td>
                      <td className="px-4 text-xs whitespace-nowrap">{vLabel(v)}</td>
                      <td className="px-4 text-xs whitespace-nowrap">{locMap.get(m.location_id)?.name ?? "—"}</td>
                      <td className="px-4 text-xs whitespace-nowrap uppercase tracking-widest text-moss/70">{mvLabel(m.dk)}</td>
                      <td className="px-4 text-xs whitespace-nowrap text-ink/70">{m.ref_type === "order" && m.ref_id ? invoiceMap.get(m.ref_id) ?? "—" : ""}</td>
                      <td className={"px-4 text-right font-serif tabular-nums " + (positive ? "text-moss" : "text-clay")}>{positive ? "+" : ""}{m.sq}</td>
                      <td className="px-4 text-right font-serif tabular-nums text-ink/70">{m.balance ?? "—"}</td>
                      <td className="px-4 text-right font-serif tabular-nums text-ink">{m.available ?? "—"}</td>
                      <td className="px-4 text-xs whitespace-nowrap text-ink/70">{doneBy(m)}</td>
                      <td className="px-4 text-xs text-moss/70">{noteFor(m)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

function AdjustForm({ variants, locations, vLabel, defaultVariant, onDone }: { variants: KVariant[]; locations: KLocation[]; vLabel: (v?: KVariant) => string; defaultVariant: string; onDone: () => void }) {
  const [variantId, setVariantId] = useState(defaultVariant || variants[0]?.id || "");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [kind, setKind] = useState<"adjustment" | "return">("adjustment");
  const [qty, setQty] = useState("");
  const [note, setNote] = useState("");
  const sendRCount = useServerFn(sendRCountAdjustment);
  const m = useMutation({
    mutationFn: async () => {
      const n = Number(qty);
      if (!n) throw new Error("Indica una cantidad (negativa para restar).");
      const { error } = await supabase.rpc("adjust_inventory" as never, { _location_id: locationId, _variant_id: variantId, _qty: n, _kind: kind, _note: note } as never);
      if (error) throw error;
      if (kind === "adjustment") {
        const r = await sendRCount({ data: { kind: "ajuste", reason: note || "Ajuste Hub", items: [{ variant_id: variantId, qty: n }], location_id: locationId } });
        if (!r.ok) toast.error(r.message);
      }
    },
    onSuccess: () => { toast.success("Movimiento registrado en el kardex."); onDone(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo registrar."),
  });
  const f = "rounded-xl border border-ink/10 bg-white px-3 py-2 text-xs";
  return (
    <div className="grid gap-2 border-b border-ink/10 bg-cream/50 px-6 py-4 md:grid-cols-6">
      <select value={kind} onChange={(e) => setKind(e.target.value as "adjustment" | "return")} className={f}>
        <option value="adjustment">Ajuste</option>
        <option value="return">Devolución</option>
      </select>
      <select value={variantId} onChange={(e) => setVariantId(e.target.value)} className={f + " md:col-span-2"}>
        {variants.map((v) => <option key={v.id} value={v.id}>{vLabel(v)} · {v.sku}</option>)}
      </select>
      <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={f}>
        {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" placeholder="+/- cantidad" className={f} />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo (obligatorio)" className={f} />
      <div className="md:col-span-6 flex justify-end">
        <button onClick={() => m.mutate()} disabled={m.isPending || !note.trim()} className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2 text-xs text-ivory disabled:opacity-50">
          {m.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Registrar
        </button>
      </div>
    </div>
  );
}

function SwapForm({ variants, locations, vLabel, productName, defaultVariant, onDone }: { variants: KVariant[]; locations: KLocation[]; vLabel: (v?: KVariant) => string; productName: string; defaultVariant: string; onDone: () => void }) {
  const [fromId, setFromId] = useState(defaultVariant || variants[0]?.id || "");
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [q, setQ] = useState("");
  const [toId, setToId] = useState("");
  const [toLabel, setToLabel] = useState("");

  const { data: results } = useQuery({
    queryKey: ["swap-search", q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const term = q.trim();
      const { data } = await supabase
        .from("product_variants")
        .select("id, sku, size, color, quality, products!inner(name)")
        .or(`sku.ilike.%${term}%,products.name.ilike.%${term}%`)
        .limit(20);
      return (data ?? []) as unknown as (KVariant & { products: { name: string } })[];
    },
  });
  const local = variants.filter((v) => v.id !== fromId);

  const m = useMutation({
    mutationFn: async () => {
      if (!toId) throw new Error("Elige la variante que realmente llegó / corresponde.");
      const { error } = await supabase.rpc("swap_variants" as never, { _location_id: locationId, _from_variant: fromId, _to_variant: toId, _qty: Number(qty), _note: note } as never);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cambio registrado en el kardex de ambas variantes."); onDone(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo registrar el cambio."),
  });
  const f = "rounded-xl border border-ink/10 bg-white px-3 py-2 text-xs";
  const pick = (id: string, label: string) => { setToId(id); setToLabel(label); };

  return (
    <div className="space-y-3 border-b border-ink/10 bg-cream/50 px-6 py-4 text-xs">
      <p className="text-moss/80">Para tallas o referencias trocadas: resta de la variante registrada y suma a la que realmente está en la bodega. Queda en el kardex de las dos.</p>
      <div className="grid gap-2 md:grid-cols-4">
        <label className="md:col-span-2">
          <span className="text-[10px] uppercase tracking-widest text-moss/70">Sale (registrada)</span>
          <select value={fromId} onChange={(e) => setFromId(e.target.value)} className={f + " mt-1 w-full"}>
            {variants.map((v) => <option key={v.id} value={v.id}>{vLabel(v)} · {v.sku}</option>)}
          </select>
        </label>
        <label>
          <span className="text-[10px] uppercase tracking-widest text-moss/70">Bodega</span>
          <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={f + " mt-1 w-full"}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </label>
        <label>
          <span className="text-[10px] uppercase tracking-widest text-moss/70">Cantidad</span>
          <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" className={f + " mt-1 w-full"} />
        </label>
      </div>
      <div>
        <span className="text-[10px] uppercase tracking-widest text-moss/70">Entra (real) — {toLabel || "sin elegir"}</span>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {local.map((v) => (
            <button key={v.id} type="button" onClick={() => pick(v.id, `${productName} · ${vLabel(v)}`)} className={"rounded-full border px-3 py-1 " + (toId === v.id ? "border-ink bg-ink text-ivory" : "border-ink/15 bg-white hover:bg-ink/5")}>{vLabel(v)}</button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="…o busca otra referencia por nombre o SKU" className={f + " mt-2 w-full"} />
        {results && results.length > 0 && (
          <div className="mt-1 max-h-36 overflow-y-auto rounded-xl border border-ink/10 bg-white">
            {results.filter((r) => r.id !== fromId).map((r) => (
              <button key={r.id} type="button" onClick={() => pick(r.id, `${r.products.name} · ${vLabel(r)}`)} className={"block w-full px-3 py-1.5 text-left hover:bg-ink/5 " + (toId === r.id ? "bg-cream" : "")}>
                {r.products.name} · {vLabel(r)} <span className="font-mono text-ink/50">{r.sku}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-2">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (ej. llegó M marcada como S)" className={f + " flex-1"} />
        <button onClick={() => m.mutate()} disabled={m.isPending || !toId} className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2 text-ivory disabled:opacity-50">
          {m.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Registrar cambio
        </button>
      </div>
    </div>
  );
}
