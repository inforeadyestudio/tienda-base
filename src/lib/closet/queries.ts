import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ClosetSource = "purchase" | "upload" | "wishlist";

export type ClosetPiece = {
  id: string;
  source: ClosetSource;
  name: string;
  category: string | null;
  garment_type: string | null;
  color: string | null;
  color_hex: string | null;
  material: string | null;
  fit: string | null;
  image: string | null;
  productSlug: string | null;
  createdAt: string;
};

export const SOURCE_LABELS: Record<ClosetSource, string> = {
  purchase: "Comprado aquí",
  upload: "Agregado por mí",
  wishlist: "Wishlist",
};

/** Firma las rutas privadas del bucket del closet para poder mostrarlas. */
async function signPaths(paths: string[]) {
  const map = new Map<string, string>();
  if (!paths.length) return map;
  const { data } = await supabase.storage.from("closet").createSignedUrls(paths, 60 * 60);
  for (const row of data ?? []) {
    if (row.path && row.signedUrl) map.set(row.path, row.signedUrl);
  }
  return map;
}

/** PNG sin fondo por producto (recortes guardados en Looks). */
async function cutoutsByProduct() {
  const map = new Map<string, string>();
  const { data } = await supabase
    .from("product_look_items")
    .select("product_id, cutout_url")
    .not("cutout_url", "is", null);
  for (const row of (data ?? []) as any[]) {
    if (row.product_id && row.cutout_url && !map.has(row.product_id)) map.set(row.product_id, row.cutout_url);
  }
  return map;
}

/** Closet unificado: prendas compradas + wishlist + prendas subidas por la clienta. */
export const closetQueryOptions = (userId?: string) =>
  queryOptions({
    queryKey: ["closet", userId ?? "anon"],
    enabled: !!userId,
    queryFn: async (): Promise<ClosetPiece[]> => {
      const [uploadsRes, ordersRes, wishRes, cutouts] = await Promise.all([
        supabase
          .from("closet_items")
          .select(
            "id, source, name, category, garment_type, color, color_hex, material, fit, image_url, created_at, products(slug)",
          )
          .order("created_at", { ascending: false }),
        supabase
          .from("orders")
          .select(
            "id, created_at, status, order_items(id, product_name, variant_label, product_variants(color, color_hex, size, products(id, slug, name, product_type, materials, hero_image_url)))",
          )
          .eq("customer_id", userId!)
          .in("status", ["paid", "preparing", "shipped", "delivered"])
          .order("created_at", { ascending: false })
          .limit(20),
        supabase
          .from("wishlists")
          .select(
            "variant_id, created_at, product_variants(color, color_hex, products(id, slug, name, product_type, materials, hero_image_url))",
          )
          .eq("user_id", userId!)
          .order("created_at", { ascending: false }),
        cutoutsByProduct(),
      ]);

      if (uploadsRes.error) throw uploadsRes.error;

      const uploads = (uploadsRes.data ?? []) as any[];
      const signed = await signPaths(uploads.map((u) => u.image_url).filter(Boolean));

      const uploaded: ClosetPiece[] = uploads.map((u) => ({
        id: u.id,
        source: "upload",
        name: u.name,
        category: u.category,
        garment_type: u.garment_type,
        color: u.color,
        color_hex: u.color_hex,
        material: u.material,
        fit: u.fit,
        image: signed.get(u.image_url) ?? null,
        productSlug: u.products?.slug ?? null,
        createdAt: u.created_at,
      }));

      const seen = new Set<string>();
      const purchased: ClosetPiece[] = [];
      for (const order of (ordersRes.data ?? []) as any[]) {
        for (const item of order.order_items ?? []) {
          const p = item.product_variants?.products;
          const dedupe = `${p?.slug ?? item.product_name}-${item.variant_label ?? ""}`;
          if (seen.has(dedupe)) continue;
          seen.add(dedupe);
          purchased.push({
            id: item.id,
            source: "purchase",
            name: p?.name ?? item.product_name,
            category: null,
            garment_type: p?.product_type ?? null,
            color: item.product_variants?.color ?? null,
            color_hex: item.product_variants?.color_hex ?? null,
            material: p?.materials ?? null,
            fit: null,
            // Siempre preferimos el PNG sin fondo para poder armar looks y probárselos.
            image: (p?.id ? cutouts.get(p.id) : null) ?? p?.hero_image_url ?? null,
            productSlug: p?.slug ?? null,
            createdAt: order.created_at,
          });
        }
      }

      const wished: ClosetPiece[] = [];
      for (const row of (wishRes.data ?? []) as any[]) {
        const p = row.product_variants?.products;
        if (!p) continue;
        const dedupe = `${p.slug}-wish`;
        if (seen.has(dedupe)) continue;
        seen.add(dedupe);
        wished.push({
          id: row.variant_id,
          source: "wishlist",
          name: p.name,
          category: null,
          garment_type: p.product_type ?? null,
          color: row.product_variants?.color ?? null,
          color_hex: row.product_variants?.color_hex ?? null,
          material: p.materials ?? null,
          fit: null,
          image: cutouts.get(p.id) ?? p.hero_image_url ?? null,
          productSlug: p.slug,
          createdAt: row.created_at,
        });
      }

      return [...uploaded, ...purchased, ...wished].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
  });

export function useCloset(userId?: string) {
  return useQuery(closetQueryOptions(userId));
}

export const CATEGORY_LABELS: Record<string, string> = {
  superior: "Superiores",
  inferior: "Inferiores",
  set: "Conjuntos",
  vestido: "Vestidos",
  abrigo: "Abrigos",
  calzado: "Calzado",
  accesorio: "Accesorios",
  otros: "Otros",
};
