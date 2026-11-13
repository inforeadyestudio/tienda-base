import { queryOptions, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth-hooks";
import { formatUSD } from "@/lib/format";


export const B2B_SETTINGS_KEY = "b2b_portal";

export type B2BSlide = {
  id: string;
  imageUrl: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  ctaLabel: string;
  collectionSlug: string;
  active: boolean;
};

export type B2BKeyDate = { id: string; label: string; date: string; color: string };

export type B2BSettings = {
  slides: B2BSlide[];
  lookbook: string[];
  keyDates: B2BKeyDate[];
  currency: "USD" | "COP";
  usdRate: number;
  discountPct: number;
  minUnits: number;
  termsVersion: string;
  paymentTerms: string;
  /** product_id → % de descuento B2B por colección (mayor entre sus colecciones). */
  productDiscounts?: Record<string, number>;
};

export const DEFAULT_B2B_SETTINGS: B2BSettings = {
  slides: [],
  lookbook: [],
  keyDates: [],
  currency: "USD",
  usdRate: 4000,
  discountPct: 40,
  minUnits: 20,
  termsVersion: "v1",
  paymentTerms:
    "Condiciones de pago mayorista:\n\n1. 50% de anticipo para confirmar la producción del pedido.\n2. 50% restante antes del despacho.\n3. Los precios están expresados en la moneda del pedido y no incluyen fletes ni impuestos de importación.\n4. El pedido aprobado no admite cancelaciones una vez iniciada la producción.\n5. Los tiempos de entrega se cuentan desde la recepción del anticipo.",
};

function merge(value: unknown): B2BSettings {
  const v = (value ?? {}) as Partial<B2BSettings>;
  return {
    ...DEFAULT_B2B_SETTINGS,
    ...v,
    slides: Array.isArray(v.slides) ? v.slides : [],
    lookbook: Array.isArray(v.lookbook) ? v.lookbook : [],
    keyDates: Array.isArray(v.keyDates) ? v.keyDates : [],
  };
}

export const b2bSettingsQuery = () =>
  queryOptions({
    queryKey: ["b2b-settings"],
    queryFn: async (): Promise<B2BSettings> => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", B2B_SETTINGS_KEY)
        .maybeSingle();
      if (error) throw error;
      const base = merge(data?.value);
      const { data: cols } = await (supabase.from("collections") as any)
        .select("b2b_discount_pct, channels, collection_products(product_id)")
        .not("b2b_discount_pct", "is", null);
      const productDiscounts: Record<string, number> = {};
      for (const c of (cols ?? []) as any[]) {
        if (!(c.channels ?? []).includes("b2b")) continue;
        for (const cp of c.collection_products ?? []) {
          const pct = Number(c.b2b_discount_pct);
          if (productDiscounts[cp.product_id] == null || pct > productDiscounts[cp.product_id]) productDiscounts[cp.product_id] = pct;
        }
      }
      return { ...base, productDiscounts };
    },
  });

export async function saveB2BSettings(settings: B2BSettings) {
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: B2B_SETTINGS_KEY, value: settings as never }, { onConflict: "key" });
  if (error) throw error;
}

/** Ajustes base (sin moneda del cliente). Para el admin. */
export function useB2BBaseSettings() {
  return useQuery(b2bSettingsQuery());
}

/** Moneda según el país del cliente: Colombia → COP, todos los demás (incluido Panamá) → USD. null si no aplica. */
export function currencyForCountry(country?: string | null): "USD" | "COP" | null {
  if (!country?.trim()) return null;
  const c = country.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return c === "colombia" || c === "co" ? "COP" : "USD";
}

export const myB2BCurrencyQuery = (userId?: string | null) =>
  queryOptions({
    queryKey: ["b2b-my-currency", userId ?? "anon"],
    enabled: !!userId,
    queryFn: async (): Promise<"USD" | "COP" | null> => {
      const uid = userId;
      if (!uid) return null;
      const { data } = await supabase
        .from("addresses")
        .select("country")
        .eq("user_id", uid)
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      return currencyForCountry(data?.country);
    },
  });

