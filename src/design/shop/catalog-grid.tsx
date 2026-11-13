import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ProductCardInfo } from "@/components/storefront/product-card-info";
import { ProductPhoto } from "@/components/storefront/product-photo";
import { FavoriteButton } from "@/components/storefront/favorite-button";
import { QuickAddModal } from "@/components/tienda/quick-add-modal";
import { ProductViewToggle } from "@/components/scenes/product-view-toggle";
import { TryOnModal } from "@/components/tryon/try-on-modal";
import { tryOnSettingsQuery } from "@/lib/tryon/settings";
import { productLooksQuery } from "@/lib/queries";
import { LOOK_SLOTS, normalizeFit, slotFromType, type LookSlot } from "@/lib/looks/board";
import { useSession } from "@/lib/auth-hooks";
import { cn } from "@/lib/utils";
import { useLocale } from "@/lib/locale";
import { hasSalePrice, priceVaries, type SaleVariant } from "@/lib/product-sale";

export type CatalogItem = {
  id: string;
  slug: string;
  name: string;
  hero_image_url: string | null;
  product_type?: string | null;
  product_variants: Array<SaleVariant & { id?: string; size?: string | null; active?: boolean | null }> | null;
};

const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "U", "UNICA", "ÚNICA"];
const sizeRank = (s: string) => {
  const i = SIZE_ORDER.indexOf(s.toUpperCase());
  if (i >= 0) return i;
  const n = Number(s);
  return Number.isFinite(n) ? 100 + n : 500;
};

type TryOnTarget = { id: string; name: string; image: string | null; slot: LookSlot; fit: ReturnType<typeof normalizeFit> };

/**
 * Catálogo de páginas de tipo de prenda y colección: vista en dos columnas o
 * carrusel, filtro por talla, favorito y botón para abrir el probador virtual.
 */
export function CatalogGrid({ items, typeLabel }: { items: CatalogItem[]; typeLabel?: string }) {
  const [view, setView] = useState<"grid" | "carousel">("grid");
  const [sizes, setSizes] = useState<string[]>([]);
  const [quickId, setQuickId] = useState<string | null>(null);
  const [tryOn, setTryOn] = useState<TryOnTarget | null>(null);
  const { user } = useSession();
  const qc = useQueryClient();
  const { data: tryOnSettings } = useQuery(tryOnSettingsQuery());
  const canTryOn = Boolean(tryOnSettings?.enabled && (user || tryOnSettings.guestEnabled));

  const allSizes = useMemo(() => {
    const set = new Set<string>();
    items.forEach((p) => p.product_variants?.forEach((v) => v.size && v.active !== false && set.add(v.size)));
    return Array.from(set).sort((a, b) => sizeRank(a) - sizeRank(b));
  }, [items]);

  const shown = useMemo(
    () =>
      sizes.length
        ? items.filter((p) => p.product_variants?.some((v) => v.active !== false && v.size && sizes.includes(v.size)))
        : items,
    [items, sizes],
  );

  const openTryOn = async (p: CatalogItem) => {
    const looks = ((await qc.fetchQuery(productLooksQuery(p.id)).catch(() => [])) ?? []) as any[];
    const boards = looks.map((l) => (l.board ?? {}) as any);
    const b = boards.find((x) => x.baseCutout) ?? boards[0] ?? {};
    const slot = (LOOK_SLOTS as readonly string[]).includes(b.baseSlot)
      ? (b.baseSlot as LookSlot)
      : slotFromType(p.product_type ?? p.name);
    setTryOn({ id: p.id, name: p.name, image: b.baseCutout ?? p.hero_image_url, slot, fit: normalizeFit(b.baseFit) });
  };

  if (!items.length) return <p className="text-sm text-moss/60">Muy pronto nuevas piezas aquí.</p>;

  const card = (p: CatalogItem) => (
    <CatalogCard
      key={p.id}
      p={p}
      tryLabel={canTryOn ? `Probar ${(typeLabel ?? p.product_type ?? "prenda").toLowerCase()}` : null}
      onAdd={() => setQuickId(p.id)}
      onTry={() => openTryOn(p)}
    />
  );

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center gap-x-6 gap-y-3">
        <ProductViewToggle view={view} onChange={setView} />
        {allSizes.length > 0 && (
          <div className="mb-5 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-nm text-[10px] uppercase tracking-[0.2em] text-ink/55">Talla</span>
            {allSizes.map((s) => {
              const on = sizes.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setSizes(on ? sizes.filter((x) => x !== s) : [...sizes, s])}
                  className={cn(
                    "min-w-9 border px-2 py-1.5 font-nm text-[11px] uppercase transition-colors",
                    on ? "border-ink/30 bg-cream text-ink" : "border-ink/15 text-ink/70 hover:border-ink/40",
                  )}
                >
                  {s}
                </button>
              );
            })}
            {sizes.length > 0 && (
              <button type="button" onClick={() => setSizes([])} className="ml-1 font-nm text-[10px] uppercase tracking-[0.2em] text-ink/55 underline underline-offset-4">
                Limpiar
              </button>
            )}
          </div>
        )}
      </div>

      {!shown.length ? (
        <p className="text-sm text-moss/60">No hay piezas en esa talla por ahora.</p>
      ) : view === "carousel" ? (
        <Carousel>{shown.map(card)}</Carousel>
      ) : (
        <div className="grid grid-cols-2 gap-x-6 gap-y-14 md:grid-cols-3">{shown.map(card)}</div>
      )}

      <QuickAddModal productId={quickId ?? ""} open={!!quickId} onClose={() => setQuickId(null)} />
      {tryOn && (
        <TryOnModal
          open
          onClose={() => setTryOn(null)}
          productId={tryOn.id}
          productName={tryOn.name}
          productImage={tryOn.image ?? ""}
          garmentSlot={tryOn.slot}
          garmentFit={tryOn.fit}
        />
      )}
    </>
  );
}

