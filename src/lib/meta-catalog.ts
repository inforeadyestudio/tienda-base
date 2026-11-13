export const META_CATALOG_KEY = "meta_catalog";

export type MetaCatalogMode = "all" | "collections" | "products";
export type MetaCatalogSettings = { mode: MetaCatalogMode; collections: string[]; products: string[]; onlyInStock: boolean };

export function normalizeMetaCatalog(v: unknown): MetaCatalogSettings {
  const o = (v ?? {}) as Record<string, unknown>;
  const mode = o.mode === "collections" || o.mode === "products" ? o.mode : "all";
  const arr = (x: unknown) => (Array.isArray(x) ? x.filter((s) => typeof s === "string") as string[] : []);
  return { mode, collections: arr(o.collections), products: arr(o.products), onlyInStock: o.onlyInStock !== false };
}
