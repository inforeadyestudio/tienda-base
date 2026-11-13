import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteNav } from "@/components/storefront/site-nav";
import { SiteFooter } from "@/components/storefront/site-footer";
import { SceneRenderer } from "@/components/scenes/scene-renderer";
import { collectionWithProductsQuery, publishedExperienceQuery } from "@/lib/scenes/data";
import { BrandLoader } from "@/components/ui/page-loader";
import { pageBackgroundClass, pageBackgroundStyle } from "@/lib/scenes/page-theme";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/our-world")({
  head: () =>
    seoHead({
      title: "Nuestro mundo | Tu Marca",
      description:
        "Conoce la historia de Tu Marca.",
      path: "/our-world",
    }),
  component: OurWorldPage,
});

function OurWorldPage() {
  const ctxQ = useQuery(collectionWithProductsQuery("our-world"));
  const ctx = ctxQ.data;
  const expQ = useQuery(publishedExperienceQuery(ctx?.collection?.id));
  const scenes = expQ.data?.scenes ?? [];

  const waiting = ctxQ.isPending || (!!ctx?.collection && (expQ.isPending || expQ.fetchStatus === "fetching"));
  if (waiting) return <BrandLoader full />;

  return (
    <div style={pageBackgroundStyle(expQ.data?.theme)} className={`min-h-screen font-sans ${pageBackgroundClass(expQ.data?.theme)}`}>
      <SiteNav />
      {ctx?.collection && scenes.length > 0 ? (
        <SceneRenderer scenes={scenes} background={String(expQ.data?.theme?.background ?? "ivory")} sound={(expQ.data?.theme as any)?.sound} ctx={{ collection: ctx.collection as any, products: (ctx.products ?? []) as any }} />
      ) : (
        <OurWorldFallback />
      )}
      <SiteFooter />
    </div>
  );
}

function OurWorldFallback() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-24 text-center">
      <p className="font-nm text-[10px] uppercase tracking-[0.28em] text-moss/60">Tu Marca</p>
      <h1 className="mt-4 font-serif text-5xl italic text-ink">Our World</h1>
      <p className="mt-6 text-[15px] leading-relaxed text-moss">
        Nuestro universo: el oficio, los materiales y las manos que dan forma a cada pieza en Colombia. Esta página está
        lista para diseñarse desde el editor de la tienda online.
      </p>
      <Link
        to="/coleccion/$slug"
        params={{ slug: "todo" }}
        className="mt-8 inline-block font-nm text-[10px] uppercase tracking-[0.25em] border-b border-ink pb-1"
      >
        Ver colecciones
      </Link>
    </main>
  );
}
