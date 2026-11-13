import { webSellable } from "@/lib/web-stock";
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getStorefrontCatalog } from "@/lib/tienda/catalog.functions";
import { withRequestTimeout } from "@/lib/tienda/request-timeout";

export type ShopVariant = {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  color_hex: string | null;
  price_cop: number;
  price_usd: number | null;
  active: boolean;
  available: number;
  locations: string[];
};

export type ShopProduct = {
  id: string;
  slug: string;
  name: string;
  product_type: string | null;
  tags: string[];
  materials: string | null;
  hero_image_url: string | null;
  created_at: string;
  available_national: boolean;
  available_international: boolean;
  available_pos_cali: boolean;
  available_pos_bogota: boolean;
  images: string[];
  coverVideo: string | null;
  hoverVideo: string | null;
  variants: ShopVariant[];
  colors: { name: string; hex: string }[];
  sizes: string[];
  minPrice: number;
  minPriceUsd: number | null;
  compareCop?: number | null;
  compareUsd?: number | null;
  inStock: boolean;
};

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const catalogQuery = () =>
  queryOptions({
    queryKey: ["storefront", "catalog"],
    staleTime: 60_000,
    retry: 1,
    retryDelay: 800,
    queryFn: async (): Promise<ShopProduct[]> => {
      // Catálogo solo desde la caché del servidor; nunca consulta la base por visitante.
      const LS_KEY = "tb-catalog-v1";
      const isBrowser = typeof window !== "undefined";
      let data: any[] | null = null;
      try {
        data = await withRequestTimeout(() => getStorefrontCatalog(), 12_000);
        if (isBrowser) {
          try { localStorage.setItem(LS_KEY, JSON.stringify({ at: Date.now(), rows: data })); } catch { /* lleno */ }
        }
      } catch (e) {
        const saved = isBrowser ? (() => { try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "null"); } catch { return null; } })() : null;
        if (!saved || !Array.isArray(saved.rows) || !Number.isFinite(saved.at) || Date.now() - saved.at > 10 * 60_000) throw e;
        data = saved.rows;
      }
      return ((data ?? []) as any[]).map((p) => {
        const images: string[] = [
          ...(p.hero_image_url ? [p.hero_image_url] : []),
          ...((p.product_images ?? []) as any[])
            .slice()
            .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
            .map((i) => i.url as string),
        ].filter((v, i, arr) => v && arr.indexOf(v) === i);

        const variants: ShopVariant[] = ((p.product_variants ?? []) as any[]).map((v) => {
          const levels = (v.inventory_levels ?? []) as any[];
          const available = levels.reduce((sum, l) => sum + webSellable(l), 0);
          const locations = levels
            .filter((l) => webSellable(l) > 0)
            .map((l) => String(l.locations?.city ?? l.locations?.name ?? ""))
            .filter(Boolean);
          return {
            id: v.id,
            sku: v.sku,
            size: v.size,
            color: v.color,
            color_hex: v.color_hex,
            price_cop: v.price_cop ?? 0,
            price_usd: v.price_usd ?? null,
            active: v.active,
            available,
            locations,
          };
        });

        const colors = Array.from(
          new Map(
            variants.filter((v) => v.color).map((v) => [v.color as string, v.color_hex ?? "#ccc"]),
          ).entries(),
        ).map(([name, hex]) => ({ name, hex }));

        // Solo tallas de variantes activas con unidades disponibles: filtrar por
        // talla M no debe mostrar productos cuya M está agotada o inactiva.
        const sizes = Array.from(
          new Set(
            variants.filter((v) => v.active && v.available > 0).map((v) => v.size).filter(Boolean) as string[],
          ),
        );
        const prices = variants.filter((v) => v.active).map((v) => v.price_cop);

        return {
          id: p.id,
          slug: p.slug,
          name: p.name,
          product_type: p.product_type,
          tags: (p.tags ?? []) as string[],
          materials: p.materials,
          hero_image_url: p.hero_image_url,
          created_at: p.created_at,
          available_national: p.available_national,
          available_international: p.available_international,
          available_pos_cali: p.available_pos_cali,
          available_pos_bogota: p.available_pos_bogota,
          images,
          coverVideo: ((p.product_videos ?? []) as any[]).find((v) => v.position === -1)?.url ?? null,
          hoverVideo: ((p.product_videos ?? []) as any[]).find((v) => v.position === 0)?.url ?? null,
          variants,
          colors,
          sizes,
          minPrice: prices.length ? Math.min(...prices) : 0,
          minPriceUsd: (() => { const act = variants.filter((v) => v.active); const m = act.find((v) => v.price_cop === Math.min(...prices)); return m?.price_usd ?? null; })(),
          ...(() => {
            const raw = ((p.product_variants ?? []) as any[]).filter((v) => v.active);
            const m = raw.find((v) => (v.price_cop ?? 0) === Math.min(...prices));
            return { compareCop: (m?.compare_at_cop as number | null) ?? null, compareUsd: (m?.compare_at_usd as number | null) ?? null };
          })(),
          inStock: variants.some((v) => v.active && v.available > 0),
        } satisfies ShopProduct;
      });
    },
  });

