// Lógica (Claude NO modifica este archivo). El diseño recibe el resultado como `vm`.
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { addToCart } from "@/lib/cart";

export type WishRow = {
  variant_id: string;
  created_at: string;
  product_variants: {
    id: string;
    size: string | null;
    color: string | null;
    price_cop: number | null;
    products: {
      id: string;
      slug: string;
      name: string;
      hero_image_url: string | null;
    } | null;
  } | null;
};

export function useWishlist() {
  return useQuery({
    queryKey: ["cuenta", "wishlist"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wishlists")
        .select(
          "variant_id, created_at, product_variants(id, size, color, price_cop, products(id, slug, name, hero_image_url))",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as WishRow[];
    },
  });
}

export function useWishlistPage() {
  const { data, isLoading } = useWishlist();
  const qc = useQueryClient();
  const [cartOpen, setCartOpen] = useState(false);

  const addRow = async (row: WishRow) => {
    const variant = row.product_variants!;
    const product = variant.products!;
    const ok = await addToCart({
      variantId: variant.id,
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      variantLabel: [variant.color, variant.size].filter(Boolean).join(" · "),
      priceCop: variant.price_cop ?? 0,
      imageUrl: product.hero_image_url,
      qty: 1,
    });
    if (ok) setCartOpen(true);
  };

  const remove = useMutation({
    mutationFn: async (variantId: string) => {
      const { error } = await supabase.from("wishlists").delete().eq("variant_id", variantId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cuenta", "wishlist"] });
      toast.success("Quitado de tu wishlist");
    },
    onError: () => toast.error("No pudimos quitarlo, intenta de nuevo"),
  });

  const items = (data ?? []).filter((row) => row.product_variants?.products);

  return { data, isLoading, qc, cartOpen, setCartOpen, addRow, remove, items };
}

export type WishlistPageVM = ReturnType<typeof useWishlistPage>;
