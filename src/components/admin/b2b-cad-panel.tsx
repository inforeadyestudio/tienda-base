import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { buildCadInvoice } from "@/lib/rcount";

const fmtCad = (n: number) => `CA$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Moneda de facturación en dólares canadienses para un pedido B2B (precios y tasa digitados). */
export function B2BCadPanel({ orderId, locked }: { orderId: string; locked?: boolean }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["b2b-cad", orderId],
    queryFn: async () => {
      const { data: o } = await (supabase as any).from("orders").select("billing_currency, fx_cop_per_cad, shipping_cad, total_cad").eq("id", orderId).maybeSingle();
      const { data: items } = await (supabase as any).from("order_items").select("id, qty, unit_price_cad, product_name, variant_label, product_variants(sku)").eq("order_id", orderId).order("created_at");
      return { o, items: (items ?? []) as any[] };
    },
  });
  const [on, setOn] = useState(false);
  const [trm, setTrm] = useState("");
  const [ship, setShip] = useState("");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!data) return;
    setOn(data.o?.billing_currency === "CAD");
    setTrm(data.o?.fx_cop_per_cad ? String(data.o.fx_cop_per_cad) : "");
    setShip(data.o?.shipping_cad != null ? String(data.o.shipping_cad) : "");
    setPrices(Object.fromEntries(data.items.map((i) => [i.id, i.unit_price_cad != null ? String(i.unit_price_cad) : ""])));
  }, [data]);
  if (!data) return null;
  const calc = buildCadInvoice(data.items.map((i) => ({ sku: i.product_variants?.sku ?? "", description: i.product_name, quantity: Number(i.qty), unit_price_cad: prices[i.id] ? Number(prices[i.id]) : null })), Number(ship || 0), trm ? Number(trm) : null);

  const save = async () => {
    if (on && calc.error) return toast.error(calc.error);
    setSaving(true);
    try {
      for (const i of data.items) {
        const v = prices[i.id] ? Number(prices[i.id]) : null;
        const { error } = await (supabase as any).from("order_items").update({ unit_price_cad: v }).eq("id", i.id);
        if (error) throw error;
      }
      const { error } = await (supabase as any).from("orders").update(on
        ? { billing_currency: "CAD", fx_cop_per_cad: Number(trm), shipping_cad: Number(ship || 0), total_cad: calc.total }
        : { billing_currency: null }).eq("id", orderId);
      if (error) throw error;
      toast.success(on ? "Pedido en CAD guardado" : "El pedido vuelve a su moneda original");
      qc.invalidateQueries({ queryKey: ["b2b-cad", orderId] });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    } finally { setSaving(false); }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 text-sm">
      <label className="flex items-center gap-2 font-medium">
        <input type="checkbox" checked={on} disabled={locked} onChange={(e) => setOn(e.target.checked)} />
        Facturar en dólares canadienses (CAD)
      </label>
      {on && (
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="text-xs text-muted-foreground">Tasa (pesos por 1 dólar canadiense)</span>
            <input className="mt-1 w-full rounded border border-border bg-background px-2 py-1" inputMode="decimal" value={trm} disabled={locked} onChange={(e) => setTrm(e.target.value)} placeholder="2950" />
          </label>
          <div className="space-y-1">
            {data.items.map((i) => (
              <div key={i.id} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{i.qty} × {i.product_name} {i.variant_label}</span>
                <input className="w-24 rounded border border-border bg-background px-2 py-1 text-right" inputMode="decimal" placeholder="CA$" value={prices[i.id] ?? ""} disabled={locked} onChange={(e) => setPrices({ ...prices, [i.id]: e.target.value })} />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <span className="flex-1">Envío</span>
              <input className="w-24 rounded border border-border bg-background px-2 py-1 text-right" inputMode="decimal" placeholder="CA$" value={ship} disabled={locked} onChange={(e) => setShip(e.target.value)} />
            </div>
          </div>
          <div className="flex justify-between font-medium"><span>Total</span><span>{fmtCad(calc.total)}</span></div>
          {calc.error && <p className="text-xs text-destructive">{calc.error}</p>}
        </div>
      )}
      {!locked && <button className="mt-3 rounded bg-primary px-3 py-1.5 text-primary-foreground disabled:opacity-50" disabled={saving} onClick={save}>{saving ? "Guardando…" : "Guardar moneda"}</button>}
      {locked && <p className="mt-2 text-xs text-muted-foreground">Ya se envió a facturar; para corregir, avisa a R-Count.</p>}
    </div>
  );
}
