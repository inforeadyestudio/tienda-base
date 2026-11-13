import { forwardRef, useEffect, useRef, useState } from "react";
import HTMLFlipBook from "react-pageflip";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { optimizedImageUrl } from "@/lib/media";

export type CollectionPageProduct = {
  id: string;
  slug: string;
  name: string;
  photos: string[];
};

type Page = { kind: "cover"; image: string | null; title: string; subtitle?: string | null }
  | { kind: "product"; product: CollectionPageProduct; image: string; number: number };

const Paper = forwardRef<HTMLDivElement, { page: Page; total: number; near: boolean }>(function Paper({ page, total, near }, ref) {
  return (
    <div ref={ref} className="b2b-paper relative h-full w-full overflow-hidden bg-ivory">
      {page.image && near && <img src={optimizedImageUrl(page.image, 900)} alt={page.kind === "cover" ? `Portada de ${page.title}` : page.product.name} loading="eager" decoding="async" className="absolute inset-0 h-full w-full object-cover" />}
      {page.kind === "cover" ? (
        <div className="absolute inset-x-0 bottom-0 p-5 md:p-8 bg-ink/75 text-ivory">
          <p className="text-[10px] uppercase tracking-widest mb-2">Tu Marca · Wholesale</p>
          <h2 className="font-nm text-3xl md:text-5xl leading-none break-words">{page.title}</h2>
          {page.subtitle && <p className="text-xs md:text-sm mt-3">{page.subtitle}</p>}
        </div>
      ) : (
        <div className="absolute inset-x-0 bottom-0 p-4 md:p-6 bg-ink/75 text-ivory flex items-end justify-between gap-3">
          <div className="min-w-0"><p className="text-[10px] uppercase tracking-widest">{String(page.number).padStart(2, "0")} / {String(total).padStart(2, "0")}</p><h3 className="font-nm text-lg md:text-2xl leading-tight break-words mt-1">{page.product.name}</h3></div>
          <Link to="/b2b/producto/$slug" params={{ slug: page.product.slug }} className="shrink-0 text-xs underline underline-offset-4 hover:opacity-70">Ver prenda ↗</Link>
        </div>
      )}
    </div>
  );
});

export function CollectionFlipbook({ title, subtitle, cover, products }: { title: string; subtitle?: string | null; cover: string | null; products: CollectionPageProduct[] }) {
  const book = useRef<{ pageFlip: () => { flipNext: () => void; flipPrev: () => void } | undefined } | null>(null);
  const [index, setIndex] = useState(0);
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 640px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const pages: Page[] = [{ kind: "cover", title, subtitle, image: cover ?? products.find((p) => p.photos.length)?.photos[0] ?? null }];
  products.forEach((product) => product.photos.forEach((image) => pages.push({ kind: "product", product, image, number: pages.length })));
  if (pages.length === 1) return <p className="text-sm text-ink/60">Esta colección aún no tiene fotos de productos publicados.</p>;

  return (
    <section aria-label={`Revista ${title}`} tabIndex={0} onKeyDown={(event) => {
      if (event.key === "ArrowRight") { event.preventDefault(); book.current?.pageFlip()?.flipNext(); }
      if (event.key === "ArrowLeft") { event.preventDefault(); book.current?.pageFlip()?.flipPrev(); }
    }} className="mb-10 focus-visible:outline-2 focus-visible:outline-ink">
      <div className="b2b-book-stage mx-auto w-full max-w-[980px] min-h-[380px] sm:min-h-[530px] flex justify-center items-center py-5 sm:py-8">
        <HTMLFlipBook
          key={mobile ? "portrait" : "landscape"} ref={book} width={mobile ? 300 : 400} height={mobile ? 420 : 520} size="stretch" minWidth={mobile ? 250 : 170} maxWidth={mobile ? 340 : 440} minHeight={mobile ? 350 : 250} maxHeight={mobile ? 475 : 570}
          drawShadow flippingTime={720} usePortrait startZIndex={0} autoSize maxShadowOpacity={0.18}
          showCover mobileScrollSupport clickEventForward useMouseEvents swipeDistance={30}
          showPageCorners disableFlipByClick={false} startPage={0} className="b2b-flipbook cursor-grab active:cursor-grabbing" style={{}}
          onFlip={(event) => setIndex(event.data)}
        >
          {pages.map((page, i) => <Paper key={i} page={page} total={pages.length - 1} near={Math.abs(i - index) <= 4} />)}
        </HTMLFlipBook>
      </div>
      <div className="flex items-center justify-center gap-5 text-xs text-ink/60">
        <Button variant="outline" size="icon" aria-label="Página anterior" title="Página anterior" disabled={index === 0} onClick={() => book.current?.pageFlip()?.flipPrev()}><ArrowLeft /></Button>
        <span aria-live="polite" className="min-w-16 text-center">{index + 1} / {pages.length}</span>
        <Button variant="outline" size="icon" aria-label="Página siguiente" title="Página siguiente" disabled={index >= pages.length - 1} onClick={() => book.current?.pageFlip()?.flipNext()}><ArrowRight /></Button>
      </div>
    </section>
  );
}