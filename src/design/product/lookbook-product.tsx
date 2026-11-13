import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { ProductSaleNotice, ProductSalePrice, type SaleNoticeState } from "@/components/storefront/product-sale";
import { usePrice } from "@/lib/locale";
import { FavoriteButton } from "@/components/storefront/favorite-button";
import { track } from "@/lib/analytics";

export type LookbookConfig = {
  videoUrl?: string | null;
  videoUrlAlt?: string | null;
  posterUrl?: string | null;
  desktopPosition?: { x: number; y: number };
  mobilePosition?: { x: number; y: number };
  duration?: "short" | "medium" | "long";
  features?: string[];
  gallery?: string[];
};

export const DURATION_VH: Record<NonNullable<LookbookConfig["duration"]>, number> = {
  short: 350,
  medium: 500,
  long: 650,
};

export function normalizeLookbookConfig(raw: unknown): LookbookConfig {
  const c = (raw ?? {}) as Record<string, any>;
  return {
    videoUrl: c.videoUrl ?? null,
    videoUrlAlt: c.videoUrlAlt ?? null,
    posterUrl: c.posterUrl ?? null,
    desktopPosition: c.desktopPosition ?? { x: 50, y: 50 },
    mobilePosition: c.mobilePosition ?? { x: 50, y: 50 },
    duration: (c.duration as LookbookConfig["duration"]) ?? "medium",
    features: Array.isArray(c.features) ? c.features.filter(Boolean) : [],
    gallery: Array.isArray(c.gallery) ? c.gallery.filter(Boolean) : [],
  };
}

type SizeOption = { id: string; label: string; disabled: boolean; storeOnly: boolean };

export type LookbookProductPageProps = {
  config: LookbookConfig;
  name: string;
  description?: string | null;
  story?: string | null;
  materials?: string | null;
  care?: string | null;
  collectionLabel?: string | null;
  priceCop: number;
  priceUsd?: number | null;
  compareAtCop?: number | null;
  compareAtUsd?: number | null;
  saleState: SaleNoticeState;
  gallery: { url: string; alt?: string | null }[];
  colors: { color: string; hex: string | null }[];
  color: string;
  onPickColor: (c: string) => void;
  sizes: SizeOption[];
  variantId: string | null;
  sizeTouched: boolean;
  onPickSize: (id: string) => void;
  availabilityLabel: string;
  urgent: boolean;
  soldOut: boolean;
  onAdd: () => void;
  onBuyNow: () => void;
  onSizeGuide: () => void;
  onSizeFinder: () => void;
  onOpenLooks?: () => void;
  lookCount?: number;
  onRequestInStore?: () => void;
};

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n);
const pendingVideoFrames = new WeakSet<HTMLVideoElement>();
const lastVideoSeek = new WeakMap<HTMLVideoElement, number>();

function seekVideo(video: HTMLVideoElement | null, progress: number, mobile: boolean, now: number) {
  if (
    !video ||
    video.seeking ||
    pendingVideoFrames.has(video) ||
    video.readyState < HTMLMediaElement.HAVE_METADATA ||
    !Number.isFinite(video.duration) ||
    video.duration <= 0
  ) {
    return;
  }

  const next = clamp01(progress) * Math.max(0, video.duration - 0.04);
  const frameDuration = mobile ? 1 / 24 : 1 / 30;
  if (Math.abs(video.currentTime - next) < frameDuration) return;

  // En móvil no se envían más búsquedas de las que el decodificador puede pintar.
  const sinceLastSeek = now - (lastVideoSeek.get(video) ?? 0);
  if (mobile && sinceLastSeek < 42) return;
  lastVideoSeek.set(video, now);

  const fastSeek = (video as HTMLVideoElement & { fastSeek?: (time: number) => void }).fastSeek;
  if (mobile && typeof fastSeek === "function") fastSeek.call(video, next);
  else video.currentTime = next;
  if (typeof video.requestVideoFrameCallback === "function") {
    pendingVideoFrames.add(video);
    video.requestVideoFrameCallback(() => pendingVideoFrames.delete(video));
  }
}

