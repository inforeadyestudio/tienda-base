import { supabase } from "@/integrations/supabase/client";
import { publicUrl } from "@/lib/site";

export type GiftList = {
  id: string;
  user_id: string;
  slug: string;
  title: string;
  owner_name: string | null;
  occasion: string | null;
  event_date: string | null;
  message: string | null;
  cover_url: string | null;
  is_public: boolean;
  created_at: string;
};

export type GiftShipTo = {
  recipient: string;
  phone: string;
  line1: string;
  line2: string;
  city: string;
  department: string;
  postal_code: string;
  notes: string;
};

export const EMPTY_SHIP_TO: GiftShipTo = {
  recipient: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  department: "",
  postal_code: "",
  notes: "",
};

export type GiftListItem = {
  id: string;
  list_id: string;
  product_id: string | null;
  variant_id: string | null;
  qty_wanted: number;
  purchased_qty: number;
  note: string | null;
  position: number;
};

export type GiftItemView = GiftListItem & {
  productName: string;
  productSlug: string;
  imageUrl: string | null;
  variantLabel: string;
  priceCop: number;
};

const SLUG_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export function makeGiftSlug(title: string) {
  const base = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  let suffix = "";
  for (let i = 0; i < 6; i++) {
    suffix += SLUG_ALPHABET[Math.floor(Math.random() * SLUG_ALPHABET.length)];
  }
  return `${base || "lista"}-${suffix}`;
}

export function giftListUrl(slug: string) {
  return publicUrl(`/regalos/${slug}`);
}


/** Trae los ítems de una lista con los datos del producto/variante. */
export async function fetchGiftItems(listId: string): Promise<GiftItemView[]> {
  const { data, error } = await supabase
    .from("gift_list_items")
    .select(
      "id, list_id, product_id, variant_id, qty_wanted, purchased_qty, note, position, products(name, slug, hero_image_url), product_variants(size, color, price_cop)",
    )
    .eq("list_id", listId)
    .order("position");
  if (error) throw error;
  return (data ?? []).map((row) => {
    const p = (row as { products: { name: string; slug: string; hero_image_url: string | null } | null }).products;
    const v = (row as { product_variants: { size: string | null; color: string | null; price_cop: number } | null })
      .product_variants;
    return {
      id: row.id,
      list_id: row.list_id,
      product_id: row.product_id,
      variant_id: row.variant_id,
      qty_wanted: row.qty_wanted,
      purchased_qty: row.purchased_qty,
      note: row.note,
      position: row.position,
      productName: p?.name ?? "Pieza Tu Marca",
      productSlug: p?.slug ?? "",
      imageUrl: p?.hero_image_url ?? null,
      variantLabel: [v?.size, v?.color].filter(Boolean).join(" · "),
      priceCop: v?.price_cop ?? 0,
    };
  });
}
