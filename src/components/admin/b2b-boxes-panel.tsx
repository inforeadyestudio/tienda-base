import { formatUSD } from "@/lib/format";
import { useEffect, useMemo, useRef, useState } from "react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { Check, ChevronDown, ChevronUp, Package, Pencil, Plus, Printer, Trash2, Truck, FileText } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { printB2BPackingList, printB2BBoxGuide } from "@/components/admin/order-print";
import { SkydropxLabelCard } from "@/components/admin/skydropx-label-card";
import { InternationalLabelCard, isInternationalShip } from "@/components/admin/international-label-card";
import { resendBoxBilling } from "@/lib/rcount.functions";
import { refreshBoxLabel, stampShippingLabel } from "@/lib/carriers.functions";
import { openStampedLabel } from "@/lib/print-label";
import { compareSizes, displaySize } from "@/lib/size-order";
import { Button } from "@/components/ui/button";
import { customsDifference, distributeCustomsValue, type BillingValueMode } from "@/lib/b2b-customs";
import { selectBoxLocation } from "@/lib/b2b-box-selection";

type Item = {
  id: string; qty: number; shipped_qty?: number | null; fulfill_location_id?: string | null; b2b_source?: "restock" | "preventa" | null;
  unit_price_cop: number; product_name: string | null; variant_label: string | null;
  product_variants?: { sku?: string; size?: string; color?: string; products?: { name?: string; hero_image_url?: string } } | null;
};

const TRANSFER_LABEL: Record<string, string> = {
  requested: "Solicitado", approved: "Pendiente por enviar", in_transit: "En camino", received: "Recibido", cancelled: "Cancelado",
};

