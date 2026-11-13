import { Link } from "@tanstack/react-router";
import { sizeLabel, displaySize, compareSizes } from "@/lib/size-order";
import { SceneFilterSelect } from "./scene-filters";
import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { storesQuery } from "@/lib/stores";
import { productTypesQuery } from "@/lib/product-types";
import { selectedProductsQuery, type CarouselProduct } from "./product-carousel";
import { CatalogBannerCell, interleaveBanners, type CatalogBanner } from "./catalog-banners";
import { catalogQuery, salesRankQuery, collectionProductOrderQuery, type ShopProduct } from "@/lib/tienda/catalog";
import { collectionWithProductsQuery, publishedExperienceQuery } from "@/lib/scenes/data";
import { catalogOrderIds } from "@/lib/scenes/catalog-order";
import { useLocale } from "@/lib/locale";
import { hasSalePrice } from "@/lib/product-sale";
import { SceneShell, Media, isVideo } from "./scene-shell";
import { AutoVideo } from "@/components/media/auto-video";
import { QuickAddModal } from "@/components/tienda/quick-add-modal";
import { ProductCardInfo } from "@/components/storefront/product-card-info";
import { ProductPhoto } from "@/components/storefront/product-photo";
import { formatCOP } from "@/lib/format";
import type { Layer, SceneContext } from "@/lib/scenes/types";
import { cn } from "@/lib/utils";
import { ProductViewToggle, useProductView } from "./product-view-toggle";

type P = { props: Record<string, any>; layers: Layer[]; ctx: SceneContext };

const ALIGN: Record<string, string> = {
  left: "text-left items-start",
  center: "text-center items-center",
  right: "text-right items-end",
};

/* ---------------- Hero editorial ---------------- */
export function HeroScene({ props, ctx }: P) {
  const title = props.title || ctx.collection.title;
  const media = props.media || ctx.collection.cover_url;
  const height = props.height === "full" ? "min-h-[92vh]" : props.height === "short" ? "min-h-[55vh]" : "min-h-[75vh]";
  return (
    <section className={cn("relative w-full overflow-hidden", height, props.hideOnMobile && "hidden md:block")}>
      <Media url={media} alt={title} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 bg-ink" style={{ opacity: Number(props.overlay ?? 0.25) }} />
      <div className={cn("relative h-full min-h-inherit flex flex-col justify-end px-6 md:px-12 pb-16", ALIGN[props.align ?? "left"], height)}>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="font-nm text-[10px] uppercase tracking-[0.3em] text-ivory/70"
        >
          {props.eyebrow || "Colección"}
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="font-serif italic text-ivory text-6xl md:text-[9vw] leading-[0.9] mt-3"
        >
          {title}
        </motion.h1>
        {props.subtitle && (
          <p className="mt-6 max-w-md text-ivory/80 text-sm md:text-base">{props.subtitle}</p>
        )}
      </div>
    </section>
  );
}

/* ---------------- Imagen + texto ---------------- */
export function ImageTextScene({ props, ctx }: P) {
  const reverse = props.side === "right";
  const productId = String(props.productId ?? "");
  const { data: picked } = useQuery(selectedProductsQuery(productId ? [productId] : []) as any);
  const product = productId
    ? (((picked as CarouselProduct[] | undefined)?.[0] ?? ctx.products.find((item) => item.id === productId)) as CarouselProduct | undefined)
    : undefined;
  const ctaHref = product ? `/producto/${product.slug}` : props.ctaHref;
  return (
    <SceneShell props={props}>
      <div className={cn("grid md:grid-cols-2 gap-10 md:gap-16 items-center", reverse && "md:[direction:rtl]")}>
        <div className={cn("overflow-hidden", props.ratio === "square" ? "aspect-square" : props.ratio === "wide" ? "aspect-[4/3]" : "aspect-[3/4]")}>
          <Media url={props.media} alt={props.title} className="w-full h-full object-cover" />
        </div>
        <div className="[direction:ltr]">
          {props.eyebrow && <p className="font-nm text-[10px] uppercase tracking-[0.3em] opacity-60">{props.eyebrow}</p>}
          <h2 className="font-serif italic text-4xl md:text-6xl leading-[1.05] mt-3">{props.title}</h2>
          {props.body && <p className="mt-6 text-sm md:text-base opacity-75 max-w-md whitespace-pre-line">{props.body}</p>}
          {props.ctaLabel && ctaHref && (
            <a href={ctaHref} className="inline-block mt-8 font-nm text-[10px] uppercase tracking-[0.3em] border-b border-current pb-1">
              {props.ctaLabel}
            </a>
          )}
        </div>
      </div>
    </SceneShell>
  );
}

