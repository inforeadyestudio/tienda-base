import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { createSwrCache, type CacheEntry, type CacheStore } from "@/lib/tienda/catalog-cache";

/**
 * Catálogo público compartido entre visitantes.
 * En picos (Sale) cada visitante pedía el catálogo completo directo a la base;
 * aquí se sirve desde una caché de servidor de pocos segundos para que miles de
 * visitas usen la misma lectura. El stock se revalida al pagar.
 */
export const CATALOG_SELECT =
  "id, slug, name, product_type, tags, materials, hero_image_url, created_at, available_national, available_international, available_pos_cali, available_pos_bogota, product_images(url, position), product_videos(url, position), product_variants(id, sku, size, color, color_hex, price_cop, price_usd, compare_at_cop, compare_at_usd, active, inventory_levels(on_hand, reserved, locations(name, city, kind, web_lending, web_safety_stock)))";

const TTL_MS = 20_000;
const STALE_MS = 10 * 60_000;
const CACHE_KEY = "https://cache.internal/storefront-catalog-v2";
const LOCK_KEY = "https://cache.internal/storefront-catalog-v2-lock";

async function readFromDb(): Promise<unknown[]> {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const sb = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        // La lectura nunca puede quedar colgada: se corta a los 6 s.
        return fetch(input, { ...init, headers: h, signal: init?.signal ?? AbortSignal.timeout(6_000) });
      },
    },
  });
  const { data, error } = await sb
    .from("products")
    .select(CATALOG_SELECT)
    .eq("status", "published")
    .or("available_national.eq.true,available_international.eq.true")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown[];
}

function edgeCache(): Cache | null {
  try {
    return ((globalThis as any).caches?.default as Cache | undefined) ?? null;
  } catch {
    return null;
  }
}

const store: CacheStore<unknown[]> = {
  async get() {
    const c = edgeCache();
    if (!c) return null;
    const hit = await c.match(CACHE_KEY);
    return hit ? ((await hit.json()) as CacheEntry<unknown[]>) : null;
  },
  async put(e) {
    const c = edgeCache();
    if (!c) return;
    await c.put(
      CACHE_KEY,
      new Response(JSON.stringify(e), {
        headers: { "content-type": "application/json", "cache-control": `public, max-age=${STALE_MS / 1000}` },
      }),
    );
  },
  async lock() {
    // Candado compartido de pocos segundos: en un pico solo uno lee la base.
    const c = edgeCache();
    if (!c) return true;
    if (await c.match(LOCK_KEY)) return false;
    await c.put(LOCK_KEY, new Response("1", { headers: { "cache-control": "public, max-age=10" } }));
    return true;
  },
};

const loadCatalogRows = createSwrCache<unknown[]>({ ttlMs: TTL_MS, staleMs: STALE_MS, read: readFromDb, store, readTimeoutMs: 6_000, storeTimeoutMs: 1_000 });

/** Ranking de ventas: se calcula en la base como mucho cada 10 min por copia del servidor. */
const salesRankCaches = new Map<number, () => Promise<Record<string, number>>>();
function salesRankLoader(days: number) {
  let load = salesRankCaches.get(days);
  if (!load) {
    load = createSwrCache<Record<string, number>>({
      ttlMs: 10 * 60_000,
      staleMs: 60 * 60_000,
      readTimeoutMs: 5_000,
      read: async () => {
        const url = process.env.SUPABASE_URL!;
        const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const sb = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            fetch: (input, init) => {
              const h = new Headers(init?.headers);
              if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
              h.set("apikey", key);
              return fetch(input, { ...init, headers: h, signal: init?.signal ?? AbortSignal.timeout(5_000) });
            },
          },
        });
        const { data, error } = await sb.rpc("product_sales_rank", { _days: days });
        if (error) throw new Error(error.message);
        const map: Record<string, number> = {};
        ((data ?? []) as any[]).forEach((r) => { map[r.product_id as string] = Number(r.units ?? 0); });
        return map;
      },
    });
    salesRankCaches.set(days, load);
  }
  return load;
}

export const getSalesRank = createServerFn({ method: "GET" })
  .inputValidator((d: { days: number }) => ({ days: Math.min(365, Math.max(1, Math.round(Number(d?.days) || 120))) }))
  .handler(async ({ data }) => {
    try {
      return await salesRankLoader(data.days)();
    } catch {
      return {} as Record<string, number>;
    }
  });

export const getStorefrontCatalog = createServerFn({ method: "GET" }).handler(async () => {
  const rows = await loadCatalogRows();
  return rows as any[];
});
