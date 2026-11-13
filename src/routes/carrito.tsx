import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteNav } from "@/components/storefront/site-nav";
import { SiteFooter } from "@/components/storefront/site-footer";
import { useEffect } from "react";
import { itemUsd, refreshCartPrices, useCart } from "@/lib/cart";
import { CartLinePrice, useCartSavings } from "@/components/storefront/product-sale";
import { usePrice } from "@/lib/locale";
import { openCheckout } from "@/lib/checkout/engine";
import { Minus, Plus, X } from "lucide-react";
import { seoHead, SEO_DEFAULT_DESCRIPTION } from "@/lib/seo";

export const Route = createFileRoute("/carrito")({
  head: () => seoHead({ title: "Carrito | Tu Marca", description: SEO_DEFAULT_DESCRIPTION, path: "/carrito", noindex: true }),
  component: CartPage,
});

function CartPage() {
  const { items, setQty, remove, subtotal } = useCart();
  const money = usePrice();
  const savings = useCartSavings(items);
  useEffect(() => { void refreshCartPrices(); }, []);
  const subtotalUsd = items.reduce((sum, i) => sum + itemUsd(i, 4000) * i.qty, 0);
  return (
    <div className="min-h-screen bg-ivory">
      <SiteNav />
      <div className="max-w-5xl mx-auto px-6 py-12">
        <h1 className="font-serif italic text-5xl mb-10">Carrito</h1>
        {items.length === 0 ? (
          <div className="py-24 text-center text-moss/70">
            <p className="mb-6">Tu carrito está vacío.</p>
            <Link to="/coleccion/$slug" params={{ slug: "todo" }} className="text-[11px] uppercase tracking-[0.2em] border border-ink/20 px-6 py-4 inline-block hover:border-ink">
              Explorar piezas
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-12">
            <ul className="md:col-span-2 divide-y divide-ink/10">
              {items.map((i) => (
                <li key={i.variantId} className="py-6 flex gap-4">
                  <div className="w-24 h-32 bg-cream shrink-0 overflow-hidden">
                    {i.imageUrl && <img src={i.imageUrl} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between">
                      <div>
                        <Link to="/producto/$slug" params={{ slug: i.productSlug }} className="font-serif italic text-xl hover:underline">
                          {i.productName}
                        </Link>
                        <p className="text-xs text-moss mt-1">{i.variantLabel}</p>
                      </div>
                      <button onClick={() => remove(i.variantId)} className="text-moss/60 hover:text-ink"><X className="size-4" /></button>
                    </div>
                    <div className="flex items-center justify-between mt-6">
                      <div className="flex items-center border border-ink/20">
                        <button onClick={() => setQty(i.variantId, i.qty - 1)} className="p-2 hover:bg-cream"><Minus className="size-3" /></button>
                        <span className="px-4 text-sm">{i.qty}</span>
                        <button onClick={() => setQty(i.variantId, i.qty + 1)} className="p-2 hover:bg-cream"><Plus className="size-3" /></button>
                      </div>
                      <CartLinePrice item={i} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            <aside className="md:col-span-1">
              <div className="border border-ink/10 p-6 bg-cream/40">
                <h2 className="text-[11px] uppercase tracking-[0.2em] text-moss mb-4">Resumen</h2>
                {savings.any && <div className="flex justify-between text-sm py-2 text-moss"><span>Ahorras en el Sale</span><span>{money(savings.cop, savings.usd)}</span></div>}
                <div className="flex justify-between text-sm py-2">
                  <span>Subtotal</span><span>{money(subtotal, subtotalUsd)}</span>
                </div>

                <div className="flex justify-between text-sm py-2 text-moss/70">
                  <span>Envío</span><span>Calculado en checkout</span>
                </div>
                <button type="button" onClick={() => openCheckout()} className="mt-6 block w-full text-center bg-ink text-ivory text-[11px] uppercase tracking-[0.2em] py-4 hover:bg-moss">
                  Proceder al pago
                </button>
              </div>
            </aside>
          </div>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}