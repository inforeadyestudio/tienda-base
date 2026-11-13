import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { slugify } from "@/lib/tienda/catalog";

export type ProductType = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  position: number;
  active: boolean;
  board_shape?: string;
  weight_grams?: number | null;
  length_cm?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  size_chart?: unknown;
};

export const productTypesQuery = () =>
  queryOptions({
    queryKey: ["product-types"],
    staleTime: 60_000,
    queryFn: async (): Promise<ProductType[]> => {
      const { data, error } = await supabase
        .from("product_types")
        .select("id, slug, name, description, cover_url, position, active, board_shape, weight_grams, length_cm, width_cm, height_cm, size_chart")
        .order("position", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ProductType[];
    },
  });

export const productTypeQuery = (slug: string) =>
  queryOptions({
    queryKey: ["product-type", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_types")
        .select("id, slug, name, description, cover_url, position, active, board_shape, weight_grams, length_cm, width_cm, height_cm, size_chart")
        .eq("slug", slug)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as ProductType | null;
    },
  });

/** Productos publicados que pertenecen a un tipo de prenda. */
export const productsByTypeQuery = (typeName: string) =>
  queryOptions({
    queryKey: ["product-type-products", typeName],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, slug, name, hero_image_url, product_type, product_variants(id, size, price_cop, price_usd, compare_at_cop, compare_at_usd, active)")
        .eq("status", "published").or("available_national.eq.true,available_international.eq.true")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter(
        (p) => p.product_type && slugify(p.product_type) === slugify(typeName),
      );
    },
  });

/** Crea (o reutiliza) un tipo de prenda por nombre y devuelve su nombre canónico. */
export async function ensureProductType(name: string): Promise<string> {
  const clean = name.trim();
  if (!clean) return clean;
  const slug = slugify(clean);
  const { data: existing } = await supabase
    .from("product_types")
    .select("name")
    .eq("slug", slug)
    .maybeSingle();
  if (existing?.name) return existing.name;
  const { error } = await supabase.from("product_types").insert({ slug, name: clean });
  if (error) throw error;
  return clean;
}

export async function saveProductType(type: Partial<ProductType> & { id: string }) {
  const { id, ...rest } = type;
  const { error } = await supabase.from("product_types").update(rest as any).eq("id", id);
  if (error) throw error;
}

export async function deleteProductType(id: string) {
  const { error } = await supabase.from("product_types").delete().eq("id", id);
  if (error) throw error;
}
