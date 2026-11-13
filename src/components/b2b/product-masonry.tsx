import { Link } from "@tanstack/react-router";
import { ecomAvailable, formatMoney, isRestockProduct, wholesalePrice, type B2BSettings } from "@/lib/b2b/portal";
import { optimizedImageUrl } from "@/lib/media";
import { StockBadge } from "@/components/b2b/stock-badge";

export function ProductMasonry({ products, settings }: { products: any[]; settings: B2BSettings }) {
  if (!products.length) return <p className="text-sm text-ink/50">No encontramos referencias con este filtro.</p>;
  return (
    <div className="columns-2 md:columns-3 xl:columns-4 gap-3 md:gap-4 [column-fill:_balance]">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} settings={settings} />
      ))}
    </div>
  );
}

function ProductCard({ product, settings }: { product: any; settings: B2BSettings }) {
  const variants = (product.product_variants ?? []).filter((v: any) => v.active !== false);
  const prices = variants.map((v: any) => wholesalePrice(v, settings)).filter((n: number) => n > 0);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;
  const priceLabel = minPrice === maxPrice
    ? formatMoney(minPrice, settings.currency)
    : `${formatMoney(minPrice, settings.currency)} – ${formatMoney(maxPrice, settings.currency)}`;
  const restock = isRestockProduct(product);
  const stock = variants.reduce((s: number, v: any) => s + ecomAvailable(v), 0);
  const colors = [...new Set(variants.map((v: any) => v.color_hex).filter(Boolean))].slice(0, 5) as string[];

  return (
    <Link
      to="/b2b/producto/$slug"
      params={{ slug: product.slug }}
      className="group mb-3 md:mb-4 block break-inside-avoid rounded-2xl overflow-hidden bg-white border border-ink/8 hover:border-ink/20 transition-colors"
    >
      <div className="relative bg-[#f0e6d2] overflow-hidden">
        <StockBadge restock={restock} className="absolute left-2 top-2 z-10" />
        {product.hero_image_url ? (
          <img
            src={optimizedImageUrl(product.hero_image_url, 600)}
            srcSet={`${optimizedImageUrl(product.hero_image_url, 400)} 400w, ${optimizedImageUrl(product.hero_image_url, 600)} 600w, ${optimizedImageUrl(product.hero_image_url, 800)} 800w`}
            sizes="(min-width: 1024px) 25vw, 50vw"
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="w-full h-auto object-cover group-hover:scale-[1.03] transition-transform duration-500"
          />
        ) : (
          <div className="aspect-[3/4]" />
        )}
      </div>
      <div className="p-3">
        <div className="text-[13px] leading-snug">{product.name}</div>
        <div className="text-[10px] tracking-[0.14em] text-ink/45 mt-1 uppercase">{product.product_type ?? "—"}</div>
        <div className="flex items-center justify-between mt-2">
          <span className="text-[12px]">{priceLabel}</span>
          <span className="text-[10px] text-ink/45">{restock ? `${stock} disp.` : "Preventa"}</span>
        </div>
        {colors.length > 0 && (
          <div className="flex gap-1 mt-2">
            {colors.map((c) => <span key={c} className="size-3 rounded-full border border-ink/10" style={{ background: c }} />)}
          </div>
        )}
      </div>
    </Link>
  );
}