/* ---------------- Galería horizontal ---------------- */
export function GalleryHScene({ props }: P) {
  const items: string[] = props.media ?? [];
  return (
    <SceneShell props={{ ...props, width: "full" }}>
      {props.title && <h2 className="font-serif italic text-4xl md:text-5xl px-6 mb-8">{props.title}</h2>}
      <div className="flex gap-4 overflow-x-auto px-6 pb-4 snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((url, i) => (
          <div key={i} className="snap-start shrink-0 w-[72vw] md:w-[38vw] aspect-[3/4] overflow-hidden">
            <Media url={url} className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
    </SceneShell>
  );
}

/* ---------------- Galería vertical ---------------- */
export function GalleryVScene({ props }: P) {
  const items: string[] = props.media ?? [];
  return (
    <SceneShell props={props}>
      <div className={cn("grid gap-6", props.columns === "1" ? "grid-cols-1" : props.columns === "3" ? "grid-cols-2 md:grid-cols-3" : "grid-cols-1 md:grid-cols-2")}>
        {items.map((url, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.7, delay: (i % 3) * 0.08 }}
            className={cn("overflow-hidden", i % 3 === 1 ? "aspect-[4/5] md:translate-y-10" : "aspect-[3/4]")}
          >
            <Media url={url} className="w-full h-full object-cover" />
          </motion.div>
        ))}
      </div>
    </SceneShell>
  );
}

/* ---------------- Texto manifiesto ---------------- */
export function ManifestoScene({ props }: P) {
  return (
    <SceneShell props={props} className={cn("flex flex-col", ALIGN[props.align ?? "center"])}>
      {props.eyebrow && <p className="font-nm text-[10px] uppercase tracking-[0.3em] opacity-60 mb-6">{props.eyebrow}</p>}
      <p className={cn("font-serif italic max-w-4xl leading-[1.08]", props.size === "xl" ? "text-5xl md:text-8xl" : props.size === "sm" ? "text-2xl md:text-4xl" : "text-4xl md:text-6xl")}>
        {props.body}
      </p>
      {props.signature && <p className="mt-8 font-nm text-[10px] uppercase tracking-[0.3em] opacity-60">{props.signature}</p>}
    </SceneShell>
  );
}

/* ---------------- Marquee ---------------- */
export function MarqueeScene({ props }: P) {
  const text = props.text || "Tu Marca";
  const items = Array.from({ length: 8 }, () => text);
  const duration = Number(props.speed ?? 24);
  return (
    <section className={cn(props.bg === "ink" ? "bg-ink text-ivory" : props.bg === "moss" ? "bg-moss text-ivory" : props.bg === "cream" ? "bg-cream" : "bg-ivory", "overflow-hidden py-6 border-y border-current/10")}>
      <motion.div
        className="flex gap-10 whitespace-nowrap will-change-transform"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration, ease: "linear", repeat: Infinity }}
      >
        {[...items, ...items].map((t, i) => (
          <span key={i} className="font-serif italic text-4xl md:text-7xl opacity-90">
            {t} <span className="opacity-30">·</span>
          </span>
        ))}
      </motion.div>
    </section>
  );
}

/* ---------------- Video fullscreen ---------------- */
type BannerModalKind = "products" | "stores" | "collections" | "categories" | "story";

const BANNER_MODAL_TITLES: Record<BannerModalKind, string> = {
  products: "Productos",
  stores: "Visítanos",
  collections: "Universo",
  categories: "Categorías",
  story: "Our World",
};

