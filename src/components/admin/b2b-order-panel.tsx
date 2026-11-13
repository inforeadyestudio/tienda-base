import { formatUSD } from "@/lib/format";
import { useOrderWarehouses } from "@/components/admin/order-warehouse-step";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ImageIcon, Minus, PackageCheck, Plus, Search, Truck, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { GoalProgress, OrderHistory, OrderMetaEditor } from "@/components/b2b/order-extras";
import { Button } from "@/components/ui/button";
import { compareSizes, displaySize } from "@/lib/size-order";

/** Panel de pedidos B2B: ajuste real de cantidades, despacho y documentos. */
export function B2BOrderPanel({ order, companyName, documentId }: { order: any; companyName?: string | null; documentId?: string | null }) {
  const qc = useQueryClient();
  const items = [...(order.order_items ?? [])].sort((a, b) =>
    String(a.product_name ?? "").localeCompare(String(b.product_name ?? ""), "es", { sensitivity: "base", numeric: true }) ||
    String(a.product_variants?.color ?? "").localeCompare(String(b.product_variants?.color ?? ""), "es") ||
    compareSizes(a.product_variants?.size ?? a.variant_label, b.product_variants?.size ?? b.variant_label)
  );
  const preliminary = order.status === "draft";
  const dispatchable = order.status === "preparing";
  const { data: wh } = useOrderWarehouses(order.id);
  const readyToDispatch = dispatchable && (wh?.done ?? true) && !!order.stock_confirmed_at && (order.payment_status === "paid" || !!order.paid_at || String(order.b2b_payment_method ?? "").startsWith("credito"));
  const [edit, setEdit] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [hsCodes, setHsCodes] = useState<Record<string, string>>({});
  const [editingHs, setEditingHs] = useState(false);
  const [itemsView, setItemsView] = useState<"list" | "table">("table");
  const [busy, setBusy] = useState(false);
  const { data: packedByItem } = useQuery({
    queryKey: ["b2b-boxes", order.id, "packed"],
    queryFn: async () => {
      const { data } = await (supabase as any).from("b2b_boxes").select("status, b2b_box_items(order_item_id, qty)").eq("order_id", order.id);
      const m = new Map<string, number>();
      for (const b of data ?? []) for (const bi of b.b2b_box_items ?? []) m.set(bi.order_item_id, (m.get(bi.order_item_id) ?? 0) + Number(bi.qty ?? 0));
      return m;
    },
  });
  const packedOf = (id: string) => packedByItem?.get(id) ?? 0;
  const consignment = order.b2b_mode === "consignment";
  const hasRestock = items.some((item) => item.b2b_source === "restock");
  const hasPreventa = items.some((item) => item.b2b_source === "preventa");
  const sourceLabel = hasRestock && hasPreventa ? "Mixto" : hasRestock ? "Restock" : hasPreventa ? "Preventa" : null;
  const [payOpen, setPayOpen] = useState(false);
  const [proof, setProof] = useState<File | null>(null);
  const [payMethod, setPayMethod] = useState("Transferencia");
  const doc = { ...order, company_name: companyName ?? null, customer_document_id: documentId ?? null };

  useEffect(() => {
    setQty(Object.fromEntries(items.map((i) => [i.id, i.qty])));
    if (!editingHs) setHsCodes(Object.fromEntries(items.map((i) => [i.id, i.hs_code ?? i.product_variants?.tariff_code ?? ""])));
  }, [order]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const open = () => { setEdit(true); setTimeout(() => document.getElementById("b2b-adjust")?.scrollIntoView({ behavior: "smooth", block: "center" }), 50); };
    window.addEventListener("b2b-adjust-open", open);
    return () => window.removeEventListener("b2b-adjust-open", open);
  }, []);

  useEffect(() => {
    const openPayment = () => setPayOpen(true);
    const confirmQuantities = () => { void confirmOrder(); };
    window.addEventListener("b2b-confirm-payment", openPayment);
    window.addEventListener("b2b-confirm-quantities", confirmQuantities);
    return () => {
      window.removeEventListener("b2b-confirm-payment", openPayment);
      window.removeEventListener("b2b-confirm-quantities", confirmQuantities);
    };
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin", "order", order.id] });
    qc.invalidateQueries({ queryKey: ["admin", "orders-list"] });
    qc.invalidateQueries({ queryKey: ["admin-b2b-orders"] });
    qc.invalidateQueries({ queryKey: ["b2b-committed"] });
    qc.invalidateQueries({ queryKey: ["b2b-matrix"] });
    qc.invalidateQueries({ queryKey: ["b2b-boxes", order.id] });
    qc.invalidateQueries({ queryKey: ["b2b-flow", order.id] });
    qc.invalidateQueries({ queryKey: ["b2b-adjust-sources", order.id] });
  };

  const save = async () => {
    const changes = items.filter((i) => (qty[i.id] ?? i.qty) !== i.qty).map((i) => ({ item_id: i.id, qty: qty[i.id] ?? 0 }));
    if (!changes.length) { setEdit(false); return; }
    const blocked = changes.map((c) => ({ c, it: items.find((i) => i.id === c.item_id)! })).find(({ c, it }) => c.qty < packedOf(it.id));
    if (blocked) {
      return toast.error(`${blocked.it.product_name} ${blocked.it.variant_label ?? ""} ya tiene ${packedOf(blocked.it.id)} u. empacadas en una caja. Para sacarlas solo de la caja usa «Editar» en la caja; aquí se quitan del pedido.`);
    }
    setBusy(true);
    for (const c of changes) {
      const { error } = await (supabase.rpc as any)("set_b2b_item_qty", { _order_id: order.id, _item_id: c.item_id, _qty: c.qty });
      if (error) { setBusy(false); toast.error(error.message); return; }
    }
    setBusy(false);
    toast.success("Cantidades reales actualizadas");
    setEdit(false);
    refresh();
  };

  const saveHs = async () => {
    const changes = items.filter((i) => (hsCodes[i.id] ?? "").trim() !== (i.hs_code ?? i.product_variants?.tariff_code ?? "").trim());
    setBusy(true);
    for (const item of changes) {
      const { error } = await supabase.from("order_items").update({ hs_code: (hsCodes[item.id] ?? "").trim() }).eq("id", item.id).eq("order_id", order.id);
      if (error) { setBusy(false); toast.error(error.message); return; }
    }
    setBusy(false);
    setEditingHs(false);
    toast.success("Códigos HS guardados en el pedido");
    refresh();
  };

  const cur: "USD" | "COP" = order.currency === "USD" ? "USD" : "COP";
  const orderTotal = cur === "USD" ? Number(order.total_usd ?? 0) : Number(order.total_cop ?? 0);
  const priceEditable = ["draft", "reserved", "paid", "preparing"].includes(order.status);
  const editRefPrice = async (name: string) => {
    const line = items.find((i) => i.product_name === name);
    if (!line) return;
    const isUsd = cur === "USD";
    const curUsd = Number(line.unit_price_usd ?? 0) || Number(line.unit_price_cop ?? 0) * usdPerCop;
    const raw = window.prompt(`Nuevo precio de venta unitario para «${name}» (${isUsd ? "US$" : "$ COP"})`, isUsd ? curUsd.toFixed(2) : String(line.unit_price_cop ?? ""));
    if (raw == null) return;
    const val = Number(raw.replace(isUsd ? /[^0-9.]/g : /[^0-9]/g, ""));
    if (!(val > 0)) return toast.error("Precio inválido");
    const cop = isUsd ? Math.round(usdPerCop > 0 ? val / usdPerCop : val * 4000) : Math.round(val);
    const { error } = await (supabase.rpc as any)("set_b2b_reference_price", { _order_id: order.id, _product_name: name, _price_cop: cop, _price_usd: isUsd ? val : null });
    if (error) return toast.error(error.message);
    toast.success("Precio actualizado");
    refresh();
  };
  const usdPerCop = Number(order.total_cop ?? 0) > 0 ? Number(order.total_usd ?? 0) / Number(order.total_cop) : 0;
  const money = (cop: number, usd?: number) => cur === "USD"
    ? formatUSD(usd && usd > 0 ? usd : cop * usdPerCop)
    : `$ ${Math.round(cop).toLocaleString("es-CO")}`;

  const confirmOrder = async () => {
    if (!items.length) return toast.error("Agrega prendas antes de confirmar el pedido");
    if (!confirm("¿Confirmar las cantidades disponibles de este pedido?")) return;
    setBusy(true);
    const { error } = await (supabase.rpc as any)("confirm_b2b_quantities", { _order_id: order.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Cantidades confirmadas");
    refresh();
  };
  const confirmPayment = async () => {
    if (!proof) return toast.error("Sube la foto de la transferencia");
    setBusy(true);
    const ext = (proof.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${order.number}/pago-${Date.now()}.${ext}`;
    const { error: ue } = await supabase.storage.from("payment-receipts").upload(path, proof, { contentType: proof.type || undefined });
    if (ue) { setBusy(false); return toast.error(ue.message); }
    const { data: signed, error: se } = await supabase.storage.from("payment-receipts").createSignedUrl(path, 60 * 60 * 24 * 365);
    if (se || !signed) { setBusy(false); return toast.error(se?.message ?? "No se pudo guardar el comprobante"); }
    const { error } = await (supabase.rpc as any)("confirm_restock_payment", { _order_id: order.id, _proof_url: signed.signedUrl, _method: payMethod });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Pago confirmado");
    setPayOpen(false);
    setProof(null);
    refresh();
  };
  const cancelRestock = async () => {
    if (!confirm("¿Cancelar este pedido Restock? Las unidades vuelven a estar disponibles en Ecommerce.")) return;
    setBusy(true);
    const { error } = await (supabase.rpc as any)("cancel_restock_order", { _order_id: order.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Pedido cancelado; unidades devueltas a Ecommerce");
    refresh();
  };
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<any[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [selectedSource, setSelectedSource] = useState<"restock" | "preventa">("restock");
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const { data: locations = [] } = useQuery({
    queryKey: ["b2b-adjust-locations"],
    enabled: edit,
    queryFn: async () => {
      let query = supabase.from("locations").select("id, name, code, kind, allow_preventa").eq("active", true).order("priority", { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: itemSources = [] } = useQuery({
    queryKey: ["b2b-adjust-sources", order.id],
    enabled: edit,
    queryFn: async () => {
      const [{ data: reservations, error: reservationError }, { data: allocations, error: allocationError }] = await Promise.all([
        supabase.from("reservations").select("order_item_id, variant_id, location_id, locations(name)").eq("order_id", order.id).eq("status", "active"),
        supabase.from("preventa_allocations").select("order_item_id, variant_id, location_id, locations(name)").eq("order_id", order.id).in("status", ["pending", "covered"]),
      ]);
      if (reservationError || allocationError) throw reservationError ?? allocationError;
      return [...(reservations ?? []).map((row: any) => ({ ...row, b2b_source: "restock" })), ...(allocations ?? []).map((row: any) => ({ ...row, b2b_source: "preventa" }))];
    },
  });
  const { data: quotaUsage = [] } = useQuery({
    queryKey: ["b2b-adjust-quota-usage", selectedLocationId],
    enabled: edit && selectedSource === "preventa" && !!selectedLocationId,
    queryFn: async () => {
      const { data, error } = await supabase.from("preventa_allocations")
        .select("variant_id, qty").eq("location_id", selectedLocationId).in("status", ["pending", "covered"]);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!edit || selectedLocationId || locations.length === 0) return;
    const validLocations = selectedSource === "preventa" ? locations.filter((location: any) => location.allow_preventa) : locations;
    const currentLocation = itemSources.find((source: any) => source.b2b_source === selectedSource && source.location_id)?.location_id;
    setSelectedLocationId(currentLocation ?? validLocations[0]?.id ?? "");
  }, [edit, itemSources, locations, selectedSource, selectedLocationId]);

  useEffect(() => {
    const t = term.trim();
    if (t.length < 2) { setHits([]); return; }
    const h = setTimeout(async () => {
      const [{ data: matchingProducts }, { data: matchingVariants }] = await Promise.all([
        supabase.from("products").select("id").neq("status", "archived").or(`name.ilike.%${t}%,reference_code.ilike.%${t}%`).limit(50),
        supabase.from("product_variants").select("product_id").ilike("sku", `%${t}%`).eq("active", true).limit(50),
      ]);
      const productIds = [...new Set([...(matchingProducts ?? []).map((p: any) => p.id), ...(matchingVariants ?? []).map((v: any) => v.product_id)])];
      if (!productIds.length) { setHits([]); return; }
      const { data, error } = await supabase.from("product_variants")
        .select("id, product_id, sku, size, color, inventory_levels(location_id, on_hand, reserved), preventa_rules(location_id, max_qty, active, starts_at, ends_at), products(name, hero_image_url)")
        .in("product_id", productIds).eq("active", true).order("sku").limit(200);
      if (error) { toast.error(error.message); setHits([]); return; }
      setHits(data ?? []);
    }, 250);
    return () => clearTimeout(h);
  }, [term]);

  const addRef = async (variantId: string, quiet = false) => {
    if (!selectedLocationId) { toast.error(selectedSource === "restock" ? "Selecciona la bodega de origen" : "Selecciona el cupo de preventa"); return false; }
    setBusy(true);
    const { error } = await (supabase.rpc as any)("add_b2b_order_item", {
      _order_id: order.id, _variant_id: variantId, _location_id: selectedLocationId, _qty: 1, _source: selectedSource,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return false; }
    setAddingIds((current) => new Set(current).add(variantId));
    if (!quiet) toast.success(selectedSource === "restock" ? "Referencia reservada en la bodega" : "Referencia agregada al cupo de preventa");
    refresh();
    return true;
  };

  const sourceName = (item: any) => {
    const source = itemSources.find((row: any) => row.order_item_id === item.id || (!row.order_item_id && row.variant_id === item.variant_id));
    return source?.locations?.name ?? locations.find((location: any) => location.id === item.fulfill_location_id)?.name ?? null;
  };
  const itemLocationId = (item: any) => {
    const source = itemSources.find((row: any) => row.order_item_id === item.id);
    return source?.location_id ?? item.fulfill_location_id ?? "";
  };
  const changeItemLocation = async (item: any, source: "restock" | "preventa", locationId: string) => {
    if (!locationId) return;
    setBusy(true);
    const { error } = await (supabase.rpc as any)("set_b2b_item_location", {
      _order_id: order.id, _item_id: item.id, _location_id: locationId, _source: source,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(source === "restock" ? "Bodega actualizada" : "Cupo de preventa actualizado");
    qc.invalidateQueries({ queryKey: ["b2b-adjust-sources", order.id] });
    refresh();
  };
  const availableFor = (variant: any) => {
    if (!selectedLocationId) return 0;
    if (selectedSource === "restock") {
      const level = (variant.inventory_levels ?? []).find((row: any) => row.location_id === selectedLocationId);
      return Math.max(0, Number(level?.on_hand ?? 0) - Number(level?.reserved ?? 0));
    }
    const now = Date.now();
    const rule = (variant.preventa_rules ?? []).find((row: any) => row.location_id === selectedLocationId && row.active !== false
      && (!row.starts_at || new Date(row.starts_at).getTime() <= now) && (!row.ends_at || new Date(row.ends_at).getTime() >= now));
    const used = quotaUsage.filter((row: any) => row.variant_id === variant.id).reduce((sum: number, row: any) => sum + Number(row.qty ?? 0), 0);
    return Math.max(0, Number(rule?.max_qty ?? 0) - used);
  };
  const selectedVariantIds = new Set(items.filter((item) => {
    if (item.b2b_source !== selectedSource) return false;
    const source = itemSources.find((row: any) => row.order_item_id === item.id);
    return (source?.location_id ?? item.fulfill_location_id) === selectedLocationId;
  }).map((item) => item.product_variants?.id).filter(Boolean));
  addingIds.forEach((id) => selectedVariantIds.add(id));
  const groupedHits = Array.from(hits.reduce((groups, variant) => {
    if (selectedVariantIds.has(variant.id)) return groups;
    const product = variant.products;
    const key = variant.product_id;
    const group = groups.get(key) ?? { id: key, name: product?.name ?? "Referencia", image: product?.hero_image_url, variants: [] };
    group.variants.push(variant);
    groups.set(key, group);
    return groups;
  }, new Map<string, any>()).values()) as any[];

  const total = items.reduce((a, i) => a + (qty[i.id] ?? i.qty), 0);

  return (
    <section className="bg-white border border-ink/10 rounded-2xl">
      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 px-5 py-4 border-b border-ink/5 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <PackageCheck className="mt-0.5 size-4 shrink-0 text-moss" />
          <div className="min-w-0">
            <h2 className="truncate text-sm font-medium text-ink">Resumen del pedido</h2>
            <p className="mt-1 text-[10px] uppercase tracking-widest text-clay">Pedido mayorista{consignment ? " · Consignación" : sourceLabel ? ` · ${sourceLabel}` : ""}</p>
            <p className="mt-0.5 text-xs text-moss">
             {preliminary ? "Borrador" : dispatchable ? "Pedido B2B · En proceso" : order.status === "shipped" || order.status === "delivered" ? "Despachado" : order.status}
            </p>
          </div>
        </div>
        <div className="col-span-2 flex min-w-0 flex-wrap justify-start gap-2 sm:col-span-1">
          {["draft", "reserved", "paid", "preparing"].includes(order.status) && !edit && (
            <button disabled={busy} onClick={() => setEdit(true)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white border border-ink/10 text-xs text-moss hover:text-ink">
              Ajustar cantidades
            </button>
          )}
          {["draft", "reserved", "paid", "preparing"].includes(order.status) && !edit && (
            <button disabled={busy} onClick={cancelRestock} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white border border-destructive/30 text-xs text-destructive hover:bg-destructive/5 disabled:opacity-50">
              Cancelar pedido
            </button>
          )}
          {readyToDispatch && !edit && (
            <Link to="/admin/b2b/envios" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-ink text-ivory text-xs">
              <Truck className="size-3.5" /> Generar guía y despachar
            </Link>
          )}
        </div>
      </header>
      {payOpen && !order.paid_at && order.payment_status !== "paid" && (
        <div className="px-5 py-4 border-b border-ink/5 space-y-3 bg-ivory/40">
          <h3 className="text-xs font-medium text-ink">Confirmar pago del pedido B2B</h3>
          <label className="block text-xs text-moss">Foto de la transferencia
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setProof(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-xs" />
          </label>
          <label className="block text-xs text-moss">Medio de pago
            <select value={payMethod} onChange={(e) => setPayMethod(e.target.value)} className="mt-1 block w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink">
              <option>Transferencia</option><option>Consignación bancaria</option><option>Link de pago</option><option>Efectivo</option>
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => setPayOpen(false)}>Cancelar</Button>
            <Button size="sm" disabled={busy || !proof} onClick={confirmPayment}>{busy ? "Guardando…" : "Confirmar pago"}</Button>
          </div>
        </div>
      )}
      {order.payment_proof_url && (
        <div className="px-5 py-3 border-b border-ink/5 text-xs text-moss">
          Pago confirmado{order.b2b_payment_method ? ` · ${order.b2b_payment_method}` : ""} · <a href={order.payment_proof_url} target="_blank" rel="noreferrer" className="underline text-ink">Ver comprobante</a>
        </div>
      )}
      <div className="px-5 py-4 border-b border-ink/5 space-y-3">
        <OrderMetaEditor order={order} onSaved={refresh} />
        {preliminary && <GoalProgress total={orderTotal} currency={cur} />}
        {order.b2b_reward && <p className="text-xs text-moss">Recompensa ganada: <b className="text-ink">{order.b2b_reward}</b></p>}
      </div>
      <div className="px-5 py-4 border-b border-ink/5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 mb-3">
          <p className="text-xs text-moss">{items.length} referencias · {items.reduce((sum, item) => sum + Number(item.qty ?? 0), 0)} unidades</p>
          <div className="flex items-center gap-2">
          {!editingHs && items.length > 0 && <div className="flex gap-1" role="group" aria-label="Vista de productos">{([["table", "Tabla"], ["list", "Lista"]] as const).map(([k, t]) => <button key={k} type="button" aria-pressed={itemsView === k} onClick={() => setItemsView(k)} className={`text-[11px] px-3 py-1 rounded-full border ${itemsView === k ? "border-ink bg-ink text-ivory" : "border-ink/15 bg-white"}`}>{t}</button>)}</div>}
          {!editingHs && order.status === "draft" && (
            <Button variant="outline" size="sm" disabled={busy} onClick={async () => {
              if (!window.confirm("Se recalcularán todos los precios con el descuento mayorista de cada colección. ¿Continuar?")) return;
              setBusy(true);
              const { data, error } = await (supabase.rpc as any)("refresh_b2b_draft_prices", { _order_id: order.id });
              setBusy(false);
              if (error) return toast.error(error.message);
              toast.success(Number(data) > 0 ? `${data} líneas actualizadas con el descuento de su colección` : "No había líneas para actualizar");
              refresh();
            }}>Actualizar precios del catálogo</Button>
          )}
          {!editingHs && <Button variant="outline" size="sm" onClick={() => { setHsCodes(Object.fromEntries(items.map((i) => [i.id, i.hs_code ?? i.product_variants?.tariff_code ?? ""]))); setEditingHs(true); }}>Editar códigos</Button>}
          </div>
        </div>
        {!editingHs && itemsView === "table" && items.length > 0 && (() => {
          const sizeOf = (i: any): string => String( i.product_variants?.size || String(i.variant_label ?? "").split("/").pop()?.trim() || "—");
          const sizes = [...new Set(items.map(sizeOf))].sort(compareSizes);
          const rows = new Map<string, { name: string; img: string | null; cells: Record<string, number>; packed: Record<string, number>; qty: number; packedQty: number; total: number; usd: number; locs: string[] }>();
          for (const i of items) {
            const row = rows.get(i.product_name) ?? { name: i.product_name, img: i.product_variants?.products?.hero_image_url ?? null, cells: {} as Record<string, number>, packed: {} as Record<string, number>, qty: 0, packedQty: 0, total: 0, usd: 0, locs: [] as string[] };
            const s = sizeOf(i); const q = Number(i.qty ?? 0); const p = Math.min(q, Math.max(packedOf(i.id), Number(i.shipped_qty ?? 0)));
            row.cells[s] = (row.cells[s] ?? 0) + q; row.packed[s] = (row.packed[s] ?? 0) + p; row.packedQty += p; row.qty += q; row.total += Number(i.unit_price_cop ?? 0) * q; row.usd += (Number(i.unit_price_usd ?? 0) || Number(i.unit_price_cop ?? 0) * usdPerCop) * q;
            const loc = i.fulfill_location?.name ?? (i.b2b_source === "preventa" ? "Cupo preventa" : null);
            if (loc && !row.locs.includes(loc)) row.locs.push(loc);
            rows.set(i.product_name, row);
          }
          return (
            <div className="overflow-x-auto rounded-xl border border-ink/10">
              <table className="w-full text-xs">
                <thead className="bg-ink/[0.03] text-[10px] uppercase tracking-widest text-moss">
                  <tr><th className="px-3 py-2 text-left font-normal">Producto</th>{sizes.map((s) => <th key={s} className="px-2 py-2 text-center font-normal">{displaySize(s)}</th>)}<th className="px-3 py-2 text-right font-normal">Und</th><th className="px-3 py-2 text-right font-normal">Total</th></tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {[...rows.values()].map((row) => (
                    <tr key={row.name}>
                      <td className="px-3 py-2 min-w-[180px]"><div className="flex items-center gap-2">{row.img ? <img src={row.img} alt="" className="size-8 rounded-md object-cover" /> : <div className="size-8 rounded-md bg-ink/5" />}<div className="min-w-0"><span className="text-sm text-ink">{row.name}</span>{row.locs.length > 0 && <p className="truncate text-[11px] text-moss/60">Reservado en: {row.locs.join(" · ")}</p>}</div></div></td>
                      {sizes.map((s) => <td key={s} className="px-2 py-2 text-center">{row.cells[s] ? <span className={(row.packed[s] ?? 0) >= row.cells[s] ? "text-ink/30" : "text-ink"} title={row.packed[s] ? `${row.packed[s]} empacadas` : undefined}>{row.cells[s]}</span> : null}</td>)}
                      <td className={`px-3 py-2 text-right ${row.packedQty >= row.qty ? "text-ink/30" : "text-ink"}`}>{row.qty}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-ink">{money(row.total, row.usd)}{row.qty > 0 && <p className="text-[11px] text-moss/70">{money(row.total / row.qty, row.usd / row.qty)} c/u{priceEditable && <button type="button" onClick={() => void editRefPrice(row.name)} className="ml-2 underline hover:text-ink">Editar precio</button>}</p>}</td>
                    </tr>
                  ))}
                </tbody>
                {(() => { const all = [...rows.values()]; return (
                  <tfoot className="border-t border-ink/15 bg-ink/[0.03] font-medium">
                    <tr>
                      <td className="px-3 py-2 text-[10px] uppercase tracking-widest text-moss">Total pedido</td>
                      {sizes.map((s) => { const n = all.reduce((a, r) => a + (r.cells[s] ?? 0), 0); return <td key={s} className="px-2 py-2 text-center text-ink">{n || null}</td>; })}
                      <td className="px-3 py-2 text-right text-ink">{all.reduce((a, r) => a + r.qty, 0)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap text-ink">{money(all.reduce((a, r) => a + r.total, 0), all.reduce((a, r) => a + r.usd, 0))}</td>
                    </tr>
                  </tfoot>
                ); })()}
              </table>
            </div>
          );
        })()}
        <div className={`divide-y divide-ink/5 ${!editingHs && itemsView === "table" && items.length > 0 ? "hidden" : ""}`}>
          {items.map((item) => (
            <div key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 gap-y-2 py-3 text-xs md:grid-cols-[auto_minmax(0,1fr)_auto_auto] md:items-center">
              <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-ink/5">
                {item.product_variants?.products?.hero_image_url
                  ? <img src={item.product_variants.products.hero_image_url} alt="" className="size-full object-cover" />
                  : <ImageIcon className="m-3 size-5 text-moss/40" />}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm text-ink">{item.product_name}</p>
                <p className="truncate text-[11px] text-moss/60">{[item.variant_label, item.product_variants?.sku].filter(Boolean).join(" · ")}</p>
              </div>
              <div className="text-right text-moss md:min-w-28">
                <p>{money(Number(item.unit_price_cop ?? 0), Number(item.unit_price_usd ?? 0) || Number(item.unit_price_cop ?? 0) * usdPerCop)} × {item.qty}</p>
                <p className="text-sm text-ink">{money(Number(item.unit_price_cop ?? 0) * Number(item.qty ?? 0), (Number(item.unit_price_usd ?? 0) || Number(item.unit_price_cop ?? 0) * usdPerCop) * Number(item.qty ?? 0))}</p>
              </div>
              <div className="col-span-2 col-start-2 flex min-w-0 items-center justify-between gap-2 md:col-span-1 md:col-start-auto md:w-36 md:justify-end">
                <span className="text-[10px] uppercase tracking-widest text-moss/60 md:hidden">Código HS</span>
                {editingHs ? <input aria-label={`Código HS de ${item.product_name} ${item.variant_label ?? item.product_variants?.sku ?? ""}`} value={hsCodes[item.id] ?? ""} onChange={(e) => setHsCodes((codes) => ({ ...codes, [item.id]: e.target.value }))} placeholder="Código HS" inputMode="numeric" maxLength={24} className="w-32 rounded border border-ink/15 bg-white px-2 py-1.5 text-ink" /> : <span className="truncate text-moss">{(item.hs_code ?? item.product_variants?.tariff_code) || "Sin código HS"}</span>}
              </div>
            </div>
          ))}
          {!items.length && <p className="py-3 text-xs text-moss">Agrega productos al pedido para asignar sus códigos HS.</p>}
        </div>
        {editingHs && <div className="flex justify-end gap-2 mt-4"><Button variant="outline" size="sm" disabled={busy} onClick={() => setEditingHs(false)}>Cancelar</Button><Button size="sm" disabled={busy} onClick={saveHs}>Guardar</Button></div>}
      </div>
      {edit && (
        <div id="b2b-adjust" className="px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="text-sm font-medium text-ink">Ajustar cantidades y referencias</h3>
              <p className="text-xs text-moss mt-0.5">{items.length} variantes · {total} unidades</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setEdit(false)} aria-label="Cerrar ajuste"><X className="size-4" /></Button>
          </div>
          <div className="divide-y divide-ink/5 border-y border-ink/5">
            {items.map((i) => (
              <div key={i.id} className="flex items-center gap-3 py-3 text-sm">
                <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-ink/5">
                  {i.product_variants?.products?.hero_image_url
                    ? <img src={i.product_variants.products.hero_image_url} alt="" className="size-full object-cover" />
                    : <ImageIcon className="m-3 size-5 text-moss/40" />}
                </div>
                 <div className="min-w-0 flex-1">
                   <p className="truncate text-ink">{i.product_name}</p>
                   <p className="text-xs text-moss">{[i.variant_label, i.product_variants?.sku].filter(Boolean).join(" · ")}</p>
                   <div className="mt-1 flex flex-wrap items-center gap-1.5">
                     <select
                       aria-label={`Origen de ${i.product_name}`}
                       value={i.b2b_source ?? "restock"}
                       disabled={busy}
                       onChange={(e) => {
                         const source = e.target.value as "restock" | "preventa";
                         const first = locations.find((location: any) => source === "restock" || location.allow_preventa);
                         if (first) void changeItemLocation(i, source, first.id);
                       }}
                       className="h-7 rounded-lg border border-ink/15 bg-white px-1.5 text-[10px] text-ink outline-none"
                     >
                       <option value="restock">Restock · Bodega</option>
                       <option value="preventa">Preventa · Cupo</option>
                     </select>
                     <select
                       aria-label={`Bodega de ${i.product_name}`}
                       value={itemLocationId(i)}
                       disabled={busy}
                       onChange={(e) => void changeItemLocation(i, i.b2b_source ?? "restock", e.target.value)}
                       className="h-7 max-w-40 rounded-lg border border-ink/15 bg-white px-1.5 text-[10px] text-ink outline-none"
                     >
                       <option value="">Seleccionar…</option>
                       {locations.filter((location: any) => (i.b2b_source ?? "restock") === "restock" || location.allow_preventa).map((location: any) => (
                         <option key={location.id} value={location.id}>{location.name}</option>
                       ))}
                     </select>
                   </div>
                 </div>
                <div className="flex h-9 shrink-0 items-center rounded-full border border-ink/15 bg-white">
                  <Button variant="ghost" size="icon" className="size-8 rounded-full" onClick={() => setQty((current) => ({ ...current, [i.id]: Math.max(0, (current[i.id] ?? i.qty) - 1) }))} aria-label={`Quitar una unidad de ${i.product_name}`}><Minus className="size-3.5" /></Button>
                  <input type="number" min={0} value={qty[i.id] ?? 0}
                    onChange={(e) => setQty((current) => ({ ...current, [i.id]: Math.max(0, Number(e.target.value) || 0) }))}
                    className="no-spin w-10 bg-transparent text-center text-sm outline-none" />
                  <Button variant="ghost" size="icon" className="size-8 rounded-full" onClick={() => setQty((current) => ({ ...current, [i.id]: (current[i.id] ?? i.qty) + 1 }))} aria-label={`Agregar una unidad de ${i.product_name}`}><Plus className="size-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-[minmax(160px,0.3fr)_minmax(180px,0.35fr)_1fr]">
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-widest text-moss">Origen de las unidades</span>
              <select value={selectedSource} onChange={(event) => { setSelectedSource(event.target.value as "restock" | "preventa"); setSelectedLocationId(""); }} className="h-10 w-full rounded-xl border border-ink/15 bg-white px-3 text-sm text-ink outline-none">
                <option value="restock">Restock · Bodega</option>
                <option value="preventa">Preventa · Cupo</option>
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-widest text-moss">{selectedSource === "restock" ? "Bodega de origen" : "Cupo de preventa"}</span>
              <select value={selectedLocationId} onChange={(event) => setSelectedLocationId(event.target.value)} className="h-10 w-full rounded-xl border border-ink/15 bg-white px-3 text-sm text-ink outline-none">
                <option value="">Seleccionar…</option>
                {locations.filter((location: any) => selectedSource === "restock" || location.allow_preventa).map((location: any) => <option key={location.id} value={location.id}>{location.name}</option>)}
              </select>
            </label>
            <div className="relative self-end">
            <div className="flex items-center gap-2 rounded-full border border-ink/15 px-3 py-1.5">
              <Search className="size-3.5 text-moss" />
              <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Buscar producto, referencia o SKU…"
                className="flex-1 bg-transparent text-sm outline-none" />
            </div>
            </div>
          </div>
          {groupedHits.length > 0 && (
            <div className="mt-3 max-h-[28rem] overflow-y-auto rounded-xl border border-ink/10 divide-y divide-ink/10">
              {groupedHits.map((group) => {
                const availableVariants = group.variants.filter((variant: any) => availableFor(variant) > 0);
                return <div key={group.id} className="p-3">
                  <div className="mb-2 flex items-center gap-3">
                    <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-ink/5">
                      {group.image ? <img src={group.image} alt="" className="size-full object-cover" /> : <ImageIcon className="m-3 size-5 text-moss/40" />}
                    </div>
                    <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{group.name}</p>
                    <Button variant="outline" size="sm" disabled={busy || !selectedLocationId || availableVariants.length === 0}
                      onClick={async () => {
                        let added = 0;
                        for (const variant of availableVariants) if (await addRef(variant.id, true)) added += 1;
                        if (added) toast.success(`${added} variantes agregadas`);
                      }}>Agregar todas ({availableVariants.length})</Button>
                  </div>
                  <div className="ml-0 divide-y divide-ink/5 md:ml-14">
                    {group.variants.map((variant: any) => {
                      const available = availableFor(variant);
                      return <div key={variant.id} className="flex items-center gap-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs text-ink">{[variant.color, variant.size].filter(Boolean).join(" · ") || "Única"}</p>
                           <p className="text-[10px] text-moss">{variant.sku} · {available} {selectedSource === "restock" ? "disponibles" : "de cupo"}</p>
                        </div>
                        <Button variant="ghost" size="icon" disabled={busy || !selectedLocationId || available <= 0} onClick={() => addRef(variant.id)} aria-label={`Agregar ${group.name} ${variant.size ?? ""}`}><Plus className="size-4" /></Button>
                      </div>;
                    })}
                  </div>
                </div>;
              })}
            </div>
          )}
          {term.trim().length >= 2 && hits.length > 0 && groupedHits.length === 0 && <p className="mt-3 text-xs text-moss">Todas las variantes encontradas ya están en el pedido.</p>}
          <div className="flex items-center justify-between mt-4">
            <p className="text-xs text-moss">{total} prendas · en 0 se quita la talla</p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setEdit(false)}>Cancelar</Button>
              <Button size="sm" disabled={busy} onClick={save}>Guardar cantidades</Button>
            </div>
          </div>
        </div>
      )}
      <details className="px-5 py-3">
        <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-moss">Historial de cambios</summary>
        <div className="mt-2"><OrderHistory orderId={order.id} /></div>
      </details>
    </section>
  );
}
