import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Button } from "@/components/ui/button";
import { isDarkBackground } from "@/lib/scenes/page-theme";
import { posterUrlFor } from "@/lib/media";
import type { Layer, SceneContext } from "@/lib/scenes/types";
import { selectedProductsQuery, type CarouselProduct } from "./product-carousel";
import { ScrollFrames, frameSequenceFor, type ScrollFramesHandle } from "./scroll-frames";

type Props = { props: Record<string, any>; layers: Layer[]; ctx: SceneContext };

export function ProductPortraitScene({ props, ctx }: Props) {
  const fallbackId = props.lookProductId || ctx.products.find((item) =>
    !/prueba|test/i.test(item.name) && item.product_variants?.some((variant) => variant.price_cop > 0)
  )?.id || ctx.products[0]?.id;
  const ids: string[] = Array.isArray(props.portraitProductIds) && props.portraitProductIds.length
    ? props.portraitProductIds : fallbackId ? [fallbackId] : [];
  const { data } = useQuery(selectedProductsQuery(ids) as any);
  const products = ids.map((id) => (data as CarouselProduct[] | undefined)?.find((item) => item.id === id)
    ?? ctx.products.find((item) => item.id === id)).filter((item): item is CarouselProduct => Boolean(item));
  const [active, setActive] = useState(0);
  const product = products[active % products.length];
  const image = product?.hero_image_url || product?.product_images?.[0]?.url || product?.cutout_url;
  const portraitBg = typeof props.portraitBg === "string" && /^#[0-9a-fA-F]{6}$/.test(props.portraitBg) ? props.portraitBg : "#ffffff";
  const portraitStyle = { "--portrait-bg": portraitBg, "--portrait-fg": isDarkBackground(portraitBg) ? "var(--color-ivory)" : "var(--color-ink)" } as CSSProperties;
  // Colección que abre el botón «Ver nueva colección»; si no se eligió, sigue abriendo la de siempre.
  const ctaCollectionSlug = typeof props.heroCollectionSlug === "string" && props.heroCollectionSlug ? props.heroCollectionSlug : ctx.collection.slug;

  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoSource: string | undefined = props.lookVideo;
  const frameSequence = frameSequenceFor(videoSource);
  const framesRef = useRef<ScrollFramesHandle>(null);

  // En todos los tamaños el video sigue el desplazamiento, sin reproducirse solo.
  useEffect(() => {
    const video = videoRef.current;
    const section = sectionRef.current;
    if (!section || !videoSource) return;
    if (frameSequence) {
      // Fotogramas en lienzo: estables en todos los navegadores.
      const scrollParent = section.closest(".builder-scroll");
      let raf = 0;
      const draw = () => {
        raf = 0;
        const rect = section.getBoundingClientRect();
        const travel = Math.max(1, rect.height - (section.firstElementChild?.clientHeight ?? window.innerHeight));
        framesRef.current?.draw(Math.min(1, Math.max(0, -rect.top / travel)));
      };
      const onScroll = () => { if (!raf) raf = requestAnimationFrame(draw); };
      draw();
      window.addEventListener("scroll", onScroll, { passive: true });
      window.addEventListener("resize", onScroll);
      scrollParent?.addEventListener("scroll", onScroll, { passive: true });
      return () => {
        window.removeEventListener("scroll", onScroll);
        window.removeEventListener("resize", onScroll);
        scrollParent?.removeEventListener("scroll", onScroll);
        cancelAnimationFrame(raf);
      };
    }
    if (!video) return;
    video.pause();
    let raf = 0;
    let targetTime = 0;
    const seek = () => {
      raf = 0;
      if (!Number.isFinite(video.duration) || video.duration <= 0 || video.seeking) return;
      // No encadenar búsquedas de fotogramas mientras el navegador decodifica la anterior.
      if (Math.abs(video.currentTime - targetTime) >= (window.innerWidth < 768 ? 1 / 15 : 1 / 24)) video.currentTime = targetTime;
    };
    const scheduleSeek = () => {
      if (!raf) raf = requestAnimationFrame(seek);
    };
    const update = () => {
      const rect = section.getBoundingClientRect();
      // Repartir todos los fotogramas a lo largo del tramo en que el retrato permanece fijo.
      const travel = Math.max(1, rect.height - (section.firstElementChild?.clientHeight ?? window.innerHeight));
      const progress = Math.min(1, Math.max(0, -rect.top / travel));
      if (Number.isFinite(video.duration)) targetTime = progress * Math.max(0, video.duration - 0.04);
      scheduleSeek();
    };
    const onScroll = () => update();
    video.addEventListener("loadedmetadata", update);
    video.addEventListener("seeked", scheduleSeek);
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    const scrollParent = section.closest(".builder-scroll");
    scrollParent?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      video.removeEventListener("loadedmetadata", update);
      video.removeEventListener("seeked", scheduleSeek);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      scrollParent?.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [videoSource, frameSequence]);

  return (
    <section ref={sectionRef} className="relative h-[220svh] bg-[var(--portrait-bg)] text-[var(--portrait-fg)]" style={portraitStyle}>
      <div className="sticky top-0 flex h-[100svh] items-stretch overflow-hidden">
      {props.lookVideo && frameSequence ? (
        <ScrollFrames
          ref={framesRef}
          sequence={frameSequence}
          desktopSet="portrait"
          mobileSet="portrait"
          posY={props.lookPosition === "top" ? 0 : props.lookPosition === "bottom" ? 1 : 0.5}
          className="absolute inset-0 size-full md:left-1/2 md:w-1/2"
        />
      ) : props.lookVideo ? (
        <video
          ref={videoRef}
          src={videoSource}
          poster={posterUrlFor(props.lookVideo)}
          muted playsInline preload="auto"
          className={`absolute inset-0 size-full object-cover md:left-1/2 md:w-1/2 ${props.lookPosition === "top" ? "object-top" : props.lookPosition === "bottom" ? "object-bottom" : "object-center"}`}
        />
      ) : <div className="absolute inset-0 bg-moss md:left-1/2 md:w-1/2" />}
        <div className="absolute inset-0 bg-ink/30 md:hidden" />
        <div className="relative z-10 flex min-h-[100svh] w-full flex-col gap-6 px-5 pb-18 pt-24 text-ivory md:w-1/2 md:px-10 md:pb-12 md:pt-20 md:text-[var(--portrait-fg)]">
          <div className="relative flex min-h-0 flex-1 flex-col items-center justify-center gap-5">
            {product && image && <Link to="/producto/$slug" params={{ slug: product.slug }} aria-label={`Ver ${product.name}`} className="hidden w-full justify-center md:flex"><img key={product.id} src={image} alt={product.name} className="max-h-[74svh] w-auto max-w-[96%] object-contain" /></Link>}
            <div className="relative hidden w-full items-center md:flex">
              <div className="flex w-full flex-wrap items-center justify-center gap-x-6 gap-y-3">
                {product && <Link to="/producto/$slug" params={{ slug: product.slug }} className="inline-flex items-center gap-2 border-b border-current pb-1 font-nm text-[10px] uppercase">Ver producto <ArrowRight className="size-3" /></Link>}
                <Link to="/coleccion/$slug" params={{ slug: ctaCollectionSlug }} className="inline-flex items-center gap-2 border-b border-current pb-1 font-nm text-[10px] uppercase">Ver nueva colección <ArrowRight className="size-3" /></Link>
                <Link to="/tienda" className="inline-flex items-center gap-2 bg-[var(--portrait-fg)] px-5 py-2.5 font-nm text-[10px] uppercase tracking-[0.16em] text-[var(--portrait-bg)] transition-opacity hover:opacity-85">Shop now</Link>
              </div>
              {products.length > 1 && <div className="absolute right-0 top-1/2 flex -translate-y-1/2 items-center gap-3">
                <Button type="button" variant="ghost" size="icon" aria-label="Producto anterior" title="Producto anterior" onClick={() => setActive((i) => (i - 1 + products.length) % products.length)} className="rounded-none text-inherit hover:bg-ink/10"><ArrowLeft className="size-5" /></Button>
                <span className="font-nm text-xs tabular-nums">{String(active % products.length + 1).padStart(2, "0")} / {String(products.length).padStart(2, "0")}</span>
                <Button type="button" variant="ghost" size="icon" aria-label="Producto siguiente" title="Producto siguiente" onClick={() => setActive((i) => (i + 1) % products.length)} className="rounded-none text-inherit hover:bg-ink/10"><ArrowRight className="size-5" /></Button>
              </div>}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 md:hidden">
            <Link to="/coleccion/$slug" params={{ slug: ctaCollectionSlug }} className="inline-flex items-center gap-2 border-b border-current pb-1 font-nm text-[10px] uppercase">Ver nueva colección <ArrowRight className="size-3" /></Link>
            <Link to="/tienda" className="inline-flex items-center gap-2 bg-ivory px-5 py-2.5 font-nm text-[10px] uppercase tracking-[0.16em] text-ink transition active:scale-[0.99]">Shop now</Link>
          </div>

        </div>
      </div>
    </section>
  );
}