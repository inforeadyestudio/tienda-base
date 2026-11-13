import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { productTypesQuery } from "@/lib/product-types";
import { InfiniteBoard, type BoardItem } from "@/components/storefront/infinite-board";
import { supabase } from "@/integrations/supabase/client";
import { SiteNav } from "@/components/storefront/site-nav";
import { SiteFooter } from "@/components/storefront/site-footer";
import { CatalogGrid } from "@/components/storefront/catalog-grid";
import { QuickAddModal } from "@/components/tienda/quick-add-modal";
import { queryOptions } from "@tanstack/react-query";
import { collectionsListQuery } from "@/lib/queries";
import { CollectionsCarousel } from "@/components/storefront/collections-carousel";
import { publishedExperienceQuery } from "@/lib/scenes/data";
import { SceneRenderer } from "@/components/scenes/scene-renderer";
import { BrandLoader } from "@/components/ui/page-loader";
import { pageBackgroundClass, pageBackgroundStyle } from "@/lib/scenes/page-theme";
import { seoHead } from "@/lib/seo";

function collectionQuery(slug: string) {
  return queryOptions({
    queryKey: ["storefront", "collection", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collections")
        .select(
          "id, slug, title, subtitle, cover_url, collection_products(position, products(id, slug, name, hero_image_url, status, available_national, available_international, product_variants(id, size, active, price_cop, price_usd, compare_at_cop, compare_at_usd, color, color_hex), product_type))"
        )
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export const Route = createFileRoute("/coleccion/$slug")({
  ssr: false,
  pendingComponent: () => <BrandLoader full />,
  loader: async ({ context, params }) => {
    const qc = context.queryClient;
    if (params.slug === "todo") {
      await qc.ensureQueryData(collectionsListQuery());
      return { title: "Todos los productos", subtitle: null, cover_url: null };
    }
    const collection: any = await qc.ensureQueryData(collectionQuery(params.slug));
    if (collection?.id) {
      await qc.ensureQueryData(publishedExperienceQuery(collection.id) as any).catch(() => null);
    }
    // Datos mínimos para el SEO de la colección.
    return { title: collection?.title ?? null, subtitle: collection?.subtitle ?? null, cover_url: collection?.cover_url ?? null };
  },
  head: ({ params, loaderData }) => {
    const data = loaderData as { title?: string | null; subtitle?: string | null } | undefined;
    const name = data?.title || params.slug.replace(/-/g, " ");
    return seoHead({
      title: params.slug === "todo" ? "Todos los productos | Tu Marca" : `${name} | Colección Tu Marca`,
      description: data?.subtitle
        ? `${data.subtitle} Colección de Tu Marca.`
        : `Colección ${name} de Tu Marca, con envíos a toda Colombia.`,
      path: `/coleccion/${params.slug}`,
      image: (loaderData as { cover_url?: string | null } | undefined)?.cover_url,
    });
  },
  component: CollectionPage,
});

function CollectionPage() {
  const { slug } = Route.useParams();
  const isDeck = slug === "todo";
  return (
    <div className="min-h-screen bg-ivory">
      <SiteNav />
      {isDeck ? <CollectionsDeck /> : <CollectionContent slug={slug} />}
      {!isDeck && <SiteFooter />}
    </div>
  );
}

function CollectionsDeck() {
  const { data } = useSuspenseQuery(collectionsListQuery());
  const { data: types } = useQuery(productTypesQuery());
  const [scope, setScope] = useState<"collections" | "types">("collections");

  const shapeOf = (v: unknown): "oval" | "rect" => (v === "rect" ? "rect" : "oval");

  const collectionItems: BoardItem[] = (data ?? []).map((c: any) => ({
    key: `c-${c.id}`,
    title: c.title,
    subtitle: c.subtitle ?? "Colección",
    cover: c.cover_url ?? null,
    to: "/coleccion/$slug",
    slug: c.slug,
    shape: shapeOf(c.board_shape),
  }));
  const typeItems: BoardItem[] = (types ?? [])
    .filter((t) => t.active)
    .map((t) => ({
      key: `t-${t.id}`,
      title: t.name,
      subtitle: "Categoría",
      cover: t.cover_url ?? null,
      to: "/tipo/$slug",
      slug: t.slug,
      shape: shapeOf(t.board_shape),
    }));

  const items = scope === "types" ? typeItems : collectionItems;

  if (!collectionItems.length && !typeItems.length) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-32 text-center text-moss/60 text-sm">
        Muy pronto nuevas colecciones aquí.
      </div>
    );
  }

  const tab = (value: typeof scope, label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setScope(value)}
      className={`rounded-full px-4 py-1.5 text-[11px] uppercase tracking-[0.18em] transition ${
        scope === value ? "bg-ivory text-ink" : "text-ivory/70 hover:text-ivory"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="relative">
      <h1 className="sr-only">Colecciones de Tu Marca</h1>

      <div className="pointer-events-none absolute inset-x-0 top-4 z-30 flex justify-center px-4">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-ink/85 p-1 backdrop-blur">
          {tab("collections", "Colecciones")}
          {tab("types", "Categorías")}
        </div>
      </div>

      {items.length ? (
        <InfiniteBoard items={items} />
      ) : (
        <div className="max-w-7xl mx-auto px-6 py-32 text-center text-moss/60 text-sm">
          Nada por aquí todavía.
        </div>
      )}
    </section>
  );
}

function CollectionContent({ slug }: { slug: string }) {
  const { data } = useSuspenseQuery(collectionQuery(slug));
  if (!data) throw notFound();
  const items = (data.collection_products ?? [])
    .map((cp) => cp.products)
    .filter((p): p is NonNullable<typeof p> => !!p && p.status === "published" && ((p as any).available_national || (p as any).available_international));
  return <CollectionBody data={data} items={items} />;
}

function CollectionBody({ data, items }: { data: any; items: any[] }) {
  const { data: experience } = useQuery(publishedExperienceQuery(data.id));

  if (experience?.scenes?.length) {
    return (
      <div style={pageBackgroundStyle(experience.theme)} className={pageBackgroundClass(experience.theme)}>
      <SceneRenderer
        scenes={experience.scenes}
        background={String(experience.theme?.background ?? "ivory")} sound={(experience.theme as any)?.sound}
        ctx={{
          collection: {
            id: data.id,
            slug: data.slug,
            title: data.title,
            subtitle: data.subtitle ?? null,
            cover_url: data.cover_url ?? null,
          },
          products: items as any,
        }}
      />
      </div>
    );
  }

  return (
    <div>
      <section className="max-w-7xl mx-auto px-6 pt-8 pb-16">
        {/* Desktop: portada oculta, solo el título */}
        <div className="hidden md:block max-w-md">
          <p className="text-[11px] uppercase tracking-[0.2em] text-moss/70">Colección</p>
          <h1 className="font-serif italic text-6xl md:text-7xl mt-4 leading-none">{data.title}</h1>
          {data.subtitle && <p className="mt-6 text-moss/80">{data.subtitle}</p>}
        </div>
        {/* Móvil: portada 4:5 con el título superpuesto */}
        <div className="md:hidden relative aspect-[4/5] w-full overflow-hidden bg-cream">
          {data.cover_url && (
            <img
              src={data.cover_url}
              alt={data.title}
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/70 to-transparent pt-16 pb-5 px-5">
            <p className="text-[10px] uppercase tracking-[0.2em] text-ivory/80">Colección</p>
            <h1 className="mt-1 font-nm text-sm tracking-wide text-ivory">{data.title}</h1>
            {data.subtitle && <p className="mt-1 text-[12px] text-ivory/80">{data.subtitle}</p>}
          </div>
        </div>
      </section>
      <div className="max-w-7xl mx-auto px-6 pb-20">
        <Grid items={items} />
      </div>
    </div>
  );
}

function Grid({ items }: { items: any[] }) {
  return <CatalogGrid items={items} />;
}
