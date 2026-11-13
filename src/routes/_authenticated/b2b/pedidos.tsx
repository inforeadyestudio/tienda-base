import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronDown, Copy, Plus, Search } from "lucide-react";
import { B2BTopBar } from "@/components/b2b/b2b-topbar";
import { formatDate } from "@/lib/format";
import { ecomAvailable, formatMoney, useB2BProducts, useB2BSettings, useMyB2BOrders, wholesalePrice } from "@/lib/b2b/portal";
import { addB2BItem, clearB2BCart, openB2BCart, useB2BCart } from "@/lib/b2b/cart";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { EtaBadge, GoalProgress, OrderHistory, OrderMetaEditor } from "@/components/b2b/order-extras";

export const Route = createFileRoute("/_authenticated/b2b/pedidos")({
  head: () => ({
    meta: [
      { title: "Mis pedidos mayoristas · Tu Marca" },
      { name: "description", content: "Historial de pedidos aprobados por tu boutique." },
      { property: "og:title", content: "Mis pedidos mayoristas · Tu Marca" },
      { property: "og:description", content: "Historial de pedidos aprobados por tu boutique." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: B2BOrders,
});

const STATUS: Record<string, string> = {
  draft: "Borrador", reserved: "En proceso", paid: "En proceso", preparing: "En proceso",
  shipped: "Despachado", delivered: "Entregado", cancelled: "Cancelado", refunded: "Reembolsado",
};

function B2BOrders() {
  const { data, isLoading } = useMyB2BOrders();
  const { data: catalog } = useB2BProducts();
  const { data: settings } = useB2BSettings();
  const cart = useB2BCart();
  const [openId, setOpenId] = useState<string | null>(null);

  const qc = useQueryClient();
  const setQty = async (orderId: string, itemId: string, qty: number) => {
    const { error } = await (supabase.rpc as any)("client_set_preventa_item_qty", { _order_id: orderId, _item_id: itemId, _qty: qty });
    if (error) { toast.error(error.message); return; }
    toast.success("Cantidad actualizada");
    qc.invalidateQueries({ queryKey: ["b2b-my-orders"] });
  };
  const addItem = async (orderId: string, variantId: string) => {
    const { error } = await (supabase.rpc as any)("client_add_preventa_item", { _order_id: orderId, _variant_id: variantId, _qty: 1 });
    if (error) { toast.error(error.message); return; }
    toast.success("Producto agregado a la preventa");
    qc.invalidateQueries({ queryKey: ["b2b-my-orders"] });
  };
  const orderCurrency = (o: any): "USD" | "COP" => o.currency === "USD" ? "USD" : "COP";
  const totalOf = (o: any) => (orderCurrency(o) === "USD" ? (o.total_usd ?? 0) : (o.total_cop ?? 0));
  const duplicate = (order: any) => {
    if (!settings || !catalog) { toast.error("Espera a que cargue el catálogo"); return; }
    if (cart.length && !window.confirm("¿Reemplazar el pedido en curso con esta copia?")) return;
    const available = new Map<string, { product: (typeof catalog)[number]; variant: (typeof catalog)[number]["product_variants"][number] }>();
    for (const product of catalog) for (const variant of product.product_variants ?? []) {
      if (variant.active) available.set(variant.id, { product, variant });
    }
    const entries = (order.order_items ?? []).filter((item: any) => item.qty > 0).map((item: any) => ({ item, match: available.get(item.variant_id) })).filter(({ match }: any) => !!match && ecomAvailable(match.variant) > 0);
    if (!entries.length) { toast.error("Las referencias de este pedido ya no están disponibles en el catálogo B2B"); return; }
    clearB2BCart();
    for (const { item, match } of entries) {
      const { product, variant } = match;
      addB2BItem({ variantId: variant.id, productId: product.id, productName: product.name, variantLabel: [variant.size, variant.color].filter(Boolean).join(" · ") || "Única", sku: variant.sku, imageUrl: product.hero_image_url, unitPrice: wholesalePrice(variant, settings), priceCop: wholesalePrice(variant, settings, "COP"), qty: Math.min(item.qty, ecomAvailable(variant)), restock: true });
    }
    if (entries.length < (order.order_items ?? []).filter((item: any) => item.qty > 0).length || entries.some(({ item, match }: any) => item.qty > ecomAvailable(match.variant))) toast.info("Algunas prendas ya no están disponibles. Revisa la copia antes de aprobarla.");
    openB2BCart();
  };

  return (
    <div className="flex-1 flex flex-col">
      <B2BTopBar />
      <div className="p-4 md:p-6">
        <header className="mb-6">
          <p className="text-[10px] tracking-[0.2em] text-ink/50">HISTORIAL</p>
          <h1 className="font-serif italic text-3xl md:text-4xl mt-1">Mis pedidos</h1>
        </header>

        {isLoading && <p className="text-sm text-ink/50">Cargando…</p>}
        {!isLoading && !data?.length && <p className="text-sm text-ink/50">Todavía no has aprobado pedidos.</p>}

        <div className="space-y-3">
          {(data ?? []).map((o: any) => {
            const units = (o.order_items ?? []).reduce((s: number, i: any) => s + i.qty, 0);
            const approval = (o.b2b_order_approvals ?? [])[0];
            const open = openId === o.id;
            return (
              <div key={o.id} className="bg-white rounded-3xl border border-ink/8 overflow-hidden">
                <button onClick={() => setOpenId(open ? null : o.id)} className="w-full px-5 py-4 flex items-center gap-4 text-left">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium">{o.number}</div>
                    <div className="text-[11px] text-ink/50 mt-0.5">{formatDate(o.created_at)} · {units} unidades</div>
                  </div>
                  <EtaBadge eta={o.b2b_ship_eta} status={o.status} />
                  <span className="text-[10px] uppercase tracking-[0.14em] bg-[#f0e6d2] px-2.5 py-1 rounded-full">{STATUS[o.status] ?? o.status}</span>
                   <span className="text-[13px] tabular-nums">{formatMoney(totalOf(o), orderCurrency(o))}</span>
                  <ChevronDown className={"size-4 text-ink/40 transition-transform " + (open ? "rotate-180" : "")} />
                </button>
                {open && (
                  <div className="px-5 pb-5 border-t border-ink/8">
                    <table className="w-full text-[12px] mt-3">
                      <tbody>
                        {(o.order_items ?? []).map((i: any) => (
                          <tr key={i.id} className="border-b border-ink/5 last:border-0">
                            <td className="py-2">{i.product_name}</td>
                            <td className="py-2 text-ink/50">{i.variant_label ?? "—"}</td>
                            <td className="py-2 text-right tabular-nums">
                              {o.status === "draft" ? (
                                <input type="number" min={0} defaultValue={i.qty} key={i.id + i.qty}
                                  onBlur={(e) => { const n = Math.max(0, Number(e.target.value) || 0); if (n !== i.qty) setQty(o.id, i.id, n); }}
                                  className="no-spin w-16 text-center rounded-full border border-ink/15 px-2 py-1" />
                              ) : i.qty}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {o.status === "draft" && (
                      <>
                        <p className="text-[10px] text-ink/40 mt-2">Cambia las cantidades o pon 0 para quitar una talla.</p>
                        <VariantSearch onAdd={(variantId) => addItem(o.id, variantId)} />
                      </>
                    )}
                    <div className="mt-4 space-y-3">
                      <button type="button" onClick={() => duplicate(o)} className="inline-flex items-center gap-2 border-b border-ink/40 pb-1 text-xs text-ink" aria-label={`Duplicar pedido ${o.number}`}><Copy className="size-3.5" /> Duplicar pedido</button>
                      <OrderMetaEditor order={o} readOnlyMeta onSaved={() => qc.invalidateQueries({ queryKey: ["b2b-my-orders"] })} />
                       {o.status === "draft" && <GoalProgress total={totalOf(o)} currency={orderCurrency(o)} />}
                      {o.b2b_reward && <p className="text-[11px] text-ink/60">Recompensa ganada: {o.b2b_reward}</p>}
                    </div>
                    {approval ? (
                      <p className="text-[11px] text-ink/50 mt-3">
                        Aprobado por {approval.signer_name} el {formatDate(approval.accepted_at)} · condiciones {approval.terms_version}
                      </p>
                    ) : (
                      <p className="text-[11px] text-ink/40 mt-3">Sin comprobante de aprobación.</p>
                    )}
                    {o.notes && <p className="text-[11px] text-ink/50 mt-1">Notas: {o.notes}</p>}
                    <details className="mt-3">
                      <summary className="cursor-pointer text-[10px] uppercase tracking-[0.14em] text-ink/50">Historial de cambios</summary>
                      <div className="mt-2"><OrderHistory orderId={o.id} /></div>
                    </details>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Buscador de variantes para agregar productos a una preventa abierta. */
function VariantSearch({ onAdd }: { onAdd: (variantId: string) => void }) {
  const [term, setTerm] = useState("");
  const [hits, setHits] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = term.trim();
    if (t.length < 2) { setHits([]); return; }
    const h = setTimeout(async () => {
      const { data: prods } = await supabase.from("products").select("id").ilike("name", `%${t}%`).neq("status", "archived").limit(50);
      const ids = (prods ?? []).map((p: any) => p.id);
      let q = supabase.from("product_variants").select("id, sku, size, color, products(name)").limit(30);
      q = ids.length ? q.or(`sku.ilike.%${t}%,product_id.in.(${ids.join(",")})`) : q.ilike("sku", `%${t}%`);
      const { data } = await q;
      setHits(data ?? []);
    }, 250);
    return () => clearTimeout(h);
  }, [term]);

  return (
    <div className="mt-3">
      <div className="flex items-center gap-2 rounded-full border border-ink/15 px-3 py-1.5">
        <Search className="size-3.5 text-ink/40" />
        <input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Agregar producto: busca por nombre o SKU…"
          className="flex-1 bg-transparent text-[12px] outline-none" />
      </div>
      {hits.length > 0 && (
        <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-ink/10 divide-y divide-ink/5">
          {hits.map((v) => (
            <button key={v.id} disabled={busy}
              onClick={async () => { setBusy(true); await onAdd(v.id); setBusy(false); setTerm(""); setHits([]); }}
              className="w-full flex items-center justify-between px-3 py-2 text-left text-[12px] hover:bg-ink/5 disabled:opacity-50">
              <span><span className="text-ink">{v.products?.name}</span> <span className="text-ink/50">{[v.color, v.size].filter(Boolean).join(" / ")} · {v.sku}</span></span>
              <Plus className="size-3.5 text-ink/40" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