/** Productos por colección (en el orden guardado en cada colección). */
export const collectionProductOrderQuery = () =>
  queryOptions({
    queryKey: ["storefront", "collection-product-order"],
    staleTime: 60_000,
    queryFn: async (): Promise<Record<string, string[]>> => {
      const { data, error } = await supabase
        .from("collections")
        .select("slug, collection_products(product_id, position)")
        .eq("is_page", false);
      if (error) return {};
      const map: Record<string, string[]> = {};
      ((data ?? []) as any[]).forEach((c) => {
        map[c.slug as string] = ((c.collection_products ?? []) as any[])
          .slice()
          .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
          .map((cp) => cp.product_id as string);
      });
      return map;
    },
  });

export type Availability = "all" | "now" | "cali" | "bogota" | "online";

/** Ranking público de unidades vendidas por producto (agregado, sin datos de pedidos). */
export const salesRankQuery = (days = 120) =>
  queryOptions({
    queryKey: ["storefront", "sales-rank", days],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, number>> => {
      // Se sirve desde el servidor con caché; el navegador ya no consulta la base.
      const { getSalesRank } = await import("@/lib/tienda/catalog.functions");
      return getSalesRank({ data: { days } }).catch(() => ({}));
    },
  });

export type SortKey = "new" | "price-asc" | "price-desc";

export type ShopFilters = {
  q: string;
  types: string[];
  sizes: string[];
  colors: string[];
  materials: string[];
  tags: string[];
  min: number | null;
  max: number | null;
  availability: Availability;
  sort: SortKey;
};

export const emptyFilters: ShopFilters = {
  q: "",
  types: [],
  sizes: [],
  colors: [],
  materials: [],
  tags: [],
  min: null,
  max: null,
  availability: "all",
  sort: "new",
};

export function facetsFrom(products: ShopProduct[]) {
  const count = (values: string[]) => {
    const map = new Map<string, number>();
    values.forEach((v) => map.set(v, (map.get(v) ?? 0) + 1));
    return Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([value, total]) => ({ value, total }));
  };
  // Tipos de prenda: se agrupan ignorando mayúsculas (Top = TOP) y se excluyen
  // las rutas crudas importadas de Shopify (p. ej. «Salud y belleza > …»).
  const types = (() => {
    const groups = new Map<string, { value: string; total: number; variants: Map<string, number> }>();
    for (const raw of products.map((p) => p.product_type ?? "").filter(Boolean)) {
      if (raw.includes(">")) continue;
      const key = slugify(raw);
      const g = groups.get(key);
      if (g) {
        g.total += 1;
        g.variants.set(raw, (g.variants.get(raw) ?? 0) + 1);
      } else {
        groups.set(key, { value: raw, total: 1, variants: new Map([[raw, 1]]) });
      }
    }
    return Array.from(groups.values())
      .map((g) => {
        let best = g.value;
        let bestCount = -1;
        g.variants.forEach((c, v) => {
          if (c > bestCount || (c === bestCount && v !== v.toUpperCase())) {
            best = v;
            bestCount = c;
          }
        });
        return { value: best, total: g.total };
      })
      .sort((a, b) => b.total - a.total);
  })();
  return {
    types,
    // Tallas agrupadas ignorando mayúsculas (S = s), etiqueta en mayúscula.
    sizes: (() => {
      const groups = new Map<string, number>();
      products.flatMap((p) => p.sizes).forEach((s) => {
        const key = s.toUpperCase();
        groups.set(key, (groups.get(key) ?? 0) + 1);
      });
      return Array.from(groups.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([value, total]) => ({ value, total }));
    })(),
    materials: count(products.map((p) => (p.materials ?? "").trim()).filter(Boolean)),
    tags: count(products.flatMap((p) => p.tags)),
    colors: Array.from(
      new Map(products.flatMap((p) => p.colors).map((c) => [c.name, c.hex])).entries(),
    ).map(([name, hex]) => ({ name, hex })),
    priceMin: products.length ? Math.min(...products.map((p) => p.minPrice)) : 0,
    priceMax: products.length ? Math.max(...products.map((p) => p.minPrice)) : 0,
  };
}