/** Ajustes del portal con la moneda del cliente según su país. */
export function useB2BSettings() {
  const base = useQuery(b2bSettingsQuery());
  const { user } = useSession();
  const cur = useQuery(myB2BCurrencyQuery(user?.id));
  // Sin dirección colombiana confirmada, el mayorista ve dólares (nunca pesos por defecto).
  const currency: "USD" | "COP" = cur.data === "COP" ? "COP" : "USD";
  const data = base.data ? { ...base.data, currency: user ? currency : base.data.currency } : base.data;
  return { ...base, data };
}

/** Precio mayorista unitario en la moneda del portal. */
export function wholesalePrice(
  variant: { price_cop?: number | null; price_usd?: number | null; product_id?: string | null },
  s: B2BSettings,
  currency: "USD" | "COP" = s.currency,
): number {
  const pct = (variant.product_id ? s.productDiscounts?.[variant.product_id] : undefined) ?? s.discountPct;
  const factor = 1 - Math.min(90, Math.max(0, pct)) / 100;
  if (currency === "USD") {
    const usd = variant.price_usd ?? Math.round((variant.price_cop ?? 0) / Math.max(1, s.usdRate));
    return Math.round(usd * factor);
  }
  return Math.round((variant.price_cop ?? 0) * factor);
}

export function formatMoney(value: number, currency: "USD" | "COP") {
  if (currency === "USD") return formatUSD(value);
  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}


/* ---------------- Catálogo mayorista ---------------- */

export function useB2BCollections() {
  return useQuery({
    queryKey: ["b2b-collections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collections")
        .select("id, slug, title, subtitle, cover_url, channels, position, collection_products(product_id, products(hero_image_url, status))")
        .eq("status", "published")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []).filter((c: any) => c.channels?.includes("b2b"));
    },
  });
}

/** Product pages in the same order as the collection editor; never include other collections. */
export function useB2BCollectionPages(collectionId?: string) {
  return useQuery({
    queryKey: ["b2b-collection-pages", collectionId],
    enabled: !!collectionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collection_products")
        .select("position, products(id, slug, name, status, hero_image_url, product_images(url, position))")
        .eq("collection_id", collectionId ?? "")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []).flatMap((row) => {
        const product = row.products;
        if (!product || product.status !== "published") return [];
        const photos = [product.hero_image_url, ...[...(product.product_images ?? [])]
          .sort((a, b) => a.position - b.position).map((image) => image.url)]
          .filter((url): url is string => Boolean(url));
        return [{ id: product.id, slug: product.slug, name: product.name, photos: [...new Set(photos)].slice(0, 2) }];
      });
    },
  });
}

export function useB2BProducts(collectionId?: string | null) {
  const { data: collections } = useB2BCollections();
  const allowedIds = (collections ?? []).map((c) => c.id);
  return useQuery({
    queryKey: ["b2b-products", collectionId ?? "all", allowedIds],
    enabled: !!collections,
    queryFn: async () => {
      if (!allowedIds.length || (collectionId && !allowedIds.includes(collectionId))) return [];
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, slug, name, product_type, hero_image_url, tags, collection_products(collection_id), product_variants(id, product_id, sku, size, color, color_hex, price_cop, price_usd, active, inventory_levels(on_hand, reserved, locations(kind)))",
        )
        .eq("status", "published")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((p) =>
        (p.collection_products ?? []).some((cp) =>
          allowedIds.includes(cp.collection_id) && (!collectionId || cp.collection_id === collectionId),
        ),
      );
    },
  });
}

/** Ficha de producto dentro del portal B2B. */
export function useB2BProduct(slug: string) {
  const { data: collections } = useB2BCollections();
  const allowedIds = (collections ?? []).map((c) => c.id);
  return useQuery({
    queryKey: ["b2b-product", slug, allowedIds],
    enabled: !!collections,
    queryFn: async () => {
      if (!allowedIds.length) return null;
      const { data, error } = await supabase
        .from("products")
        .select(
           "id, slug, name, description, materials, composition, care, fit_spec, product_type, reference_code, hero_image_url, collection_products(collection_id), product_images(url, alt, position), product_variants(id, product_id, sku, size, color, color_hex, price_cop, price_usd, active, inventory_levels(on_hand, reserved, locations(kind)))",
        )
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw error;
      return data?.collection_products?.some((cp) => allowedIds.includes(cp.collection_id)) ? data : null;
    },
  });
}

/* ---------------- Pedidos de la cuenta ---------------- */

