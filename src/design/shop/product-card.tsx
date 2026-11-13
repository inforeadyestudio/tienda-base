import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { FavoriteButton } from "@/components/storefront/favorite-button";
import { QuickAddModal } from "@/components/tienda/quick-add-modal";
import { useSession } from "@/lib/auth-hooks";
import { useLocale, usePrice } from "@/lib/locale";
import { hasSalePrice } from "@/lib/product-sale";
import type { ShopProduct } from "@/lib/tienda/catalog";
import { cn } from "@/lib/utils";
import { AutoVideo } from "@/components/media/auto-video";
import { ProductPhoto } from "@/components/storefront/product-photo";

type Props = { product: ShopProduct; preferredSize?: string | null; flush?: boolean; imageSizes?: string };

export function ShopProductCard({ product, preferredSize, flush, imageSizes }: Props) {
  const { user } = useSession();
  const money = usePrice();
  const { currency } = useLocale();
  const onSale = hasSalePrice(
    { price_cop: product.minPrice, price_usd: product.minPriceUsd, compare_at_cop: product.compareCop, compare_at_usd: product.compareUsd },
    currency,
  );
  const [color, setColor] = useState<string | null>(product.colors[0]?.name ?? null);
  const [hover, setHover] = useState(false);
  const [picking, setPicking] = useState(false);

  const colorVariant = product.variants.find((v) => v.color === color);
  const image =
    (hover && product.images[1]) ||
    product.images[0] ||
    product.hero_image_url ||
    null;

  const sizeMatch =
    preferredSize && product.variants.find((v) => v.size === preferredSize && v.available > 0);

  const hasStock = product.variants.some((v) => v.active && v.available > 0);

  const openQuickBuy = () => {
    if (!hasStock) return toast.info("Esta pieza está agotada por ahora");
    setPicking(true);
  };

  return (
    <div
      className={cn("group relative bg-marca-paper", flush && "flex flex-col")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <Link to="/producto/$slug" params={{ slug: product.slug }} className="block">
        <div className="relative aspect-[4/5] overflow-hidden bg-marca-paper">
          {image && (
            <ProductPhoto
              src={image}
              alt={product.name}
              loading="lazy"
              sizes={imageSizes}
              className="absolute inset-0 h-full w-full scale-[1.08] object-cover mix-blend-multiply transition-transform duration-[900ms] ease-out group-hover:scale-[1.12]"
            />
          )}
          {product.coverVideo && !(hover && product.hoverVideo) ? (
            <AutoVideo src={product.coverVideo} className="absolute inset-0 h-full w-full object-cover" />
          ) : hover && product.hoverVideo ? (
            <AutoVideo src={product.hoverVideo} priority className="absolute inset-0 h-full w-full object-cover" />
          ) : null}
          {onSale ? (
            <span className="marca-mono absolute left-3 top-3 text-[9.5px] text-marca-burdeos">
              Sale
            </span>
          ) : isNew(product.created_at) && (
            <span className="marca-mono marca-mono-soft absolute left-3 top-3 text-[9.5px]">
              Nuevo
            </span>
          )}
        </div>
      </Link>

      {!flush && (
        <div className="absolute top-3 right-3 flex flex-col gap-2">
          <FavoriteButton variantId={colorVariant?.id ?? product.variants[0]?.id ?? null} tone="light" />
        </div>
      )}

      <QuickAddModal productId={product.id} product={product} open={picking} onClose={() => setPicking(false)} />

      {/* Info centrada: nombre, precio y colores */}
      <div className={cn("pt-4 flex flex-col items-center text-center", flush && "flex-1")}>
        <Link
          to="/producto/$slug"
          params={{ slug: product.slug }}
          className="marca-tr text-[12.5px] md:text-[14px] text-marca-cacao no-underline"
        >
          {product.name}
        </Link>
        <p className="marca-mono m-0 mt-1 flex flex-wrap items-baseline justify-center gap-x-2 text-[11px] tracking-[.06em] text-marca-cacao">
          {onSale && (
            <del className="opacity-60 decoration-1">
              <span className="sr-only">Antes: </span>
              {money(product.compareCop ?? 0, product.compareUsd ?? null)}
            </del>
          )}
          <span>{onSale && <span className="sr-only">Ahora: </span>}{money(product.minPrice, product.minPriceUsd)}</span>
        </p>

        {/* Swatches */}
        {product.colors.length > 1 && (
          <div className="mt-2.5 flex items-center justify-center gap-[7px]">
            {product.colors.slice(0, 3).map((c) => (
              <button
                key={c.name}
                type="button"
                title={c.name}
                aria-label={c.name}
                onClick={() => setColor(c.name)}
                className={cn(
                  "size-3 rounded-full p-0 transition-shadow",
                  color === c.name ? "shadow-[0_0_0_1px_var(--marca-paper),0_0_0_2px_var(--marca-cacao)]" : "shadow-[inset_0_0_0_1px_var(--marca-line-strong)]",
                )}
                style={{ background: c.hex }}
              />
            ))}
            {product.colors.length > 3 && (
              <span className="text-[10px] opacity-50">+{product.colors.length - 3}</span>
            )}
          </div>
        )}

        {/* Texto talla del usuario */}
        {user && preferredSize && (
          <p className="mt-2 font-nm text-[10px] uppercase tracking-[0.16em] text-ink/50">
            {sizeMatch ? `Tu talla ${preferredSize} disponible ✓` : `Talla ${preferredSize} agotada`}
          </p>
        )}

        {/* Acciones centradas */}
        <div className={cn("mt-2 flex items-center justify-center gap-4", flush && "mt-auto pt-2")}>
          <Link to="/producto/$slug" params={{ slug: product.slug }} className="marca-bk text-[10.5px]">
            Ver
          </Link>
          <button type="button" onClick={openQuickBuy} className="marca-bk text-[10.5px]">
            Agregar
          </button>
        </div>
      </div>

      {/* Favorito en modo flush */}
      {flush && (
        <div className="absolute top-3 right-3">
          <FavoriteButton variantId={colorVariant?.id ?? product.variants[0]?.id ?? null} tone="light" />
        </div>
      )}
    </div>
  );
}

function isNew(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < 1000 * 60 * 60 * 24 * 30;
}
