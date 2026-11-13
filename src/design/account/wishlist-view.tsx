// Diseño (editable desde Claude). Datos y acciones llegan en `vm`; no calcules precios ni stock aquí.
import { WishlistGiftTabs } from "@/lib/portal-modules";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart, ShoppingBag } from "lucide-react";
import { PageHeader } from "@/components/cuenta/ui";
import { CartDrawer } from "@/components/storefront/cart-drawer";
import { type WishlistPageVM } from "@/logic/account/use-wishlist-page";
import { WishRow } from "@/logic/account/use-wishlist-page";


export function WishlistView({ vm }: { vm: WishlistPageVM }) {
  const { isLoading, cartOpen, setCartOpen, addRow, remove, items } = vm;
  return (
    <>
      <WishlistGiftTabs active="wishlist" />
      <PageHeader title="Wishlist" subtitle="Tus piezas guardadas, listas para cuando decidas." />

      {isLoading ? (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-cream" />
          ))}
        </section>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-ink/10 bg-cream/40 px-6 py-14 text-center">
          <Heart className="mx-auto h-6 w-6 text-ink/40" strokeWidth={1.5} />
          <p className="mt-4 text-base text-ink">Todavía no has guardado piezas.</p>
          <p className="mt-1 text-sm text-ink/60">
            Toca el corazón en cualquier prenda para verla aquí.
          </p>
          <Link
            to="/tienda"
            className="mt-6 inline-flex rounded-full bg-ink px-6 py-2.5 text-sm text-ivory"
          >
            Explorar la tienda
          </Link>
        </div>
      ) : (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((row) => {
            const variant = row.product_variants!;
            const product = variant.products!;
            const label = [variant.color, variant.size].filter(Boolean).join(" · ");
            return (
              <div key={row.variant_id} className="group relative">
                <Link
                  to="/producto/$slug"
                  params={{ slug: product.slug }}
                  className="relative block aspect-[3/4] overflow-hidden rounded-2xl bg-cream"
                >
                  {product.hero_image_url ? (
                    <img
                      src={product.hero_image_url}
                      alt={product.name}
                      loading="lazy"
                      className="absolute inset-0 h-full w-full object-cover"
                    />
                  ) : null}
                </Link>
                <button
                  type="button"
                  onClick={() => remove.mutate(row.variant_id)}
                  aria-label={`Quitar ${product.name} de la wishlist`}
                  className="absolute right-3 top-3 rounded-full bg-ink/30 p-1.5 backdrop-blur"
                >
                  <Heart className="h-4 w-4 fill-ivory text-ivory" strokeWidth={1.5} />
                </button>
                <button
                  type="button"
                  onClick={() => addRow(row)}
                  className="mt-2 flex w-full items-center justify-center gap-2 rounded-full bg-ink px-4 py-2 text-xs text-ivory transition hover:bg-ink/90"
                >
                  <ShoppingBag className="h-3.5 w-3.5" strokeWidth={1.5} />
                  Agregar al carrito
                </button>
                <div className="mt-2 px-0.5">
                  <p className="truncate text-sm text-ink">{product.name}</p>
                  {label ? <p className="text-xs text-ink/50">{label}</p> : null}
                  {variant.price_cop ? (
                    <p className="text-xs text-ink/70">
                      ${variant.price_cop.toLocaleString("es-CO")}
                    </p>
                  ) : null}
                </div>
              </div>
            );
          })}
        </section>
      )}

      <CartDrawer open={cartOpen} onOpenChange={setCartOpen} />
    </>
  );
}
