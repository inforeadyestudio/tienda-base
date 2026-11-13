import { z } from "zod";
import { stockTotals } from "./stock-totals";
import type { ReadyActor } from "./context.server";
import { publicDb } from "./context.server";
import { ADMIN_TOOLS, PORTAL_TOOLS } from "./admin-tools.server";
import { readSalesAnalysis } from "./sales-analysis.server";

export type UiAction = { type: string; payload: Record<string, any> };
export type ToolResult = { data: any; ui_action?: UiAction };

type ToolDef = {
  description: string;
  schema: z.ZodTypeAny;
  /** Contextos que pueden ver la herramienta. */
  actors: Array<"public" | "client" | "b2b" | "admin">;
  /** Roles admin permitidos; vacío = cualquier rol de staff. */
  roles?: string[];
  parameters: Record<string, unknown>;
  run: (actor: ReadyActor, args: any) => Promise<ToolResult>;
};

const PRODUCT_FIELDS =
  "id, slug, name, description, materials, product_type, tags, hero_image_url, status";

function obj(props: Record<string, unknown>, required: string[] = []) {
  return { type: "object", properties: props, required, additionalProperties: false };
}
const str = { type: "string" };

/** Tarjeta mínima que la interfaz necesita para renderizar un producto. */
function card(p: any) {
  const prices = (p.product_variants ?? []).map((v: any) => v.price_cop).filter((n: any) => typeof n === "number");
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    image: p.hero_image_url ?? null,
    from_price_cop: prices.length ? Math.min(...prices) : null,
  };
}

async function productCards(ids: string[]) {
  if (!ids.length) return [];
  const db = publicDb();
  const { data } = await db
    .from("products")
    .select("id, slug, name, hero_image_url, product_variants(price_cop)")
    .in("id", ids.slice(0, 24))
    .eq("status", "published").or("available_national.eq.true,available_international.eq.true");
  return (data ?? []).map((p: any) => card(p));
}
const num = { type: "number" };

/**
 * Trae TODAS las filas de una consulta paginando de a 1000 (el tope de
 * PostgREST). Sin esto, los totales del chat saldrían contando solo las
 * primeras 1000 filas y la información sería falsa.
 */
async function fetchAll<T = any>(buildQuery: () => any, pageSize = 1000, maxPages = 30): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const { data, error } = await buildQuery().range(page * pageSize, (page + 1) * pageSize - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}


const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

/** Familias de prenda: si no hay coincidencia exacta, se recomienda dentro de la misma familia. */
const FAMILIES: Record<string, string[]> = {
  superior: [
    "top", "tops", "blusa", "blusas", "camisa", "camisas", "camiseta", "camisetas", "tshirt", "t-shirt",
    "tee", "tees", "shirt", "shirts", "crop", "body", "bodysuit", "sueter", "buzo", "hoodie", "chaqueta",
    "blazer", "saco", "abrigo", "cardigan", "corset", "bralette",
  ],
  inferior: [
    "pantalon", "pantalones", "pant", "pants", "jean", "jeans", "denim", "trouser", "trousers", "short",
    "shorts", "falda", "faldas", "skirt", "legging", "leggings", "bermuda", "cargo", "palazzo",
  ],
  completo: ["vestido", "vestidos", "dress", "enterizo", "jumpsuit", "overol", "conjunto", "set"],
  accesorio: ["bolso", "bolsos", "bag", "cinturon", "sombrero", "pañoleta", "accesorio", "accesorios", "gorra"],
};

function familyOf(token: string): string | null {
  for (const [family, words] of Object.entries(FAMILIES)) {
    if (words.some((w) => token.includes(w) || w.includes(token))) return family;
  }
  return null;
}

