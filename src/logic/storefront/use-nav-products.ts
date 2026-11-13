// Lógica (Claude NO modifica este archivo). El diseño recibe el resultado como `vm`.
import { collectionSlugFromHref } from "@/logic/storefront/nav-helpers";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type NavProduct = { id: string; slug: string; name: string; hero_image_url: string | null; price: number | null };

export function useNavProducts({ href }: { href: string | null }) {
  const slug = collectionSlugFromHref(href);
  const { data: products } = useQuery({
    queryKey: ["nav-collection-products", slug],
    enabled: !!slug,
    staleTime: 300_000,
    queryFn: async (): Promise<NavProduct[]> => {
      const { data } = await supabase
        .from("collections")
        .select("collection_products(position, products(id, slug, name, hero_image_url, status, available_national, available_international, product_variants(price_cop)))")
        .eq("slug", slug!)
        .maybeSingle();
      const rows = ((data as any)?.collection_products ?? []) as any[];
      return rows
        .map((r) => r.products)
        .filter((p) => p && p.status === "published" && (p.available_national || p.available_international))
        .slice(0, 4)
        .map((p: any) => ({
          id: p.id,
          slug: p.slug,
          name: p.name,
          hero_image_url: p.hero_image_url ?? null,
          price: (p.product_variants ?? []).find((v: any) => v.price_cop != null)?.price_cop ?? null,
        }));
    },
  });

  return { href, slug, products };
}

export type NavProductsVM = ReturnType<typeof useNavProducts>;
