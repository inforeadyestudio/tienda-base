import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Minus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCOP, formatUSD } from "@/lib/format";
import { allocateSwapAmount } from "@/lib/returns/inventory-error-allocation";

type Line = { id: string; variant_id: string; product_name: string; variant_label: string | null; qty: number; shipped_qty: number | null; unit_price_cop: number; unit_price_usd: number | null };
type Option = { variant_id: string; location_id: string; label: string; avail: number; price_cop: number; price_usd: number | null };
type Selection = Option & { qty: number };

const input = "rounded-full border border-ink/10 px-4 py-2 text-sm bg-background w-full";

export function InventoryErrorSwapModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [orderNumber, setOrderNumber] = useState("");
  const [order, setOrder] = useState<{ id: string; number: string; status: string; currency: string | null; contact_name: string | null } | null>(null);
  const [lineIds, setLineIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [choices, setChoices] = useState<Selection[]>([]);
  const requestId = useRef<string | null>(null);
  const [reason, setReason] = useState("");

  const findOrder = useMutation({
    mutationFn: async () => {
      const n = orderNumber.trim().toUpperCase();
      const { data, error } = await supabase.from("orders").select("id, number, status, currency, contact_name").ilike("number", /^(LU|ZL|B2B)-/i.test(n) ? n : `%${n}`).limit(1).maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Pedido no encontrado");
      return data;
    },
    onMutate: () => { setOrder(null); setLineIds([]); setChoices([]); requestId.current = null; },
    onSuccess: (d) => { setOrder(d); },
    onError: (e: Error) => toast.error(e.message),
  });

  const lines = useQuery({
    queryKey: ["swap-lines", order?.id],
    enabled: !!order,
    queryFn: async () => {
      if (!order) return [];
      const { data, error } = await supabase.from("order_items").select("id, variant_id, product_name, variant_label, qty, shipped_qty, unit_price_cop, unit_price_usd").eq("order_id", order.id);
      if (error) throw error;
      return (data ?? []) as Line[];
    },
  });

  const options = useQuery({
    queryKey: ["swap-options", search],
    enabled: search.trim().length >= 2,
    queryFn: async () => {
      const { data: prods, error: pe } = await supabase.from("products").select("id, name").ilike("name", `%${search.trim()}%`).limit(15);
      if (pe) throw pe;
      const ids = (prods ?? []).map((p) => p.id);
      if (!ids.length) return [] as Option[];
      const { data: vars, error: ve } = await supabase.from("product_variants").select("id, product_id, size, sku, price_cop, price_usd, active").in("product_id", ids).eq("active", true);
      if (ve) throw ve;
      const vids = (vars ?? []).map((v) => v.id);
      if (!vids.length) return [] as Option[];
      const { data: inv, error: ie } = await supabase.from("inventory_levels").select("variant_id, location_id, on_hand, reserved, locations(name, active)").in("variant_id", vids);
      if (ie) throw ie;
      const out: Option[] = [];
      for (const l of inv ?? []) {
        const avail = (l.on_hand ?? 0) - (l.reserved ?? 0);
        const loc = l.locations as unknown as { name: string; active: boolean } | null;
        if (avail <= 0 || !loc?.active) continue;
        const v = vars?.find((x) => x.id === l.variant_id);
        if (!v) continue;
        const p = prods?.find((x) => x.id === v.product_id);
        if (!p) continue;
        out.push({ variant_id: v.id, location_id: l.location_id, avail, price_cop: v.price_cop ?? 0, price_usd: v.price_usd, label: `${p.name} · ${v.size || v.sku || "Sin talla"} · ${loc.name}` });
      }
      return out.sort((a, b) => a.label.localeCompare(b.label));
    },
  });

  const swap = useMutation({
    mutationFn: async () => {
      if (!lineIds.length || !choices.length) throw new Error("Escoge las prendas del cambio");
      if (!requestId.current) requestId.current = crypto.randomUUID();
      const { error } = await supabase.rpc("swap_order_items_inventory_error_many", {
        _order_item_ids: lineIds,
        _replacements: choices.map((c) => ({ variant_id: c.variant_id, location_id: c.location_id, qty: c.qty })),
        _request_id: requestId.current,
        _reason: reason || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["returns"] });
      qc.invalidateQueries({ queryKey: ["swap-lines"] });
      qc.invalidateQueries({ queryKey: ["swap-options"] });
      qc.invalidateQueries({ predicate: (q) => q.queryKey.some((k) => typeof k === "string" && /order|pedido|inventory|inventario|picking/.test(k)) });
      toast.success("Cambio hecho. Las prendas nuevas quedaron en el pedido sin cobro adicional.");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const closed = order && ["shipped", "delivered", "cancelled", "refunded"].includes(order.status);

  const selectedLines = (lines.data ?? []).filter((l) => lineIds.includes(l.id));
  const units = choices.flatMap((c) => Array.from({ length: c.qty }, () => c));
  const isUSD = order?.currency === "USD";
  const amount = selectedLines.reduce((total, l) => total + Math.round(isUSD ? (l.unit_price_usd ?? 0) * 100 : l.unit_price_cop) * l.qty, 0);
  const allocation = units.length ? allocateSwapAmount(amount, units.map((c) => Math.max(0, Math.round(isUSD ? (c.price_usd != null ? c.price_usd * 100 : c.price_cop) : c.price_cop)))) : [];
  const money = (value: number) => isUSD ? formatUSD(value / 100) : formatCOP(value);
  const selectedKey = (c: Option) => c.variant_id + c.location_id;
  const changeQty = (c: Selection, delta: number) => {
    requestId.current = null;
    setChoices((current) => current.map((x) => selectedKey(x) === selectedKey(c) ? { ...x, qty: Math.min(x.avail, Math.max(1, x.qty + delta)) } : x));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => { if (!swap.isPending) onClose(); }} />
      <div role="dialog" aria-modal="true" aria-label="Cambio por error de inventario" className="relative w-full max-w-2xl bg-background rounded-3xl p-6 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="font-serif italic text-2xl mb-1">Cambio por error de inventario</div>
        <p className="text-xs text-moss mb-5">Sin cobro adicional · Sin devolución al inventario de la prenda inexistente</p>

        <fieldset disabled={swap.isPending} className="space-y-4 min-w-0">
          <div className="flex gap-2">
            <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !findOrder.isPending && !swap.isPending) findOrder.mutate(); }} placeholder="Número de pedido (TM-WEB-250)" className={input} />
            <Button onClick={() => findOrder.mutate()} disabled={!orderNumber.trim() || findOrder.isPending}>Buscar</Button>
          </div>

          {order && (
            <div className="text-sm">
              <div className="font-medium">{order.number} · {order.contact_name}</div>
              {closed && <div className="text-destructive text-xs mt-1">Este pedido ya fue despachado o cerrado; usa un cambio normal.</div>}
            </div>
          )}

          {order && !closed && (
            <>
              <div>
                <div className="text-[10px] uppercase tracking-widest text-moss/70 mb-1">Prendas que no había</div>
                <div className="space-y-1">
                  {lines.isFetching && <div className="text-xs text-moss">Cargando prendas…</div>}
                  {lines.error && <div className="text-xs text-destructive">{lines.error.message}</div>}
                  {(lines.data ?? []).map((l) => (
                    <label key={l.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm cursor-pointer ${lineIds.includes(l.id) ? "border-ink" : "border-ink/10"}`}>
                      <input type="checkbox" checked={lineIds.includes(l.id)} disabled={(l.shipped_qty ?? 0) > 0} onChange={() => { setLineIds((ids) => ids.includes(l.id) ? ids.filter((id) => id !== l.id) : [...ids, l.id]); setChoices([]); requestId.current = null; }} />
                      {l.product_name} · {l.variant_label || "Sin talla"} × {l.qty}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[10px] uppercase tracking-widest text-moss/70 mb-1">Prendas nuevas</div>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto…" className={input} />
                <div className="mt-2 space-y-1 max-h-56 overflow-y-auto">
                  {options.isFetching && <div className="text-xs text-moss">Buscando…</div>}
                  {search.trim().length >= 2 && !options.isFetching && (options.data ?? []).length === 0 && <div className="text-xs text-moss">Sin tallas con stock libre.</div>}
                  {options.error && <div className="text-xs text-destructive">{options.error.message}</div>}
                  {(options.data ?? []).filter((o) => !selectedLines.some((l) => o.variant_id === l.variant_id)).map((o) => {
                    const chosen = choices.find((c) => selectedKey(c) === selectedKey(o));
                    return <Button key={selectedKey(o)} variant="outline" disabled={!lineIds.length || (chosen?.qty ?? 0) >= o.avail}
                      onClick={() => { requestId.current = null; setChoices((current) => chosen ? current.map((c) => selectedKey(c) === selectedKey(o) ? { ...c, qty: c.qty + 1 } : c) : [...current, { ...o, qty: 1 }]); }}
                      className="w-full h-auto justify-between whitespace-normal text-left px-3 py-2">
                      <span className="min-w-0">{o.label}<span className="block text-xs text-muted-foreground">{o.avail} libres · {isUSD ? formatUSD(o.price_usd) : formatCOP(o.price_cop)}</span></span><Plus className="shrink-0" />
                    </Button>;
                  })}
                </div>
              </div>

              {choices.length > 0 && <div className="space-y-2 border-t border-border pt-3">
                <div className="text-xs text-muted-foreground">{units.length} prendas seleccionadas</div>
                {choices.map((c) => <div key={selectedKey(c)} className="flex items-center gap-2 py-2">
                  <span className="text-sm flex-1 min-w-0">{c.label}</span>
                  <Button variant="ghost" size="icon" aria-label={`Reducir ${c.label}`} title="Reducir cantidad" disabled={c.qty <= 1} onClick={() => changeQty(c, -1)}><Minus /></Button>
                  <span className="text-sm w-5 text-center">{c.qty}</span>
                  <Button variant="ghost" size="icon" aria-label={`Aumentar ${c.label}`} title="Aumentar cantidad" disabled={c.qty >= c.avail} onClick={() => changeQty(c, 1)}><Plus /></Button>
                  <Button variant="ghost" size="icon" aria-label={`Quitar ${c.label}`} title="Quitar prenda" onClick={() => { requestId.current = null; setChoices((current) => current.filter((x) => selectedKey(x) !== selectedKey(c))); }}><Trash2 /></Button>
                </div>)}
                <div className="text-sm flex justify-between gap-2 font-medium"><span>Valor conservado del cambio</span><span>{money(amount)}</span></div>
                <ul className="text-xs text-muted-foreground space-y-1">{units.map((c, i) => <li key={i}>{c.label} · {money(allocation[i] ?? 0)}</li>)}</ul>
              </div>}

              <input value={reason} onChange={(e) => { setReason(e.target.value); requestId.current = null; }} placeholder="Motivo (opcional)" className={input} />
            </>
          )}
        </fieldset>

        <div className="flex justify-end gap-2 mt-6">
          <Button variant="ghost" disabled={swap.isPending} onClick={onClose}>Cancelar</Button>
          <Button disabled={!lineIds.length || !choices.length || swap.isPending || !!closed || findOrder.isPending} onClick={() => swap.mutate()}>
            {swap.isPending ? "Guardando…" : "Hacer cambio"}
          </Button>
        </div>
      </div>
    </div>
  );
}