/** Experiencia editorial: el scroll es la línea de tiempo del video. */
export function LookbookProductPage(props: LookbookProductPageProps) {
  const money = usePrice();
  const {
    config,
    name,
    description,
    story,
    materials,
    collectionLabel,
    priceCop,
    priceUsd,
    gallery,
    colors,
    color,
    onPickColor,
    sizes,
    variantId,
    sizeTouched,
    onPickSize,
    availabilityLabel,
    urgent,
    soldOut,
    onAdd,
    onBuyNow,
    onSizeGuide,
    onSizeFinder,
    onOpenLooks,
    lookCount = 0,
    onRequestInStore,
  } = props;

  const filmRef = useRef<HTMLElement | null>(null);
  const chaptersRef = useRef<HTMLDivElement | null>(null);
  const gallerySectionRef = useRef<HTMLDivElement | null>(null);
  const galleryTrackRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const sceneRefs = useRef<(HTMLDivElement | null)[]>([]);
  const targetRef = useRef(0);
  const chapterRatioRef = useRef(0.4);
  const renderedRef = useRef(0);
  const milestonesRef = useRef<Record<string, boolean>>({});

  const [quickBuy, setQuickBuy] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [openImage, setOpenImage] = useState<string | null>(null);

  const features = useMemo(() => {
    const list = (config.features ?? []).filter(Boolean);
    if (list.length) return list;
    return (materials ?? "")
      .split(/[·,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 4);
  }, [config.features, materials]);

  const shots = useMemo(() => {
    const chosen = (config.gallery ?? []).filter((u) => gallery.some((g) => g.url === u));
    const urls = chosen.length ? chosen : gallery.map((g) => g.url).slice(0, 6);
    return urls.map((url) => ({ url, alt: gallery.find((g) => g.url === url)?.alt ?? name }));
  }, [config.gallery, gallery, name]);

  const heightVh = DURATION_VH[config.duration ?? "medium"];
  const poster = config.posterUrl ?? gallery[0]?.url ?? undefined;
  const hasVideo = Boolean(config.videoUrl) && !videoFailed;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  useEffect(() => {
    track("lookbook_started" as any, { product: name });
  }, [name]);

  // Scroll = timeline. Progreso suavizado por fotograma, sin recalcular layout.
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let alive = true;
    let visible = true;
    let previousTime = performance.now();
    let filmTop = 0;
    let total = 0;
    let galleryTop = 0;
    let galleryRange = 1;
    let galleryTravel = 0;
    const mobile = window.matchMedia("(max-width: 767px), (pointer: coarse)").matches;

    const measureLayout = () => {
      const el = filmRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      filmTop = window.scrollY + rect.top;
      total = el.offsetHeight - window.innerHeight;
      const chapters = chaptersRef.current?.offsetHeight ?? 0;
      chapterRatioRef.current = total > 0 ? clamp01(chapters / total) || 0.4 : 0.4;
      const gallerySection = gallerySectionRef.current;
      const galleryTrack = galleryTrackRef.current;
      if (gallerySection && galleryTrack) {
        const galleryRect = gallerySection.getBoundingClientRect();
        galleryTop = window.scrollY + galleryRect.top;
        galleryRange = Math.max(1, gallerySection.offsetHeight - window.innerHeight);
        galleryTravel = Math.max(0, galleryTrack.scrollWidth - window.innerWidth + 48);
      }
      measureScroll();
    };

    const measureScroll = () => {
      targetRef.current = clamp01(total > 0 ? (window.scrollY - filmTop) / total : 0);
    };

    const applyScenes = (p: number) => {
      const count = sceneRefs.current.length;
      const span = Math.max(0.05, chapterRatioRef.current);
      const cp = clamp01(p / span);
      sceneRefs.current.forEach((node, i) => {
        if (!node) return;
        const start = i / count;
        const end = (i + 1) / count;
        const local = clamp01((cp - start) / (end - start));
        const fade = Math.sin(Math.PI * local);
        node.style.opacity = String(i === 0 ? clamp01(1 - local * 1.3) || (cp < 0.02 ? 1 : 0) : fade);
        node.style.transform = `translate3d(0, ${(0.5 - local) * 40}px, 0)`;
        node.style.pointerEvents = fade > 0.5 ? "auto" : "none";
      });
    };

    const milestone = (key: string, p: number, at: number) => {
      if (p >= at && !milestonesRef.current[key]) {
        milestonesRef.current[key] = true;
        track(key as any, { product: name });
      }
    };

    const loop = (time: number) => {
      if (!alive) return;
      if (!visible) {
        previousTime = time;
        raf = requestAnimationFrame(loop);
        return;
      }
      const elapsed = Math.min(64, time - previousTime);
      previousTime = time;
      const target = targetRef.current;
      const smoothing = 1 - Math.pow(0.82, elapsed / 16.67);
      renderedRef.current =
        Math.abs(target - renderedRef.current) < 0.00008
          ? target
          : renderedRef.current + (target - renderedRef.current) * smoothing;
      const p = renderedRef.current;
      seekVideo(videoRef.current, p, mobile, time);
      applyScenes(p);
      const galleryTrack = galleryTrackRef.current;
      if (galleryTrack) {
        const galleryProgress = clamp01((window.scrollY - galleryTop) / galleryRange);
        galleryTrack.style.transform = `translate3d(${24 - galleryProgress * galleryTravel}px, 0, 0)`;
      }
      milestone("lookbook_25", target, 0.25);
      milestone("lookbook_50", target, 0.5);
      milestone("lookbook_75", target, 0.75);
      milestone("lookbook_completed", target, 0.98);
      raf = requestAnimationFrame(loop);
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = Boolean(entry?.isIntersecting);
    }, { rootMargin: "100% 0px" });
    if (filmRef.current) observer.observe(filmRef.current);

    measureLayout();
    raf = requestAnimationFrame(loop);
    window.addEventListener("scroll", measureScroll, { passive: true });
    window.addEventListener("resize", measureLayout);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("scroll", measureScroll);
      window.removeEventListener("resize", measureLayout);
    };
  }, [reduced, name]);

  const posDesktop = config.desktopPosition ?? { x: 50, y: 50 };
  const posMobile = config.mobilePosition ?? { x: 50, y: 50 };

  const openQuickBuy = () => {
    setQuickBuy(true);
    track("quick_buy_opened" as any, { product: name });
  };

  const scenes = [
    // 01 · Portada
    <div key="cover" className="flex h-full flex-col justify-end px-6 pb-28 md:px-12 md:pb-24">
      <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-ivory/60">
        {collectionLabel || "Tu Marca"}
      </p>
      <h1 className="mt-3 -ml-1 font-nm text-[13vw] leading-[0.85] tracking-tight md:-ml-2 md:text-[8.5vw]">
        {name}
      </h1>
      <ProductSalePrice className="mt-4 font-mono text-[11px] uppercase tracking-[0.3em] text-ivory/75" variant={{ price_cop: priceCop, price_usd: priceUsd, compare_at_cop: props.compareAtCop, compare_at_usd: props.compareAtUsd }} />
    </div>,
    // 02 · Concepto
    <div key="concept" className="flex h-full items-center px-6 md:px-16">
      <div className="max-w-md md:ml-auto md:max-w-sm">
        <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-ivory/55">Concepto</p>
        <p className="mt-6 font-serif text-[19px] leading-relaxed text-ivory/90 md:text-[22px]">
          {story || description || "Una pieza pensada para moverse contigo."}
        </p>
      </div>
    </div>,
    // 03 · Características
    <div key="features" className="relative h-full px-6 md:px-16">
      {features.map((f, i) => (
        <p
          key={f + i}
          className="absolute font-mono text-[11px] uppercase tracking-[0.3em] text-ivory/85 md:text-[13px]"
          style={{
            top: `${18 + i * 17}%`,
            left: i % 2 === 0 ? "6%" : "auto",
            right: i % 2 === 0 ? "auto" : "8%",
          }}
        >
          {String(i + 1).padStart(2, "0")} — {f}
        </p>
      ))}
    </div>,
  ];

  return (
    <div className="bg-ink text-ivory">
      {/* ── Film fijado: el video queda al fondo durante toda la secuencia ── */}
      <section ref={filmRef as any} className="relative">
        <div id="lookbook-film" className="sticky top-0 z-0 h-[100svh] overflow-hidden bg-ink md:h-screen">

          {poster && (
            <img
              src={poster}
              alt={name}
              className="absolute inset-0 size-full object-cover md:object-contain"
              style={{ objectPosition: `${posMobile.x}% ${posMobile.y}%` }}
            />
          )}
          {hasVideo && !reduced && (
            <video
              ref={videoRef}
              poster={poster}
              muted
              playsInline
              preload="auto"
              onError={() => setVideoFailed(true)}
              className="absolute inset-0 size-full object-cover md:object-contain"
              style={{ objectPosition: `${posMobile.x}% ${posMobile.y}%` }}
            >
              <source src={config.videoUrl ?? undefined} />
              {config.videoUrlAlt ? <source src={config.videoUrlAlt} /> : null}
            </video>
          )}
          <style>{`@media (min-width:768px){#lookbook-film>img,#lookbook-film>video{object-position:${posDesktop.x}% ${posDesktop.y}% !important}}`}</style>
          <div className="absolute inset-0">
            <div className="absolute inset-0 bg-gradient-to-t from-ink/55 via-ink/5 to-ink/15" />
            {scenes.map((scene, i) => (
              <div
                key={i}
                ref={(el) => {
                  sceneRefs.current[i] = el;
                }}
                className="absolute inset-0"
                style={{ opacity: i === 0 ? 1 : 0 }}
              >
                {scene}
              </div>
            ))}
          </div>
        </div>

        {/* Capas que viajan por encima del video fijo */}
        <div className="relative z-10 -mt-[100svh] md:-mt-[100vh]">
          {/* Espacio de los capítulos narrativos sobre el video */}
          <div ref={chaptersRef} style={{ height: reduced ? "100vh" : `${heightVh}vh` }} />

          {/* Galería editorial: carrusel horizontal ligado al scroll */}
          {shots.length > 0 && (
            <div ref={gallerySectionRef} className="relative h-[280svh] md:h-[320vh]">
              <div className="sticky top-0 flex h-[100svh] items-center overflow-hidden md:h-screen">
                <div
                  ref={galleryTrackRef}
                  className="flex w-max items-center gap-5 px-6 [backface-visibility:hidden] [will-change:transform] md:gap-8"
                >
                  {shots.map((shot, i) => (
                    <figure
                      key={shot.url}
                      className="w-[78vw] shrink-0 rounded-md bg-ivory p-3 text-ink shadow-[0_30px_80px_rgba(0,0,0,0.42)] md:w-[38vw] md:p-5"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setOpenImage(shot.url);
                          track("lookbook_gallery_interaction" as any, { product: name, image: i });
                        }}
                        className="block aspect-[3/4] w-full overflow-hidden rounded-sm bg-background"
                      >
                        <img
                          src={shot.url}
                          alt={shot.alt ?? name}
                          loading="lazy"
                          className="size-full object-contain transition-transform duration-700 hover:scale-[1.02]"
                        />
                      </button>
                      <div className="flex items-center justify-between gap-3 pt-3 md:pt-4">
                        <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink/55">
                          {String(i + 1).padStart(2, "0")} / {String(shots.length).padStart(2, "0")}
                        </span>
                        <button
                          type="button"
                          disabled={soldOut}
                          onClick={onAdd}
                          className="min-h-9 rounded-sm bg-ink px-4 font-mono text-[9px] uppercase tracking-[0.18em] text-ivory transition-colors hover:bg-moss disabled:opacity-40"
                        >
                          {soldOut ? "Agotado" : "Agregar al carrito"}
                        </button>
                      </div>
                    </figure>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>


      {/* ── Material ──────────────────────────────────────────────────────── */}
      {materials && (
        <section className="relative z-10 bg-ink px-6 py-24 md:px-16 md:py-36">
          <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-ivory/55">Material</p>
          <p className="mt-6 max-w-3xl font-nm text-[7vw] leading-[1.05] md:text-[3.4vw]">{materials}</p>
        </section>
      )}

      {/* ── Fit ───────────────────────────────────────────────────────────── */}
      <section className="relative z-10 border-t border-ivory/12 bg-ink px-6 py-20 md:px-16">
        <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-ivory/55">Fit</p>
        <div className="mt-6 flex flex-wrap items-center gap-x-10 gap-y-4">
          <p className="font-nm text-2xl md:text-4xl">La modelo mide 1,75 m y usa talla M</p>
          <div className="flex gap-6">
            <button
              onClick={onSizeFinder}
              className="font-mono text-[10px] uppercase tracking-[0.22em] underline underline-offset-4 text-ivory/80 hover:text-ivory"
            >
              Encuentra tu talla
            </button>
            <button
              onClick={onSizeGuide}
              className="font-mono text-[10px] uppercase tracking-[0.22em] underline underline-offset-4 text-ivory/60 hover:text-ivory"
            >
              Guía de tallas
            </button>
          </div>
        </div>
      </section>

      {/* ── Tu pieza: color, talla y compra ───────────────────────────────── */}
      <section className="relative z-10 border-t border-ivory/12 bg-ink px-6 pb-40 pt-20 md:px-16">
        <p className="font-mono text-[10px] uppercase tracking-[0.4em] text-ivory/55">Tu pieza</p>
        <div className="mt-10 grid gap-14 md:grid-cols-2">
          <div className="space-y-12">
            {colors.length > 1 && (
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ivory/45">01 Color</p>
                <div className="mt-4 space-y-2">
                  {colors.map((c, i) => (
                    <button
                      key={c.color}
                      onClick={() => onPickColor(c.color)}
                      className="flex w-full items-center gap-3 py-1.5 text-left"
                    >
                      <span
                        className={
                          "size-4 rounded-full border transition-colors " +
                          (color === c.color ? "border-ivory" : "border-ivory/25")
                        }
                        style={{ background: c.hex ?? "#ccc" }}
                      />
                      <span
                        className={
                          "font-mono text-[11px] uppercase tracking-[0.22em] " +
                          (color === c.color ? "text-ivory" : "text-ivory/45 hover:text-ivory/80")
                        }
                      >
                        {String(i + 1).padStart(2, "0")} {c.color}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ivory/45">02 Talla</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {sizes.map((s) => {
                  const active = sizeTouched && variantId === s.id;
                  return (
                    <button
                      key={s.id}
                      disabled={s.disabled}
                      onClick={() => onPickSize(s.id)}
                      className={
                        "min-h-11 min-w-14 px-4 font-mono text-[11px] uppercase tracking-[0.18em] transition-colors " +
                        (active
                          ? "bg-ivory text-ink"
                          : s.disabled
                            ? "cursor-not-allowed text-ivory/25 line-through"
                            : "border border-ivory/25 text-ivory/80 hover:border-ivory")
                      }
                    >
                      {s.label}
                      {s.storeOnly && !s.disabled && <span className="ml-1 text-moss">•</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="md:pl-10">
            <div className="flex items-start gap-4 md:gap-6">
              {poster && (
                <img
                  src={poster}
                  alt={`Portada de ${name}`}
                  className="aspect-[3/4] w-20 shrink-0 rounded-sm bg-ivory object-cover p-1 md:w-24"
                />
              )}
              <div>
                <h2 className="font-nm text-4xl leading-none md:text-6xl">{name}</h2>
                <ProductSalePrice className="mt-4 font-mono text-[12px] uppercase tracking-[0.28em] text-ivory/80" variant={{ price_cop: priceCop, price_usd: priceUsd, compare_at_cop: props.compareAtCop, compare_at_usd: props.compareAtUsd }} />
              </div>
            </div>
            <p
              className={
                "mt-2 font-mono text-[10px] uppercase tracking-[0.2em] " +
                (soldOut ? "text-ivory/40" : urgent ? "text-[#e0a184]" : "text-moss")
              }
            >
              {availabilityLabel}
            </p>
            <ProductSaleNotice state={props.saleState} className="mt-5" />
            <div className="mt-8 flex items-center gap-2">
              <button
                onClick={onAdd}
                disabled={soldOut}
                className="flex-1 bg-ivory py-4 font-mono text-[10px] uppercase tracking-[0.24em] text-ink transition-colors hover:bg-moss hover:text-ivory disabled:bg-ivory/25"
              >
                {soldOut ? "Agotado" : "Agregar a la bolsa"}
              </button>
              <FavoriteButton variantId={variantId} tone="light" className="size-[52px] shrink-0 rounded-none border border-ivory/40" />
            </div>
            <button
              onClick={onBuyNow}
              disabled={soldOut}
              className="mt-3 w-full border border-ivory/40 py-4 font-mono text-[10px] uppercase tracking-[0.24em] transition-colors hover:bg-ivory hover:text-ink disabled:opacity-30"
            >
              Comprar esta pieza
            </button>
            {onRequestInStore && (
              <button
                onClick={onRequestInStore}
                className="mt-3 w-full border border-ivory/20 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-ivory/70 hover:border-ivory hover:text-ivory"
              >
                Solicitar esta pieza en tienda
              </button>
            )}
            {onOpenLooks && lookCount > 0 && (
              <button
                onClick={onOpenLooks}
                className="mt-8 font-nm text-2xl text-ivory/70 underline underline-offset-8 hover:text-ivory"
              >
                Style it with →
              </button>
            )}
          </div>
        </div>
      </section>

      {/* ── Compra siempre accesible ──────────────────────────────────────── */}
      <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-40 mx-auto max-w-2xl rounded-2xl border border-ivory/15 bg-ink/90 text-ivory shadow-2xl backdrop-blur-xl md:inset-x-6 md:bottom-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-5 py-3 md:px-6">
          <div className="min-w-0">
            <p className="truncate font-nm text-base md:text-lg">{name}</p>
            <ProductSalePrice className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.22em] text-ivory/70" variant={{ price_cop: priceCop, price_usd: priceUsd, compare_at_cop: props.compareAtCop, compare_at_usd: props.compareAtUsd }} />
          </div>
          <button
            onClick={openQuickBuy}
            className="min-h-11 shrink-0 rounded-xl bg-ivory px-5 font-mono text-[10px] uppercase tracking-[0.2em] text-ink transition-colors hover:bg-moss hover:text-ivory md:px-7"
          >
            Elegir talla
          </button>
        </div>
      </div>

      {/* ── Panel de compra rápida ────────────────────────────────────────── */}
      <AnimatePresence>
        {quickBuy && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setQuickBuy(false)}
              className="fixed inset-0 z-50 bg-ink/50"
            />
            <motion.div
              initial={{ y: "100%", opacity: 0.6 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: "100%", opacity: 0.6 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-50 max-h-[82svh] overflow-y-auto rounded-2xl border border-ivory/15 bg-ink/95 px-6 pb-7 pt-5 text-ivory shadow-2xl backdrop-blur-xl md:inset-x-auto md:bottom-6 md:right-6 md:w-[420px]"
            >
              <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-ivory/25 md:hidden" />
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-nm text-2xl">{name}</h3>
                  <ProductSalePrice className="mt-1 font-mono text-[11px] uppercase tracking-[0.24em] text-ivory/80" variant={{ price_cop: priceCop, price_usd: priceUsd, compare_at_cop: props.compareAtCop, compare_at_usd: props.compareAtUsd }} />
                </div>
                <button onClick={() => setQuickBuy(false)} aria-label="Cerrar" className="p-2 text-ivory/70 hover:text-ivory">
                  <X className="size-5" />
                </button>
              </div>

              {colors.length > 1 && (
                <div className="mt-8">
                  <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ivory/45">Color</p>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {colors.map((c) => (
                      <button
                        key={c.color}
                        onClick={() => onPickColor(c.color)}
                        className={
                          "size-8 rounded-full border transition-colors " +
                          (color === c.color ? "border-ivory" : "border-ivory/25")
                        }
                        style={{ background: c.hex ?? "#ccc" }}
                        aria-label={c.color}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-8">
                <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ivory/45">Talla</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {sizes.map((s) => {
                    const active = sizeTouched && variantId === s.id;
                    return (
                      <button
                        key={s.id}
                        disabled={s.disabled}
                        onClick={() => onPickSize(s.id)}
                        className={
                          "min-h-11 min-w-14 px-4 font-mono text-[11px] uppercase tracking-[0.18em] " +
                          (active
                            ? "bg-ivory text-ink"
                            : s.disabled
                              ? "cursor-not-allowed text-ivory/25 line-through"
                              : "border border-ivory/25 text-ivory/80 hover:border-ivory")
                        }
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
                <p
                  className={
                    "mt-3 font-mono text-[10px] uppercase tracking-[0.2em] " +
                    (soldOut ? "text-ivory/40" : urgent ? "text-[#e0a184]" : "text-moss")
                  }
                >
                  {availabilityLabel}
                </p>
                <div className="mt-3 flex gap-6">
                  <button onClick={onSizeFinder} className="font-mono text-[10px] uppercase tracking-[0.2em] underline underline-offset-4">
                    Encuentra tu talla
                  </button>
                  <button onClick={onSizeGuide} className="font-mono text-[10px] uppercase tracking-[0.2em] text-ivory/60 underline underline-offset-4">
                    Guía de tallas
                  </button>
                </div>
              </div>

              <ProductSaleNotice state={props.saleState} className="mt-5" />
            <div className="mt-8 flex items-center gap-2">
                <button
                  onClick={onAdd}
                  disabled={soldOut}
                  className="flex-1 bg-ivory py-4 font-mono text-[10px] uppercase tracking-[0.24em] text-ink hover:bg-moss hover:text-ivory disabled:bg-ivory/25"
                >
                  {soldOut ? "Agotado" : "Agregar a la bolsa"}
                </button>
                <FavoriteButton variantId={variantId} tone="light" className="size-[52px] shrink-0 rounded-none border border-ivory/40" />
              </div>
              <button
                onClick={onBuyNow}
                disabled={soldOut}
                className="mt-3 w-full border border-ivory/40 py-4 font-mono text-[10px] uppercase tracking-[0.24em] hover:bg-ivory hover:text-ink disabled:opacity-30"
              >
                Comprar esta pieza
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Detalle de fotografía ─────────────────────────────────────────── */}
      <AnimatePresence>
        {openImage && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpenImage(null)}
            className="fixed inset-0 z-50 flex items-center justify-center bg-ink/95 p-6"
          >
            <img src={openImage} alt={name} className="max-h-full max-w-full object-contain" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