function CatalogCard({ p, tryLabel, onAdd, onTry }: { p: CatalogItem; tryLabel: string | null; onAdd: () => void; onTry: () => void }) {
  const active = p.product_variants?.find((v) => v.active !== false) ?? p.product_variants?.[0];
  const { currency } = useLocale();
  const onSale = hasSalePrice(active, currency);
  return (
    <div className="group relative block">
      <Link to="/producto/$slug" params={{ slug: p.slug }} className="block">
        <div className="relative aspect-[4/5] overflow-hidden bg-cream">
          {p.hero_image_url && (
            <ProductPhoto
              src={p.hero_image_url}
              alt={p.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
            />
          )}
          {onSale && (
            <span className="absolute left-3 top-3 bg-destructive px-2 py-1 font-nm text-[9px] uppercase tracking-[0.2em] text-destructive-foreground">Sale</span>
          )}
        </div>
      </Link>
      <div className="absolute right-3 top-3">
        <FavoriteButton variantId={active?.id ?? null} tone="light" />
      </div>
      <ProductCardInfo name={p.name} price={active?.price_cop ?? 0} priceUsd={active?.price_usd} compareCop={active?.compare_at_cop} compareUsd={active?.compare_at_usd} slug={p.slug} priceFrom={priceVaries(p.product_variants, currency)} onAdd={onAdd} className="pt-2" />
      {tryLabel && (
        <button
          type="button"
          onClick={onTry}
          className="mt-3 font-nm text-[10px] uppercase tracking-[0.2em] border-b border-ink/30 pb-0.5 transition-colors hover:border-moss hover:text-moss"
        >
          {tryLabel}
        </button>
      )}
    </div>
  );
}

function Carousel({ children }: { children: React.ReactNode[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const go = (d: number) => ref.current?.scrollBy({ left: d * Math.max(ref.current.clientWidth * 0.6, 240), behavior: "smooth" });
  return (
    <div>
      <div ref={ref} className="-mx-6 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2 md:gap-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children.map((c, i) => (
          <div key={i} className="w-[62vw] max-w-[420px] shrink-0 snap-start md:w-[28vw]">{c}</div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-4 pt-6">
        <button type="button" aria-label="Anterior" onClick={() => go(-1)} className="p-2"><ChevronLeft className="size-5" /></button>
        <button type="button" aria-label="Siguiente" onClick={() => go(1)} className="p-2"><ChevronRight className="size-5" /></button>
      </div>
    </div>
  );
}