const has = (list: string[], value: string | null | undefined) =>
  !list.length || (value ? list.some((v) => slugify(v) === slugify(value)) : false);

export function applyFilters(products: ShopProduct[], f: ShopFilters): ShopProduct[] {
  const q = f.q.trim().toLowerCase();
  const out = products.filter((p) => {
    if (q) {
      const haystack = [p.name, p.product_type, p.materials, ...p.tags, ...p.colors.map((c) => c.name)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (!has(f.types, p.product_type)) return false;
    if (f.sizes.length && !p.sizes.some((s) => f.sizes.some((x) => slugify(x) === slugify(s))))
      return false;
    if (f.colors.length && !p.colors.some((c) => f.colors.some((x) => slugify(x) === slugify(c.name))))
      return false;
    if (!has(f.materials, p.materials)) return false;
    if (f.tags.length && !f.tags.every((t) => p.tags.some((pt) => slugify(pt) === slugify(t))))
      return false;
    if (f.min != null && p.minPrice < f.min) return false;
    if (f.max != null && p.minPrice > f.max) return false;
    if (f.availability === "now" && !p.inStock) return false;
    if (f.availability === "cali" && !p.available_pos_cali) return false;
    if (f.availability === "bogota" && !p.available_pos_bogota) return false;
    if (f.availability === "online" && !p.available_national) return false;
    return true;
  });
  if (f.sort === "price-asc") out.sort((a, b) => a.minPrice - b.minPrice);
  if (f.sort === "price-desc") out.sort((a, b) => b.minPrice - a.minPrice);
  return out;
}

/** Traduce /tienda/$facet a un estado inicial de filtros. */
export function filtersFromFacet(facet: string | undefined, products: ShopProduct[]): ShopFilters {
  if (!facet) return { ...emptyFilters };
  const s = slugify(facet);
  const next: ShopFilters = { ...emptyFilters };
  const type = products.map((p) => p.product_type).find((t) => t && (slugify(t) === s || slugify(t) + "s" === s || s.startsWith(slugify(t))));
  if (type) {
    next.types = [type];
    return next;
  }
  const tag = products.flatMap((p) => p.tags).find((t) => slugify(t) === s);
  if (tag) {
    next.tags = [tag];
    return next;
  }
  const color = products.flatMap((p) => p.colors).find((c) => slugify(c.name) === s);
  if (color) {
    next.colors = [color.name];
    return next;
  }
  if (s === "nueva-coleccion" || s === "nuevos") {
    next.sort = "new";
    return next;
  }
  next.q = facet.replace(/-/g, " ");
  return next;
}

export function activeChips(f: ShopFilters): { label: string; clear: (f: ShopFilters) => ShopFilters }[] {
  const chips: { label: string; clear: (f: ShopFilters) => ShopFilters }[] = [];
  f.types.forEach((t) => chips.push({ label: t, clear: (x) => ({ ...x, types: x.types.filter((v) => v !== t) }) }));
  f.sizes.forEach((t) => chips.push({ label: `Talla ${t}`, clear: (x) => ({ ...x, sizes: x.sizes.filter((v) => v !== t) }) }));
  f.colors.forEach((t) => chips.push({ label: t, clear: (x) => ({ ...x, colors: x.colors.filter((v) => v !== t) }) }));
  f.materials.forEach((t) => chips.push({ label: t, clear: (x) => ({ ...x, materials: x.materials.filter((v) => v !== t) }) }));
  f.tags.forEach((t) => chips.push({ label: t, clear: (x) => ({ ...x, tags: x.tags.filter((v) => v !== t) }) }));
  if (f.min != null || f.max != null)
    chips.push({ label: "Precio", clear: (x) => ({ ...x, min: null, max: null }) });
  if (f.availability !== "all")
    chips.push({
      label:
        f.availability === "now"
          ? "Disponibles ahora"
          : f.availability === "cali"
            ? "En Cali"
            : f.availability === "bogota"
              ? "En Bogotá"
              : "Online",
      clear: (x) => ({ ...x, availability: "all" as Availability }),
    });
  if (f.q) chips.push({ label: `“${f.q}”`, clear: (x) => ({ ...x, q: "" }) });
  return chips;
}