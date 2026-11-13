import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { B2BTopBar } from "@/components/b2b/b2b-topbar";
import { ProductMasonry } from "@/components/b2b/product-masonry";
import { useB2BCollections, useB2BProducts, useB2BSettings, wholesalePrice } from "@/lib/b2b/portal";

export const Route = createFileRoute("/_authenticated/b2b/productos")({
  validateSearch: (search: Record<string, unknown>): { coleccion?: string } =>
    typeof search['coleccion'] === "string" && search['coleccion'] ? { coleccion: search['coleccion'] as string } : {},
  head: () => ({
    meta: [
      { title: "Productos mayoristas · Tu Marca" },
      { name: "description", content: "Catálogo mayorista con tallas, colores y precios para boutiques." },
      { property: "og:title", content: "Productos mayoristas · Tu Marca" },
      { property: "og:description", content: "Catálogo mayorista con tallas, colores y precios." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: B2BProducts,
});

function B2BProducts() {
  const { coleccion } = Route.useSearch();
  const navigate = Route.useNavigate();
  const { data: collections, isLoading: collectionsLoading } = useB2BCollections();
  const { data: products, isLoading } = useB2BProducts(coleccion ?? null);
  const { data: settings } = useB2BSettings();
  const [q, setQ] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (products ?? []).filter((p: any) => {
      if (settings && (minPrice !== "" || maxPrice !== "")) {
        const min = minPrice === "" ? 0 : Number(minPrice);
        const max = maxPrice === "" ? Infinity : Number(maxPrice);
        if (!(p.product_variants ?? []).some((v: any) => {
          const price = wholesalePrice(v, settings);
          return v.active !== false && price > 0 && price >= min && price <= max;
        })) return false;
      }
      if (!term) return true;
      return (
        p.name.toLowerCase().includes(term) ||
        (p.product_type ?? "").toLowerCase().includes(term) ||
        (p.product_variants ?? []).some((v: any) => (v.sku ?? "").toLowerCase().includes(term))
      );
    });
  }, [products, q, settings, minPrice, maxPrice]);

  return (
    <div className="flex-1 flex flex-col">
      <B2BTopBar />
      <div className="p-4 md:p-6">
        <header className="mb-5">
          <p className="text-[10px] tracking-[0.2em] text-ink/50">CATÁLOGO MAYORISTA</p>
          <h1 className="font-serif italic text-3xl md:text-4xl mt-1">Productos</h1>
        </header>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="flex-1 flex items-center gap-2 bg-white border border-ink/12 rounded-full px-4 py-2.5">
            <Search className="size-3.5 text-ink/40" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, tipo o referencia…" className="flex-1 bg-transparent text-[13px] outline-none" />
          </div>
          <select
            value={coleccion ?? ""}
            onChange={(e) => navigate({ search: e.target.value ? { coleccion: e.target.value } : {} })}
            className="bg-white border border-ink/12 rounded-full px-4 py-2.5 text-[13px] outline-none"
          >
            <option value="">Todas las colecciones</option>
            {(collections ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap items-end gap-3 mb-6">
          <label className="text-[11px] text-ink/65 flex flex-col gap-1.5">
            Precio mayorista desde ({settings?.currency ?? "COP"})
            <input type="number" min="0" inputMode="numeric" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} placeholder="Mínimo" className="w-36 bg-white border border-ink/12 rounded-md px-3 py-2 text-[13px] text-ink outline-none focus:border-ink/40" />
          </label>
          <label className="text-[11px] text-ink/65 flex flex-col gap-1.5">
            Hasta ({settings?.currency ?? "COP"})
            <input type="number" min="0" inputMode="numeric" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} placeholder="Máximo" className="w-36 bg-white border border-ink/12 rounded-md px-3 py-2 text-[13px] text-ink outline-none focus:border-ink/40" />
          </label>
          {(minPrice || maxPrice) && <Button variant="ghost" size="sm" onClick={() => { setMinPrice(""); setMaxPrice(""); }}>Limpiar</Button>}
        </div>

        {(collectionsLoading || isLoading) && <p className="text-sm text-ink/50">Cargando catálogo…</p>}
        {!collectionsLoading && !isLoading && settings && <ProductMasonry products={rows} settings={settings} />}
      </div>
    </div>
  );
}
