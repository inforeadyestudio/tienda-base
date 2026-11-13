// Lógica (Claude NO modifica este archivo). El diseño recibe el resultado como `vm`.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { productTypesQuery } from "@/lib/product-types";
import { collectionsListQuery } from "@/lib/queries";
import { collectionWithProductsQuery, publishedExperienceQuery } from "@/lib/scenes/data";
import { CatalogBannerCell, interleaveBanners, type CatalogBanner } from "@/components/scenes/catalog-banners";
import {
  catalogQuery,
  collectionProductOrderQuery,
  salesRankQuery,
  facetsFrom,
  applyFilters,
  filtersFromFacet,
  emptyFilters,
  activeChips,
  slugify,
  type ShopFilters,
  type ShopProduct,
} from "@/lib/tienda/catalog";
import { useReadyPageContext } from "@/components/ready/ready-context";

export type Sort = "recomendados" | "nuevos" | "vendidos" | "precio-asc" | "precio-desc" | "nombre";

export const SORTS: Array<{ value: Sort; label: string }> = [
  { value: "recomendados", label: "Recomendados" },
  { value: "nuevos", label: "Nuevos" },
  { value: "vendidos", label: "Más vendidos" },
  { value: "precio-asc", label: "Precio: menor a mayor" },
  { value: "precio-desc", label: "Precio: mayor a menor" },
  { value: "nombre", label: "Alfabético" },
];

