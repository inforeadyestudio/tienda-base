// Bloques visuales de la página de producto. Claude puede editar este archivo.
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { usePrice, useLocale } from "@/lib/locale";
import { hasSalePrice } from "@/lib/product-sale";

const EASE = [0.22, 1, 0.36, 1] as const;

export function BracketCard({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ scaleY: 0.06, scaleX: 0.9, opacity: 0 }}
      animate={{ scaleY: 1, scaleX: 1, opacity: 1 }}
      transition={{ duration: 0.65, delay, ease: [0.16, 1, 0.3, 1] }}
      style={{ transformOrigin: "center" }}
      className={"relative bg-white/95 backdrop-blur-sm p-6 " + className}
    >
      {[
        "-top-[1px] -left-[1px] border-t border-l",
        "-top-[1px] -right-[1px] border-t border-r",
        "-bottom-[1px] -left-[1px] border-b border-l",
        "-bottom-[1px] -right-[1px] border-b border-r",
      ].map((c) => (
        <motion.span
          key={c}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.4, delay: delay + 0.35, ease: EASE }}
          className={"absolute w-3 h-3 border-ink/70 " + c}
        />
      ))}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: delay + 0.25, ease: EASE }}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

export function ProductRecommendationsCompact({ products }: { products: any[] }) {
  const money = usePrice();
  const { currency } = useLocale();
  if (!products.length) return null;

  return (
    <div className="border-t border-ink/10 pt-4">
      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink/55">Combínalo con</p>
      <div className="mt-3 grid grid-cols-4 gap-2.5">
        {products.slice(0, 4).map((product) => {
          const variants = (product.product_variants ?? []).filter((v: any) => v.active !== false);
          const base = variants.find((v: any) => v.price_cop === Math.min(...variants.map((v: any) => v.price_cop).filter(Boolean)));
          const onSale = hasSalePrice(base, currency);
          const price = currency === "USD" ? base?.price_usd ?? base?.price_cop : base?.price_cop;
          const compare = currency === "USD" ? base?.compare_at_usd : base?.compare_at_cop;
          return (
            <Link key={product.id} to="/producto/$slug" params={{ slug: product.slug }} className="group min-w-0">
              <div className="aspect-[4/5] overflow-hidden bg-ivory">
                {product.hero_image_url && (
                  <img
                    src={product.hero_image_url}
                    alt={product.name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                )}
              </div>
              <p className="mt-2 truncate font-nm text-[10px] uppercase text-ink/80">{product.name}</p>
              {Number.isFinite(price) && (
                <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 font-mono text-[8px] text-ink/50">
                  {onSale && <del className="decoration-1 opacity-70"><span className="sr-only">Antes: </span>{money(compare ?? 0, base?.compare_at_usd ?? null)}</del>}
                  <span>{onSale && <span className="sr-only">Ahora: </span>}{money(price, base?.price_usd ?? null)}</span>
                </p>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