function Step({ done, title, children }: { done: boolean; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${done ? "bg-ink border-ink text-ivory" : "border-ink/25"}`}>
        {done && <Check className="size-3" />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink">{title}</p>
        {children}
      </div>
    </li>
  );
}

/** Pasos del pedido B2B: cantidades (con bodega de origen en restock), pago, traslado y despacho por cajas. */
export function B2BOrderFlow({ order }: { order: any }) {
  const items = [...(order.order_items ?? []) as Item[]].sort((a, b) =>
    String(a.product_variants?.products?.name ?? a.product_name ?? "").localeCompare(String(b.product_variants?.products?.name ?? b.product_name ?? ""), "es", { sensitivity: "base", numeric: true }) ||
    String(a.product_variants?.color ?? "").localeCompare(String(b.product_variants?.color ?? ""), "es") ||
    compareSizes(a.product_variants?.size ?? a.variant_label, b.product_variants?.size ?? b.variant_label)
  );
  const { data } = useQuery({
    queryKey: ["b2b-flow", order.id],
    queryFn: async () => {
      const [{ data: res }, { data: transfers }] = await Promise.all([
        supabase.from("reservations").select("qty, status, location_id, locations:location_id(name)").eq("order_id", order.id).eq("status", "active"),
        supabase.from("transfers").select("id, status, from:from_location_id(name), to:to_location_id(name)").eq("order_id" as any, order.id),
      ]);
      const byLoc = new Map<string, { name: string; units: number }>();
      (res ?? []).forEach((r: any) => {
        const c = byLoc.get(r.location_id) ?? { name: r.locations?.name ?? "Bodega", units: 0 };
        c.units += r.qty; byLoc.set(r.location_id, c);
      });
      return { origins: [...byLoc.values()].sort((a, b) => b.units - a.units), transfers: (transfers ?? []) as any[] };
    },
  });
  const total = items.reduce((s, i) => s + i.qty, 0);
  const shipped = items.reduce((s, i) => s + (i.shipped_qty ?? 0), 0);
  const qtyOk = !!order.stock_confirmed_at;
  const credit = String(order.b2b_payment_method ?? "").startsWith("credito");
  const paid = credit || !!order.paid_at || order.payment_status === "paid";
  const pending = (data?.transfers ?? []).filter((t) => !["received", "cancelled"].includes(t.status));
  const transferOk = qtyOk && pending.length === 0;
  const done = ["shipped", "delivered"].includes(order.status);

  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-widest text-moss/70">Pedido B2B</p>
        <span className="text-[10px] uppercase tracking-widest rounded-full bg-ink/5 px-2 py-1">
          {done ? "Despachado" : shipped > 0 ? "Despacho parcial" : qtyOk && paid && transferOk ? "Listo para despachar" : "En proceso"}
        </span>
      </div>
      <ol className="mt-4 space-y-4">
        <Step done={qtyOk} title="Cantidades">
          {!qtyOk && (
            <div className="flex flex-wrap gap-x-2 text-xs text-moss/75">
              <button type="button" onClick={() => window.dispatchEvent(new Event("b2b-confirm-quantities"))} className="text-ink underline underline-offset-2">Confirmar cantidades</button>
              <span>o</span>
              <button type="button" onClick={() => window.dispatchEvent(new Event("b2b-adjust-open"))} className="text-ink underline underline-offset-2">ajustarlas</button>
            </div>
          )}
          {(data?.origins ?? []).length > 0 && (
            <div className="mt-1 text-xs text-moss/80">
              <p className="text-moss/60">Unidades reservadas en:</p>
              {(data?.origins ?? []).length === 0
                ? <p>{done ? "Ya despachadas." : "Sin reservas activas."}</p>
                : <ul>{data!.origins.map((o) => <li key={o.name}><span className="text-ink">{o.name}</span> · {o.units} u.</li>)}</ul>}
            </div>
          )}
        </Step>
        <Step done={paid} title="Pago">
          {paid
            ? <p className="text-xs text-moss/75">{credit && !order.paid_at ? "A crédito · no necesita confirmar el pago." : "Pago confirmado."}</p>
            : <button type="button" onClick={() => window.dispatchEvent(new Event("b2b-confirm-payment"))} className="text-xs text-ink underline underline-offset-2">Confirmar pago</button>}
        </Step>
        <Step done={transferOk} title="Traslado">
          {(data?.transfers ?? []).length === 0 ? <p className="text-xs text-moss/75">No necesita traslado.</p> : (
            <ul className="mt-1 space-y-1">
              {data!.transfers.map((t) => (
                <li key={t.id} className="text-xs text-moss">
                  {t.from?.name} → {t.to?.name}: <span className="text-ink">{t.status === "received" ? "Recibido" : `${TRANSFER_LABEL[t.status] ?? t.status} · pendiente por recibir`}</span>{" "}
                  <Link to="/admin/traslados" className="underline">Ver</Link>
                </li>
              ))}
            </ul>
          )}
        </Step>
        <Step done={done} title="Despacho por cajas">
          <p className="text-xs text-moss/75">{shipped} de {total} unidades despachadas.</p>
        </Step>
      </ol>
    </section>
  );
}

/** Cajas del pedido B2B: cada caja tiene su lista de empaque, su factura y su guía. */
export function B2BBoxesPanel({ order, ship, companyName, documentId }: { order: any; ship: Record<string, any>; companyName?: string | null; documentId?: string | null }) {
  const qc = useQueryClient();
  const items = [...(order.order_items ?? []) as Item[]].sort((a, b) =>
    String(a.product_variants?.products?.name ?? a.product_name ?? "").localeCompare(String(b.product_variants?.products?.name ?? b.product_name ?? ""), "es", { sensitivity: "base", numeric: true }) ||
    String(a.product_variants?.color ?? "").localeCompare(String(b.product_variants?.color ?? ""), "es") ||
    compareSizes(a.product_variants?.size ?? a.variant_label, b.product_variants?.size ?? b.variant_label));
  const resend = useServerFn(resendBoxBilling);
  const refreshBoxLabelFn = useServerFn(refreshBoxLabel);
  const stampFn = useServerFn(stampShippingLabel);
  const intl = isInternationalShip(ship);
  const [creating, setCreating] = useState(false);
  const [editingBox, setEditingBox] = useState<any | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!creating || !editingBox) return;
    editorRef.current?.scrollIntoView({ block: "start", behavior: "instant" });
  }, [creating, editingBox]);
  const [pkgType, setPkgType] = useState<"caja" | "paquete">("caja");
  const unit = (b: any) => (b?.package_type === "paquete" ? "Paquete" : "Caja");
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [meta, setMeta] = useState({ weight_kg: "", length_cm: "", width_cm: "", height_cm: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [guideFor, setGuideFor] = useState<string | null>(null);
  const [packingFor, setPackingFor] = useState<any | null>(null);
  const [packingPhotos, setPackingPhotos] = useState(true);
  const [manual, setManual] = useState<Record<string, { carrier: string; tracking: string }>>({});
  const [customsDraft, setCustomsDraft] = useState<Record<string, string>>({});
  const [billingModes, setBillingModes] = useState<Record<string, BillingValueMode>>({});
  const [collapsedBoxes, setCollapsedBoxes] = useState<Set<string>>(() => new Set());

  const { data: boxes, isPending: loadingBoxes, error: boxesError } = useQuery({
    queryKey: ["b2b-boxes", order.id],
    queryFn: async () => {
      const [{ data: b, error: boxError }, { data: inv, error: invoiceError }] = await Promise.all([
        (supabase as any).from("b2b_boxes").select("*, b2b_box_items(id, order_item_id, qty, location_id, b2b_source, customs_invoice_value)").eq("order_id", order.id).order("box_number"),
        (supabase as any).from("invoices").select("id, box_id, status, number, pdf_url, error, external_id, billing_value_mode, total_amount, commercial_total_amount").eq("order_id", order.id).not("box_id", "is", null),
      ]);
      if (boxError) throw boxError;
      if (invoiceError) throw invoiceError;
      const invByBox = new Map<string, any>(((inv ?? []) as any[]).map((i) => [i.box_id, i]));
      return ((b ?? []) as any[]).map((x) => ({ ...x, invoice: invByBox.get(x.id) ?? null }));
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["b2b-boxes", order.id] });
    qc.invalidateQueries({ queryKey: ["b2b-flow", order.id] });
    qc.invalidateQueries({ queryKey: ["admin", "order", order.id] });
    qc.invalidateQueries({ queryKey: ["b2b-shipments"] });
  };

  const pendingById = useMemo(() => {
    const packed = new Map<string, number>();
    (boxes ?? []).filter((b) => b.status === "packed" && b.id !== editingBox?.id).forEach((b) => (b.b2b_box_items ?? []).forEach((bi: any) => packed.set(bi.order_item_id, (packed.get(bi.order_item_id) ?? 0) + bi.qty)));
    return new Map(items.map((i) => [i.id, Math.max(0, i.qty - (i.shipped_qty ?? 0) - (packed.get(i.id) ?? 0))]));
  }, [boxes, items, editingBox]);
  const { data: locNames } = useQuery({
    queryKey: ["b2b-box-locs"],
    queryFn: async () => (await supabase.from("locations").select("id, name, code").eq("active", true)).data ?? [],
    staleTime: 300_000,
  });
  const centralId = (locNames ?? []).find((l: any) => l.code === "bodega")?.id ?? "central";
  const locOf = (i: Item) => (i.b2b_source === "restock" && i.fulfill_location_id) ? i.fulfill_location_id : centralId;
  const locName = (id: string) => (locNames ?? []).find((l: any) => l.id === id)?.name ?? "Bodega central";
  const allPending = items.filter((i) => (pendingById.get(i.id) ?? 0) > 0);
  const pendingLocs = [...new Set(allPending.map(locOf))];
  const [boxLoc, setBoxLoc] = useState<string | null>(null);
  const activeLoc = selectBoxLocation(pendingLocs, boxLoc, editingBox?.location_id ?? null);
  const pendingItems = allPending.filter((i) => locOf(i) === activeLoc);
  const otherLocationItems = allPending.filter((i) => locOf(i) !== activeLoc);
  const totalPending = allPending.reduce((s, i) => s + (pendingById.get(i.id) ?? 0), 0);
  const label = (i: Item) => [i.product_variants?.products?.name ?? i.product_name, i.product_variants?.color, i.product_variants?.size].filter(Boolean).join(" · ");

  const createBox = async () => {
    const payload = Object.entries(draft).filter(([, q]) => q > 0).map(([order_item_id, qty]) => ({ order_item_id, qty }));
    if (!payload.length) return toast.error("Agrega al menos una prenda a la caja");
    setBusy("create");
    try {
      if (editingBox) {
        const { error } = await (supabase.rpc as any)("update_b2b_box", { _box_id: editingBox.id, _items: payload, _meta: meta });
        if (error) throw error;
        toast.success(`${unit(editingBox)} ${editingBox.box_number} actualizada`);
      } else {
        const { data: boxId, error } = await (supabase.rpc as any)("create_b2b_box", { _order_id: order.id, _items: payload, _meta: { ...meta, package_type: pkgType } });
        if (error) throw error;
        if (!boxId) throw new Error("No se pudo guardar la caja");
        toast.success(pkgType === "paquete" ? "Paquete armado" : "Caja armada");
      }
      setPkgType("caja");
      setCreating(false); setEditingBox(null); setDraft({}); setMeta({ weight_kg: "", length_cm: "", width_cm: "", height_cm: "" });
      refresh();
    } catch (e: any) { toast.error(e?.message ?? "No se pudo guardar la caja"); }
    finally { setBusy(null); }
  };

  const startEdit = (b: any) => {
    refresh();
    setEditingBox(b);
    setPkgType(b.package_type === "paquete" ? "paquete" : "caja");
    setDraft(Object.fromEntries((b.b2b_box_items ?? []).map((bi: any) => [bi.order_item_id, Number(bi.qty)])));
    setMeta({
      weight_kg: b.weight_kg != null ? String(b.weight_kg) : "",
      length_cm: b.length_cm != null ? String(b.length_cm) : "",
      width_cm: b.width_cm != null ? String(b.width_cm) : "",
      height_cm: b.height_cm != null ? String(b.height_cm) : "",
    });
    setBoxLoc(b.location_id ?? null);
    setCreating(true);
  };

  // Pedidos en US$: cada prenda vale su precio US$ × unidades, igual que en el pedido (sin precio US$ guardado usa la tasa del pedido).
  const usdPerCop = Number(order.total_cop ?? 0) > 0 ? Number(order.total_usd ?? 0) / Number(order.total_cop) : 0;
  const usdUnit = (i: any) => Number(i.unit_price_usd) > 0 ? Number(i.unit_price_usd) : Number(i.unit_price_cop ?? 0) * usdPerCop;
  const boxOrder = (b: any) => {
    const byId = new Map(items.map((i) => [i.id, i]));
    const boxItems = (b.b2b_box_items ?? []).map((bi: any) => ({ ...byId.get(bi.order_item_id), qty: bi.qty })).filter((i: any) => i.id);
    const boxGross = boxItems.reduce((s: number, i: any) => s + i.qty * Number(i.unit_price_cop), 0);
    const fullGross = items.reduce((s, i) => s + i.qty * Number(i.unit_price_cop), 0) || 1;
    const w = (i: any) => order.currency === "USD" ? usdUnit(i) : Number(i.unit_price_cop);
    const usdBox = boxItems.reduce((s: number, i: any) => s + i.qty * w(i), 0);
    
    const ratio = boxGross / fullGross;
    const f = 1 - Math.min(90, Math.max(0, Number(b.discount_pct ?? 0))) / 100;
    const discount = Math.round(boxGross - (boxGross - Number(order.discount_cop ?? 0) * ratio) * f);
    return {
      ...order, number: `${order.number} · ${unit(b)} ${b.box_number}`, order_items: boxItems,
      subtotal_cop: boxGross, discount_cop: discount, shipping_cop: 0, total_cop: boxGross - discount,
      total_usd: usdBox * f, company_name: companyName ?? null, customer_document_id: documentId ?? null,
      notes: [b.weight_kg ? `Peso: ${b.weight_kg} kg` : "", b.length_cm ? `Medidas: ${b.length_cm}×${b.width_cm}×${b.height_cm} cm` : "", b.tracking ? `Guía: ${b.carrier ?? ""} ${b.tracking}` : ""].filter(Boolean).join(" · ") || null,
    };
  };

  const saveDiscount = async (b: any, raw: string) => {
    const pct = raw === "" ? 0 : Number(raw);
    if (!Number.isFinite(pct) || pct < 0 || pct > 90) return toast.error("El descuento debe estar entre 0 y 90 %");
    if (pct === Number(b.discount_pct ?? 0)) return;
    const { error } = await (supabase as any).from("b2b_boxes").update({ discount_pct: pct }).eq("id", b.id);
    if (error) return toast.error(error.message);
    toast.success(pct ? `Descuento de ${pct} % aplicado` : "Descuento quitado");
    refresh();
  };

  const dispatch = async (b: any) => {
    const carrier = manual[b.id]?.carrier || b.carrier || "";
    const tracking = manual[b.id]?.tracking || b.tracking || "";
    if (!carrier || !tracking) return toast.error("Genera la guía o escribe transportadora y número de guía");
    if (!confirm(`¿Despachar ${unit(b).toLowerCase()} ${b.box_number}? Se descuenta del inventario${order.b2b_mode === "consignment" ? " y pasa a la bodega del cliente" : " y se envía su factura"}.`)) return;
    setBusy(b.id);
    const { error } = await (supabase.rpc as any)("dispatch_b2b_box", { _box_id: b.id, _carrier: carrier, _tracking: tracking });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`${unit(b)} ${b.box_number} despachado`);
    refresh();
  };

  const clearGuide = async (b: any) => {
    if (!confirm(`¿Quitar la guía de ${unit(b).toLowerCase()} ${b.box_number}? Podrás generar otra o escribirla a mano.`)) return;
    setBusy("g" + b.id);
    const { error } = await (supabase as any).from("b2b_boxes").update({ carrier: null, tracking: null, label_url: null }).eq("id", b.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Guía eliminada");
    refresh();
  };

  const saveGuide = async (b: any) => {
    const carrier = (manual[b.id]?.carrier ?? "").trim();
    const tracking = (manual[b.id]?.tracking ?? "").trim();
    if (!carrier || !tracking) return toast.error("Escribe transportadora y número de guía");
    setBusy("g" + b.id);
    const { error } = await (supabase as any).from("b2b_boxes").update({ carrier, tracking, label_url: null }).eq("id", b.id);
    setBusy(null);
    if (error) return toast.error(error.message);
    setManual((m) => ({ ...m, [b.id]: { carrier: "", tracking: "" } }));
    toast.success("Guía manual guardada");
    refresh();
  };

  const remove = async (b: any) => {
    if (!confirm(`¿Borrar ${unit(b).toLowerCase()} ${b.box_number}? Las prendas vuelven a pendientes.`)) return;
    const { error } = await (supabase.rpc as any)("delete_b2b_box", { _box_id: b.id });
    if (error) return toast.error(error.message);
    refresh();
  };

  const saveCustomsRow = async (b: any, row: { key: string; items: Array<{ boxItemId: string; commercialValue: number }> }, commercialValue: number) => {
    const stateKey = `${b.id}:${row.key}`;
    const raw = customsDraft[stateKey];
    if (raw == null) return;
    const customsValue = Number(raw);
    try {
      customsDifference(commercialValue, customsValue);
      const distributed = distributeCustomsValue(row.items, customsValue);
      const results = await Promise.all(row.items.map((item, index) => (supabase as any).from("b2b_box_items").update({ customs_invoice_value: distributed[index] }).eq("id", item.boxItemId)));
      const failure = results.find((result) => result.error)?.error;
      if (failure) throw failure;
      toast.success("Valor de aduanas guardado");
      refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el valor de aduanas");
    }
  };

  const retryInvoice = async (b: any, customsTotal: number, commercialTotal: number, customsComplete: boolean) => {
    const mode = billingModes[b.id] ?? b.billing_value_mode ?? "total";
    if (mode === "customs" && !customsComplete) return toast.error("Completa el valor de aduanas de todos los productos");
    const invoiceValue = mode === "customs" ? customsTotal : commercialTotal;
    if (!confirm(`¿Enviar a R-Count con ${mode === "customs" ? "el valor de aduanas" : "el valor total"} por ${formatValue({ total_usd: order.currency === "USD" ? invoiceValue : 0, total_cop: order.currency === "USD" ? 0 : invoiceValue })}?`)) return;
    setBusy("inv" + b.id);
    try {
      const r = await resend({ data: { orderId: order.id, boxId: b.id, billingValueMode: mode } });
      r.ok ? toast.success(r.message) : toast.error(r.message);
    } catch (e: any) { toast.error(e?.message ?? "No se pudo enviar la factura"); }
    finally { setBusy(null); refresh(); }
  };

  const canEdit = !["shipped", "delivered", "cancelled", "refunded"].includes(order.status);
  const formatValue = (o: any) => order.currency === "USD"
    ? formatUSD(Number(o.total_usd ?? 0))
    : `COP ${Math.round(Number(o.total_cop ?? 0)).toLocaleString("es-CO")}`;


  const toggleBox = (id: string) => setCollapsedBoxes((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-moss/70"><Package className="size-3.5" /> Cajas</p>
          <p className="mt-1 text-xs text-moss/75">{totalPending} unidades pendientes por empacar · guía {intl ? "internacional" : "nacional (Skydropx)"}</p>
        </div>
        {canEdit && totalPending > 0 && !creating && (
          <button onClick={() => { setEditingBox(null); setDraft({}); setMeta({ weight_kg: "", length_cm: "", width_cm: "", height_cm: "" }); setCreating(true); }} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-xs uppercase tracking-widest text-ivory">
            <Plus className="size-3.5" /> Nueva caja o paquete
          </button>
        )}
      </div>

      {(() => {
        const usd = (order.currency ?? "COP") === "USD";
        const fmt = (n: number) => usd ? `US$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : `COP ${Math.round(n).toLocaleString("es-CO")}`;
        const val = (o: any) => usd ? Number(o.total_usd ?? 0) : Number(o.total_cop ?? 0);
        const orderTotal = usd ? Number(order.total_usd ?? 0) : Number(order.total_cop ?? 0);
        const all = boxes ?? [];
        const sent = all.filter((b) => b.status !== "packed");
        const dispatched = sent.reduce((s, b) => s + val(boxOrder(b)), 0);
        const remaining = Math.max(0, orderTotal - dispatched);
        const issued = sent.filter((b) => b.invoice?.status === "issued" && b.invoice?.number);
        const pendingInv = order.b2b_mode === "consignment" ? [] : sent.filter((b) => !(b.invoice?.status === "issued" && b.invoice?.number));
        return (
          <div className="mt-4 rounded-xl bg-ink/[0.03] p-4">
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div><p className="text-moss/70">Total pedido</p><p className="mt-0.5 text-sm text-ink">{fmt(orderTotal)}</p></div>
              <div><p className="text-moss/70">Despachado</p><p className="mt-0.5 text-sm text-ink">− {fmt(dispatched)}</p></div>
              <div><p className="text-moss/70">Por despachar</p><p className="mt-0.5 text-sm font-medium text-ink">{fmt(remaining)}</p></div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10"><div className="h-full bg-moss" style={{ width: `${orderTotal > 0 ? Math.min(100, (dispatched / orderTotal) * 100) : 0}%` }} /></div>
            {sent.length > 0 && (
              <div className="mt-3 border-t border-ink/10 pt-3">
                <p className="text-[10px] uppercase tracking-widest text-moss/70">Facturación por caja · {issued.length} emitidas · {pendingInv.length} pendientes en R-Count</p>
                <ul className="mt-2 space-y-1 text-xs">
                  {sent.map((b) => {
                    const ok = b.invoice?.status === "issued" && b.invoice?.number;
                    return (
                      <li key={b.id} className="flex items-center justify-between gap-2">
                        <span className="text-ink">{unit(b)} {b.box_number} · {fmt(val(boxOrder(b)))}</span>
                        {order.b2b_mode === "consignment" ? <span className="text-moss/70">Consignación · sin factura</span>
                          : ok ? (b.invoice.pdf_url ? <a href={b.invoice.pdf_url} target="_blank" rel="noopener noreferrer" className="text-moss underline">Emitida · {b.invoice.number}</a> : <span className="text-moss">Emitida · {b.invoice.number}</span>)
                          : <span className="text-destructive">{b.invoice?.status === "error" ? "Error · reintentar abajo" : "Pendiente por emitir"}</span>}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        );
      })()}

      {creating && (
        <div ref={editorRef} className="mt-4 scroll-mt-24 rounded-xl border border-ink/10 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-sm text-ink">{editingBox ? `Editando ${unit(editingBox).toLowerCase()} ${editingBox.box_number}` : `${pkgType === "paquete" ? "Paquete" : "Caja"} ${(boxes?.length ?? 0) + 1}`}</p>
              <div className="flex rounded-full border border-ink/15 p-0.5 text-[11px]" role="group" aria-label="Tipo de empaque">
                {(["caja", "paquete"] as const).map((t) => (
                  <button key={t} type="button" aria-pressed={pkgType === t} onClick={() => setPkgType(t)} className={"rounded-full px-3 py-1 " + (pkgType === t ? "bg-ink text-ivory" : "text-moss")}>{t === "caja" ? "Caja" : "Paquete"}</button>
                ))}
              </div>
            </div>
            <button className="text-xs underline text-moss" onClick={() => setDraft(Object.fromEntries(pendingItems.map((i) => [i.id, pendingById.get(i.id) ?? 0])))}>Agregar todo lo pendiente</button>
          </div>
          {editingBox && <p className="mt-3 text-xs text-moss">Bodega de esta {unit(editingBox).toLowerCase()}: <span className="text-ink">{locName(activeLoc ?? "")}</span></p>}
          {!editingBox && pendingLocs.length > 1 && (
            <div className="mt-3">
              <p className="text-[11px] text-moss/75">Cada caja sale de una sola bodega. ¿De cuál armas esta?</p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {pendingLocs.map((id) => (
                  <button key={id} type="button" onClick={() => { setBoxLoc(id); setDraft({}); }}
                    className={"rounded-full border px-3 py-1 text-xs " + (activeLoc === id ? "bg-ink text-ivory border-ink" : "border-ink/15")}>
                    {locName(id)} · {allPending.filter((i) => locOf(i) === id).reduce((s, i) => s + (pendingById.get(i.id) ?? 0), 0)} u.
                  </button>
                ))}
              </div>
            </div>
          )}
          <ul className="mt-3 max-h-80 overflow-auto divide-y divide-ink/5">
            {pendingItems.map((i) => {
              const max = pendingById.get(i.id) ?? 0;
              const v = draft[i.id] ?? 0;
              const set = (n: number) => setDraft((d) => ({ ...d, [i.id]: Math.max(0, Math.min(max, n)) }));
              return (
                <li key={i.id} className="flex items-center gap-3 py-2">
                  {i.product_variants?.products?.hero_image_url && <img src={i.product_variants.products.hero_image_url} alt="" className="size-9 rounded object-cover" />}
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm text-ink">{label(i)}</p>
                    <p className="text-[11px] text-moss/60">{max} pendientes</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => set(v - 1)} className="size-7 rounded-full border border-ink/15">−</button>
                    <input aria-label={`Unidades de ${label(i)}`} type="number" value={v} onChange={(e) => set(Number(e.target.value) || 0)} className="w-12 rounded border border-ink/15 px-1 py-1 text-center text-sm" />
                    <button type="button" onClick={() => set(v + 1)} className="size-7 rounded-full border border-ink/15">+</button>
                    <button type="button" onClick={() => set(max)} className="ml-1 text-[11px] underline text-moss">Todo</button>
                  </div>
                </li>
              );
            })}
          </ul>
          {otherLocationItems.length > 0 && (
            <div className="mt-3 border-t border-ink/10 pt-3">
              <p className="text-xs text-moss">Prendas pendientes en otra bodega</p>
              <ul className="mt-2 divide-y divide-ink/5">
                {otherLocationItems.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                    <div className="min-w-0"><p className="text-ink">{label(i)}</p><p className="text-moss">{locName(locOf(i))} · {pendingById.get(i.id) ?? 0} pendientes</p></div>
                    <Button type="button" variant="link" size="sm" onClick={() => window.dispatchEvent(new Event("b2b-adjust-open"))}>Cambiar bodega en pedido</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-3 grid grid-cols-4 gap-2">
            {([["weight_kg", "Peso kg"], ["length_cm", "Largo cm"], ["width_cm", "Ancho cm"], ["height_cm", "Alto cm"]] as const).map(([k, l]) => (
              <label key={k} className="text-[10px] uppercase tracking-widest text-moss/70">{l}
                <input type="number" value={meta[k]} onChange={(e) => setMeta((m) => ({ ...m, [k]: e.target.value }))} className="mt-1 w-full rounded-lg border border-ink/10 px-2 py-1.5 text-sm" />
              </label>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            <span className="mr-auto text-xs text-moss">{Object.values(draft).reduce((s, n) => s + n, 0)} unidades {pkgType === "paquete" ? "en el paquete" : "en la caja"}</span>
            <button onClick={() => { setCreating(false); setEditingBox(null); setDraft({}); }} className="rounded-full border border-ink/15 px-4 py-2 text-xs">Cancelar</button>
            <button disabled={busy === "create"} onClick={createBox} className="rounded-full bg-ink px-4 py-2 text-xs uppercase tracking-widest text-ivory disabled:opacity-50">{editingBox ? "Guardar cambios" : pkgType === "paquete" ? "Armar paquete" : "Armar caja"}</button>
          </div>
        </div>
      )}

      <ul className="mt-4 space-y-3">
        {loadingBoxes && <li className="text-sm text-moss/60">Cargando cajas…</li>}
        {boxesError && <li role="alert" className="text-sm text-destructive">No se pudieron consultar las cajas. <Button variant="link" size="sm" onClick={refresh}>Reintentar</Button></li>}
        {!loadingBoxes && !boxesError && (boxes ?? []).length === 0 && !creating && <li className="text-sm text-moss/60">Aún no hay cajas. Arma una a medida que lleguen las referencias.</li>}
        {(boxes ?? []).map((b) => {
          const units = (b.b2b_box_items ?? []).reduce((s: number, i: any) => s + i.qty, 0);
          const origins = [...new Set((b.b2b_box_items ?? []).map((i: any) => locName(i.location_id)).filter(Boolean))].join(", ");
          const shipped = b.status !== "packed";
          const guideDone = !!b.tracking;
          const invoiceDone = !!b.invoice?.external_id;
          const collapsed = collapsedBoxes.has(b.id);
          const boxItems = (b.b2b_box_items ?? []).map((bi: any) => {
            const item = items.find((candidate) => candidate.id === bi.order_item_id);
            return item ? { ...item, boxQty: Number(bi.qty), boxItemId: bi.id, boxLocId: bi.location_id as string | null } : null;
          }).filter(Boolean) as Array<Item & { boxQty: number; boxItemId: string; boxLocId: string | null }>;
          const sizes = [...new Set(boxItems.map((item) => displaySize(item.product_variants?.size ?? item.variant_label)))].sort(compareSizes);
          const gross = items.reduce((sum, item) => sum + item.qty * Number(item.unit_price_cop), 0);
          const wt = (item: any) => order.currency === "USD" ? usdUnit(item) : Number(item.unit_price_cop);
          const grossW = items.reduce((sum, item) => sum + item.qty * wt(item), 0);
          const bf = 1 - Math.min(90, Math.max(0, Number(b.discount_pct ?? 0))) / 100;
          const rows = [...boxItems.reduce((grouped, item) => {
            const name = item.product_variants?.products?.name ?? item.product_name ?? "Prenda";
            const color = item.product_variants?.color ?? "";
            const key = `${name}::${color}`;
            const row = grouped.get(key) ?? { key, name, color, quantities: new Map<string, number>(), cop: 0, w: 0, customs: 0, customsComplete: true, locs: [] as string[], items: [] as Array<{ boxItemId: string; commercialValue: number }> };
            const size = displaySize(item.product_variants?.size ?? item.variant_label);
            row.quantities.set(size, (row.quantities.get(size) ?? 0) + item.boxQty);
            row.cop += item.boxQty * Number(item.unit_price_cop);
            row.w += item.boxQty * wt(item);
            const itemCommercial = order.currency === "USD"
              ? item.boxQty * wt(item) * bf
              : (gross - Number(order.discount_cop ?? 0)) * (item.boxQty * Number(item.unit_price_cop) / (gross || 1)) * bf;
            const storedCustoms = (b.b2b_box_items ?? []).find((candidate: any) => candidate.id === item.boxItemId)?.customs_invoice_value;
            row.customs += Number(storedCustoms ?? 0);
            row.customsComplete = row.customsComplete && storedCustoms != null;
            row.items.push({ boxItemId: item.boxItemId, commercialValue: itemCommercial });
            const loc = item.boxLocId ? locName(item.boxLocId) : null;
            if (loc && !row.locs.includes(loc)) row.locs.push(loc);
            grouped.set(key, row);
            return grouped;
          }, new Map<string, { key: string; name: string; color: string; quantities: Map<string, number>; cop: number; w: number; customs: number; customsComplete: boolean; locs: string[]; items: Array<{ boxItemId: string; commercialValue: number }> }>()).values()].sort((first, second) => first.name.localeCompare(second.name, "es", { sensitivity: "base", numeric: true }) || first.color.localeCompare(second.color, "es"));
          const boxCommercialTotal = order.currency === "USD"
            ? Number(boxOrder(b).total_usd ?? 0)
            : Number(boxOrder(b).total_cop ?? 0);
          const customsTotal = rows.reduce((sum, row) => sum + row.customs, 0);
          const customsComplete = rows.every((row) => row.customsComplete);
          return (
            <li key={b.id} className="rounded-xl border border-ink/10 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-medium text-ink">{unit(b)} {b.box_number}</p>
                 <div className="ml-auto text-right">
                  <p className="text-sm font-medium text-ink">{formatValue(boxOrder(b))}</p>
                  {(() => {
                    const bo = boxOrder(b);
                    const base = order.currency === "USD" ? Number(bo.total_usd ?? 0) : Number(bo.total_cop ?? 0);
                    if (base <= 0) return null;
                    return <p className="text-[11px] text-moss/70">+4% Bold/Wompi: {formatValue({ total_usd: Number(bo.total_usd ?? 0) * 1.04, total_cop: Number(bo.total_cop ?? 0) * 1.04 })}</p>;
                  })()}
                </div>
                <span className="text-[10px] uppercase tracking-widest rounded-full bg-ink/5 px-2 py-0.5">{shipped ? "Enviada" : "Armada"}</span>
                <span className="text-xs text-moss">{units} u.{origins ? ` · sale de ${origins}` : ""}{b.weight_kg ? ` · ${b.weight_kg} kg` : ""}</span>
                {b.tracking && <span className="text-xs text-moss">· {b.carrier} <span className="font-mono text-ink">{b.tracking}</span></span>}
                <Button variant="ghost" size="icon" onClick={() => toggleBox(b.id)} aria-expanded={!collapsed} aria-label={collapsed ? `Abrir ${unit(b).toLowerCase()} ${b.box_number}` : `Minimizar ${unit(b).toLowerCase()} ${b.box_number}`} title={collapsed ? "Abrir caja" : "Minimizar caja"} className="size-7 rounded-full">
                  {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
                </Button>
              </div>
              {!collapsed && <>
              <div className="mt-3 flex items-center gap-2 text-xs">
                <label htmlFor={`disc-${b.id}`} className="text-moss">Descuento de la caja</label>
                <input id={`disc-${b.id}`} type="number" min="0" max="90" step="1" defaultValue={Number(b.discount_pct ?? 0) || ""} placeholder="0"
                  disabled={invoiceDone || shipped}
                  onBlur={(event) => saveDiscount(b, event.target.value)}
                  className="w-16 rounded-md border border-ink/15 bg-white px-2 py-1 text-right outline-none focus:border-ink/40 disabled:bg-ink/5" />
                <span className="text-moss">%</span>
                <span className="text-moss/60">Se aplica a todos los precios de venta de esta caja.</span>
              </div>
              <div className="mt-3 overflow-x-auto border-y border-ink/10">
                <table className="w-full min-w-max border-collapse text-xs">
                  <thead>
                    <tr className="bg-ink/[0.03] text-[10px] uppercase tracking-wider text-moss/70">
                      <th className="sticky left-0 z-10 min-w-52 bg-ivory px-3 py-2 text-left font-medium">Producto</th>
                      {sizes.map((size) => <th key={size} className="min-w-12 border-l border-ink/10 px-2 py-2 text-center font-medium">{size}</th>)}
                      <th className="min-w-14 border-l border-ink/10 px-2 py-2 text-center font-medium">Total</th>
                      <th className="min-w-28 border-l border-ink/10 px-3 py-2 text-right font-medium">Valor</th>
                      <th className="min-w-36 border-l border-ink/10 px-3 py-2 text-right font-medium">Valor factura aduanas</th>
                      <th className="min-w-36 border-l border-ink/10 px-3 py-2 text-right font-medium">Diferencia de servicios</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => {
                      const rowUnits = [...row.quantities.values()].reduce((sum, qty) => sum + qty, 0);
                      const proportion = gross > 0 ? row.cop / gross : 0;
                      const commercialValue = order.currency === "USD" ? row.w * bf : (gross - Number(order.discount_cop ?? 0)) * proportion * bf;
                      const stateKey = `${b.id}:${row.key}`;
                      const shownCustoms = customsDraft[stateKey] ?? (row.customsComplete ? String(row.customs) : "");
                      const numericCustoms = shownCustoms === "" ? 0 : Number(shownCustoms);
                      return (
                        <tr key={row.key} className="border-t border-ink/10 text-ink">
                          <td className="sticky left-0 z-10 bg-white px-3 py-2">
                            <span className="font-medium">{row.name}</span>{row.color && <span className="ml-1 text-moss/65">· {row.color}</span>}
                            {row.locs.length > 0 && <p className="text-[11px] text-moss/60">Reservado en: {row.locs.join(" · ")}</p>}
                          </td>
                          {sizes.map((size) => <td key={size} className="border-l border-ink/10 px-2 py-2 text-center">{row.quantities.get(size) || ""}</td>)}
                          <td className="border-l border-ink/10 px-2 py-2 text-center font-medium">{rowUnits}</td>
                          <td className="border-l border-ink/10 px-3 py-2 text-right font-medium">{formatValue({ total_usd: row.w * bf, total_cop: (gross - Number(order.discount_cop ?? 0)) * proportion * bf })}</td>
                          <td className="border-l border-ink/10 px-2 py-1.5 text-right">
                            <input type="number" min="0" max={commercialValue} step={order.currency === "USD" ? "0.01" : "1"} value={shownCustoms}
                              disabled={invoiceDone}
                              onChange={(event) => setCustomsDraft((current) => ({ ...current, [stateKey]: event.target.value }))}
                              onBlur={() => saveCustomsRow(b, row, commercialValue)}
                              placeholder={order.currency === "USD" ? "US$0.00" : "COP 0"}
                              aria-label={`Valor factura aduanas de ${row.name}`}
                              className="w-32 rounded-md border border-ink/15 bg-white px-2 py-1 text-right text-xs outline-none focus:border-ink/40 disabled:bg-ink/5" />
                          </td>
                          <td className="border-l border-ink/10 px-3 py-2 text-right font-medium">{shownCustoms === "" ? "—" : formatValue({ total_usd: order.currency === "USD" ? Math.max(0, commercialValue - numericCustoms) : 0, total_cop: order.currency === "USD" ? 0 : Math.max(0, commercialValue - numericCustoms) })}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-ink/25 bg-ink/[0.03] text-ink">
                      <td className="sticky left-0 z-10 bg-ink/[0.03] px-3 py-2 font-medium">Total caja</td>
                      {sizes.map((size) => (
                        <td key={size} className="border-l border-ink/10 px-2 py-2 text-center font-medium">{[...boxItems].reduce((sum, item) => sum + (displaySize(item.product_variants?.size ?? item.variant_label) === size ? item.boxQty : 0), 0) || ""}</td>
                      ))}
                      <td className="border-l border-ink/10 px-2 py-2 text-center font-medium">{[...boxItems].reduce((sum, item) => sum + item.boxQty, 0)}</td>
                      <td className="border-l border-ink/10 px-3 py-2 text-right font-medium">{formatValue({ total_usd: rows.reduce((sum, row) => sum + row.w, 0) * bf, total_cop: (gross - Number(order.discount_cop ?? 0)) * (gross > 0 ? rows.reduce((sum, row) => sum + row.cop, 0) / gross : 0) * bf })}</td>
                      <td className="border-l border-ink/10 px-3 py-2 text-right font-medium">{customsComplete ? formatValue({ total_usd: order.currency === "USD" ? customsTotal : 0, total_cop: order.currency === "USD" ? 0 : customsTotal }) : "Pendiente"}</td>
                      <td className="border-l border-ink/10 px-3 py-2 text-right font-medium">{customsComplete ? formatValue({ total_usd: order.currency === "USD" ? boxCommercialTotal - customsTotal : 0, total_cop: order.currency === "USD" ? 0 : boxCommercialTotal - customsTotal }) : "—"}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs" aria-label={`Comprobaciones de ${unit(b).toLowerCase()} ${b.box_number}`}>
                <span className="inline-flex items-center gap-1.5 text-moss"><span className="grid size-4 place-items-center rounded border border-ink/20">{guideDone && <Check className="size-3" />}</span>{guideDone ? "Guía generada" : "Guía pendiente"}</span>
                {order.b2b_mode !== "consignment" && <span className="inline-flex items-center gap-1.5 text-moss"><span className="grid size-4 place-items-center rounded border border-ink/20">{invoiceDone && <Check className="size-3" />}</span>{invoiceDone ? "Enviada a facturar a R-Count" : "Pendiente de enviar a R-Count"}</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => setPackingFor(boxOrder(b))} className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 text-xs"><Printer className="size-3.5" /> Lista de empaque</button>
                {b.tracking && <button onClick={async () => {
                  if (b.label_url) { await openStampedLabel(stampFn, { orderId: order.id, boxId: b.id, url: b.label_url }); return; }
                  try {
                    const r = await refreshBoxLabelFn({ data: { boxId: b.id } });
                    if (r.label) { await openStampedLabel(stampFn, { orderId: order.id, boxId: b.id, url: r.label }); qc.invalidateQueries(); return; }
                  } catch { /* sin Skydropx: hoja propia */ }
                  toast.info("No se encontró la etiqueta en Skydropx; se imprime la hoja de guía.");
                  printB2BBoxGuide(order, b);
                }} className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 text-xs hover:border-ink"><Printer className="size-3.5" /> Imprimir guía</button>}
                {!shipped && <Button variant="outline" size="sm" onClick={() => setGuideFor(guideFor === b.id ? null : b.id)} className="rounded-full"><Truck className="size-3.5" /> {b.tracking ? "Cambiar guía" : "Generar guía"}</Button>}
                {b.tracking && <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/5 px-3 py-1.5 text-xs">{b.carrier} · {b.tracking}</span>}
                {b.tracking && <button disabled={busy === "g" + b.id} onClick={() => clearGuide(b)} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-clay disabled:opacity-50"><Trash2 className="size-3.5" /> Quitar guía</button>}
                {order.b2b_mode !== "consignment" && (
                  b.invoice?.status === "issued"
                    ? (b.invoice.pdf_url
                      ? <a href={b.invoice.pdf_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 text-xs"><FileText className="size-3.5" /> Factura {b.invoice.number}</a>
                      : <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/5 px-3 py-1.5 text-xs"><FileText className="size-3.5" /> Factura {b.invoice.number}</span>)
                    : <>
                      {!invoiceDone && <select value={billingModes[b.id] ?? b.billing_value_mode ?? "total"} onChange={(event) => setBillingModes((current) => ({ ...current, [b.id]: event.target.value as BillingValueMode }))} className="rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs outline-none" aria-label={`Valor a facturar de ${unit(b).toLowerCase()} ${b.box_number}`}>
                        <option value="total">Facturar valor total</option>
                        <option value="customs">Facturar valor aduanas</option>
                      </select>}
                      <Button variant="outline" size="sm" disabled={busy === "inv" + b.id} onClick={() => retryInvoice(b, customsTotal, boxCommercialTotal, customsComplete)} className="rounded-full" title={b.invoice?.error ?? ""}>
                        <FileText className="size-3.5" /> {busy === "inv" + b.id ? "Consultando R-Count…" : invoiceDone ? "Consultar factura en R-Count" : "Enviar a facturar a R-Count"}
                      </Button>
                    </>
                )}
                {b.invoice?.error && <p role="alert" className="w-full text-xs text-destructive">{b.invoice.error}</p>}
                {!shipped && !b.tracking && canEdit && <button onClick={() => startEdit(b)} className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 text-xs"><Pencil className="size-3.5" /> Editar</button>}
                {!shipped && <button onClick={() => remove(b)} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-clay"><Trash2 className="size-3.5" /> Borrar</button>}
              </div>

              {guideFor === b.id && !shipped && (
                <div className="mt-3">
                  {intl ? (
                    <InternationalLabelCard order={{ ...order, order_items: boxOrder(b).order_items }} ship={ship}
                      box={{ id: b.id, number: b.box_number, carrier: b.carrier, tracking: b.tracking, weight_kg: b.weight_kg, dims: b.length_cm ? `${b.length_cm}x${b.width_cm}x${b.height_cm}` : null }} />
                  ) : (
                    <SkydropxLabelCard key={b.id} orderId={order.id} boxId={b.id} title={`Guía nacional · ${unit(b)} ${b.box_number}`}
                      carrier={null} tracking={null} labelUrl={null} shipmentId={null}
                      onCreated={() => { setGuideFor(null); refresh(); }} />
                  )}
                </div>
              )}

              {shipped && !b.tracking && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink/5 pt-3">
                  <input placeholder="Transportadora" value={manual[b.id]?.carrier ?? ""} onChange={(e) => setManual((m) => ({ ...m, [b.id]: { carrier: e.target.value, tracking: m[b.id]?.tracking ?? "" } }))} className="w-36 rounded-lg border border-ink/10 px-2 py-1.5 text-xs" />
                  <input placeholder="N.º de guía" value={manual[b.id]?.tracking ?? ""} onChange={(e) => setManual((m) => ({ ...m, [b.id]: { tracking: e.target.value, carrier: m[b.id]?.carrier ?? "" } }))} className="w-40 rounded-lg border border-ink/10 px-2 py-1.5 text-xs" />
                  <button disabled={busy === "g" + b.id} onClick={() => saveGuide(b)} className="rounded-full border border-ink/15 px-3 py-1.5 text-xs disabled:opacity-50">Guardar guía manual</button>
                </div>
              )}
              {!shipped && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-ink/5 pt-3">
                  {!b.tracking && (
                    <>
                      <input placeholder="Transportadora" value={manual[b.id]?.carrier ?? ""} onChange={(e) => setManual((m) => ({ ...m, [b.id]: { carrier: e.target.value, tracking: m[b.id]?.tracking ?? "" } }))} className="w-36 rounded-lg border border-ink/10 px-2 py-1.5 text-xs" />
                      <input placeholder="N.º de guía" value={manual[b.id]?.tracking ?? ""} onChange={(e) => setManual((m) => ({ ...m, [b.id]: { tracking: e.target.value, carrier: m[b.id]?.carrier ?? "" } }))} className="w-40 rounded-lg border border-ink/10 px-2 py-1.5 text-xs" />
                      <button disabled={busy === "g" + b.id} onClick={() => saveGuide(b)} className="rounded-full border border-ink/15 px-3 py-1.5 text-xs disabled:opacity-50">Guardar guía manual</button>
                    </>
                  )}
                  <button disabled={busy === b.id || !["preparing", "paid"].includes(order.status)} onClick={() => dispatch(b)}
                    title={!["preparing", "paid"].includes(order.status) ? "Primero confirma el pedido o el pago" : ""}
                    className="ml-auto rounded-full bg-ink px-4 py-2 text-xs uppercase tracking-widest text-ivory disabled:opacity-40">
                    Despachar caja
                  </button>
                </div>
              )}
              </>}
            </li>
          );
        })}
      </ul>

      {packingFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button aria-label="Cerrar" onClick={() => setPackingFor(null)} className="absolute inset-0 bg-ink/40" />
          <div role="dialog" aria-modal="true" aria-label="Imprimir lista de empaque"
            className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="font-nm text-lg">Lista de empaque</h3>
            <p className="mt-1 text-sm text-moss/70">¿Cómo quieres que salga el documento?</p>
            <label className="mt-4 flex items-center justify-between gap-3 text-sm text-ink">
              Incluir fotos
              <input type="checkbox" checked={packingPhotos} className="size-4 accent-ink"
                onChange={(event) => setPackingPhotos(event.target.checked)} />
            </label>
            <div className="mt-5 grid gap-2">
              <Button onClick={() => { printB2BPackingList(packingFor, true, packingPhotos); setPackingFor(null); }}>
                Con precios
              </Button>
              <Button variant="outline" onClick={() => { printB2BPackingList(packingFor, false, packingPhotos); setPackingFor(null); }}>
                Solo cantidades
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