export function useShopPage(facet?: string) {
  useReadyPageContext({ page_type: "shop", collection_id: facet });
  const { data: products, isLoading, isError, isFetching, refetch } = useQuery(catalogQuery());
  const { data: salesRank } = useQuery(salesRankQuery());
  const { data: collections } = useQuery(collectionsListQuery());
  const pageQ = useQuery(collectionWithProductsQuery("page-tienda"));
  const pageExpQ = useQuery(publishedExperienceQuery(pageQ.data?.collection?.id));
  const allPageScenes = pageExpQ.data?.scenes ?? [];
  const pageScenes = useMemo(
    () =>
      allPageScenes.filter(
        (s: any) => s.type !== "catalog-banners" && s.type !== "products" && s.type !== "catalog-order",
      ),
    [allPageScenes],
  );
  const orderCfg = useMemo(() => {
    const s = allPageScenes.find((x: any) => x.type === "catalog-order" && x.visible !== false);
    return {
      mode: (s?.props?.mode ?? "auto") as "auto" | "collections" | "manual",
      collectionSlugs: (s?.props?.collectionSlugs ?? []) as string[],
      productIds: (s?.props?.productIds ?? []) as string[],
      pageSize: Math.max(4, Number(s?.props?.pageSize ?? 20) || 20),
    };
  }, [allPageScenes]);
  // Sección "Productos" configurada en Diseño → Tienda online: si limita la fuente
  // (una colección o una selección manual), el catálogo de /tienda la respeta.
  const scopeCfg = useMemo(() => {
    const s = allPageScenes.find((x: any) => x.type === "products" && x.visible !== false);
    const source = s?.props?.source as string | undefined;
    if (source === "collection" && s?.props?.collectionSlug)
      return { kind: "collection" as const, slug: String(s.props.collectionSlug) };
    if (source === "manual" && ((s?.props?.productIds ?? []) as string[]).length)
      return { kind: "manual" as const, ids: (s?.props?.productIds ?? []) as string[] };
    return null;
  }, [allPageScenes]);
  const { data: collectionOrder } = useQuery(collectionProductOrderQuery());
  const scopeIds = useMemo(() => {
    if (!scopeCfg) return null;
    const ids = scopeCfg.kind === "manual" ? scopeCfg.ids : (collectionOrder?.[scopeCfg.slug] ?? []);
    return ids.length ? ids : null;
  }, [scopeCfg, collectionOrder]);
  const banners: CatalogBanner[] = useMemo(
    () =>
      allPageScenes
        .filter((s: any) => (s.type === "catalog-banners" || s.type === "products") && s.visible !== false)
        .flatMap((s: any) => (s.props?.banners ?? []) as CatalogBanner[])
        .filter((b) => !!b?.media),
    [allPageScenes],
  );
  const all = useMemo(() => {
    const list = products ?? [];
    if (!scopeIds) return list;
    const rank = new Map(scopeIds.map((id, i) => [id, i]));
    return list
      .filter((p) => rank.has(p.id))
      .sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  }, [products, scopeIds]);

  // Los filtros sobreviven al ir a un producto y volver: se guardan en la
  // sesión mientras se siga en la misma categoría de /tienda.
  const [override, setOverrideState] = useState<ShopFilters | null>(() => {
    try {
      const raw = sessionStorage.getItem("tb-shop-filters");
      if (!raw) return null;
      const saved = JSON.parse(raw);
      return saved.facet === (facet ?? "") ? (saved.filters as ShopFilters) : null;
    } catch {
      return null;
    }
  });
  const setFilters = (f: ShopFilters) => {
    setOverrideState(f);
    try {
      sessionStorage.setItem("tb-shop-filters", JSON.stringify({ facet: facet ?? "", filters: f }));
    } catch {}
  };
  const base = useMemo(() => filtersFromFacet(facet, all), [facet, all]);
  const filters = override ?? base;

  const [panelOpen, setPanelOpen] = useState(false);
  const [cols, setCols] = useState<3 | 4 | 6>(3);
  const [sort, setSort] = useState<Sort>("recomendados");
  const [sortOpen, setSortOpen] = useState(false);

  const { data: productTypes } = useQuery(productTypesQuery());
  const baseFacets = useMemo(() => facetsFrom(all), [all]);
  const facets = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of all) {
      if (!p.product_type || p.product_type.includes(">")) continue;
      const key = slugify(p.product_type);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const managed = (productTypes ?? []).filter((t) => t.active !== false && counts.get(t.slug));
    const covered = new Set(managed.map((t) => t.slug));
    const fallback = baseFacets.types.filter((t) => !covered.has(slugify(t.value)));
    return {
      ...baseFacets,
      types: [...managed.map((t) => ({ value: t.name, total: counts.get(t.slug) ?? 0 })), ...fallback],
    };
  }, [all, productTypes, baseFacets]);
  const filtered = useMemo(() => applyFilters(all, filters), [all, filters]);
  const results = useMemo(() => {
    const list = [...filtered];
    const units = (p: ShopProduct) => salesRank?.[p.id] ?? 0;
    const newest = (p: ShopProduct) => new Date(p.created_at).getTime();
    if (sort === "precio-asc") list.sort((a, b) => a.minPrice - b.minPrice);
    if (sort === "precio-desc") list.sort((a, b) => b.minPrice - a.minPrice);
    if (sort === "nombre") list.sort((a, b) => a.name.localeCompare(b.name, "es"));
    if (sort === "nuevos") list.sort((a, b) => newest(b) - newest(a));
    if (sort === "vendidos")
      list.sort((a, b) => units(b) - units(a) || newest(b) - newest(a));
    if (sort === "recomendados") {
      // Orden definido desde Diseño → Tienda online (sección "Orden del catálogo")
      let curated: string[] | null = scopeIds;
      if (orderCfg.mode === "manual" && orderCfg.productIds.length) curated = orderCfg.productIds;
      if (orderCfg.mode === "collections" && orderCfg.collectionSlugs.length) {
        const seen = new Set<string>();
        curated = [];
        for (const slug of orderCfg.collectionSlugs) {
          for (const id of collectionOrder?.[slug] ?? []) {
            if (!seen.has(id)) {
              seen.add(id);
              curated.push(id);
            }
          }
        }
      }
      if (curated && curated.length) {
        const rank = new Map(curated.map((id, i) => [id, i]));
        list.sort(
          (a, b) =>
            (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER) ||
            Number(b.inStock) - Number(a.inStock) ||
            newest(b) - newest(a),
        );
      } else {
        list.sort(
          (a, b) =>
            Number(b.inStock) - Number(a.inStock) ||
            units(b) - units(a) ||
            newest(b) - newest(a),
        );
      }
    }
    return list;
  }, [filtered, sort, salesRank, orderCfg, collectionOrder, scopeIds]);

  const pageSize = orderCfg.pageSize;
  const [visible, setVisible] = useState(pageSize);
  useEffect(() => {
    setVisible(pageSize);
  }, [pageSize, filters, sort, facet]);
  const paged = useMemo(() => results.slice(0, visible), [results, visible]);
  const chips = activeChips(filters);
  const sortLabel = SORTS.find((s) => s.value === sort)?.label ?? "Recomendados";
  // Portada de la primera colección: alimenta el cierre editorial del final.
  const leadCollection = collections?.[0] ?? null;


  const toggleFilter = (key: "types" | "sizes") => (v: string) => {
    const list = filters[key];
    const hasIt = list.some((s) => slugify(s) === slugify(v));
    setFilters({
      ...filters,
      [key]: hasIt ? list.filter((s) => slugify(s) !== slugify(v)) : [...list, v],
    });
  };

  const vocabulary = useMemo(
    () => ({
      types: facets.types.map((t) => t.value),
      colors: facets.colors.map((c) => c.name),
      sizes: facets.sizes.map((s) => s.value),
      materials: facets.materials.map((m) => m.value),
      tags: facets.tags.map((t) => t.value),
    }),
    [facets],
  );

  return { products, isLoading, isError, isFetching, refetch, salesRank, collections, pageQ, pageExpQ, allPageScenes, pageScenes, orderCfg, scopeCfg, collectionOrder, scopeIds, banners, all, override, setOverrideState, setFilters, base, filters, panelOpen, setPanelOpen, cols, setCols, sort, setSort, sortOpen, setSortOpen, productTypes, baseFacets, facets, filtered, results, pageSize, visible, setVisible, paged, chips, sortLabel, leadCollection, toggleFilter, vocabulary };
}

export type ShopPageVM = ReturnType<typeof useShopPage>;