async function searchProducts(args: {
  query?: string;
  colors?: string[];
  sizes?: string[];
  materials?: string[];
  types?: string[];
  max_price?: number;
  min_price?: number;
  limit?: number;
}): Promise<ToolResult> {
  const db = publicDb();
  const limit = Math.max(1, Math.min(args.limit ?? 3, 6));

  const { data, error } = await db
    .from("products")
    .select(`${PRODUCT_FIELDS}, product_variants(id, size, color, color_hex, price_cop, active)`)
    .eq("status", "published").or("available_national.eq.true,available_international.eq.true")
    .limit(300);
  if (error) throw new Error("No pude consultar el catálogo.");

  const all = (data ?? []).map((p: any) => ({
    ...p,
    product_variants: (p.product_variants ?? []).filter((v: any) => v.active),
  }));

  const tokens = [
    ...norm(args.query).split(/[^a-z0-9]+/).filter((t) => t.length > 2),
    ...(args.types ?? []).map(norm),
    ...(args.materials ?? []).map(norm),
  ];
  const families = [...new Set(tokens.map(familyOf).filter(Boolean) as string[])];
  const wantedColors = (args.colors ?? []).map(norm);

  const matchesFilters = (p: any) => {
    if (wantedColors.length && !p.product_variants.some((v: any) => wantedColors.some((c) => norm(v.color).includes(c))))
      return false;
    if (args.sizes?.length && !p.product_variants.some((v: any) => args.sizes!.includes(v.size ?? ""))) return false;
    if (args.max_price != null && !p.product_variants.some((v: any) => v.price_cop <= args.max_price!)) return false;
    if (args.min_price != null && !p.product_variants.some((v: any) => v.price_cop >= args.min_price!)) return false;
    return true;
  };

  const score = (p: any) => {
    const hay = norm([p.name, p.product_type, p.description, p.materials, (p.tags ?? []).join(" ")].join(" "));
    let s = 0;
    for (const t of tokens) {
      if (norm(p.name).includes(t)) s += 6;
      else if (norm(p.product_type).includes(t)) s += 5;
      else if (hay.includes(t)) s += 2;
    }
    const pf = familyOf(norm(p.product_type)) ?? familyOf(norm(p.name));
    if (pf && families.includes(pf)) s += 4; // pants ↔ pantalones, tops ↔ camisetas
    if (wantedColors.length && p.product_variants.some((v: any) => wantedColors.some((c) => norm(v.color).includes(c))))
      s += 2;
    return s;
  };

  const eligible = all.filter(matchesFilters);
  const scored = eligible
    .map((p: any) => ({ p, s: score(p) }))
    .sort((a, b) => b.s - a.s);

  const exact = scored.filter((r) => r.s >= 5).map((r) => r.p);
  const related = scored.filter((r) => r.s > 0 && r.s < 5).map((r) => r.p);

  let rows = exact.slice(0, limit);
  let match: "exact" | "related" | "fallback" = "exact";
  if (!rows.length) {
    rows = related.slice(0, limit);
    match = "related";
  }
  if (!rows.length) {
    // Nunca dejamos a la clienta sin opciones: sugerimos del catálogo disponible.
    rows = (eligible.length ? eligible : all).slice(0, limit);
    match = "fallback";
  }

  const compact = rows.map((p: any) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    type: p.product_type,
    from_price_cop: Math.min(...p.product_variants.map((v: any) => v.price_cop), Infinity),
    colors: [...new Set(p.product_variants.map((v: any) => v.color).filter(Boolean))],
    sizes: [...new Set(p.product_variants.map((v: any) => v.size).filter(Boolean))],
  }));

  return {
    data: {
      match,
      note:
        match === "exact"
          ? "Coincidencias directas."
          : match === "related"
            ? "No hay exactamente eso; estas son de la misma familia de prenda."
            : "No hay eso disponible; estas son alternativas del catálogo. Preséntalas como recomendación.",
      products: compact,
    },
    ui_action: compact.length
      ? {
          type: "show_products",
          payload: {
            product_ids: compact.map((p) => p.id),
            products: rows.map((p: any) => card(p)),
          },
        }
      : undefined,
  };
}

