import { createFileRoute, Link } from "@tanstack/react-router";
import { B2BTopBar } from "@/components/b2b/b2b-topbar";
import { BookOpen } from "lucide-react";
import { useB2BCollections, useRestockProductIds } from "@/lib/b2b/portal";
import { optimizedImageUrl } from "@/lib/media";
import { StockBadge } from "@/components/b2b/stock-badge";

export const Route = createFileRoute("/_authenticated/b2b/colecciones")({
  head: () => ({
    meta: [
      { title: "Colecciones mayoristas · Tu Marca" },
      { name: "description", content: "Colecciones disponibles para boutiques mayoristas de Tu Marca." },
      { property: "og:title", content: "Colecciones mayoristas · Tu Marca" },
      { property: "og:description", content: "Colecciones disponibles para boutiques mayoristas." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: B2BCollections,
});

function B2BCollections() {
  const { data, isLoading } = useB2BCollections();
  const { data: restockIds } = useRestockProductIds();

  return (
    <div className="flex-1 flex flex-col">
      <B2BTopBar />
      <div className="p-4 md:p-6">
        <header className="mb-6">
          <p className="text-[10px] tracking-[0.2em] text-ink/50">CATÁLOGO</p>
          <h1 className="font-serif italic text-3xl md:text-4xl mt-1">Colecciones</h1>
        </header>
        {isLoading && <p className="text-sm text-ink/50">Cargando…</p>}
        {!isLoading && !data?.length && <p className="text-sm text-ink/50">Aún no hay colecciones publicadas para Wholesale.</p>}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-7 md:gap-10">
          {(data ?? []).map((c: any) => (
            <Link
              key={c.id}
              to="/b2b/coleccion/$slug"
              params={{ slug: c.slug }}
              className="group block max-w-md w-full mx-auto focus-visible:outline-2 focus-visible:outline-ink"
            >
              <div className="relative mx-3 mb-5 transition-transform duration-500 motion-safe:group-hover:-translate-y-2 motion-safe:group-hover:rotate-1">
                <div className="absolute inset-0 translate-x-3 translate-y-3 bg-cream border border-ink/15 shadow-lg" aria-hidden="true" />
                <div className="absolute inset-0 translate-x-1.5 translate-y-1.5 bg-ivory border border-ink/10" aria-hidden="true" />
                <div className="relative aspect-[3/4] bg-cream border border-ink/15 overflow-hidden shadow-xl">
                  {(c.cover_url ?? c.collection_products?.find((cp: any) => cp.products?.status === "published" && cp.products?.hero_image_url)?.products?.hero_image_url) &&
                    <img src={optimizedImageUrl(c.cover_url ?? c.collection_products?.find((cp: any) => cp.products?.status === "published" && cp.products?.hero_image_url)?.products?.hero_image_url, 700)} alt={`Portada de ${c.title}`} className="w-full h-full object-cover" loading="lazy" />}
                  <StockBadge restock={!!restockIds && (c.collection_products ?? []).some((cp: any) => restockIds.has(cp.product_id))} className="absolute left-3 top-3" />
                  <div className="absolute inset-x-0 bottom-0 bg-ink/75 text-ivory p-5 md:p-6">
                    <p className="text-[10px] uppercase tracking-widest mb-2">Tu Marca · Wholesale</p>
                    <div className="font-nm text-2xl md:text-3xl leading-tight break-words">{c.title}</div>
                    {c.subtitle && <div className="text-xs mt-2">{c.subtitle}</div>}
                  </div>
                </div>
              </div>
              <div className="px-3 flex items-center justify-between gap-3 text-xs text-ink/60">
                <span>{(c.collection_products ?? []).filter((cp: any) => cp.products?.status === "published").length} referencias</span>
                <span className="inline-flex items-center gap-1.5 text-ink"><BookOpen className="size-4" /> Abrir revista</span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
