import { useEffect, useMemo, useState } from "react";
import { useDraftState, clearDraft } from "@/hooks/use-draft-state";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Search, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useB2BAccounts } from "@/lib/b2b/admin";
import { formatMoney, useB2BBaseSettings, wholesalePrice } from "@/lib/b2b/portal";
import { createManualB2BOrder } from "@/lib/b2b/admin.functions";
import { compareSizes, displaySize } from "@/lib/size-order";
import { B2BAccountForm } from "@/components/admin/b2b-account-form";
import { Button } from "@/components/ui/button";

type Source = "restock" | "preventa";
type Line = { variantId: string; qty: number; priceCop: number; priceUsd: number; productName: string; variantLabel: string | null; imageUrl: string | null; source: Source; locationId: string; locationName: string };

export function B2BManualOrder({ onClose, onCreated, initialCustomerId, initialOrder }: { onClose: () => void; onCreated?: (customerId: string) => void; initialCustomerId?: string; initialOrder?: { customer_id: string | null; currency: string | null; b2b_mode: string | null; order_items: { variant_id: string | null; qty: number }[] } }) {
  const { data: accounts } = useB2BAccounts();
  // La preventa manual puede incluir cualquier producto publicado, no solo los de colecciones habilitadas para el portal B2B.
  const { data: products } = useQuery({
    queryKey: ["b2b-manual-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, reference_code, product_images(url, position), product_variants(id, product_id, sku, size, color, active, price_cop, price_usd, inventory_levels(location_id, on_hand, reserved), preventa_rules(location_id, max_qty, active))")
        .neq("status", "archived")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: settings } = useB2BBaseSettings();
  const { data: locations = [] } = useQuery({
    queryKey: ["b2b-manual-locations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("locations").select("id, name, allow_preventa").eq("active", true).order("priority", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const create = useServerFn(createManualB2BOrder);
  const qc = useQueryClient();
  const draftKey = initialOrder || initialCustomerId ? null : "draft-b2b-order:";
  const dk = (k: string) => (draftKey ? draftKey + k : null);
   const [customerId, setCustomerId] = useDraftState(dk("customer"), initialOrder?.customer_id ?? initialCustomerId ?? "");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useDraftState<Line[]>(dk("lines"), []);
  const [notes, setNotes] = useDraftState(dk("notes"), "");
   const [mode, setMode] = useDraftState<"direct" | "consignment">(dk("mode"), initialOrder?.b2b_mode === "consignment" ? "consignment" : "direct");
   const [destination, setDestination] = useDraftState<"nacional" | "internacional">(dk("destination"), initialOrder?.currency === "USD" ? "internacional" : "nacional");
  const [saving, setSaving] = useState(false);
  const [createdCustomer, setCreatedCustomer] = useState<{ userId: string; name: string } | null>(null);
  const [linesView, setLinesView] = useState<"list" | "table">("table");
  const currency = destination === "internacional" ? "USD" : "COP";
  const priceOf = (line: Line) => currency === "USD" ? line.priceUsd : line.priceCop;

  const imageOf = (p: any): string | null => {
    const imgs = [...(p.product_images ?? [])].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));
    return imgs[0]?.url ?? null;
  };

  useEffect(() => {
    if (!initialOrder || !products || !settings || locations.length === 0) return;
    const entries = new Map<string, Line>();
    for (const item of initialOrder.order_items) {
      if (!item.variant_id || item.qty <= 0) continue;
      const p = products.find((product) => product.product_variants?.some((variant) => variant.id === item.variant_id));
      const v = p?.product_variants?.find((variant) => variant.id === item.variant_id);
      if (!p || !v || v.active === false) continue;
      const fallbackLocation = locations.find((location: any) => location.allow_preventa) ?? locations[0];
      if (!fallbackLocation) continue;
      const key = `${v.id}:preventa:${fallbackLocation.id}`;
      const existing = entries.get(key);
      entries.set(key, { variantId: v.id, qty: (existing?.qty ?? 0) + item.qty, priceCop: wholesalePrice(v, settings, "COP"), priceUsd: wholesalePrice(v, settings, "USD"), productName: p.name, variantLabel: [v.color, v.size].filter(Boolean).join(" / ") || null, imageUrl: imageOf(p), source: "preventa", locationId: fallbackLocation.id, locationName: fallbackLocation.name });
    }
    setLines([...entries.values()]);
    if (entries.size < initialOrder.order_items.length) toast.info("Revisa las referencias: algunas variantes ya no están disponibles.");
  }, [initialOrder, products, settings, locations]);

  // Orígenes posibles por variante: cada bodega con stock libre (Restock) y cada cupo de preventa activo.
  const originsOf = (v: any) => {
    const out: { key: string; source: Source; locationId: string; name: string; available: number }[] = [];
    for (const l of locations as any[]) {
      const lvl = v.inventory_levels?.find((x: any) => x.location_id === l.id);
      const avail = Math.max(0, Number(lvl?.on_hand ?? 0) - Number(lvl?.reserved ?? 0));
      if (avail > 0) out.push({ key: `restock:${l.id}`, source: "restock", locationId: l.id, name: l.name, available: avail });
    }
    for (const l of locations as any[]) {
      if (!l.allow_preventa) continue;
      const cap = Number(v.preventa_rules?.find((x: any) => x.location_id === l.id && x.active !== false)?.max_qty ?? 0);
      if (cap > 0) out.push({ key: `preventa:${l.id}`, source: "preventa", locationId: l.id, name: l.name, available: cap });
    }
    return out;
  };

  const found = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return [];
    // Cada palabra debe aparecer (en cualquier orden) en nombre, referencia o SKU: «ave ivory» encuentra «Ave T-Shirt Ivory».
    const words = q.split(/\s+/).filter(Boolean);
    return (products ?? []).filter((p: any) => {
      const hay = [p.name, p.reference_code ?? "", ...(p.product_variants ?? []).map((v: any) => v.sku ?? "")].join(" ").toLowerCase();
      return words.every((w) => hay.includes(w));
    }).slice(0, 40);
  }, [search, products]);

  const addVariant = (p: any, v: any, origin: ReturnType<typeof originsOf>[number]) => {
    const qty = 1;
    if (!settings || qty < 1) return;
    const { source, locationId, available } = origin;
    const location = { name: origin.name };
    const alreadySelected = lines.filter((line) => line.variantId === v.id && line.source === source && line.locationId === locationId).reduce((sum, line) => sum + line.qty, 0);
    if (qty + alreadySelected > available) return toast.error(`Solo hay ${available} unidades disponibles en este origen`);
    setLines((ls) => {
      const i = ls.findIndex((l) => l.variantId === v.id && l.source === source && l.locationId === locationId);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + qty } : l));
      return [...ls, {
        variantId: v.id, qty,
        priceCop: wholesalePrice(v, settings, "COP"),
        priceUsd: wholesalePrice(v, settings, "USD"),
        productName: p.name,
        variantLabel: [v.color, v.size].filter(Boolean).join(" / ") || null,
        imageUrl: imageOf(p),
        source,
        locationId,
        locationName: location?.name ?? "Origen",
      }];
    });
  };

  // Agrupa las líneas por referencia para totalizar cada una.
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; imageUrl: string | null; lines: { line: Line; index: number }[] }>();
    lines.forEach((line, index) => {
      const g = map.get(line.productName) ?? { name: line.productName, imageUrl: line.imageUrl, lines: [] };
      g.lines.push({ line, index });
      map.set(line.productName, g);
    });
    return [...map.values()];
  }, [lines]);

  const sizeOfLine = (l: Line) => {
    const v = (products ?? []).flatMap((p: any) => p.product_variants ?? []).find((x: any) => x.id === l.variantId);
    return v?.size ?? l.variantLabel ?? "—";
  };

  const total = lines.reduce((s, l) => s + priceOf(l) * l.qty, 0);
  const units = lines.reduce((s, l) => s + l.qty, 0);

  const submit = async () => {
    if (!customerId) return toast.error("Elige el cliente");
    if (!lines.length) return toast.error("Agrega referencias");
    setSaving(true);
    try {
      const r = await create({ data: { customerId, currency, notes: notes || undefined, mode, items: lines.map(({ imageUrl, priceUsd, priceCop, locationName, ...line }) => ({ ...line, unitPrice: currency === "USD" ? priceUsd : priceCop, priceCop })) } });
      toast.success(`Borrador ${r.number} creado`);
      if (r.warning) toast.warning(`Sin stock suficiente para reservar: ${r.warning}`);
      qc.invalidateQueries({ queryKey: ["admin-b2b-orders"] });
      qc.invalidateQueries({ queryKey: ["b2b-matrix"] });
      onCreated?.(customerId);
      if (draftKey) clearDraft(draftKey);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo crear el pedido");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-end md:items-center justify-center">
      <div role="dialog" aria-modal="true" aria-label="Nuevo pedido B2B" onClick={(e) => e.stopPropagation()} className="bg-ivory w-full md:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-3xl md:rounded-3xl p-6">
        <div className="flex items-center justify-between mb-5">
           <h2 className="font-serif text-2xl">{initialOrder ? "Duplicar pedido B2B" : "Nuevo pedido B2B"}</h2>
          <button onClick={() => { if (lines.length && !window.confirm("¿Descartar el pedido en curso? Se borrará lo que llevas.")) return; if (draftKey) clearDraft(draftKey); onClose(); }} aria-label="Cerrar"><X className="size-5" /></button>
        </div>

        <label className="text-[10px] uppercase tracking-[0.15em] text-ink/50">Cliente</label>
        <select aria-label="Cliente B2B" value={customerId} onChange={(e) => setCustomerId(e.target.value)} className="w-full mt-1 mb-4 border border-ink/15 rounded-xl px-3 py-2.5 text-sm bg-white">
          <option value="">Selecciona una cuenta B2B…</option>
          {createdCustomer && !accounts?.some((a) => a.userId === createdCustomer.userId) && <option value={createdCustomer.userId}>{createdCustomer.name}</option>}
          {(accounts ?? []).map((a) => <option key={a.userId} value={a.userId}>{a.name}</option>)}
        </select>
        <div className="mb-2"><B2BAccountForm label="Crear nuevo cliente" onCreated={(customer) => { setCreatedCustomer(customer); setCustomerId(customer.userId); }} /></div>

        <label className="text-[10px] uppercase tracking-[0.15em] text-ink/50">Destino del pedido</label>
        <div className="grid grid-cols-2 gap-2 mt-1 mb-4" role="group" aria-label="Destino del pedido">
          {([['nacional', 'Nacional · COP'], ['internacional', 'Internacional · USD']] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={destination === value} onClick={() => setDestination(value)} className={`rounded-xl border px-4 py-2.5 text-sm ${destination === value ? 'border-ink bg-ink text-ivory' : 'border-ink/15 bg-white text-ink'}`}>{label}</button>
          ))}
        </div>

        <label className="text-[10px] uppercase tracking-[0.15em] text-ink/50">Tipo de pedido</label>
        <div className="grid grid-cols-2 gap-2 mt-1 mb-4">
          {([["direct", "Venta directa", "Cada referencia puede salir de una bodega o de un cupo de preventa"], ["consignment", "Consignación", "Cada referencia conserva su origen y se traslada a la bodega del cliente"]] as const).map(([k, t, d]) => (
            <button key={k} type="button" onClick={() => setMode(k)} className={`text-left rounded-2xl border px-4 py-3 ${mode === k ? "border-ink bg-ink text-ivory" : "border-ink/15 bg-white"}`}>
              <div className="text-sm">{t}</div>
              <div className={`text-[11px] ${mode === k ? "text-ivory/70" : "text-ink/50"}`}>{d}</div>
            </button>
          ))}
        </div>

        <label className="text-[10px] uppercase tracking-[0.15em] text-ink/50">Productos</label>
        <div className="relative mt-1 mb-3">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-moss/50" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, referencia o SKU…" className="w-full pl-11 pr-4 py-3 border border-ink/15 rounded-2xl text-sm bg-background" />
        </div>
        {search.trim().length >= 2 && (
          <div className="max-h-64 overflow-y-auto bg-background border border-ink/10 rounded-2xl divide-y divide-ink/5">
            {found.length === 0 && <p className="p-5 text-sm text-moss/50 text-center">Sin resultados</p>}
            {found.flatMap((p: any) => (p.product_variants ?? []).filter((v: any) => v.active !== false).sort((a: any, b: any) => compareSizes(a.size, b.size)).map((v: any) => {
              const origins = originsOf(v);
              const img = imageOf(p);
              return (
                <div key={v.id} className="p-3 flex gap-3">
                  {img ? <img src={img} alt={p.name} loading="lazy" className="w-10 h-12 rounded-md object-cover shrink-0 bg-ink/5" /> : <div className="w-10 h-12 rounded-md bg-ink/5 shrink-0" />}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0"><p className="text-sm text-ink">{p.name}</p><p className="text-xs text-moss/50 break-words">{[v.color, displaySize(v.size)].filter(Boolean).join(" · ")} · {v.sku || p.reference_code}</p></div>
                      <span className="font-mono text-xs shrink-0">{settings ? formatMoney(wholesalePrice(v, settings, currency), currency) : ""}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {origins.length === 0 && <span className="text-xs text-moss/50">Sin stock ni cupo de preventa</span>}
                      {origins.map((origin) => {
                        const selected = lines.filter((l) => l.variantId === v.id && l.source === origin.source && l.locationId === origin.locationId).reduce((sum, l) => sum + l.qty, 0);
                        return <Button key={origin.key} type="button" variant="outline" size="sm" disabled={!settings || selected >= origin.available} onClick={() => addVariant(p, v, origin)} className="h-auto py-1 rounded-full border-ink/15 text-xs text-ink hover:bg-ink hover:text-ivory whitespace-normal text-left">{origin.source === "preventa" ? "Preventa · " : ""}{origin.name} · {Math.max(0, origin.available - selected)}</Button>;
                      })}
                    </div>
                  </div>
                </div>
              );
            }))}
          </div>
        )}

        {lines.length > 0 && (
          <div className="mt-5 flex justify-end gap-1" role="group" aria-label="Vista de productos">
            {([["table", "Tabla por tallas"], ["list", "Lista"]] as const).map(([k, t]) => (
              <button key={k} type="button" aria-pressed={linesView === k} onClick={() => setLinesView(k)} className={`text-[11px] px-3 py-1 rounded-full border ${linesView === k ? "border-ink bg-ink text-ivory" : "border-ink/15 bg-white"}`}>{t}</button>
            ))}
          </div>
        )}
        {linesView === "table" && lines.length > 0 && (() => {
          const sizes = [...new Set(lines.map((l) => sizeOfLine(l)))].sort(compareSizes);
          const rows = new Map<string, { name: string; imageUrl: string | null; origin: string; cells: Record<string, number> }>();
          lines.forEach((l, i) => {
            const key = `${l.productName}|${l.source}|${l.locationId}`;
            const row = rows.get(key) ?? { name: l.productName, imageUrl: l.imageUrl, origin: `${l.source === "restock" ? "" : "Preventa · "}${l.locationName}`, cells: {} };
            row.cells[sizeOfLine(l)] = i;
            rows.set(key, row);
          });
          return (
            <div className="mt-2 bg-white rounded-2xl border border-ink/10 overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="bg-ink/[0.03] text-ink/50 uppercase tracking-[0.1em]">
                  <tr><th className="text-left px-3 py-2 font-normal">Producto</th>{sizes.map((s) => <th key={s} className="px-1 py-2 font-normal text-center">{displaySize(s)}</th>)}<th className="px-3 py-2 font-normal text-right">Und</th><th className="px-3 py-2 font-normal text-right">Total</th></tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {[...rows.entries()].map(([key, row]) => {
                    const idx = Object.values(row.cells);
                    const u = idx.reduce((s, i) => s + lines[i].qty, 0);
                    const t = idx.reduce((s, i) => s + priceOf(lines[i]) * lines[i].qty, 0);
                    return (
                      <tr key={key}>
                        <td className="px-3 py-2 min-w-[160px]"><div className="flex items-center gap-2">{row.imageUrl && <img src={row.imageUrl} alt={row.name} className="size-8 rounded-md object-cover" />}<div><div className="font-medium text-ink">{row.name}</div><div className="text-[10px] text-ink/45">{row.origin}</div></div></div></td>
                        {sizes.map((s) => {
                          const i = row.cells[s];
                          return <td key={s} className="px-1 py-2 text-center">{i === undefined ? null : (
                            <input type="number" min={0} value={lines[i].qty} aria-label={`Cantidad ${displaySize(s)}`} onChange={(e) => {
                              const qty = Math.max(0, parseInt(e.target.value) || 0);
                              setLines((ls) => qty === 0 ? ls.filter((_, j) => j !== i) : ls.map((x, j) => (j === i ? { ...x, qty } : x)));
                            }} className="w-12 border border-ink/15 rounded-md px-1 py-1 text-center" />
                          )}</td>;
                        })}
                        <td className="px-3 py-2 text-right">{u}</td>
                        <td className="px-3 py-2 text-right whitespace-nowrap">{formatMoney(t, currency)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()}
        <div className={`mt-3 space-y-3 ${linesView === "table" ? "hidden" : ""}`}>
          {groups.map((g) => {
            const gUnits = g.lines.reduce((s, { line }) => s + line.qty, 0);
            const gTotal = g.lines.reduce((s, { line }) => s + priceOf(line) * line.qty, 0);
            return (
              <div key={g.name} className="bg-white rounded-2xl border border-ink/10 overflow-hidden">
                <div className="flex items-center gap-3 px-4 py-2.5 bg-ink/[0.03]">
                  {g.imageUrl && <img src={g.imageUrl} alt={g.name} className="size-10 rounded-lg object-cover object-center bg-ink/5" />}
                  <div className="flex-1 min-w-0 text-sm font-medium truncate">{g.name}</div>
                  <div className="text-[11px] text-ink/50">{gUnits} und · <span className="font-medium text-ink">{formatMoney(gTotal, currency)}</span></div>
                </div>
                <div className="divide-y divide-ink/5">
                  {g.lines.map(({ line: l, index: i }) => (
                    <div key={`${l.variantId}:${l.source}:${l.locationId}`} className="flex items-center gap-3 px-4 py-2">
                      <div className="flex-1 min-w-0">
                         <div className="text-[11px] text-ink/60">{l.variantLabel ?? "—"} · {formatMoney(priceOf(l), currency)}</div>
                         <div className="text-[10px] text-ink/45">{l.source === "restock" ? "Restock · Bodega" : "Preventa · Cupo"}: {l.locationName}</div>
                      </div>
                      <input type="number" min={1} value={l.qty} onChange={(e) => {
                        const qty = Math.max(1, parseInt(e.target.value) || 1);
                        setLines((ls) => ls.map((x, j) => (j === i ? { ...x, qty } : x)));
                      }} className="w-20 border border-ink/15 rounded-lg px-2 py-1 text-sm text-right" />
                       <div className="w-24 text-right text-sm">{formatMoney(priceOf(l) * l.qty, currency)}</div>
                      <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} aria-label="Quitar"><Trash2 className="size-4 text-ink/50" /></button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notas (opcional)" maxLength={1000} className="w-full mt-4 border border-ink/15 rounded-xl px-3 py-2.5 text-sm bg-white" rows={2} />

        <div className="flex items-center justify-between mt-5">
          <div className="text-sm">{units} unidades · <span className="font-medium">{formatMoney(total, currency)}</span></div>
           <button onClick={submit} disabled={saving} className="px-6 py-3 rounded-full bg-ink text-ivory text-xs disabled:opacity-50">{saving ? "Creando…" : "Crear borrador"}</button>
        </div>
      </div>
    </div>
  );
}