export function useMyB2BOrders() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["b2b-my-orders", user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, number, status, created_at, total_cop, total_usd:total_usd_exact, currency, notes, b2b_mode, b2b_payment_method, b2b_ship_eta, b2b_reward, order_items(id, qty, unit_price_cop, product_name, variant_label, variant_id), b2b_order_approvals(signer_name, accepted_at, terms_version)",
        )
        .eq("customer_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type B2BStats = {
  units: number;
  orders: number;
  revenue: number;
  categories: { label: string; units: number }[];
  top: { name: string; sku: string; units: number; image: string | null }[];
  sizes: { label: string; units: number }[];
};

/** Estadísticas reales de la cuenta autenticada. */
export function useMyB2BStats() {
  const { user } = useSession();
  const { data: settings } = useB2BSettings();
  return useQuery({
    queryKey: ["b2b-my-stats", user?.id ?? "anon", settings?.currency],
    enabled: !!user,
    queryFn: async (): Promise<B2BStats> => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          "id, status, total_cop, total_usd:total_usd_exact, currency, order_items(qty, unit_price_cop, product_name, variant_label, product_variants(sku, size, products(name, product_type, hero_image_url)))",
        )
        .eq("customer_id", user!.id)
        .neq("status", "draft")
        .neq("status", "cancelled");
      if (error) throw error;
      const orders = data ?? [];
      const cats = new Map<string, number>();
      const top = new Map<string, { name: string; sku: string; units: number; image: string | null }>();
      const sizes = new Map<string, number>();
      let units = 0;
      let revenue = 0;
      for (const o of orders as any[]) {
        revenue += settings?.currency === "USD" ? (o.total_usd ?? 0) : (o.total_cop ?? 0);
        for (const it of o.order_items ?? []) {
          const v = it.product_variants;
          const p = v?.products;
          units += it.qty;
          const cat = p?.product_type || "Sin categoría";
          cats.set(cat, (cats.get(cat) ?? 0) + it.qty);
          const size = v?.size || "Única";
          sizes.set(size, (sizes.get(size) ?? 0) + it.qty);
          const key = v?.sku || it.product_name;
          const prev = top.get(key);
          top.set(key, {
            name: p?.name ?? it.product_name,
            sku: v?.sku ?? "—",
            units: (prev?.units ?? 0) + it.qty,
            image: p?.hero_image_url ?? null,
          });
        }
      }
      return {
        units,
        orders: orders.length,
        revenue,
        categories: [...cats.entries()].map(([label, u]) => ({ label, units: u })).sort((a, b) => b.units - a.units),
        top: [...top.values()].sort((a, b) => b.units - a.units).slice(0, 5),
        sizes: [...sizes.entries()].map(([label, u]) => ({ label, units: u })).sort((a, b) => b.units - a.units),
      };
    },
  });
}

/* ---------------- Restock (stock de Ecommerce) ---------------- */

/** Unidades libres de una variante en la bodega Ecommerce. */
export function ecomAvailable(variant: { inventory_levels?: { on_hand?: number | null; reserved?: number | null; locations?: { kind?: string | null } | null }[] | null }): number {
  return (variant.inventory_levels ?? [])
    .filter((l) => l.locations?.kind === "ecom")
    .reduce((s, l) => s + Math.max(0, (l.on_hand ?? 0) - (l.reserved ?? 0)), 0);
}

/** Un producto es Restock si alguna variante activa tiene unidades en Ecommerce. */
export function isRestockProduct(product: { product_variants?: any[] | null }): boolean {
  return (product.product_variants ?? []).some((v) => v.active !== false && ecomAvailable(v) > 0);
}

/** Productos con unidades libres en Ecommerce (para etiquetar colecciones). */
export function useRestockProductIds() {
  return useQuery({
    queryKey: ["b2b-restock-products"],
    queryFn: async () => {
      const ids = new Set<string>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("inventory_levels")
          .select("on_hand, reserved, product_variants!inner(product_id), locations!inner(kind)")
          .eq("locations.kind", "ecom")
          .gt("on_hand", 0)
          .range(from, from + 999);
        if (error) throw error;
        for (const row of (data ?? []) as any[]) {
          if ((row.on_hand ?? 0) - (row.reserved ?? 0) > 0) ids.add(row.product_variants.product_id);
        }
        if (!data || data.length < 1000) break;
      }
      return ids;
    },
  });
}