export const TOOLS: Record<string, ToolDef> = {
  search_products: {
    description:
      "Busca en el catálogo publicado por texto, color, talla, material, tipo de prenda o rango de precio en COP.",
    actors: ["public", "client", "b2b", "admin"],
    schema: z.object({
      query: z.string().optional(),
      colors: z.array(z.string()).optional(),
      sizes: z.array(z.string()).optional(),
      materials: z.array(z.string()).optional(),
      types: z.array(z.string()).optional(),
      min_price: z.number().optional(),
      max_price: z.number().optional(),
      limit: z.number().optional(),
    }),
    parameters: obj({
      query: str,
      colors: { type: "array", items: str },
      sizes: { type: "array", items: str },
      materials: { type: "array", items: str },
      types: { type: "array", items: str },
      min_price: num,
      max_price: num,
      limit: num,
    }),
    run: (_a, args) => searchProducts(args),
  },

  get_product: {
    description: "Detalle de un producto publicado por id o slug, con sus variantes.",
    actors: ["public", "client", "b2b", "admin"],
    schema: z.object({ product_id: z.string().optional(), slug: z.string().optional() }),
    parameters: obj({ product_id: str, slug: str }),
    run: async (_a, args) => {
      const db = publicDb();
      let q = db
        .from("products")
        .select(`${PRODUCT_FIELDS}, product_variants(id, sku, size, color, color_hex, price_cop, active)`)
        .eq("status", "published").or("available_national.eq.true,available_international.eq.true")
        .limit(1);
      q = args.product_id ? q.eq("id", args.product_id) : q.eq("slug", args.slug ?? "");
      const { data } = await q.maybeSingle();
      if (!data) throw new Error("No encontré ese producto.");
      return { data, ui_action: { type: "show_product", payload: { slug: (data as any).slug } } };
    },
  },

  get_product_availability: {
    description:
      "Disponibilidad real por talla/color y por ubicación (ecommerce, Cali, Bogotá, bodega). Nunca inventar stock.",
    actors: ["public", "client", "b2b", "admin"],
    schema: z.object({ product_id: z.string() }),
    parameters: obj({ product_id: str }, ["product_id"]),
    run: async (_a, args) => {
      const db = publicDb();
      const { data: variants } = await db
        .from("product_variants")
        .select("id, size, color, price_cop")
        .eq("product_id", args.product_id)
        .eq("active", true);
      const ids = (variants ?? []).map((v) => v.id);
      if (!ids.length) return { data: [] };
      const { data: levels } = await db
        .from("inventory_levels")
        .select("variant_id, on_hand, reserved, locations(code, name, city)")
        .in("variant_id", ids);
      const rows = (variants ?? []).map((v) => ({
        variant_id: v.id,
        size: v.size,
        color: v.color,
        price_cop: v.price_cop,
        locations: (levels ?? [])
          .filter((l: any) => l.variant_id === v.id)
          .map((l: any) => ({
            location: l.locations?.name ?? l.locations?.code,
            available: Math.max(0, (l.on_hand ?? 0) - (l.reserved ?? 0)),
          }))
          .filter((l: any) => l.available > 0),
      }));
      const cards = await productCards([args.product_id]);
      return {
        data: rows,
        ui_action: cards.length
          ? { type: "show_products", payload: { product_ids: [args.product_id], products: cards } }
          : undefined,
      };
    },
  },

  cart_add: {
    description:
      "Agrega una prenda al carrito de la clienta. Resuelve la variante por producto (id o slug) más talla y color. Úsala apenas la clienta pida agregar algo.",
    actors: ["public", "client"],
    schema: z.object({
      product_id: z.string().optional(),
      slug: z.string().optional(),
      size: z.string().optional(),
      color: z.string().optional(),
      qty: z.number().optional(),
    }),
    parameters: obj({ product_id: str, slug: str, size: str, color: str, qty: num }),
    run: async (_a, args) => {
      const db = publicDb();
      let pq = db
        .from("products")
        .select("id, slug, name, hero_image_url, product_variants(id, size, color, price_cop, active)")
        .eq("status", "published").or("available_national.eq.true,available_international.eq.true")
        .limit(1);
      pq = args.product_id ? pq.eq("id", args.product_id) : pq.eq("slug", args.slug ?? "");
      const { data: product } = await pq.maybeSingle();
      if (!product) throw new Error("No encontré ese producto.");
      const variants = ((product as any).product_variants ?? []).filter((v: any) => v.active);
      const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
      let match = variants.filter(
        (v: any) =>
          (!args.size || norm(v.size) === norm(args.size)) &&
          (!args.color || norm(v.color) === norm(args.color)),
      );
      if (!match.length) {
        return {
          data: {
            ok: false,
            reason: "variant_not_found",
            available: variants.map((v: any) => ({ size: v.size, color: v.color })),
          },
        };
      }
      if (match.length > 1 && (!args.size || !args.color)) {
        return {
          data: {
            ok: false,
            reason: "needs_choice",
            options: match.map((v: any) => ({ size: v.size, color: v.color })),
          },
        };
      }
      const v = match[0]!;
      const item = {
        variantId: v.id,
        productId: (product as any).id,
        productSlug: (product as any).slug,
        productName: (product as any).name,
        variantLabel: [v.color, v.size].filter(Boolean).join(" · "),
        priceCop: v.price_cop,
        imageUrl: (product as any).hero_image_url ?? null,
        qty: Math.max(1, Math.min(Number(args.qty) || 1, 10)),
      };
      return {
        data: { ok: true, item },
        ui_action: { type: "cart_add", payload: { item } },
      };
    },
  },

  cart_view: {
    description: "Muestra el contenido actual del carrito de la clienta (prendas, tallas, cantidades y subtotal).",
    actors: ["public", "client"],
    schema: z.object({}),
    parameters: obj({}),
    run: async () => ({ data: { note: "El carrito se lee en el navegador." } }),
  },

  cart_set_qty: {
    description: "Cambia la cantidad de una prenda ya presente en el carrito, usando su variant_id.",
    actors: ["public", "client"],
    schema: z.object({ variant_id: z.string(), qty: z.number() }),
    parameters: obj({ variant_id: str, qty: num }, ["variant_id", "qty"]),
    run: async () => ({ data: { note: "El carrito se actualiza en el navegador." } }),
  },

  cart_remove: {
    description: "Quita una prenda del carrito usando su variant_id.",
    actors: ["public", "client"],
    schema: z.object({ variant_id: z.string() }),
    parameters: obj({ variant_id: str }, ["variant_id"]),
    run: async () => ({ data: { note: "El carrito se actualiza en el navegador." } }),
  },

  resolve_inventory: {
    description: "Disponibilidad omnicanal de una variante concreta en todas las ubicaciones activas.",
    actors: ["public", "client", "b2b", "admin"],
    schema: z.object({ variant_id: z.string() }),
    parameters: obj({ variant_id: str }, ["variant_id"]),
    run: async (_a, args) => {
      const db = publicDb();
      const { data } = await db
        .from("inventory_levels")
        .select("on_hand, reserved, locations(code, name, city, active)")
        .eq("variant_id", args.variant_id);
      return {
        data: (data ?? [])
          .filter((l: any) => l.locations?.active)
          .map((l: any) => ({
            location: l.locations?.name,
            city: l.locations?.city,
            available: Math.max(0, (l.on_hand ?? 0) - (l.reserved ?? 0)),
          })),
      };
    },
  },

  get_store_policies: {
    description:
      "Políticas reales de la tienda: cambios y devoluciones (plazos, condiciones, dirección de bodega) y envíos (tarifas por país/región/peso, envío gratis) e impuestos. Úsala siempre antes de responder sobre cambios, devoluciones, envíos o costos de envío.",
    actors: ["public", "client", "b2b", "admin"],
    schema: z.object({ topic: z.enum(["returns", "shipping", "taxes", "all"]).optional() }),
    parameters: obj({ topic: { type: "string", enum: ["returns", "shipping", "taxes", "all"] } }),
    run: async (_a, args) => {
      const db = publicDb();
      const topic = args.topic ?? "all";
      const keys =
        topic === "returns"
          ? ["returns_guide"]
          : topic === "shipping"
            ? ["shipping_settings"]
            : topic === "taxes"
              ? ["tax_settings"]
              : ["returns_guide", "shipping_settings", "tax_settings"];
      const { data } = await db.from("app_settings").select("key, value").in("key", keys);
      const map: Record<string, any> = {};
      for (const row of data ?? []) map[(row as any).key] = (row as any).value;
      return {
        data: {
          note: "Datos configurados por la marca. Explícalos en tus palabras, en frases cortas, sin inventar plazos ni tarifas que no estén aquí. Los impuestos ya están incluidos en el precio publicado.",
          returns: map["returns_guide"] ?? null,
          shipping: map["shipping_settings"] ?? null,
          taxes: map["tax_settings"] ?? null,
        },
      };
    },
  },

  search_collections: {
    description:
      "Lista las colecciones publicadas con su relato (subtítulo/descripción), para poder contar de qué va cada universo.",
    actors: ["public", "client", "b2b", "admin"],
    schema: z.object({}),
    parameters: obj({}),
    run: async () => {
      const db = publicDb();
      const { data } = await db
        .from("collections")
        .select("id, slug, title, subtitle")
        .eq("status", "published")
        .eq("is_page", false)
        .order("position");
      return {
        data: {
          note: "Usa el subtítulo como el relato de la colección para explicarla con tus palabras.",
          collections: data ?? [],
        },
      };
    },
  },

  get_collection: {
    description:
      "Colección publicada con su relato y los productos que la componen, incluida la descripción y los materiales de cada prenda.",
    actors: ["public", "client", "b2b", "admin"],
    schema: z.object({ slug: z.string() }),
    parameters: obj({ slug: str }, ["slug"]),
    run: async (_a, args) => {
      const db = publicDb();
      const { data: col } = await db
        .from("collections")
        .select("id, slug, title, subtitle, collection_products(product_id, position)")
        .eq("slug", args.slug)
        .maybeSingle();
      if (!col) throw new Error("No encontré esa colección.");
      const ids = ((col as any).collection_products ?? []).map((c: any) => c.product_id);
      const { data: prods } = ids.length
        ? await db
            .from("products")
            .select("id, slug, name, description, materials, product_type, tags")
            .in("id", ids.slice(0, 24))
            .eq("status", "published").or("available_national.eq.true,available_international.eq.true")
        : { data: [] as any[] };
      return {
        data: {
          title: (col as any).title,
          story: (col as any).subtitle ?? null,
          note: "Cuenta el universo de la colección con estos textos, sin inventar nada que no esté aquí.",
          products: (prods ?? []).map((p: any) => ({
            id: p.id,
            slug: p.slug,
            name: p.name,
            type: p.product_type,
            description: String(p.description ?? "").slice(0, 600),
            materials: p.materials ?? null,
            tags: p.tags ?? [],
          })),
          product_ids: ids,
        },
        ui_action: { type: "show_products", payload: { product_ids: ids, products: await productCards(ids) } },
      };
    },
  },

  get_complete_look: {
    description: "Looks y piezas que combinan con un producto (cross-sell curado).",
    actors: ["public", "client", "b2b", "admin"],
    schema: z.object({ product_id: z.string() }),
    parameters: obj({ product_id: str }, ["product_id"]),
    run: async (_a, args) => {
      const db = publicDb();
      const { data } = await db
        .from("product_looks")
        .select("id, title, image_url, discount_pct, special_price_cop, product_look_items(product_id, position)")
        .eq("product_id", args.product_id)
        .eq("active", true)
        .order("position");
      const ids = (data ?? []).flatMap((l: any) => (l.product_look_items ?? []).map((i: any) => i.product_id));
      return {
        data: data ?? [],
        ui_action: ids.length
          ? { type: "open_cross_sell", payload: { product_id: args.product_id, products: await productCards(ids) } }
          : undefined,
      };
    },
  },

  // ---------- Cliente autenticado ----------
  get_my_orders: {
    description: "Pedidos del cliente autenticado, con estado y totales.",
    actors: ["client", "b2b", "admin"],
    schema: z.object({ limit: z.number().optional() }),
    parameters: obj({ limit: num }),
    run: async (actor, args) => {
      const { data } = await actor.db
        .from("orders")
        .select("id, number, status, total_cop, created_at, paid_at")
        .eq("customer_id", actor.userId!)
        .order("created_at", { ascending: false })
        .limit(Math.min(args.limit ?? 5, 20));
      return { data: data ?? [], ui_action: { type: "show_order", payload: { orders: data ?? [] } } };
    },
  },

  get_my_previous_purchases: {
    description: "Prendas compradas por el cliente autenticado (su Closet).",
    actors: ["client", "admin"],
    schema: z.object({}),
    parameters: obj({}),
    run: async (actor) => {
      const { data } = await actor.db
        .from("order_items")
        .select("product_name, variant_label, qty, variant_id, orders!inner(customer_id, status)")
        .eq("orders.customer_id", actor.userId!);
      return { data: data ?? [] };
    },
  },

  get_my_sizes: {
    description: "Tallas que el cliente ha comprado históricamente. No garantizan el fit de una pieza nueva.",
    actors: ["client", "admin"],
    schema: z.object({}),
    parameters: obj({}),
    run: async (actor) => {
      const { data } = await actor.db
        .from("order_items")
        .select("variant_label, product_variants(size), orders!inner(customer_id)")
        .eq("orders.customer_id", actor.userId!);
      const sizes: Record<string, number> = {};
      for (const row of (data ?? []) as any[]) {
        const s = row.product_variants?.size;
        if (s) sizes[s] = (sizes[s] ?? 0) + 1;
      }
      return { data: sizes };
    },
  },

  get_my_saved_items: {
    description: "Favoritos guardados por el cliente autenticado.",
    actors: ["client", "admin"],
    schema: z.object({}),
    parameters: obj({}),
    run: async (actor) => {
      const { data } = await actor.db
        .from("wishlists")
        .select("variant_id, product_variants(id, size, color, price_cop, product_id)")
        .eq("user_id", actor.userId!);
      return { data: data ?? [] };
    },
  },

  // ---------- B2B ----------
  get_my_b2b_orders: {
    description: "Pedidos mayoristas de la boutique autenticada.",
    actors: ["b2b"],
    schema: z.object({ limit: z.number().optional() }),
    parameters: obj({ limit: num }),
    run: async (actor, args) => {
      const { data } = await actor.db
        .from("orders")
        .select("id, number, status, total_cop, created_at")
        .eq("customer_id", actor.userId!)
        .order("created_at", { ascending: false })
        .limit(Math.min(args.limit ?? 10, 30));
      return { data: data ?? [] };
    },
  },

  get_my_b2b_replenishment_data: {
    description: "Referencias más pedidas históricamente por la boutique autenticada, para reposición.",
    actors: ["b2b"],
    schema: z.object({}),
    parameters: obj({}),
    run: async (actor) => {
      const { data } = await actor.db
        .from("order_items")
        .select("product_name, variant_label, qty, orders!inner(customer_id)")
        .eq("orders.customer_id", actor.userId!);
      const agg: Record<string, number> = {};
      for (const r of (data ?? []) as any[]) agg[r.product_name] = (agg[r.product_name] ?? 0) + r.qty;
      return {
        data: Object.entries(agg)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([name, qty]) => ({ product_name: name, units: qty })),
      };
    },
  },

  // ---------- Admin ----------
  get_sales: {
    description: "Totales actualizados iguales a Pedidos → Análisis. Incluye pendientes por defecto y usa equivalente COP guardado en Todos. Fechas/horas Colombia; destination permite nacional/internacional. only_paid=true solo para dinero cobrado.",
    actors: ["admin"],
    schema: z.object({ days: z.number().optional(), from: z.string().optional(), to: z.string().optional(), source: z.enum(["ecom", "pos", "assisted"]).optional(), only_paid: z.boolean().optional(), destination: z.enum(["all", "nacional", "internacional"]).optional(), store: z.string().optional() }),
    parameters: obj({ days: num, from: str, to: str, source: { type: "string", enum: ["ecom", "pos", "assisted"] }, only_paid: { type: "boolean" }, destination: { type: "string", enum: ["all", "nacional", "internacional"] }, store: str }),
    run: async (actor, args) => {
      const data = await readSalesAnalysis(actor, args);
      return {
        data,
        ui_action: { type: "show_metrics", payload: {
          title: "Pedidos · Análisis",
          metrics: [
            { label: "Ingresos totales", value: data.total.moneda === "USD" ? `US$${data.total.revenue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : data.total.revenue, format: data.total.moneda === "USD" ? undefined : "cop" },
            { label: "Pedidos", value: data.total.orders },
            { label: "Pendientes de pago", value: data.total.pendientes },
          ],
        } },
      };
    },
  },

  get_inventory: {
    description: "Inventario por bodega (en mano, reservado, disponible), filtrable por nombre de producto o SKU, por talla(s) y por código de bodega (cali, bogota, ecom, bodega=Bodega Central, mayorista).",
    actors: ["admin"],
    schema: z.object({ query: z.string().optional(), location_code: z.string().optional(), sizes: z.array(z.string()).optional() }),
    parameters: { ...obj({ query: str, location_code: str }), sizes: { type: "array", items: { type: "string" }, description: "Tallas a filtrar, ej. [\"S\",\"M\"]" } },
    run: async (actor, args) => {
      const code = actor.locationCode ?? args.location_code;
      const sizes = (args.sizes ?? []).map((s: string) => s.trim().toUpperCase()).filter(Boolean);
      const data = await fetchAll(() => {
        let q = actor.db
          .from("inventory_levels")
          .select("on_hand, reserved, locations!inner(code, name), product_variants!inner(sku, size, color, active, products!inner(name))")
          .eq("product_variants.active", true)
          .order("variant_id", { ascending: true })
          .order("location_id", { ascending: true });
        if (code) q = q.eq("locations.code", code);
        if (sizes.length) q = q.in("product_variants.size", sizes);
        if (args.query) {
          const term = args.query.replace(/[%,()]/g, " ").trim();
          q = /\d|-/.test(term) && !term.includes(" ")
            ? q.ilike("product_variants.sku", `%${term}%`)
            : q.ilike("product_variants.products.name", `%${term}%`);
        }
        return q;
      });
      const rows = (data ?? []).map((r: any) => ({
        product: r.product_variants?.products?.name,
        sku: r.product_variants?.sku,
        size: r.product_variants?.size,
        color: r.product_variants?.color,
        location: r.locations?.name,
        on_hand: r.on_hand ?? 0,
        reserved: r.reserved ?? 0,
        available: Math.max(0, (r.on_hand ?? 0) - (r.reserved ?? 0)),
      }));
      const sizeOrder = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "U", "UNICA"];
      const bySize = new Map<string, { size: string; available: number; on_hand: number; by_location: Record<string, number> }>();
      for (const r of rows) {
        const k = String(r.size ?? "Sin talla");
        const e = bySize.get(k) ?? { size: k, available: 0, on_hand: 0, by_location: {} };
        e.available += r.available; e.on_hand += r.on_hand;
        if (r.available) e.by_location[r.location ?? "?"] = (e.by_location[r.location ?? "?"] ?? 0) + r.available;
        bySize.set(k, e);
      }
      const totals_by_size = [...bySize.values()].sort((a, b) => {
        const ia = sizeOrder.indexOf(a.size.toUpperCase()), ib = sizeOrder.indexOf(b.size.toUpperCase());
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.size.localeCompare(b.size);
      });
      const products = [...new Set(rows.map((r) => r.product))].filter(Boolean);
      return {
        data: {
          instructions: "Usa SIEMPRE totals_by_location, totals_by_size y grand_total tal cual; no sumes tú las filas. Si preguntan cuántas prendas/unidades hay por bodega, responde con una viñeta por bodega (totals_by_location). Si preguntan por un producto, responde por talla: una viñeta por talla con su total disponible y entre paréntesis el desglose por bodega (totals_by_size.by_location), y al final el total por bodega. Si hay varios productos distintos (products), dilo y pregunta cuál, o desglosa por producto usando rows. Responde en texto con viñetas; el cuadro solo aparece con pocos resultados.",
          sizes_filter: sizes.length ? sizes : null,
          products: products.slice(0, 20),
          totals_by_location: stockTotals(rows),
          totals_by_size,
          grand_total: stockTotals(rows.map((r) => ({ ...r, location: "Total" })))[0] ?? null,
          rows: rows.length <= 300 ? rows : rows.slice(0, 300),
        },
        ui_action: rows.length <= 15 ? { type: "show_inventory", payload: { rows } } : undefined,
      };
    },
  },

  get_low_stock: {
    description: "Variantes con inventario disponible por debajo de un umbral.",
    actors: ["admin"],
    schema: z.object({ threshold: z.number().optional() }),
    parameters: obj({ threshold: num }),
    run: async (actor, args) => {
      const threshold = args.threshold ?? 3;
      const data = await fetchAll(() =>
        actor.db
          .from("inventory_levels")
          .select("on_hand, reserved, locations(name), product_variants(sku, size, color, products(name))"),
      );
      const rows = (data ?? [])
        .map((r: any) => ({
          product: r.product_variants?.products?.name,
          sku: r.product_variants?.sku,
          size: r.product_variants?.size,
          location: r.locations?.name,
          available: Math.max(0, (r.on_hand ?? 0) - (r.reserved ?? 0)),
        }))
        .filter((r) => r.available <= threshold)
        .slice(0, 40);
      return { data: rows, ui_action: { type: "show_inventory", payload: { rows } } };
    },
  },

  get_customers: {
    description:
      "Clientas buscadas por nombre, teléfono, cédula o correo: datos de contacto, cuántos pedidos tiene, cuánto ha comprado y sus puntos Tu Marca. Sin filtro devuelve el total de clientas con pedidos y las compras más recientes.",
    actors: ["admin"],
    schema: z.object({ query: z.string().optional() }),
    parameters: obj({ query: str }),
    run: async (actor, args) => {
      const term = args.query?.replace(/[%,()]/g, " ").trim();
      // Todas las órdenes (paginadas, sin tope de 1000) para agregar por clienta.
      const orders = (await fetchAll(() =>
        actor.db
          .from("orders")
          .select("customer_id, contact_name, contact_email, contact_phone, total_cop, status, created_at")
          .not("status", "in", "(draft,cancelled)"),
      )) as any[];
      const byKey: Record<string, any> = {};
      for (const o of orders) {
        const key = o.customer_id ?? o.contact_email ?? o.contact_phone ?? o.contact_name ?? "desconocida";
        const c = (byKey[key] ??= {
          name: o.contact_name,
          email: o.contact_email,
          phone: o.contact_phone,
          orders: 0,
          spent_cop: 0,
          last_order: null as string | null,
        });
        c.orders += 1;
        c.spent_cop += o.total_cop ?? 0;
        if (!c.last_order || o.created_at > c.last_order) c.last_order = o.created_at;
      }
      let customers = Object.values(byKey);
      if (term) {
        const t = norm(term);
        customers = customers.filter((c) =>
          [c.name, c.email, c.phone].some((v) => norm(v).includes(t)),
        );
        // También buscar en perfiles por cédula o teléfono.
        const { data: profs } = await actor.db
          .from("profiles")
          .select("full_name, phone, document_id")
          .or(`full_name.ilike.%${term}%,phone.ilike.%${term}%,document_id.ilike.%${term}%`)
          .limit(10);
        for (const p of profs ?? []) {
          if (!customers.some((c) => norm(c.name) === norm(p.full_name))) {
            customers.push({ name: p.full_name, phone: p.phone, document_id: p.document_id, orders: 0, spent_cop: 0, last_order: null });
          }
        }
      }
      customers.sort((a, b) => b.spent_cop - a.spent_cop);
      const shown = customers.slice(0, 15);
      // Puntos Tu Marca de las clientas mostradas (suma de loyalty_transactions).
      const names = shown.map((c) => c.name).filter(Boolean);
      let points: Record<string, number> = {};
      if (names.length) {
        const txs = (await fetchAll(() =>
          actor.db.from("loyalty_transactions").select("points, orders!inner(contact_name)").in("orders.contact_name", names),
        )) as any[];
        for (const t of txs) {
          const n = t.orders?.contact_name;
          if (n) points[n] = (points[n] ?? 0) + (t.points ?? 0);
        }
      }
      return {
        data: {
          total_customers_with_orders: Object.keys(byKey).length,
          matching: customers.length,
          customers: shown.map((c) => ({ ...c, marca_points: points[c.name] ?? 0 })),
        },
      };
    },
  },

  get_margins: {
    description: "Margen por producto usando costo y precio de venta. Solo dirección y contabilidad.",
    actors: ["admin"],
    roles: ["superadmin", "admin_ecommerce", "contabilidad"],
    schema: z.object({ limit: z.number().optional() }),
    parameters: obj({ limit: num }),
    run: async (actor, args) => {
      const data = await fetchAll(() =>
        actor.db.from("product_variants").select("sku, price_cop, cost_cop, products(name)").not("cost_cop", "is", null),
      );
      return {
        data: (data ?? []).map((v: any) => ({
          product: v.products?.name,
          sku: v.sku,
          price_cop: v.price_cop,
          cost_cop: v.cost_cop,
          margin_pct: v.price_cop ? Math.round((1 - v.cost_cop / v.price_cop) * 100) : null,
        })),
      };
    },
  },
};

Object.assign(TOOLS, ADMIN_TOOLS as unknown as Record<string, ToolDef>);

const ROLE_BLOCKED_TOOLS: Record<string, string[]> = {
  mercadeo: ["get_margins"],
  servicio: ["get_margins", "get_inventory", "get_low_stock", "sales_by_channel"],
  staff_cali: ["get_margins"],
  staff_bogota: ["get_margins"],
  bodega: ["get_margins", "get_sales", "sales_by_channel"],
  admin_inventario: ["get_margins"],
};

/** Catálogo de herramientas visible para este actor. El modelo nunca ve el resto. */
export function toolsFor(actor: ReadyActor): string[] {
  return Object.entries(TOOLS)
    .filter(([name, def]) => {
      if (!def.actors.includes(actor.type)) return false;
      if (actor.type !== "admin") return true;
      // En el equipo, solo las herramientas del portal donde se abrió el chat.
      if (!PORTAL_TOOLS[actor.portal].includes(name)) return false;
      if (def.roles && !def.roles.some((r) => actor.roles.includes(r))) return false;
      const privileged = actor.roles.includes("superadmin") || actor.roles.includes("admin_ecommerce");
      if (privileged) return true;
      return !actor.roles.some((r) => (ROLE_BLOCKED_TOOLS[r] ?? []).includes(name));
    })
    .map(([name]) => name);
}

export function toolSchemasFor(actor: ReadyActor) {
  return toolsFor(actor).map((name) => ({
    type: "function" as const,
    name,
    description: TOOLS[name]!.description,
    parameters: TOOLS[name]!.parameters,
  }));
}

export async function executeTool(actor: ReadyActor, name: string, rawArgs: unknown): Promise<ToolResult> {
  if (!toolsFor(actor).includes(name)) throw new Error("Herramienta no disponible para este usuario.");
  const def = TOOLS[name]!;
  const args = def.schema.parse(rawArgs ?? {});
  return def.run(actor, args);
}