function BannerLinkModal({ kind, props, onClose }: { kind: BannerModalKind; props: Record<string, any>; onClose: () => void }) {
  const productsQuery = useQuery({
    queryKey: ["banner-modal", "products"],
    enabled: kind === "products",
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, slug, name, hero_image_url, product_variants(price_cop)")
        .eq("status", "published")
         .or("available_national.eq.true,available_international.eq.true")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw error;
      return data ?? [];
    },
  });
  const stores = useQuery({ ...storesQuery(), enabled: kind === "stores" });
  const productTypes = useQuery({ ...productTypesQuery(), enabled: kind === "categories" });
  const collectionsQuery = useQuery({
    queryKey: ["banner-modal", "collections"],
    enabled: kind === "collections",
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collections")
        .select("id, slug, title, cover_url")
        .eq("status", "published")
        .eq("is_page", false)
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data ?? [];
    },
  });

  const title = kind === "story" && props.storyModalTitle ? props.storyModalTitle : BANNER_MODAL_TITLES[kind];
  const isStory = kind === "story";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn("relative flex items-center px-6 pt-5 pb-4 md:px-10", isStory ? "justify-center" : "justify-between")}>
        <p className={cn("font-brown-sugar text-2xl md:text-3xl text-ink", isStory && "text-center")}>{title}</p>
        <button type="button" onClick={onClose} aria-label="Cerrar" className={cn("grid size-9 place-items-center rounded-full border border-ink/15 text-ink transition-colors hover:bg-ink/5", isStory && "absolute right-6 top-5 md:right-10")}>
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 md:px-10 md:pb-8">
        {kind === "products" && (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3">
              {(productsQuery.data ?? []).map((p: any) => {
                const prices = (p.product_variants ?? []).map((v: any) => Number(v.price_cop ?? 0)).filter((n: number) => n > 0);
                const price = prices.length ? Math.min(...prices) : 0;
                return (
                  <Link key={p.id} to="/producto/$slug" params={{ slug: p.slug }} onClick={onClose} className="group block">
                    <div className="aspect-[3/4] overflow-hidden bg-ivory">
                      {p.hero_image_url && <img src={p.hero_image_url} alt={p.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}
                    </div>
                    <p className="mt-2 text-center font-nm text-[10px] uppercase tracking-[0.18em] text-ink/80">{p.name}</p>
                    {price > 0 && <p className="text-center font-nm text-[10px] text-ink/50">{formatCOP(price)}</p>}
                  </Link>
                );
              })}
            </div>
            <div className="mt-6 text-center">
              <Link to="/tienda" onClick={onClose} className="inline-block border border-ink/25 px-8 py-3 font-nm text-[10px] uppercase tracking-[0.25em] text-ink transition-colors hover:bg-ink hover:text-ivory">
                Ver tienda
              </Link>
            </div>
          </>
        )}
        {kind === "stores" && (
          <>
            <div className="grid gap-6 md:grid-cols-2">
              {(stores.data ?? []).filter((s) => s.visible).map((s) => (
                <div key={s.location_id} className="overflow-hidden border border-ink/10">
                  {s.photo_url && (
                    <div className="aspect-[16/9] overflow-hidden bg-ivory">
                      <img src={s.photo_url} alt={s.name} loading="lazy" className="h-full w-full object-cover" />
                    </div>
                  )}
                  <div className="p-4">
                    <p className="font-serif text-xl text-ink">{s.name}</p>
                    <p className="mt-1 text-xs text-ink/60">{[s.address, s.city].filter(Boolean).join(", ")}</p>
                    {s.hours_note && <p className="mt-1 text-xs text-ink/60">{s.hours_note}</p>}
                    {s.phone && <p className="mt-1 text-xs text-ink/60">{s.phone}</p>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
        {kind === "collections" && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              {(collectionsQuery.data ?? []).map((c: any) => (
                <Link key={c.id} to="/coleccion/$slug" params={{ slug: c.slug }} onClick={onClose} className="group block">
                  <div className="aspect-[3/4] overflow-hidden bg-ivory">
                    {c.cover_url && <img src={c.cover_url} alt={c.title} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}
                  </div>
                  <p className="mt-2 text-center font-nm text-[10px] uppercase tracking-[0.18em] text-ink/80">{c.title}</p>
                </Link>
              ))}
            </div>
            <div className="mt-6 text-center">
              <Link to="/coleccion/$slug" params={{ slug: "todo" }} onClick={onClose} className="inline-block border border-ink/25 px-8 py-3 font-nm text-[10px] uppercase tracking-[0.25em] text-ink transition-colors hover:bg-ink hover:text-ivory">
                Ver colecciones
              </Link>
            </div>
          </>
        )}
        {kind === "categories" && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 lg:grid-cols-4">
            {(productTypes.data ?? []).filter((category) => category.active).map((category) => (
              <div key={category.id} className="text-center">
                <Link to="/tipo/$slug" params={{ slug: category.slug }} onClick={onClose} className="group block">
                  <div className="aspect-[3/4] overflow-hidden bg-ivory">
                    {category.cover_url && <img src={category.cover_url} alt={category.name} loading="lazy" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />}
                  </div>
                  <p className="mt-3 font-nm text-[11px] uppercase text-ink">{category.name}</p>
                  <span className="mt-2 inline-block border-b border-ink/35 pb-1 font-nm text-[9px] uppercase text-ink/65 transition-colors group-hover:border-ink group-hover:text-ink">
                    Ver categoría
                  </span>
                </Link>
              </div>
            ))}
          </div>
        )}
        {kind === "story" && (
          <div className="mx-auto max-w-xl py-4 text-center">
            <p className="whitespace-pre-line font-serif text-lg leading-relaxed text-ink/85 md:text-xl">
              {props.storyModalText || ""}
            </p>
            <Link to="/our-world" onClick={onClose} className="mt-8 inline-block border border-ink/25 px-8 py-3 font-nm text-[10px] uppercase tracking-[0.25em] text-ink transition-colors hover:bg-ink hover:text-ivory">
              Leer más
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export function VideoScene({ props }: P) {
  const [openModal, setOpenModal] = useState<BannerModalKind | null>(null);

  const links = [1, 2, 3, 4]
    .map((index) => ({
      label: String(props[`link${index}Label`] ?? "").trim(),
      href: String(props[`link${index}Href`] ?? "").trim(),
      modal: String(props[`link${index}Modal`] ?? "").trim() as "" | BannerModalKind,
    }))
    .filter((item) => item.label);

  const linkContent = (item: { label: string }, index: number) => (
    <>
      <span className="text-[9px] opacity-70 md:text-[11px]">{String(index + 1).padStart(2, "0")}</span>
      <span className="truncate">{item.label}</span>
    </>
  );

  return (
    <section className={cn("relative w-full overflow-hidden bg-ink text-ivory", props.height === "full" ? "h-[86svh] min-h-[28rem] md:h-[calc(100svh-5rem)] md:max-h-[46rem]" : "aspect-video max-h-[calc(100svh-5rem)] min-h-[26rem]", props.hideOnMobile && "hidden md:block")}>
      <div className="absolute inset-0">
        {isVideo(props.media) ? (
          <AutoVideo src={props.media} className="w-full h-full object-cover" poster={props.poster || undefined} />
        ) : (
          <Media url={props.media || props.poster} alt={props.title || props.caption || "Banner editorial"} className="w-full h-full object-cover" />
        )}
      </div>
      <div className="absolute inset-0 bg-ink/30" />

      <div className="absolute inset-0 flex flex-col px-5 pb-5 pt-6 md:px-8 md:pb-6 md:pt-8">
        {props.caption && <p className="font-nm text-[10px] uppercase tracking-[0.18em] text-ivory/80">{props.caption}</p>}
        <div className="mt-auto">
          {props.title && (
            <h2 className="max-w-[14ch] whitespace-pre-line font-brown-sugar text-[clamp(3.5rem,9vw,8rem)] normal-case leading-[0.9] text-ivory">
              {props.title}
            </h2>
          )}

          {links.length > 0 && (
            <nav aria-label={props.title ? `Enlaces de ${props.title}` : "Enlaces del banner"} className="mt-3 grid grid-cols-2 border-t border-ivory/45 md:mt-4 md:grid-cols-4">

              {links.map((item, index) => {
                const classes = "grid min-w-0 cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-center gap-3 border-b border-ivory/30 py-2.5 pr-4 text-left font-nm text-[10px] uppercase tracking-[0.06em] text-ivory transition-colors hover:bg-ivory/10 md:border-b-0 md:py-3.5 md:text-[13px]";
                if (item.modal) {
                  return (
                    <button key={`${item.label}-${index}`} type="button" onClick={() => setOpenModal(item.modal as BannerModalKind)} className={classes}>
                      {linkContent(item, index)}
                    </button>
                  );
                }
                if (!item.href) return <span key={`${item.label}-${index}`} className={classes}>{linkContent(item, index)}</span>;
                if (/^(https?:|mailto:)/.test(item.href)) {
                  return <a key={`${item.label}-${index}`} href={item.href} target="_blank" rel="noreferrer" className={classes}>{linkContent(item, index)}</a>;
                }
                return <Link key={`${item.label}-${index}`} to={item.href as any} className={classes}>{linkContent(item, index)}</Link>;
              })}
            </nav>
          )}
        </div>
      </div>

      <AnimatePresence>
        {openModal && (
          <div className="fixed inset-0 z-[90]">
            <motion.button
              type="button"
              aria-label="Cerrar"
              className="absolute inset-0 bg-ink/60"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpenModal(null)}
            />
            <motion.div
              className="absolute inset-x-0 bottom-0 flex max-h-[85svh] w-full flex-col overflow-hidden rounded-t-2xl bg-shell shadow-2xl"
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
            >
              <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-ink/15" />
              <BannerLinkModal kind={openModal} props={props} onClose={() => setOpenModal(null)} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}

/* ---------------- Productos de la colección ---------------- */
type DisplayProduct = { id: string; slug: string; name: string; image: string | null; images: string[]; price: number; priceUsd?: number | null; compareCop?: number | null; compareUsd?: number | null; created_at: string };

/** PNG recortados y videos por producto, para las tarjetas de la sección Productos. */
function useProductExtraMedia(ids: string[], kind: string) {
  const key = ids.slice().sort().join(",");
  return useQuery({
    queryKey: ["scene", "product-extra-media", kind, key],
    enabled: (kind === "png" || kind === "video") && ids.length > 0,
    queryFn: async () => {
      const map: Record<string, string> = {};
      if (kind === "png") {
        const [{ data: looks }, { data: items }] = await Promise.all([
          supabase
            .from("product_looks")
            .select("product_id, board, position")
            .in("product_id", ids)
            .order("position", { ascending: true }),
          supabase
            .from("product_look_items")
            .select("product_id, cutout_url")
            .in("product_id", ids)
            .not("cutout_url", "is", null),
        ]);
        // El PNG principal se guarda en el tablero de Looks como baseCutout.
        for (const row of (looks ?? []) as any[]) {
          const cutout = row?.board?.baseCutout;
          if (row.product_id && typeof cutout === "string" && cutout && !map[row.product_id]) {
            map[row.product_id] = cutout;
          }
        }
        // Las piezas adicionales mantienen cutout_url como respaldo.
        for (const row of (items ?? []) as any[]) {
          if (row.product_id && row.cutout_url && !map[row.product_id]) map[row.product_id] = row.cutout_url;
        }
      } else {
        const { data } = await supabase
          .from("product_videos")
          .select("product_id, url, position")
          .in("product_id", ids)
          .order("position", { ascending: true });
        for (const row of (data ?? []) as any[]) {
          if (row.product_id && row.url && !map[row.product_id]) map[row.product_id] = row.url;
        }
      }
      return map;
    },
  });
}

type ProductSlotVideos = { cover?: string; hover?: string };

function useProductSlotVideos(ids: string[]) {
  return useQuery({
    queryKey: ["scene", "product-slot-videos", ids.join(",")],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, ProductSlotVideos>> => {
      const { data, error } = await supabase
        .from("product_videos")
        .select("product_id, url, position")
        .in("product_id", ids)
        .in("position", [-1, 0]);
      if (error) throw error;
      const map: Record<string, ProductSlotVideos> = {};
      for (const row of data ?? []) {
        const entry = map[row.product_id] ?? {};
        if (row.position === -1) entry.cover = row.url;
        if (row.position === 0) entry.hover = row.url;
        map[row.product_id] = entry;
      }
      return map;
    },
  });
}

function ProductCardMedia({ p, kind, extra, videos }: { p: DisplayProduct; kind: string; extra?: string; videos?: ProductSlotVideos }) {
  const [hover, setHover] = useState(false);
  const { currency } = useLocale();
  const onSale = hasSalePrice({ price_cop: p.price, price_usd: p.priceUsd, compare_at_cop: p.compareCop, compare_at_usd: p.compareUsd }, currency);
  const badge = onSale ? <span className="absolute left-3 top-3 z-10 bg-destructive px-2 py-1 font-nm text-[9px] uppercase tracking-[0.2em] text-destructive-foreground">SALE</span> : null;
  if (kind === "video" && extra) {
    return (
      <div className="relative aspect-[4/5] overflow-hidden bg-ivory">
        <AutoVideo src={extra} className="w-full h-full object-cover" />
        {badge}
      </div>
    );
  }
  if (kind === "png") {
    const src = extra ?? p.image;
    return (
      <div className="relative aspect-[4/5] overflow-hidden flex items-center justify-center bg-ivory">
        {src && <ProductPhoto src={src} alt={p.name} className="w-full h-full object-contain p-4 transition-transform duration-700 group-hover:scale-[1.04]" />}
        {badge}
      </div>
    );
  }
  const first = p.image ?? p.images[0] ?? null;
  const second = kind === "gallery" ? p.images.find((u) => u && u !== first) ?? null : null;
  const src = hover && second ? second : first;
  return (
    <div
      className="relative aspect-[4/5] overflow-hidden bg-ivory"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {src && <ProductPhoto src={src} alt={p.name} className="absolute inset-0 h-full w-full object-cover group-hover:scale-[1.03] transition-transform duration-700" />}
      {videos?.cover && !(hover && videos.hover) ? (
        <AutoVideo src={videos.cover} className="absolute inset-0 h-full w-full object-cover" />
      ) : hover && videos?.hover ? (
        <AutoVideo src={videos.hover} priority className="absolute inset-0 h-full w-full object-cover" />
      ) : null}
      {badge}
    </div>
  );
}

export function ProductsScene({ props, ctx }: P) {
  const limit = Number(props.limit ?? 8);
  const ids: string[] = Array.isArray(props.productIds) ? props.productIds.filter(Boolean) : [];
  const source: string = props.source || (ids.length ? "manual" : "context");
  const collectionSlug: string = props.collectionSlug || "";

  const { data: picked } = useQuery({ ...(selectedProductsQuery(ids) as any), enabled: source === "manual" && ids.length > 0 });
  const useShopOrder = (source === "all" || ctx.collection.slug === "page-tienda") && (props.sort || "manual") === "manual";
  const liveCatalogScenes = ctx.catalogScenes;
  const { data: catalog } = useQuery(catalogQuery());
  const { data: coll } = useQuery({
    ...collectionWithProductsQuery(collectionSlug),
    enabled: source === "collection" && !!collectionSlug,
  });
  const { data: rank } = useQuery(salesRankQuery());
  // Con "Todo el catálogo" se reutiliza el orden definido para Shop (Diseño → Tienda online).
  const shopPageQ = useQuery({ ...collectionWithProductsQuery("page-tienda"), enabled: useShopOrder && liveCatalogScenes === undefined });
  const shopExpQ = useQuery({
    ...publishedExperienceQuery((shopPageQ.data as any)?.collection?.id),
    enabled: useShopOrder && liveCatalogScenes === undefined && !!(shopPageQ.data as any)?.collection?.id,
  });
  const { data: collOrder } = useQuery({ ...collectionProductOrderQuery(), enabled: useShopOrder });
  const shopCurated = useMemo(() => {
    if (!useShopOrder) return null;
    return catalogOrderIds(liveCatalogScenes ?? shopExpQ.data?.scenes ?? [], collOrder);
  }, [useShopOrder, liveCatalogScenes, shopExpQ.data, collOrder]);

  const sourceList: DisplayProduct[] = useMemo(() => {
    const fromScene = (arr: any[]): DisplayProduct[] =>
      (arr ?? []).map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        image: p.hero_image_url ?? null,
        images: [
          ...(p.hero_image_url ? [p.hero_image_url] : []),
          ...((p.product_images ?? []) as any[])
            .slice()
            .sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0))
            .map((i: any) => i.url as string),
        ].filter((v, i, arr) => v && arr.indexOf(v) === i),
        price: p.product_variants?.[0]?.price_cop ?? 0,
        created_at: p.created_at ?? "",
      }));
    if (source === "all")
      return ((catalog as ShopProduct[]) ?? []).map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        image: p.hero_image_url,
        images: p.images ?? [],
        price: p.minPrice,
        created_at: p.created_at,
      }));
    if (source === "collection") return fromScene((coll as any)?.products ?? []);
    if (source === "manual") return fromScene((picked as any[]) ?? []);
    return fromScene(ctx.products as any[]);
  }, [source, catalog, coll, picked, ctx.products]);

  const list = useMemo(() => {
    const byId = new Map((catalog ?? []).map((product) => [product.id, product]));
    return sourceList.map((product) => {
      const current = byId.get(product.id);
      if (!current) return product;
      return { ...product, price: current.minPrice, priceUsd: current.minPriceUsd, compareCop: current.compareCop, compareUsd: current.compareUsd };
    });
  }, [sourceList, catalog]);

  const sorted = useMemo(() => {
    const arr = [...list];
    const sort = props.sort || "manual";
    if (useShopOrder) {
      const stock = new Map(((catalog as ShopProduct[]) ?? []).map((p) => [p.id, p.inStock ? 1 : 0]));
      const r = new Map((shopCurated ?? []).map((id, i) => [id, i]));
      const ts = (p: DisplayProduct) => new Date(p.created_at).getTime();
      arr.sort((a, b) =>
        (r.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (r.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
        (stock.get(b.id) ?? 0) - (stock.get(a.id) ?? 0) ||
        (r.size ? 0 : (rank?.[b.id] ?? 0) - (rank?.[a.id] ?? 0)) ||
        ts(b) - ts(a));
    }
    if (sort === "precio-asc") arr.sort((a, b) => a.price - b.price);
    if (sort === "precio-desc") arr.sort((a, b) => b.price - a.price);
    if (sort === "nombre") arr.sort((a, b) => a.name.localeCompare(b.name, "es"));
    if (sort === "nuevos") arr.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    if (sort === "vendidos") arr.sort((a, b) => (rank?.[b.id] ?? 0) - (rank?.[a.id] ?? 0));
    return arr;
  }, [list, props.sort, rank, useShopOrder, shopCurated, catalog]);

  const showFilters = !!props.showFilters;
  const listIds = useMemo(() => list.map((p) => p.id), [list]);
  const { data: filterMeta } = useQuery({
    queryKey: ["scene", "product-filters", listIds.join(",")],
    enabled: showFilters && listIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, product_type, product_variants(size)")
        .in("id", listIds);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        product_type: string | null;
        product_variants?: Array<{ size: string | null }> | null;
      }>;
    },
  });
  const metaById = useMemo(
    () =>
      new Map<string, { product_type: string | null; product_variants?: Array<{ size: string | null }> | null }>(
        (filterMeta ?? []).map((m) => [m.id, { product_type: m.product_type, product_variants: m.product_variants }]),
      ),
    [filterMeta],
  );

  const sizeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of list) {
      for (const v of metaById.get(p.id)?.product_variants ?? []) {
        const s = sizeLabel(v.size);
        if (s) set.add(s);
      }
    }
    return [...set].sort(compareSizes);
  }, [list, metaById]);

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const p of list) {
      const t = (metaById.get(p.id)?.product_type ?? "").trim();
      if (t) set.add(t);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [list, metaById]);

  const [sizeSel, setSizeSel] = useState<string | null>(null);
  const [typeSel, setTypeSel] = useState<string | null>(null);
  const filtered = useMemo(() => {
    if (!showFilters) return sorted;
    return sorted.filter((p) => {
      if (sizeSel && !(metaById.get(p.id)?.product_variants ?? []).some((v) => sizeLabel(v.size) === sizeSel)) return false;
      if (typeSel && (metaById.get(p.id)?.product_type ?? "").trim() !== typeSel) return false;
      return true;
    });
  }, [sorted, showFilters, sizeSel, typeSel, metaById]);
  const items = filtered.slice(0, limit > 0 ? limit : filtered.length);
  const mediaKind: string = props.mediaKind || "hero";
  const { data: extraMedia } = useProductExtraMedia(items.map((p) => p.id), mediaKind);
  const { data: slotVideos } = useProductSlotVideos(items.map((p) => p.id));
  const [quickId, setQuickId] = useState<string | null>(null);
  const { view, canSwitch, setView } = useProductView(props.view || "grid");
  const banners: CatalogBanner[] = Array.isArray(props.banners) ? props.banners : [];
  const cells = interleaveBanners(items, banners);
  const cols = props.columns === "2" ? "grid-cols-2" : props.columns === "4" ? "grid-cols-2 md:grid-cols-4" : "grid-cols-2 md:grid-cols-3";
  const gap = props.gap === "none" ? "gap-0" : props.gap === "sm" ? "gap-2 md:gap-3" : "gap-x-4 gap-y-10 md:gap-x-6 md:gap-y-14";
  const trackRef = useRef<HTMLDivElement>(null);
  const scrollTrack = (dir: number) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.6, 240), behavior: "smooth" });
  };

  return (
    <SceneShell props={{ ...props, anim: "none" }}>
      {props.title && (
        <div className="flex items-baseline justify-between mb-10">
          <h2 className="font-serif italic text-4xl md:text-6xl">{props.title}</h2>
          <Link to="/coleccion/$slug" params={{ slug: collectionSlug || ctx.collection.slug }} className="font-nm text-[10px] uppercase tracking-[0.3em] opacity-60">
            Ver todo
          </Link>
        </div>
      )}
      {showFilters && (sizeOptions.length > 0 || typeOptions.length > 0) && (
        <div className="mb-10 flex flex-wrap items-end gap-x-10 gap-y-4">
          {sizeOptions.length > 0 && (
            <SceneFilterSelect
              label="Talla"
              allLabel="Todas"
              value={sizeSel}
              options={sizeOptions}
              onChange={setSizeSel}
              format={displaySize}
            />
          )}
          {typeOptions.length > 0 && (
            <SceneFilterSelect
              label="Tipo"
              allLabel="Todos"
              value={typeSel}
              options={typeOptions}
              onChange={setTypeSel}
            />
          )}
        </div>
      )}
      {showFilters && items.length === 0 && <p className="py-10 text-center text-sm opacity-60">No hay piezas con esos filtros.</p>}
      {canSwitch && <ProductViewToggle view={view} onChange={setView} />}
      {view === "carousel" ? (
        <div className="relative">
          <div
            ref={trackRef}
            className="flex gap-4 md:gap-6 overflow-x-auto snap-x snap-mandatory pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {items.map((p) => (
              <div key={p.id} className="snap-start shrink-0 w-[62vw] md:w-[24vw] max-w-[420px]">
                <Link to="/producto/$slug" params={{ slug: p.slug }} className="block">
                  <ProductCardMedia p={p} kind={mediaKind} extra={extraMedia?.[p.id]} videos={slotVideos?.[p.id]} />
                </Link>
                <ProductCardInfo
                  name={p.name}
                  price={p.price}
                  priceUsd={p.priceUsd}
                  compareCop={p.compareCop}
                  compareUsd={p.compareUsd}
                  slug={p.slug}
                  onAdd={() => setQuickId(p.id)}
                  className="pt-2"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-4 pt-8">
            <button type="button" aria-label="Anterior" onClick={() => scrollTrack(-1)} className="p-2 hover:-translate-x-0.5 transition-transform">
              <ChevronLeft className="size-5" />
            </button>
            <button type="button" aria-label="Siguiente" onClick={() => scrollTrack(1)} className="p-2 hover:translate-x-0.5 transition-transform">
              <ChevronRight className="size-5" />
            </button>
          </div>
        </div>
      ) : (
        <div className={cn("grid [grid-auto-flow:dense]", gap, cols)}>
          {cells.map((cell, i) =>
            cell.kind === "banner" ? (
              <CatalogBannerCell key={`b-${cell.b.id}-${i}`} banner={cell.b} />
            ) : (
              <div key={cell.p.id} className="group block">
                <Link to="/producto/$slug" params={{ slug: cell.p.slug }} className="block">
                  <ProductCardMedia p={cell.p} kind={mediaKind} extra={extraMedia?.[cell.p.id]} videos={slotVideos?.[cell.p.id]} />
                </Link>
                <ProductCardInfo
                  name={cell.p.name}
                  price={cell.p.price}
                  priceUsd={cell.p.priceUsd}
                  compareCop={cell.p.compareCop}
                  compareUsd={cell.p.compareUsd}
                  slug={cell.p.slug}
                  onAdd={() => setQuickId(cell.p.id)}
                  className="pt-2"
                />
              </div>
            ),
          )}
        </div>
      )}
      <QuickAddModal productId={quickId ?? ""} open={!!quickId} onClose={() => setQuickId(null)} />
    </SceneShell>
  );
}

