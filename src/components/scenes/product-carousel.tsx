import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Layer, SceneContext } from "@/lib/scenes/types";
import { ProductCardInfo } from "@/components/storefront/product-card-info";
import { ProductPhoto } from "@/components/storefront/product-photo";
import { QuickAddModal } from "@/components/tienda/quick-add-modal";
import { SceneShell } from "@/components/scenes/scene-shell";
import { cn } from "@/lib/utils";
import { ProductViewToggle, useProductView } from "./product-view-toggle";
import { AutoVideo } from "@/components/media/auto-video";
import { useLocale } from "@/lib/locale";
import { hasSalePrice, priceVaries, type SaleVariant } from "@/lib/product-sale";

type P = { props: Record<string, any>; layers: Layer[]; ctx: SceneContext };

export type CarouselProduct = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  hero_image_url: string | null;
  cutout_url?: string | null;
  product_images?: Array<{ url: string; position: number }> | null;
  product_videos?: Array<{ url: string; position: number }> | null;
  product_variants?: Array<SaleVariant & { active?: boolean | null; color: string | null; color_hex: string | null }> | null;
};

/** Consulta los productos elegidos en el editor (orden respetado). */
export function selectedProductsQuery(ids: string[], preview = false) {
  return {
    queryKey: ["scene", "products", ids.join(","), preview ? "editor" : "public"],
    enabled: ids.length > 0,
    queryFn: async () => {
      let productsQuery = supabase
          .from("products")
          .select("id, slug, name, description, hero_image_url, product_images(url, position), product_videos(url, position), product_variants(price_cop, price_usd, compare_at_cop, compare_at_usd, active, color, color_hex)")
          .in("id", ids);
      if (!preview) productsQuery = productsQuery.eq("status", "published").or("available_national.eq.true,available_international.eq.true");
      const [{ data, error }, { data: cutouts }, { data: looks }] = await Promise.all([
        productsQuery,
        supabase
          .from("product_look_items")
          .select("product_id, cutout_url")
          .in("product_id", ids)
          .not("cutout_url", "is", null),
        supabase
          .from("product_looks")
          .select("product_id, board, position")
          .in("product_id", ids)
          .order("position", { ascending: true }),
      ]);
      if (error) throw error;
      const cutoutByProduct = new Map<string, string>();
      // 1) PNG base del tablero del look (pieza fija del propio producto)
      (looks ?? []).forEach((look: any) => {
        const base = look?.board?.baseCutout;
        if (look.product_id && typeof base === "string" && base && !cutoutByProduct.has(look.product_id)) {
          cutoutByProduct.set(look.product_id, base);
        }
      });
      // 2) PNG guardado en piezas del look
      (cutouts ?? []).forEach((item) => {
        if (item.product_id && item.cutout_url && !cutoutByProduct.has(item.product_id)) {
          cutoutByProduct.set(item.product_id, item.cutout_url);
        }
      });
      const map = new Map((data ?? []).map((p: any) => [p.id, { ...p, cutout_url: cutoutByProduct.get(p.id) ?? null }]));
      return ids.map((id) => map.get(id)).filter(Boolean) as CarouselProduct[];

    },
  };
}

function imagesOf(p: CarouselProduct) {
  const gallery = [...(p.product_images ?? [])].sort((a, b) => a.position - b.position).map((i) => i.url);
  const all = [p.hero_image_url, ...gallery].filter(Boolean) as string[];
  return Array.from(new Set(all));
}

