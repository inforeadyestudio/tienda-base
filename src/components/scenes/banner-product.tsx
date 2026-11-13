import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { AutoVideo } from "@/components/media/auto-video";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatCOP } from "@/lib/format";
import type { Layer, SceneContext } from "@/lib/scenes/types";
import { cn } from "@/lib/utils";
import { selectedProductsQuery, type CarouselProduct } from "./product-carousel";
import { Media } from "./scene-shell";

type P = { props: Record<string, any>; layers: Layer[]; ctx: SceneContext };

function productVideoQuery(productId: string) {
  return {
    queryKey: ["scene", "banner-product-video", productId],
    enabled: !!productId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_videos")
        .select("url, position")
        .eq("product_id", productId)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.url ?? null;
    },
  };
}

function productImages(product: CarouselProduct) {
  const gallery = [...(product.product_images ?? [])]
    .sort((a, b) => a.position - b.position)
    .map((item) => item.url);
  return Array.from(new Set([product.hero_image_url, ...gallery].filter(Boolean) as string[]));
}

function ProductVisual({ product, kind, video }: { product: CarouselProduct; kind: string; video?: string | null }) {
  const images = useMemo(() => productImages(product), [product]);
  const [index, setIndex] = useState(0);

  useEffect(() => setIndex(0), [product.id, kind]);

  const fallback = product.hero_image_url ?? images[0] ?? null;
  const selectedImage = kind === "png" ? product.cutout_url ?? fallback : images[index] ?? fallback;

  if (kind === "video" && video) {
    return <AutoVideo src={video} className="h-full w-full object-cover" />;
  }

  return (
    <div className="group relative h-full w-full overflow-hidden">
      {selectedImage ? (
        <img
          src={selectedImage}
          alt={product.name}
          loading="lazy"
          decoding="async"
          className={cn("h-full w-full", kind === "png" ? "object-contain p-5 md:p-8" : "object-cover")}
        />
      ) : (
        <div className="h-full w-full bg-ink/5" />
      )}

      {kind === "gallery" && images.length > 1 && (
        <div className="absolute inset-x-3 top-1/2 flex -translate-y-1/2 justify-between opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Foto anterior"
            className="rounded-full shadow-none"
            onClick={() => setIndex((current) => (current - 1 + images.length) % images.length)}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="icon"
            aria-label="Foto siguiente"
            className="rounded-full shadow-none"
            onClick={() => setIndex((current) => (current + 1) % images.length)}
          >
            <ChevronRight />
          </Button>
        </div>
      )}
    </div>
  );
}

export function BannerProductScene({ props, ctx }: P) {
  const productId = String(props.productId ?? "");
  const { data } = useQuery(selectedProductsQuery(productId ? [productId] : []) as any);
  const product = ((data as CarouselProduct[] | undefined)?.[0] ??
    ctx.products.find((item) => item.id === productId)) as CarouselProduct | undefined;
  const mediaKind = String(props.mediaKind ?? "hero");
  const { data: productVideo } = useQuery({
    ...productVideoQuery(productId),
    enabled: mediaKind === "video" && !!productId,
  });
  const price = product
    ? Math.min(...(product.product_variants ?? []).map((variant) => variant.price_cop).filter((value) => value > 0))
    : Number.NaN;
  const productFirst = props.productSide === "left";

  const banner = (
    <div className="h-[62svh] min-h-[28rem] overflow-hidden bg-cream md:h-[78svh] md:min-h-[34rem] md:max-h-[52rem]">
      <Media url={props.bannerMedia} alt={props.bannerAlt || "Banner editorial"} className="h-full w-full object-cover" />
    </div>
  );

  const productPanel = (
    <div className="flex h-[62svh] min-h-[28rem] flex-col items-center justify-center bg-ivory px-6 py-10 text-center md:h-[78svh] md:min-h-[34rem] md:max-h-[52rem] md:px-10">
      {product ? (
        <>
          <Link
            to="/producto/$slug"
            params={{ slug: product.slug }}
            className="block w-full max-w-[19rem] overflow-hidden aspect-[4/5] bg-cream md:max-w-[22rem]"
          >
            <ProductVisual product={product} kind={mediaKind} video={productVideo} />
          </Link>
          <div className="mt-5 w-full max-w-[22rem]">
            <Link to="/producto/$slug" params={{ slug: product.slug }} className="font-serif text-2xl italic transition-opacity hover:opacity-60">
              {product.name}
            </Link>
            {Number.isFinite(price) && <p className="mt-1 text-xs opacity-65">{formatCOP(price)}</p>}
            <Link
              to="/producto/$slug"
              params={{ slug: product.slug }}
              className="mt-4 inline-block border-b border-current pb-1 font-nm text-[10px] uppercase tracking-[0.24em] transition-opacity hover:opacity-55"
            >
              {props.ctaLabel || "Ver producto"}
            </Link>
          </div>
        </>
      ) : (
        <p className="max-w-xs text-sm opacity-55">Escoge un producto para completar esta sección.</p>
      )}
    </div>
  );

  return (
    <section className={cn("w-full overflow-hidden bg-ivory text-ink", props.hideOnMobile && "hidden md:block")}>
      <div className="grid grid-cols-1 md:grid-cols-[3fr_2fr]">
        {productFirst ? productPanel : banner}
        {productFirst ? banner : productPanel}
      </div>
    </section>
  );
}