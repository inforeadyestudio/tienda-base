import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCOP, formatUSD } from "@/lib/format";
import { intlSettingsQuery } from "@/lib/international";

type Line = { key: string; variantId: string; locationId: string; locationName: string; productName: string; label: string; price: number; priceUsd: number; qty: number };

/** Editar prendas, precios, descuento y envío de un pedido manual con pago pendiente. El apartado se rehace en el servidor. */
export function EditManualOrderModal({ order, onClose }: { order: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isUsd = order.currency === "USD";
  const { data: intlCfg } = useQuery(intlSettingsQuery());
  const usdRate = intlCfg?.usdRate ?? 4000;
  const [lines, setLines] = useState<Line[] | null>(null);
  const [shipping, setShipping] = useState<number>(Number(order.shipping_cop ?? 0));
  const [discount, setDiscount] = useState<number>(Number(order.discount_cop ?? 0));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("order_items")
        .select("variant_id, qty, unit_price_cop, unit_price_usd, product_name, variant_label, fulfill_location_id, locations:fulfill_location_id(name), product_variants(price_usd)")
        .eq("order_id", order.id);
      setLines((data ?? []).map((i: any) => ({
        key: `${i.variant_id}:${i.fulfill_location_id}`, variantId: i.variant_id, locationId: i.fulfill_location_id,
        locationName: i.locations?.name ?? "", productName: i.product_name, label: i.variant_label ?? "",
        price: i.unit_price_cop, priceUsd: Number(i.unit_price_usd ?? i.product_variants?.price_usd ?? 0) || Math.round((i.unit_price_cop / usdRate) * 100) / 100, qty: i.qty,
      })));
    })();
  }, [order.id]);

  const { data: variants } = useQuery({
    queryKey: ["edit-manual-variants", q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const term = `%${q.trim()}%`;
      const { data: prods, error: pe } = await supabase.from("products").select("id").in("status", ["published", "draft"]).ilike("name", term).limit(30);
      if (pe) throw pe;
      const ids = (prods ?? []).map((p) => p.id);
      let query = supabase.from("product_variants").select("id, sku, size, color, price_cop, price_usd, products!inner(name, status)")
        .eq("active", true).in("products.status", ["published", "draft"]).limit(60);
      query = ids.length ? query.or(`sku.ilike.${term},product_id.in.(${ids.join(",")})`) : query.ilike("sku", term);
      const { data, error } = await query;
      if (error) throw error;
      const vids = (data ?? []).map((v) => v.id);
      const stock = new Map<string, { id: string; name: string; avail: number }[]>();
      if (vids.length) {
        const { data: lv } = await supabase.from("inventory_levels").select("variant_id, on_hand, reserved, locations!inner(id, name, active)").in("variant_id", vids).eq("locations.active", true);
        for (const l of (lv ?? []) as any[]) {
          const avail = (l.on_hand ?? 0) - (l.reserved ?? 0);
          if (avail <= 0) continue;
          stock.set(l.variant_id, [...(stock.get(l.variant_id) ?? []), { id: l.locations.id, name: l.locations.name, avail }]);
        }
      }
      return (data ?? []).map((v: any) => ({ ...v, stock: stock.get(v.id) ?? [] }));
    },
  });

  const add = (v: any, loc: { id: string; name: string }) => {
    const key = `${v.id}:${loc.id}`;
    setLines((prev) => {
      const p = prev ?? [];
      if (p.some((l) => l.key === key)) return p.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l));
      return [...p, { key, variantId: v.id, locationId: loc.id, locationName: loc.name, productName: v.products?.name ?? "", label: [v.color, v.size].filter(Boolean).join(" · ") || v.sku,
        price: v.price_cop, priceUsd: Number(v.price_usd) > 0 ? Number(v.price_usd) : Math.round((v.price_cop / usdRate) * 100) / 100, qty: 1 }];
    });
  };
  const upd = (key: string, patch: Partial<Line>) => setLines((p) => (p ?? []).map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const subtotal = (lines ?? []).reduce((s, l) => s + l.price * l.qty, 0);
  const subtotalUsd = (lines ?? []).reduce((s, l) => s + l.priceUsd * l.qty, 0);
  const total = Math.max(0, subtotal - discount + shipping);
  const totalUsd = Math.round((subtotalUsd - discount / usdRate + shipping / usdRate) * 100) / 100;
  const changed = isUsd ? Math.abs(totalUsd - Number(order.total_usd ?? 0)) > 0.01 : total !== Number(order.total_cop ?? 0);

  const save = async () => {
    if (!lines?.length) return toast.error("El pedido necesita al menos una prenda");
    setBusy(true);
    const { error } = await supabase.rpc("edit_manual_order" as never, {
      _order_id: order.id, _shipping_cop: Math.round(shipping), _discount_cop: Math.round(discount), _total_usd: isUsd ? totalUsd : null,
      _items: lines.map((l) => ({ variant_id: l.variantId, location_id: l.locationId, qty: l.qty, unit_price_cop: Math.round(l.price), unit_price_usd: isUsd ? l.priceUsd : null, product_name: l.productName, variant_label: l.label })),
    } as never);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(changed ? "Pedido actualizado. El total cambió: envía un link de pago nuevo." : "Pedido actualizado");
    qc.invalidateQueries();
    onClose();
  };

  const inp = "w-full rounded-lg border border-ink/15 bg-white px-2 py-1.5 text-sm";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button aria-label="Cerrar" onClick={onClose} className="absolute inset-0 bg-ink/40" />
      <div role="dialog" aria-modal="true" className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="font-nm text-lg">Editar pedido manual · #{order.number}</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-ink/5"><X className="size-4" /></button>
        </div>
        <p className="mt-1 text-xs text-moss/70">Al guardar se liberan las prendas que quites y se apartan las nuevas en su bodega.</p>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <label htmlFor="manual-order-shipping">Valor del envío (COP)<input id="manual-order-shipping" type="number" min={0} value={shipping} onChange={(e) => setShipping(Math.max(0, Number(e.target.value) || 0))} className={inp} /></label>
          <label htmlFor="manual-order-discount">Descuento (COP)<input id="manual-order-discount" type="number" min={0} value={discount} onChange={(e) => setDiscount(Math.max(0, Number(e.target.value) || 0))} className={inp} /></label>
        </div>

        <div className="mt-4 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-moss/50" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto o SKU para agregar" className="w-full rounded-full border border-ink/15 pl-9 pr-3 py-2 text-sm" />
        </div>
        {q.trim().length >= 2 && (
          <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-ink/10 divide-y divide-ink/5">
            {(variants ?? []).map((v: any) => (
              <div key={v.id} className="px-3 py-2 text-sm">
                <div>{v.products?.name} <span className="text-moss/60">· {[v.color, v.size].filter(Boolean).join(" · ")}</span></div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {v.stock.length ? v.stock.map((s: any) => (
                    <button key={s.id} onClick={() => add(v, s)} className="rounded-full border border-ink/15 px-2.5 py-0.5 text-[11px] hover:border-ink">+ {s.name} ({s.avail})</button>
                  )) : <span className="text-[11px] text-moss/60">Sin unidades libres</span>}
                </div>
              </div>
            ))}
            {variants && !variants.length && <p className="px-3 py-2 text-sm text-moss/60">Sin resultados</p>}
          </div>
        )}

        <div className="mt-4 divide-y divide-ink/5">
          {lines === null && <p className="text-sm text-moss/60">Cargando…</p>}
          {(lines ?? []).map((l) => (
            <div key={l.key} className="grid grid-cols-[1fr_70px_110px_32px] items-center gap-2 py-2 text-sm">
              <div>{l.productName}<div className="text-xs text-moss/60">{l.label} · {l.locationName}</div></div>
              <input type="number" min={1} value={l.qty} onChange={(e) => upd(l.key, { qty: Math.max(1, Number(e.target.value) || 1) })} className={inp} aria-label="Cantidad" />
              {isUsd
                ? <input type="number" step="0.01" value={l.priceUsd} onChange={(e) => upd(l.key, { priceUsd: Number(e.target.value) || 0, price: Math.round((Number(e.target.value) || 0) * usdRate) })} className={inp} aria-label="Precio US$" />
                : <input type="number" value={l.price} onChange={(e) => upd(l.key, { price: Number(e.target.value) || 0 })} className={inp} aria-label="Precio" />}
              <button onClick={() => setLines((p) => (p ?? []).filter((x) => x.key !== l.key))} className="p-1.5 text-moss hover:text-destructive" aria-label="Quitar"><Trash2 className="size-4" /></button>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between border-t border-ink/10 pt-4">
          <div>
            <div className="text-lg">{isUsd ? formatUSD(totalUsd) : formatCOP(total)}</div>
            {changed && <div className="text-xs text-destructive">El total cambió, envía un link nuevo.</div>}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-moss">Cancelar</button>
            <button disabled={busy || lines === null} onClick={save} className="rounded-full bg-primary px-5 py-2 text-sm text-primary-foreground disabled:opacity-50">{busy ? "Guardando…" : "Guardar cambios"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
