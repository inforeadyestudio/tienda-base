import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCOP } from "@/lib/format";
import { posterUrlFor } from "@/lib/media";
import type { Layer, SceneContext } from "@/lib/scenes/types";
import { selectedProductsQuery, type CarouselProduct } from "./product-carousel";
import { cn } from "@/lib/utils";
import { ScrollFrames, frameSequenceFor, type ScrollFramesHandle } from "./scroll-frames";

type Props = { props: Record<string, any>; layers: Layer[]; ctx: SceneContext };

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const range = (progress: number, start: number, end: number) => clamp01((progress - start) / (end - start));
const windowOpacity = (progress: number, enter: number, hold: number, exit: number) =>
  Math.min(range(progress, enter, hold), 1 - range(progress, hold, exit));

function setLayer(el: HTMLElement | null, opacity: number, x = 0, y = 0, interactive = false) {
  if (!el) return;
  el.style.opacity = String(clamp01(opacity));
  el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  el.style.pointerEvents = interactive && opacity > 0.45 ? "auto" : "none";
}

function seek(video: HTMLVideoElement | null, progress: number) {
  if (!video || video.seeking || !Number.isFinite(video.duration) || video.duration <= 0) return;
  const next = clamp01(progress) * Math.max(0, video.duration - 0.04);
  // No saturar el decodificador mientras se arrastra la página.
  const isMobile = typeof window !== "undefined" && !window.matchMedia("(min-width: 768px)").matches;
  const frameDuration = isMobile ? 1 / 15 : 1 / 25;
  if (Math.abs(video.currentTime - next) < frameDuration) return;
  video.currentTime = next;
}

function productImage(product?: CarouselProduct) {
  if (!product) return "";
  return product.cutout_url || product.hero_image_url || [...(product.product_images ?? [])].sort((a, b) => a.position - b.position)[0]?.url || "";
}