function ProductCell({ product, badge, onAdd }: { product: CarouselProduct; badge?: string; onAdd?: (id: string) => void }) {
  const images = imagesOf(product);
  const [index, setIndex] = useState(0);
  const [hover, setHover] = useState(false);
  const coverVideo = product.product_videos?.find((video) => video.position === -1)?.url;
  const hoverVideo = product.product_videos?.find((video) => video.position === 0)?.url;
  const colors = useMemo(() => {
    const seen = new Map<string, string>();
    (product.product_variants ?? []).forEach((v) => {
      if (v.color_hex && !seen.has(v.color_hex)) seen.set(v.color_hex, v.color ?? "");
    });
    return Array.from(seen.entries());
  }, [product.product_variants]);
  const { currency } = useLocale();
  const variant = (product.product_variants ?? [])
    .filter((v) => v.active !== false)
    .reduce<(SaleVariant & { active?: boolean | null }) | undefined>((lowest, v) => {
      const value = currency === "USD" ? v.price_usd : v.price_cop;
      const previous = currency === "USD" ? lowest?.price_usd : lowest?.price_cop;
      return typeof value === "number" && value > 0 && (typeof previous !== "number" || value < previous) ? v : lowest;
    }, undefined);
  const onSale = hasSalePrice(variant, currency);
  const go = (dir: number) => setIndex((i) => (i + dir + images.length) % Math.max(images.length, 1));

  return (
    <div className="group relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      {onSale ? (
        <span className="absolute z-10 left-3 top-3 bg-destructive px-2 py-1 font-nm text-[9px] uppercase tracking-[0.2em] text-destructive-foreground">Sale</span>
      ) : badge && (
        <span className="absolute z-10 top-4 left-4 font-nm text-[10px] uppercase tracking-[0.2em] opacity-70">{badge}</span>
      )}
      {colors.length > 0 && (
        <div className="absolute z-10 top-4 right-4 hidden md:flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {colors.slice(0, 5).map(([hex, name]) => (
            <span key={hex} title={name} className="size-3.5 border border-ink/15" style={{ background: hex }} />
          ))}
          {colors.length > 5 && <span className="text-[11px] opacity-70 ml-1">+ {colors.length - 5} colores</span>}
        </div>
      )}

      <Link to="/producto/$slug" params={{ slug: product.slug }} className="block relative aspect-[4/5] overflow-hidden bg-cream">
        {images.map((url, i) => i === index && (
          <ProductPhoto
            key={url}
            src={url}
            alt={product.name}
            loading="lazy"
            decoding="async"
            sizes="(max-width: 767px) 62vw, 36vw"
            className={cn(
              "absolute inset-0 w-full h-full object-cover transition-opacity duration-500",
              i === index ? "opacity-100" : "opacity-0",
            )}
          />
        ))}
        {coverVideo && !(hover && hoverVideo) ? (
          <AutoVideo src={coverVideo} className="absolute inset-0 h-full w-full object-cover" />
        ) : hover && hoverVideo ? (
          <AutoVideo src={hoverVideo} priority className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
      </Link>

      {images.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Anterior"
            onClick={() => go(-1)}
            className="absolute left-2 top-[40%] -translate-y-1/2 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:-translate-x-0.5"
          >
            <ChevronLeft className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Siguiente"
            onClick={() => go(1)}
            className="absolute right-2 top-[40%] -translate-y-1/2 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity hover:translate-x-0.5"
          >
            <ChevronRight className="size-5" />
          </button>
        </>
      )}

      <ProductCardInfo
        name={product.name}
        price={variant?.price_cop ?? 0}
        priceUsd={variant?.price_usd}
        compareCop={variant?.compare_at_cop}
        compareUsd={variant?.compare_at_usd}
        slug={product.slug}
        priceFrom={priceVaries(product.product_variants, currency)}
        onAdd={onAdd ? () => onAdd(product.id) : undefined}
        className="pt-3"
      />
    </div>
  );
}

export function ProductCarouselScene({ props, ctx }: P) {
  const ids: string[] = Array.isArray(props.productIds) ? props.productIds : [];
  const { data } = useQuery(selectedProductsQuery(ids) as any);
  const items = (ids.length ? ((data as CarouselProduct[]) ?? []) : (ctx.products as CarouselProduct[]).slice(0, 8)) ?? [];
  const [quickId, setQuickId] = useState<string | null>(null);
  const { view, canSwitch, setView } = useProductView(props.view || (props.focusMode ? "focus" : "grid"));
  const cols =
    props.columns === "2" ? "grid-cols-2" : props.columns === "3" ? "grid-cols-2 md:grid-cols-3" : "grid-cols-2 md:grid-cols-4";
  const gap = props.gap === "none" ? "gap-0" : props.gap === "sm" ? "gap-2" : "gap-6";
  const onAdd = (id: string) => setQuickId(id);

  return (
    <SceneShell props={{ ...props, anim: "none", space: "sm" }}>
      {props.title && (
        <div className="px-4 md:px-8 pb-6">
          <h2 className="font-serif italic text-4xl md:text-5xl">{props.title}</h2>
        </div>
      )}
      {canSwitch && <div className="px-4 md:px-8"><ProductViewToggle view={view} onChange={setView} /></div>}
      {view === "focus" ? (
        <FocusTrack items={items} badge={props.badge} onAdd={onAdd} />
      ) : view === "carousel" ? (
        <CarouselTrack items={items} badge={props.badge} onAdd={onAdd} />
      ) : (
        <div className={cn("grid", cols, gap, props.width === "contained" && "max-w-[1600px] mx-auto px-4 md:px-8")}>
          {items.map((p, i) => (
            <ProductCell key={p.id} product={p} badge={props.badge && i % 3 === 0 ? props.badge : undefined} onAdd={onAdd} />
          ))}
        </div>
      )}
      <QuickAddModal productId={quickId ?? ""} open={!!quickId} onClose={() => setQuickId(null)} />
    </SceneShell>
  );
}

