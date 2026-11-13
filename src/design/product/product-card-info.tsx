import { Link } from "@tanstack/react-router";
import { usePageBackground } from "@/components/scenes/page-background-context";
import { isDarkBackground } from "@/lib/scenes/page-theme";
import { useLocale, usePrice } from "@/lib/locale";
import { hasSalePrice } from "@/lib/product-sale";
import { cn } from "@/lib/utils";

type Props = {
  name: string;
  price: number;
  priceUsd?: number | null;
  compareCop?: number | null;
  compareUsd?: number | null;
  slug: string;
  /** Shows «Desde» when sizes have different prices. */
  priceFrom?: boolean;
  onAdd?: () => void;
  className?: string;
};

/**
 * Texto de la tarjeta de producto: nombre arriba, precio debajo y acciones
 * alineadas a la izquierda. Se comparte entre tienda, colecciones y tipos.
 * Sobre fondos de página oscuros (tinta, musgo o hex oscuro) el texto pasa a
 * marfil para seguir siendo legible.
 */
export function ProductCardInfo({ name, price, priceUsd, compareCop, compareUsd, slug, priceFrom, onAdd, className }: Props) {
  const money = usePrice();
  const { currency } = useLocale();
  const onSale = hasSalePrice({ price_cop: price, price_usd: priceUsd, compare_at_cop: compareCop, compare_at_usd: compareUsd }, currency);
  const dark = isDarkBackground(usePageBackground());
  const action = cn(
    "font-nm text-[10px] uppercase tracking-[0.2em] border-b pb-0.5 transition-colors",
    dark ? "border-ivory/40 hover:border-ivory" : "border-ink/30 hover:border-moss",
  );

  return (
    <div className={cn("flex flex-col items-start text-left", className)}>
      <Link
        to="/producto/$slug"
        params={{ slug }}
        className={cn(
          "font-nm text-[12px] md:text-[13px] uppercase tracking-[0.06em] leading-snug transition-colors",
          dark ? "text-ivory hover:text-ivory/70" : "text-ink hover:text-moss",
        )}
      >
        {name}
      </Link>
      <p className={cn("mt-1 flex flex-wrap items-baseline gap-x-2 font-nm text-[12px] md:text-[13px]", dark ? "text-ivory/75" : "text-ink/75")}>
        {onSale && <del className="opacity-60 decoration-1"><span className="sr-only">Antes: </span>{money(compareCop ?? 0, compareUsd)}</del>}
        <span>{priceFrom && "Desde "}{onSale && <span className="sr-only">Ahora: </span>}{money(price, priceUsd)}</span>
      </p>

      <div className="mt-3 flex items-center gap-4">
        <Link to="/producto/$slug" params={{ slug }} className={cn(action, dark ? "text-ivory" : "hover:text-moss")}>
          Ver
        </Link>
        {onAdd && (
          <button type="button" onClick={onAdd} className={cn(action, dark ? "text-ivory" : "hover:text-moss")}>
            Agregar
          </button>
        )}
      </div>
    </div>
  );
}
