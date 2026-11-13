import { useMemo } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sceneDef } from "./registry";
import type { Scene, SceneContext } from "./types";

const PRODUCT_SELECT =
  "id, slug, name, description, hero_image_url, status, available_national, available_international, created_at, product_images(url, position), product_variants(price_cop, color, color_hex)";
const MAX_IDS = 200;

/** IDs elegidos en campos «products»/«product» de todas las secciones. */
export function collectSceneProductIds(scenes: Scene[]): string[] {
  const ids = new Set<string>();
  for (const s of scenes) {
    const def = sceneDef(s.type);
    for (const f of def?.fields ?? []) {
      if (f.type !== "products" && f.type !== "product") continue;
      const v = (s.props ?? {})[f.key];
      for (const id of Array.isArray(v) ? v : [v]) if (typeof id === "string" && id) ids.add(id);
    }
  }
  return [...ids].sort().slice(0, MAX_IDS);
}

export function sceneProductsQuery(ids: string[], publishedOnly: boolean) {
  return queryOptions({
    queryKey: ["scene-picked-products", ids, publishedOnly],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase.from("products").select(PRODUCT_SELECT).in("id", ids);
      if (publishedOnly) q = q.eq("status", "published");
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).filter((p: any) => !publishedOnly || p.available_national || p.available_international);
    },
  });
}

/** Suma a ctx.products los productos elegidos en las secciones (sin duplicar). */
export function useSceneContextWithPicked(scenes: Scene[], ctx: SceneContext, publishedOnly = true): SceneContext {
  const ids = useMemo(() => collectSceneProductIds(scenes), [scenes]);
  const q = useQuery(sceneProductsQuery(ids, publishedOnly));
  return useMemo(() => {
    if (!q.data?.length) return ctx;
    const seen = new Set(ctx.products.map((p) => p.id));
    const extra = q.data.filter((p: any) => !seen.has(p.id));
    return extra.length ? { ...ctx, products: [...ctx.products, ...(extra as any)] } : ctx;
  }, [ctx, q.data]);
}
