import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { SiteNav } from "@/components/storefront/site-nav";
import { SiteFooter } from "@/components/storefront/site-footer";
import { featuredProductsQuery } from "@/lib/queries";
import { collectionWithProductsQuery, publishedExperienceQuery } from "@/lib/scenes/data";
import { SceneRenderer } from "@/components/scenes/scene-renderer";
import { formatCOP } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { Play, Heart, Sparkles, Shirt } from "lucide-react";


import model1 from "@/assets/model-1.png";
import model2 from "@/assets/model-2.png";
import model3 from "@/assets/model-3.png";
import model4 from "@/assets/model-4.png";
import model5 from "@/assets/model-5.png";
import model6 from "@/assets/model-6.png";
import model7 from "@/assets/model-7.png";
import model8 from "@/assets/model-8.png";
import { BrandLoader } from "@/components/ui/page-loader";
import notebookWall from "@/assets/vintage-notebook-wall-subtle.jpg";
import { storefrontHomeQuery } from "@/lib/storefront-home";
import { ShopPage } from "@/components/tienda/shop-page";
import { pageBackgroundClass, pageBackgroundStyle } from "@/lib/scenes/page-theme";
import { seoHead, SEO_DEFAULT_TITLE, SEO_DEFAULT_DESCRIPTION, SEO_KEYWORDS, seoOrganizationScript } from "@/lib/seo";

const EDITORIAL_MODELS = [model1, model2, model3, model4, model5, model6, model7, model8];

export const Route = createFileRoute("/")({
  head: () => {
    const base = seoHead({ title: SEO_DEFAULT_TITLE, description: SEO_DEFAULT_DESCRIPTION, path: "/" });
    return {
      meta: [...base.meta, { name: "keywords", content: SEO_KEYWORDS }],
      links: [...base.links, { rel: "preload", as: "image", href: notebookWall, fetchpriority: "high" }],
      scripts: [seoOrganizationScript()],
    };
  },
  component: HomePage,
});

export function HomePage({ fixedSlug }: { fixedSlug?: string } = {}) {
  const homeQ = useQuery(storefrontHomeQuery());
  if (!fixedSlug && (homeQ.data === "page-tienda" || homeQ.isError)) return <ShopPage />;
  return <HomeExperience fixedSlug={fixedSlug} homeQ={homeQ} />;
}