/** Carrusel simple: tarjetas iguales que se deslizan en una sola fila. */
function CarouselTrack({ items, badge, onAdd }: { items: CarouselProduct[]; badge?: string; onAdd?: (id: string) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const go = (dir: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.6, 240), behavior: "smooth" });
  };

  return (
    <div className="relative">
      <div
        ref={trackRef}
        className="flex gap-4 md:gap-6 overflow-x-auto snap-x snap-mandatory px-4 md:px-8 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((p, i) => (
          <div key={p.id} className="snap-start shrink-0 w-[62vw] md:w-[24vw] max-w-[420px]">
            <ProductCell product={p} badge={badge && i === 0 ? badge : undefined} onAdd={onAdd} />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-center gap-4 pt-6">
        <button type="button" aria-label="Anterior" onClick={() => go(-1)} className="p-2 hover:-translate-x-0.5 transition-transform">
          <ChevronLeft className="size-5" />
        </button>
        <button type="button" aria-label="Siguiente" onClick={() => go(1)} className="p-2 hover:translate-x-0.5 transition-transform">
          <ChevronRight className="size-5" />
        </button>
      </div>
    </div>
  );
}

/** Carrusel horizontal: la pieza centrada queda enfocada, el resto desenfocado. */
function FocusTrack({ items, badge, onAdd }: { items: CarouselProduct[]; badge?: string; onAdd?: (id: string) => void }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const measure = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const center = el.scrollLeft + el.clientWidth / 2;
    let best = 0;
    let bestDist = Infinity;
    Array.from(el.children).forEach((child, i) => {
      const c = child as HTMLElement;
      const mid = c.offsetLeft + c.offsetWidth / 2;
      const d = Math.abs(mid - center);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    });
    setActive(best);
  }, []);

  useEffect(() => {
    measure();
    const el = trackRef.current;
    if (!el) return;
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [measure, items.length]);

  const goTo = useCallback((i: number) => {
    const el = trackRef.current;
    if (!el) return;
    const child = el.children[Math.max(0, Math.min(items.length - 1, i))] as HTMLElement | undefined;
    if (!child) return;
    el.scrollTo({ left: child.offsetLeft - (el.clientWidth - child.offsetWidth) / 2, behavior: "smooth" });
  }, [items.length]);

  return (
    <div
      role="region"
      aria-label="Carrusel de productos"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") { e.preventDefault(); goTo(active + 1); }
        if (e.key === "ArrowLeft") { e.preventDefault(); goTo(active - 1); }
      }}
      className="relative outline-none"
    >
      <div
        ref={trackRef}
        className="flex gap-4 md:gap-8 overflow-x-auto snap-x snap-mandatory scroll-smooth px-[25vw] md:px-[32vw] pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items.map((p, i) => (
          <div
            key={p.id}
            onClick={() => i !== active && goTo(i)}
            className={cn(
              "snap-center shrink-0 w-[50vw] md:w-[36vw] max-w-[520px] transition-all duration-500 ease-out",
              i === active
                ? "opacity-100 blur-0 scale-100"
                : "opacity-50 blur-[3px] scale-[0.9] cursor-pointer",
            )}
          >
            <ProductCell product={p} badge={badge && i === active ? badge : undefined} onAdd={onAdd} />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center gap-4 pb-10">
        <button type="button" aria-label="Anterior" onClick={() => goTo(active - 1)} className="p-2 hover:-translate-x-0.5 transition-transform">
          <ChevronLeft className="size-5" />
        </button>
        <span className="font-nm text-[11px] tracking-[0.2em] opacity-60 tabular-nums">
          {String(active + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
        </span>
        <button type="button" aria-label="Siguiente" onClick={() => goTo(active + 1)} className="p-2 hover:translate-x-0.5 transition-transform">
          <ChevronRight className="size-5" />
        </button>
      </div>
    </div>
  );
}
