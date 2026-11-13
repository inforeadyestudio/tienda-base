// Lógica (Claude NO modifica este archivo). El diseño recibe el resultado como `vm`.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  EMPTY_SHIP_TO,
  fetchGiftItems,
  giftListUrl,
  makeGiftSlug,
  type GiftList,
  type GiftShipTo,
} from "@/lib/gifts";

export type VariantRow = { id: string; size: string | null; color: string | null; price_cop: number };

export type ProductRow = { id: string; name: string; slug: string; hero_image_url: string | null; product_variants: VariantRow[] };

export function useGiftItems({ listId }: { listId: string }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [picking, setPicking] = useState<ProductRow | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const itemsQuery = useQuery({
    queryKey: ["gift-items", listId],
    queryFn: () => fetchGiftItems(listId),
  });

  const searchQuery = useQuery({
    queryKey: ["gift-search", debounced],
    enabled: debounced.length > 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, hero_image_url, product_variants(id, size, color, price_cop)")
        .eq("status", "published")
        .ilike("name", `%${debounced}%`)
        .limit(12);
      if (error) throw error;
      return (data ?? []) as ProductRow[];
    },
  });

  const addItem = useMutation({
    mutationFn: async ({ product, variant }: { product: ProductRow; variant: VariantRow }) => {
      const { error } = await supabase.from("gift_list_items").insert({
        list_id: listId,
        product_id: product.id,
        variant_id: variant.id,
        qty_wanted: 1,
        position: (itemsQuery.data?.length ?? 0) + 1,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gift-items", listId] });
      setPicking(null);
      setQuery("");
      toast.success("Agregado a tu lista");
    },
    onError: () => toast.error("No pudimos agregarlo"),
  });

  const removeItem = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("gift_list_items").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gift-items", listId] }),
  });

  const setQty = useMutation({
    mutationFn: async ({ id, qty }: { id: string; qty: number }) => {
      const { error } = await supabase.from("gift_list_items").update({ qty_wanted: qty }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["gift-items", listId] }),
  });

  const items = itemsQuery.data ?? [];
  const gifted = useMemo(() => items.filter((i) => i.purchased_qty > 0).length, [items]);

  return { listId, qc, query, setQuery, debounced, setDebounced, picking, setPicking, itemsQuery, searchQuery, addItem, removeItem, setQty, items, gifted };
}

export type GiftItemsVM = ReturnType<typeof useGiftItems>;