function ProductEditorial({ product, compact = false, stacked = false }: { product?: CarouselProduct; compact?: boolean; stacked?: boolean }) {
  if (!product) return null;
  const price = Math.min(...(product.product_variants ?? []).map((variant) => variant.price_cop).filter(Boolean));
  if (stacked) {
    return (
      <div className="flex min-w-0 flex-col items-center gap-3 text-center">
        <Link to="/producto/$slug" params={{ slug: product.slug }} aria-label={`Ver ${product.name}`} className="block w-full">
          <img
            src={productImage(product)}
            alt={product.name}
            className="mx-auto h-[min(62svh,580px)] w-full object-contain drop-shadow-2xl transition-transform duration-500 hover:scale-[1.02] @md/walk:h-[min(55svh,620px)]"
          />
        </Link>
        <div className="w-full min-w-0 text-ivory">
          <h3 className="font-nm text-xl leading-tight @md/walk:text-lg">{product.name}</h3>
          {Number.isFinite(price) && <p className="mt-1 text-[11px] opacity-70">{formatCOP(price)}</p>}
          <Link
            to="/producto/$slug"
            params={{ slug: product.slug }}
            className="mt-2 inline-flex items-center gap-2 border-b border-current pb-0.5 font-nm text-[9px] uppercase tracking-[0.2em]"
          >
            Ver <ArrowRight className="size-3" />
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col items-start gap-3 md:flex-row md:items-end md:gap-8", compact ? "max-w-xl" : "max-w-3xl")}>
      <Link to="/producto/$slug" params={{ slug: product.slug }} aria-label={`Ver ${product.name}`}>
        <img
          src={productImage(product)}
          alt={product.name}
          className={cn("object-contain drop-shadow-2xl transition-transform duration-500 hover:scale-[1.02]", compact ? "h-[38vh] max-w-[46vw]" : "h-[56vh] max-w-[86vw] md:h-[52vh] md:max-w-[55vw]")}
        />
      </Link>
      <div className="max-w-[80vw] text-ivory md:max-w-48 md:pb-5">
        <p className="font-nm text-[9px] uppercase tracking-[0.2em] opacity-65">Pieza seleccionada</p>
        <h3 className="mt-2 font-nm text-xl md:text-3xl leading-none">{product.name}</h3>
        {product.description && <p className="mt-3 line-clamp-3 text-[11px] leading-relaxed opacity-70">{product.description}</p>}
        {Number.isFinite(price) && <p className="mt-3 text-xs opacity-70">{formatCOP(price)}</p>}
        <Link
          to="/producto/$slug"
          params={{ slug: product.slug }}
          className="mt-5 inline-flex items-center gap-2 border-b border-current pb-1 font-nm text-[10px] uppercase tracking-[0.2em]"
        >
          Ver <ArrowRight className="size-3" />
        </Link>
      </div>
    </div>
  );
}

export function CinematicAnimalScene({ props, ctx }: Props) {
  const rootRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const walkVideoRef = useRef<HTMLVideoElement>(null);
  const walkMetaRef = useRef<HTMLDivElement>(null);
  const walkTitleRef = useRef<HTMLDivElement>(null);
  const editorialImageRef = useRef<HTMLDivElement>(null);
  const productRefs = useRef<Array<HTMLDivElement | null>>([]);
  const productNumbersRef = useRef<HTMLDivElement>(null);
  const scrollInfoRef = useRef<{ scroller: HTMLElement | Window; offset: number; travel: number } | null>(null);
  const progressRef = useRef(0);
  const targetProgressRef = useRef(0);
  const isDesktopRef = useRef(false);
  const [activeProduct, setActiveProduct] = useState(0);
  const walkSource: string | undefined = props.walkVideo;
  const frameSequence = frameSequenceFor(walkSource);
  const framesRef = useRef<ScrollFramesHandle>(null);
  const walkMediaRef = useRef<HTMLDivElement>(null);

  const productIds = useMemo(() => (Array.isArray(props.productIds) ? props.productIds.slice(0, 4) : []) as string[], [props.productIds]);
  const { data } = useQuery(selectedProductsQuery(productIds, !!ctx.previewDevice) as any);
  const allProducts = ((data as CarouselProduct[]) ?? []) as CarouselProduct[];
  const byId = useMemo(() => new Map(allProducts.map((product) => [product.id, product])), [allProducts]);
  const walkProducts = productIds.map((id) => byId.get(id)).filter(Boolean) as CarouselProduct[];
  const walkProductsRef = useRef<CarouselProduct[]>([]);
  walkProductsRef.current = walkProducts;
  const selectedProduct = walkProducts[activeProduct] ?? walkProducts[0] ?? (ctx.products[0] as CarouselProduct | undefined);

  const renderProgress = (progress: number, reducedMotion: boolean) => {
    progressRef.current = progress;
    // El mismo progreso controla imagen, títulos y productos en ambas pantallas.
    if (frameSequence) framesRef.current?.draw(progress);
    else seek(walkVideoRef.current, progress);

    const titleOpacity = windowOpacity(progress, 0.12, 0.17, 0.3);
    const imageOpacity = windowOpacity(progress, 0.28, 0.34, 0.47);
    setLayer(walkMetaRef.current, windowOpacity(progress, 0, 0.025, 0.16));
    setLayer(walkTitleRef.current, titleOpacity);
    setLayer(editorialImageRef.current, imageOpacity, 0, reducedMotion ? 0 : (1 - imageOpacity) * 90);

    const liveProducts = walkProductsRef.current;
    const count = liveProducts.length;
    if (count > 0) {
      const segmentStart = 0.43;
      const segmentEnd = 0.96;
      const slot = (segmentEnd - segmentStart) / count;
      let current = 0;
      liveProducts.forEach((_, index) => {
        // En desktop todos los productos suben al mismo tiempo; en móvil van uno tras otro.
        const together = isDesktopRef.current;
        const enter = together ? segmentStart : segmentStart + index * slot;
        const hold = together ? segmentStart + 0.06 : enter + slot * 0.2;
        const exit = together || index === count - 1 ? segmentEnd : enter + slot;
        const enterT = range(progress, enter, hold);
        const exitT = range(progress, together ? segmentEnd - 0.07 : exit - slot * 0.2, exit);
        const y = reducedMotion ? 0 : (1 - enterT) * 130 - exitT * 80;
        setLayer(productRefs.current[index], Math.min(enterT, 1 - exitT), 0, y, true);
        if (enterT > 0 && exitT < 1) current = index;
      });
      setActiveProduct((prev) => (prev === current ? prev : current));
    } else {
      const fallbackOpacity = windowOpacity(progress, 0.43, 0.5, 0.96);
      setLayer(productRefs.current[0], fallbackOpacity, 0, reducedMotion ? 0 : (1 - fallbackOpacity) * 130, true);
    }
    setLayer(productNumbersRef.current, count > 1 ? windowOpacity(progress, 0.5, 0.55, 0.98) : 0, 0, 0, true);
    if (walkMediaRef.current) walkMediaRef.current.style.transform = `scale(${1 + range(progress, 0.9, 1) * 0.12})`;
  };

  useEffect(() => {
    const root = rootRef.current;
    const stage = stageRef.current;
    if (!root || !stage || !walkSource) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const configuredScreens = Number(props.scrollScreens ?? 8);
    const screens = Number.isFinite(configuredScreens) ? Math.max(2, configuredScreens) : 8;
    const scrollParent = root.closest(".builder-scroll");
    const scroller = scrollParent instanceof HTMLElement ? scrollParent : window;
    // Medimos el inicio real en cada gesto: escenas anteriores pueden cambiar de alto
    // después de cargar y dejar obsoleta una posición guardada al montar.
    const isMobile = ctx.previewDevice ? ctx.previewDevice === "mobile" : root.clientWidth < 768;
    isDesktopRef.current = !isMobile;
    let frame = 0;
    let previousTime = performance.now();
    let cachedTop = 0;
    let cachedTravel = 1;

    const currentOffset = () => (scroller instanceof Window ? window.scrollY : scroller.scrollTop);

    const measureTarget = () => {
      const rootRect = root.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      const scrollerTop = scrollParent instanceof HTMLElement ? scrollParent.getBoundingClientRect().top : 0;
      const travel = Math.max(1, root.offsetHeight - stageRect.height);
      targetProgressRef.current = clamp01((scrollerTop - rootRect.top) / travel);
      const offset = currentOffset();
      cachedTop = offset + rootRect.top - scrollerTop;
      cachedTravel = travel;
      scrollInfoRef.current = { scroller, offset: cachedTop, travel };
    };
    const tick = (time: number) => {
      const elapsed = Math.min(64, time - previousTime);
      previousTime = time;
      const target = targetProgressRef.current;
      const current = progressRef.current;
      const smoothing = reducedMotion ? 1 : 1 - Math.pow(0.82, elapsed / 16.67);
      const next = Math.abs(target - current) < 0.00008 ? target : current + (target - current) * smoothing;
      renderProgress(next, reducedMotion);
      frame = window.requestAnimationFrame(tick);
    };
    let scrollFrame = 0;
    const onScroll = isMobile
      ? () => {
          if (scrollFrame) return;
          scrollFrame = window.requestAnimationFrame(() => {
            scrollFrame = 0;
            const scrollerTop = scrollParent instanceof HTMLElement ? scrollParent.getBoundingClientRect().top : 0;
            const progress = clamp01((scrollerTop - root.getBoundingClientRect().top) / cachedTravel);
            targetProgressRef.current = progress;
            renderProgress(progress, reducedMotion);
          });
        }
      : () => {
          measureTarget();
        };
    // En móvil la barra del navegador cambia el alto al hacer scroll; solo
    // recalculamos cuando cambia el ancho para que la página no salte.
    let lastWidth = 0;
    const size = () => {
      if (isMobile && lastWidth && window.innerWidth === lastWidth) return;
      lastWidth = window.innerWidth;
      const stageHeight = scrollParent instanceof HTMLElement ? scrollParent.clientHeight : window.innerHeight;
      stage.style.height = `${stageHeight}px`;
      root.style.height = `${stageHeight * screens}px`;
      measureTarget();
    };
    // Safari puede no entregar requestVideoFrameCallback cuando un video en pausa
    // termina una búsqueda. Al terminarla, perseguimos la última posición pedida.
    const onSeeked = () => seek(walkVideoRef.current, targetProgressRef.current);
    const onLoaded = () => seek(walkVideoRef.current, targetProgressRef.current);

    size();
    renderProgress(targetProgressRef.current, reducedMotion);
    const video = walkVideoRef.current;
    video?.addEventListener("seeked", onSeeked);
    video?.addEventListener("loadedmetadata", onLoaded);
    video?.pause();
    if (!isMobile) frame = window.requestAnimationFrame(tick);
    scroller.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", size, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      scroller.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", size);
      video?.removeEventListener("seeked", onSeeked);
      video?.removeEventListener("loadedmetadata", onLoaded);
      root.style.removeProperty("height");
      stage.style.removeProperty("height");
    };
  }, [walkSource, frameSequence, props.scrollScreens, ctx.previewDevice, productIds.join(",")]);

  const jumpToProduct = (index: number) => {
    const info = scrollInfoRef.current;
    const count = walkProducts.length;
    if (!info || count === 0) return;
    const slot = (0.96 - 0.43) / count;
    const target = isDesktopRef.current ? 0.43 + 0.06 : 0.43 + index * slot + slot * 0.55;
    if (info.scroller instanceof Window) {
      info.scroller.scrollTo({ top: info.offset + info.travel * target, behavior: "smooth" });
    } else {
      info.scroller.scrollTo({ top: info.offset + info.travel * target, behavior: "smooth" });
    }
  };

  const onMetadata = (video: HTMLVideoElement | null) => {
    const p = progressRef.current;
    seek(video, clamp01(targetProgressRef.current || p));
  };

  if (!props.walkVideo) {
    return (
      <section className="flex min-h-[70vh] w-full items-center justify-center bg-ink px-8 text-center text-ivory">
        <div>
          <p className="font-nm text-[10px] uppercase tracking-[0.2em] opacity-55">Video scroll + productos</p>
          <p className="mt-4 max-w-sm font-nm text-3xl uppercase leading-none">Sube un video para construir el recorrido.</p>
        </div>
      </section>
    );
  }

  return (
    <section ref={rootRef} data-walk-scene className="@container/walk relative min-h-[100svh] w-full bg-ink text-ivory">
      <div ref={stageRef} className="sticky top-0 h-[100svh] w-full overflow-hidden bg-ink">
        <div ref={walkMediaRef} className="absolute inset-0 md:will-change-transform">
          {frameSequence ? (
            <ScrollFrames
              ref={framesRef}
              sequence={frameSequence}
              desktopSet="wide"
              mobileSet="square"
              mobilePosX={0.79}
              desktopPosX={props.walkPosition === "left" ? 0 : props.walkPosition === "right" ? 1 : 0.5}
              className="absolute inset-0 size-full"
            />
          ) : (
            <video
              ref={walkVideoRef}
              src={walkSource}
              poster={posterUrlFor(props.walkVideo)}
              muted
              playsInline
              preload="auto"
              onLoadedMetadata={() => onMetadata(walkVideoRef.current)}
              className={cn(
                "absolute inset-0 size-full object-cover object-[62%_center]",
                props.walkPosition === "left" ? "md:object-left" : props.walkPosition === "right" ? "md:object-right" : "md:object-center",
              )}
            />
          )}
        </div>
        <div className="absolute inset-0 bg-ink/15" />

        <div ref={walkMetaRef} className="absolute inset-x-5 top-20 z-10 flex items-center justify-between font-nm text-[9px] uppercase tracking-[0.2em] md:inset-x-10 md:top-24 md:text-[10px]">
          <span>{props.walkChapter || "01 / The Walk"}</span>
          <span className="flex items-center gap-2">{props.scrollLabel || "Scroll"} <ArrowDown className="size-3" /></span>
        </div>

        <div ref={walkTitleRef} className="absolute left-5 top-[28%] z-10 max-w-[70vw] md:left-[7vw] md:top-[24%] md:max-w-[42vw]">
          {props.walkTitle && (
            <h2 className="whitespace-pre-line font-nm text-[clamp(3.25rem,11vw,10rem)] leading-[0.78]">{props.walkTitle}</h2>
          )}
          {props.walkBody && <p className="mt-6 max-w-xs text-xs leading-relaxed opacity-75 md:text-sm">{props.walkBody}</p>}
        </div>

        {props.editorialImage && (
          <div ref={editorialImageRef} className="absolute bottom-[8vh] left-5 z-10 w-[48vw] max-w-sm md:bottom-[10vh] md:left-[8vw] md:w-[26vw]">
            <img src={props.editorialImage} alt={props.editorialImageAlt || "Imagen editorial"} className="h-auto w-full object-cover" />
            {props.editorialCaption && <p className="mt-3 max-w-xs font-nm text-[9px] uppercase tracking-[0.18em]">{props.editorialCaption}</p>}
          </div>
        )}

        {walkProducts.length > 0 ? (
          walkProducts.map((product, index) => (
            <div
              key={product.id}
              ref={(el) => {
                productRefs.current[index] = el;
              }}
              style={{ left: `${2 + index * (96 / Math.max(walkProducts.length, 1))}%`, width: `${96 / Math.max(walkProducts.length, 1)}%` }}
              className={cn("absolute bottom-[12%] z-20 px-2 opacity-0", ctx.previewDevice === "mobile" ? "!left-[6%] !w-[88%]" : "max-md:!left-[6%] max-md:!w-[88%]")}
            >
              <ProductEditorial product={product} stacked />
            </div>
          ))
        ) : (
          <div
            ref={(el) => {
              productRefs.current[0] = el;
            }}
            className="absolute bottom-[6vh] left-4 z-20 opacity-0 md:bottom-[7vh] md:left-[7vw]"
          >
            <ProductEditorial product={selectedProduct} />
          </div>
        )}
        <div ref={productNumbersRef} className="absolute bottom-7 right-5 z-30 flex gap-4 md:bottom-10 md:right-10" aria-label="Elegir producto">
          {walkProducts.map((product, index) => (
            <Button
              key={product.id}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={activeProduct === index}
              onClick={() => jumpToProduct(index)}
              className={cn("h-auto min-w-0 rounded-none border-b px-1 py-1 font-nm text-xs text-ivory", activeProduct === index ? "border-ivory opacity-100" : "border-transparent opacity-50")}
            >
              {String(index + 1).padStart(2, "0")}
            </Button>
          ))}
        </div>

      </div>
    </section>
  );
}