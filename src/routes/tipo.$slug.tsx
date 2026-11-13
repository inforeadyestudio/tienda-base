import { createFileRoute, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { SiteNav } from "@/components/storefront/site-nav";
import { SiteFooter } from "@/components/storefront/site-footer";
import { BrandLoader } from "@/components/ui/page-loader";
import { CatalogGrid } from "@/components/storefront/catalog-grid";
import { productTypeQuery, productsByTypeQuery } from "@/lib/product-types";
import { Media } from "@/components/scenes/scene-shell";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/tipo/$slug")({
  ssr: false,
  pendingComponent: () => <BrandLoader full />,
  loader: async ({ context, params }) => {
    const type = await context.queryClient.ensureQueryData(productTypeQuery(params.slug));
    if (type?.name) {
      await context.queryClient.ensureQueryData(productsByTypeQuery(type.name)).catch(() => null);
    }
  },
  head: ({ params, loaderData }) => {
    const name = (loaderData as { name?: string } | undefined)?.name ?? params.slug.replace(/-/g, " ");
    const description = `${name} de Tu Marca, con envíos a toda Colombia.`;
    return seoHead({ title: `${name} | Tu Marca`, description, path: `/tipo/${params.slug}` });
  },
  component: TypePage,
});

function TypePage() {
  const { slug } = Route.useParams();
  return (
    <div className="min-h-screen bg-ivory">
      <SiteNav />
      <TypeContent slug={slug} />
      <SiteFooter />
    </div>
  );
}

function TypeContent({ slug }: { slug: string }) {
  const { data: type } = useSuspenseQuery(productTypeQuery(slug));
  if (!type) throw notFound();
  return <TypeBody type={type} />;
}

function TypeBody({ type }: { type: { name: string; description: string | null; cover_url: string | null } }) {
  const { data: products } = useSuspenseQuery(productsByTypeQuery(type.name));

  return (
    <div>
      <section className="mx-auto max-w-7xl px-6 pb-16 pt-8">
        {/* Desktop: título a la izquierda, portada a la derecha */}
        <div className="hidden items-end gap-10 md:grid md:grid-cols-2">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-moss/70">Categoría</p>
            <h1 className="mt-4 font-serif text-6xl italic leading-none md:text-7xl">{type.name}</h1>
            {type.description && <p className="mt-6 max-w-md text-moss/80">{type.description}</p>}
          </div>
          {type.cover_url && (
            <div className="aspect-[4/3] overflow-hidden">
              <Media url={type.cover_url} alt={type.name} className="h-full w-full object-cover" />
            </div>
          )}
        </div>
        {/* Móvil: portada 4:5 con el título superpuesto, igual que las colecciones */}
        <div className="relative aspect-[4/5] w-full overflow-hidden bg-cream md:hidden">
          {type.cover_url && (
            <Media url={type.cover_url} alt={type.name} className="absolute inset-0 h-full w-full object-cover" />
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent px-5 pb-5 pt-16">
            <p className="text-[10px] uppercase tracking-[0.2em] text-ivory/80">Categoría</p>
            <h1 className="mt-1 font-nm text-sm tracking-wide text-ivory">{type.name}</h1>
            {type.description && <p className="mt-1 text-[12px] text-ivory/80">{type.description}</p>}
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-6 pb-20">
        <CatalogGrid items={products as any} typeLabel={type.name} />
      </div>
    </div>
  );
}
