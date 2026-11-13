import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { B2BTopBar } from "@/components/b2b/b2b-topbar";
import { CollectionMagazine } from "@/components/b2b/collection-magazine";
import { ProductMasonry } from "@/components/b2b/product-masonry";
import { isRestockProduct, useB2BCollectionPages, useB2BCollections, useB2BProducts, useB2BSettings } from "@/lib/b2b/portal";
import { StockBadge } from "@/components/b2b/stock-badge";

export const Route = createFileRoute("/_authenticated/b2b/coleccion/$slug")({
  head: () => ({
    meta: [
      { title: "Colección mayorista · Tu Marca" },
      { name: "description", content: "Referencias disponibles dentro de la colección mayorista." },
      { property: "og:title", content: "Colección mayorista · Tu Marca" },
      { property: "og:description", content: "Referencias disponibles dentro de la colección mayorista." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: B2BCollectionPage,
});

function B2BCollectionPage() {
  const { slug } = Route.useParams();
  const { data: collections, isLoading: collectionsLoading } = useB2BCollections();
  const collection = (collections ?? []).find((c: any) => c.slug === slug);
   const { data: products, isLoading } = useB2BProducts(collection?.id ?? null);
  const { data: pages, isLoading: pagesLoading } = useB2BCollectionPages(collection?.id);
  const { data: settings } = useB2BSettings();
  const [type, setType] = useState("");

  const types = useMemo(
    () => [...new Set((products ?? []).map((p: any) => p.product_type).filter(Boolean))].sort() as string[],
    [products],
  );
  const rows = useMemo(() => (products ?? []).filter((p: any) => !type || p.product_type === type), [products, type]);

  return (
    <div className="flex-1 flex flex-col">
      <B2BTopBar />
      <div className="p-4 md:p-6">
        <Link to="/b2b/colecciones" className="text-[11px] text-ink/60 hover:text-ink flex items-center gap-1 mb-4">
          <ArrowLeft className="size-3" /> Volver a colecciones
        </Link>

        {collectionsLoading && <p className="text-sm text-ink/50">Cargando colección…</p>}
        {!collectionsLoading && !collection && <p className="text-sm text-ink/60">Esta colección no está disponible para Wholesale.</p>}
        {collection && <><header className="mb-5">
          <p className="text-[10px] tracking-[0.2em] text-ink/50">COLECCIÓN</p>
          <h1 className="font-serif italic text-3xl md:text-4xl mt-1">{collection?.title ?? slug}</h1>
          {!isLoading && <StockBadge restock={(products ?? []).some((p: any) => isRestockProduct(p))} className="mt-2" />}
          {!isLoading && (products ?? []).some((p: any) => isRestockProduct(p)) && <p className="text-[12px] text-ink/55 mt-2">Unidades disponibles de inmediato. El pago se realiza al momento del despacho.</p>}
          {collection?.subtitle && <p className="text-[13px] text-ink/55 mt-1">{collection.subtitle}</p>}
        </header>

        {pagesLoading ? <p className="text-sm text-ink/50 mb-10">Cargando revista…</p> : <CollectionMagazine title={collection.title} subtitle={collection.subtitle} cover={collection.cover_url} products={pages ?? []} />}

        <h2 className="font-nm text-2xl mb-5">Prendas de la colección</h2>

        {types.length > 1 && (
          <div className="flex flex-wrap gap-2 mb-6">
            <button onClick={() => setType("")} className={"px-3.5 py-1.5 rounded-full text-[11px] border " + (!type ? "bg-ink text-ivory border-ink" : "bg-white border-ink/12 text-ink/70")}>Todas las prendas</button>
            {types.map((t) => (
              <button key={t} onClick={() => setType(type === t ? "" : t)} className={"px-3.5 py-1.5 rounded-full text-[11px] border " + (type === t ? "bg-ink text-ivory border-ink" : "bg-white border-ink/12 text-ink/70")}>{t}</button>
            ))}
          </div>
        )}

        {isLoading && <p className="text-sm text-ink/50">Cargando referencias…</p>}
        {!isLoading && settings && <ProductMasonry products={rows} settings={settings} />}
        </>}
      </div>
    </div>
  );
}