/* ---------------- Look completo ---------------- */
export function LookScene({ props, ctx }: P) {
  const slugs: string[] = String(props.productSlugs ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const items = slugs.length ? ctx.products.filter((p) => slugs.includes(p.slug)) : ctx.products.slice(0, 3);
  return (
    <SceneShell props={props}>
      <div className="grid md:grid-cols-2 gap-12 items-center">
        <div className="aspect-[3/4] overflow-hidden">
          <Media url={props.media} alt={props.title} className="w-full h-full object-cover" />
        </div>
        <div>
          <p className="font-nm text-[10px] uppercase tracking-[0.3em] opacity-60">{props.eyebrow || "El look"}</p>
          <h2 className="font-serif italic text-4xl md:text-6xl mt-3">{props.title}</h2>
          {props.body && <p className="mt-5 text-sm opacity-75 max-w-md">{props.body}</p>}
          <div className="mt-8 divide-y divide-current/10 border-y border-current/10">
            {items.map((p) => (
              <Link key={p.id} to="/producto/$slug" params={{ slug: p.slug }} className="flex items-center gap-4 py-4 group">
                <div className="w-14 h-16 bg-cream overflow-hidden shrink-0">
                  {p.hero_image_url && <img src={p.hero_image_url} alt={p.name} className="w-full h-full object-cover" />}
                </div>
                <span className="font-serif italic text-xl flex-1 group-hover:opacity-60 transition-opacity">{p.name}</span>
                <span className="text-xs opacity-70">{formatCOP(p.product_variants?.[0]?.price_cop ?? 0)}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </SceneShell>
  );
}

/* ---------------- Compra por color ---------------- */
export function ShopColorsScene({ props, ctx }: P) {
  const colors = Array.from(
    new Map(
      ctx.products
        .flatMap((p) => p.product_variants ?? [])
        .filter((v) => v.color)
        .map((v) => [v.color as string, v.color_hex ?? "#ccc"]),
    ).entries(),
  );
  const [active, setActive] = useState<string | null>(null);
  const items = active
    ? ctx.products.filter((p) => (p.product_variants ?? []).some((v) => v.color === active))
    : ctx.products;
  return (
    <SceneShell props={props}>
      <div className="flex items-baseline justify-between flex-wrap gap-4 mb-8">
        <h2 className="font-serif italic text-4xl md:text-6xl">{props.title || "Compra por color"}</h2>
        <div className="flex items-center gap-3">
          <button onClick={() => setActive(null)} className={cn("font-nm text-[10px] uppercase tracking-[0.25em]", !active ? "opacity-100" : "opacity-40")}>
            Todos
          </button>
          {colors.map(([name, hex]) => (
            <button
              key={name}
              onClick={() => setActive(name)}
              title={name}
              className={cn("w-7 h-7 rounded-full border transition-transform", active === name ? "scale-110 border-current" : "border-current/20")}
              style={{ background: hex }}
            />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-12">
        {items.slice(0, Number(props.limit ?? 8)).map((p) => (
          <Link key={p.id} to="/producto/$slug" params={{ slug: p.slug }} className="group block">
            <div className="aspect-[3/4] overflow-hidden bg-cream">
              {p.hero_image_url && <img src={p.hero_image_url} alt={p.name} className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-700" />}
            </div>
            <h3 className="font-serif italic text-lg mt-3">{p.name}</h3>
          </Link>
        ))}
      </div>
    </SceneShell>
  );
}