function HomeExperience({ fixedSlug, homeQ }: { fixedSlug?: string; homeQ: ReturnType<typeof useQuery<string>> }) {
  const desiredSlug = fixedSlug ?? homeQ.data;
  const ctxQ = useQuery({ ...collectionWithProductsQuery(desiredSlug ?? "home"), enabled: !!desiredSlug });
  const ctxData = ctxQ.data;
  const expQ = useQuery(publishedExperienceQuery(ctxData?.collection?.id));
  const experience = expQ.data;
  const scenes = experience?.scenes ?? [];
  const fallbackQ = useQuery({ ...collectionWithProductsQuery("home"), enabled: !fixedSlug && !!desiredSlug && desiredSlug !== "home" && !ctxQ.isPending && (!ctxData?.collection || (!expQ.isPending && !scenes.length)) });
  const fallbackExpQ = useQuery({ ...publishedExperienceQuery(fallbackQ.data?.collection?.id), enabled: !!fallbackQ.data?.collection?.id });
  const useFallback = !fixedSlug && desiredSlug !== "home" && (!ctxData?.collection || (!expQ.isPending && !scenes.length));
  const activeData = useFallback ? fallbackQ.data : ctxData;
  const activeExperience = useFallback ? fallbackExpQ.data : experience;

  const waitingForExperience =
    (!fixedSlug && homeQ.isLoading) || ctxQ.isLoading || (!!ctxData?.collection && expQ.isLoading) || (useFallback && (fallbackQ.isLoading || (!!fallbackQ.data?.collection && fallbackExpQ.isLoading)));

  if (waitingForExperience) {
    return <HomeLoading />;
  }

  if (ctxQ.isError || expQ.isError || (useFallback && (fallbackQ.isError || fallbackExpQ.isError))) {
    return <ShopPage />;
  }

  if (activeData?.collection && activeExperience?.scenes?.length) {
    return (
      <div style={pageBackgroundStyle(activeExperience.theme)} className={`min-h-screen font-sans ${pageBackgroundClass(activeExperience.theme)}`}>
        <SiteNav />
        <SceneRenderer
          scenes={activeExperience.scenes}
          background={String(activeExperience.theme?.background ?? "ivory")} sound={(activeExperience.theme as any)?.sound}
          ctx={{ collection: activeData.collection as any, products: (activeData.products ?? []) as any }}
        />
        <SiteFooter />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ivory text-ink font-sans">
      <SiteNav />
      <Suspense fallback={<div className="px-6 py-24 text-moss/50 text-sm">Cargando piezas…</div>}>
        <EditorialCollection />
      </Suspense>
      <Suspense fallback={<div className="px-6 py-24 text-moss/50 text-sm">Cargando favoritos…</div>}>
        <CustomerFavorites />
      </Suspense>
      <NewsletterBand />
      <BigStatement />
      <SiteFooter />
    </div>
  );
}

function HomeLoading() {
  return <BrandLoader full />;
}


function EditorialCollection() {
  const { data } = useSuspenseQuery(featuredProductsQuery());
  return (
    <section className="px-6 pt-10 pb-16">
      <header className="flex items-end justify-between gap-6 mb-8">
        <h1 className="font-nm font-medium leading-snug tracking-normal text-ink text-sm md:text-base">
          Colección Femenina
          <span className="text-ink/40"> /Piezas</span>
        </h1>
        <button className="hidden md:inline-flex items-center gap-2 text-xs text-ink/70 hover:text-ink shrink-0 pb-4">
          Filtro <span className="text-ink/40">⇅</span>
        </button>
      </header>
      {data.length === 0 ? (
        <p className="text-moss/60 text-sm">Muy pronto nuevas piezas.</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-10">
          {data.map((p, i) => {
            const price = p.product_variants?.[0]?.price_cop ?? 0;
            const img = EDITORIAL_MODELS[i % EDITORIAL_MODELS.length];
            return (
              <Link
                key={p.id}
                to="/producto/$slug"
                params={{ slug: p.slug }}
                className="group block"
              >
                <div className="relative aspect-[3/4] overflow-hidden flex items-end justify-center">
                  <span
                    aria-hidden
                    className="absolute left-1/2 -translate-x-1/2 bottom-[6%] w-[55%] h-3 rounded-[50%] bg-black/25 blur-md"
                  />
                  <img
                    src={img}
                    alt={p.name}
                    loading="lazy"
                    className="relative w-full h-full object-contain group-hover:scale-[1.02] transition-transform duration-700"
                  />
                </div>
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-nm text-sm text-ink">{p.name}</h3>
                    <p className="text-xs text-ink/60 mt-0.5">{formatCOP(price)}</p>
                  </div>
                  <div className="flex gap-1 pt-1">
                    <span className="size-3 bg-ink/80" />
                    <span className="size-3 bg-[#8b6f5e]" />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

const UGC_ITEMS = [
  { id: 1, handle: "@marianarueda", productSlug: "vestido-lino-natural", label: "Vestido Lino Natural", img: model1 },
  { id: 2, handle: "@sofiagomez", productSlug: "camisa-algodon-crudo", label: "Camisa Algodón Crudo", img: model2 },
  { id: 3, handle: "@gabrielafarfan", productSlug: "pantalon-editorial-arena", label: "Pantalón Editorial Arena", img: model3 },
  { id: 4, handle: "@lauravillamil", productSlug: "falda-larga-seda", label: "Falda Larga Seda", img: model4 },
  { id: 5, handle: "@danielaospina", productSlug: "top-cropped-canale", label: "Top Cropped Canalé", img: model5 },
  { id: 6, handle: "@catalinarestrepo", productSlug: "blazer-oversized-lino", label: "Blazer Oversized Lino", img: model6 },
  { id: 7, handle: "@paulahenao", productSlug: "short-tailored-algodon", label: "Short Tailored Algodón", img: model7 },
  { id: 8, handle: "@isabeltorres", productSlug: "vestido-midi-drapeado", label: "Vestido Midi Drapeado", img: model8 },
];

function CustomerFavorites() {
  const { data } = useSuspenseQuery(featuredProductsQuery());
  const [playing, setPlaying] = useState<number | null>(null);

  const findProduct = (slug: string) => data.find((p) => p.slug === slug) ?? data[0];

  return (
    <section className="px-6 py-16 md:py-20 bg-ivory border-t border-ink/5">
      <div className="flex items-end justify-between gap-6 mb-8">
        <h2 className="font-nm font-medium text-xs md:text-sm tracking-[0.14em] uppercase text-ink/80">
          Favoritos de nuestras clientas
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-ink/50">@tumarca</span>
        </div>
      </div>

      <Carousel
        opts={{
          align: "start",
          loop: true,
          slidesToScroll: 1,
        }}
        className="relative"
      >
        <CarouselContent className="-ml-4">
          {UGC_ITEMS.map((item) => {
            const product = findProduct(item.productSlug);
            const price = product?.product_variants?.[0]?.price_cop ?? 0;
            const isPlaying = playing === item.id;
            return (
              <CarouselItem
                key={item.id}
                className="pl-4 basis-[70%] sm:basis-[45%] md:basis-[30%] lg:basis-[23%]"
              >
                <Link
                  to="/producto/$slug"
                  params={{ slug: product?.slug ?? item.productSlug }}
                  className="group block"
                >
                  <div className="relative aspect-[3/4] overflow-hidden bg-cream">
                    <img
                      src={item.img}
                      alt={`${item.handle} vistiendo ${item.label}`}
                      loading="lazy"
                      className={cn(
                        "w-full h-full object-contain transition-transform duration-700",
                        !isPlaying && "group-hover:scale-[1.02]",
                      )}
                    />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setPlaying(isPlaying ? null : item.id);
                      }}
                      className="absolute inset-0 flex items-center justify-center"
                      aria-label={isPlaying ? "Pausar video" : "Reproducir video"}
                    >
                      <span className="size-12 md:size-14 rounded-full bg-ivory/90 backdrop-blur-sm flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                        <Play className="size-5 md:size-6 fill-ink text-ink ml-0.5" />
                      </span>
                    </button>
                    <div className="absolute top-3 left-3 flex items-center gap-1.5">
                      <span className="size-2 rounded-full bg-ink/80" />
                      <span className="text-[10px] md:text-xs text-ink/80 font-nm tracking-wide">
                        {item.handle}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-nm text-sm text-ink group-hover:underline underline-offset-4">
                        {item.label}
                      </h3>
                      <p className="text-xs text-ink/60 mt-0.5">{formatCOP(price)}</p>
                    </div>
                    <span className="text-[10px] text-ink/40 uppercase tracking-wider mt-1">
                      Ver
                    </span>
                  </div>
                </Link>
              </CarouselItem>
            );
          })}
        </CarouselContent>
        <CarouselPrevious className="left-0 md:-left-4 bg-ivory border-ink/10 hover:bg-ink hover:text-ivory disabled:opacity-0" />
        <CarouselNext className="right-0 md:-right-4 bg-ivory border-ink/10 hover:bg-ink hover:text-ivory disabled:opacity-0" />
      </Carousel>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-4 md:gap-6">
        <div className="flex items-center gap-3 px-5 py-3 rounded-full border border-ink/10 bg-cream/50">
          <Heart className="size-4 text-clay" />
          <span className="font-nm text-xs text-ink/80">Clientas reales</span>
        </div>
        <div className="flex items-center gap-3 px-5 py-3 rounded-full border border-ink/10 bg-cream/50">
          <Sparkles className="size-4 text-clay" />
          <span className="font-nm text-xs text-ink/80">Looks etiquetados</span>
        </div>
        <div className="flex items-center gap-3 px-5 py-3 rounded-full border border-ink/10 bg-cream/50">
          <Shirt className="size-4 text-clay" />
          <span className="font-nm text-xs text-ink/80">Compra el look</span>
        </div>
      </div>
    </section>
  );
}

function NewsletterBand() {
  return (
    <section className="bg-ink text-ivory px-6 py-16 md:py-20">

      <div className="grid md:grid-cols-2 gap-10 items-end">
        <h2 className="font-nm font-bold text-4xl md:text-6xl leading-[1] tracking-[-0.02em] max-w-xl">
          Suscríbete a nuestro newsletter para recibir novedades sobre nuevas piezas
        </h2>
        <div className="justify-self-end w-full max-w-md">
          <p className="font-nm font-bold text-6xl md:text-7xl text-ivory/10 text-right leading-none mb-8">
            Tu Marca
          </p>
          <label className="block border-b border-ivory/30 pb-2 flex items-center justify-between">
            <input
              type="email"
              placeholder="E-mail"
              className="bg-transparent outline-none flex-1 text-sm placeholder:text-ivory/50"
            />
            <span className="text-ivory/60">↗</span>
          </label>
          <label className="mt-4 flex items-center gap-2 text-xs text-ivory/60">
            <input type="checkbox" className="accent-ivory" />
            Acepto el tratamiento de mis datos personales
          </label>
        </div>
      </div>
    </section>
  );
}

function BigStatement() {
  return (
    <section className="px-6 py-16 md:py-24 flex items-center justify-between gap-6">
      <h2 className="font-nm font-bold text-5xl md:text-8xl leading-[0.95] tracking-[-0.03em] text-ink">
        Boutique editorial
      </h2>
      <Link
        to="/coleccion/$slug"
        params={{ slug: "todo" }}
        className="shrink-0 size-12 rounded-full border border-ink/30 flex items-center justify-center hover:bg-ink hover:text-ivory transition"
        aria-label="Ver todo"
      >
        ↑
      </Link>
    </section>
  );
}