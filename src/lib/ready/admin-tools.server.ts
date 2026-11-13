import { z } from "zod";
import type { ReadyActor } from "./context.server";
import { stockTotals } from "./stock-totals";
import { readSalesAnalysis } from "./sales-analysis.server";

export type Portal = "hub" | "tienda" | "b2b" | "pos" | "other";

/** Portal según la ruta desde donde se abrió el chat. */
export function portalFromRoute(route?: unknown): Portal {
  const r = typeof route === "string" ? route : "";
  if (r.startsWith("/admin/tienda")) return "tienda";
  if (r.startsWith("/admin/b2b")) return "b2b";
  if (r.startsWith("/admin")) return "hub";
  if (r.startsWith("/pos")) return "pos";
  return "other";
}

/** Módulo exacto según la ruta actual (la coincidencia más específica gana). */
export function moduleFromRoute(route?: unknown): { name: string; route: string; what: string } | null {
  const r = typeof route === "string" ? route : "";
  if (!r) return null;
  const all = Object.values(MODULES).flat();
  const match = all
    .filter((m) => {
      const pat = m.route.replace("{sede}", "[^/]+");
      return new RegExp(`^${pat}(/|$)`).test(r);
    })
    .sort((a, b) => b.route.length - a.route.length)[0];
  return match ?? null;
}

const PRIVILEGED = ["superadmin", "admin_ecommerce"];
export const isPrivileged = (a: ReadyActor) => a.roles.some((r) => PRIVILEGED.includes(r));
/** Costos y márgenes: solo dirección y contabilidad. */
export const canSeeCosts = (a: ReadyActor) => isPrivileged(a) || a.roles.includes("contabilidad");

/** Portales a los que el rol puede entrar (mismo criterio que los menús). */
export function portalAllowed(a: ReadyActor, p: Portal): boolean {
  if (isPrivileged(a)) return true;
  const r = a.roles;
  switch (p) {
    case "hub":
      return r.some((x) => ["admin_inventario", "bodega", "contabilidad", "mercadeo", "servicio"].includes(x));
    case "tienda":
      return r.some((x) => ["mercadeo", "servicio", "contabilidad"].includes(x));
    case "b2b":
      return r.some((x) => ["admin_inventario", "bodega", "contabilidad"].includes(x));
    case "pos":
      return r.some((x) => ["staff_cali", "staff_bogota"].includes(x));
    default:
      return false;
  }
}

/** Herramientas de equipo disponibles en cada portal. */
export const PORTAL_TOOLS: Record<Portal, string[]> = {
  hub: ["admin_modules", "admin_product", "get_inventory", "get_low_stock", "get_sales", "sales_by_channel", "get_margins", "admin_orders", "admin_order_detail", "get_customers"],
  tienda: ["admin_modules", "admin_product", "get_sales", "sales_by_channel", "get_margins", "admin_orders", "admin_order_detail", "get_inventory", "get_customers"],
  b2b: ["admin_modules", "admin_product", "get_inventory", "sales_by_channel", "admin_orders", "admin_order_detail", "get_margins", "get_customers"],
  pos: ["admin_modules", "admin_product", "get_inventory", "get_low_stock", "get_sales", "sales_by_channel", "admin_orders", "admin_order_detail", "get_customers"],
  other: ["admin_modules"],
};

type Mod = { name: string; route: string; what: string; roles?: string[] };
const MODULES: Record<Exclude<Portal, "other">, Mod[]> = {
  hub: [
    { name: "Inicio", route: "/admin", what: "Resumen general del Sales Hub." },
    { name: "Productos", route: "/admin/productos", what: "Crear y editar productos; pestaña «Variantes y precios» con SKU, tallas, colores, precios y costos. Búsqueda por nombre o SKU." },
    { name: "Inventario", route: "/admin/inventario", what: "Stock por bodega y calidad A/B/C, kardex, ajustes, cambios entre variantes, importar/exportar Excel." },
    { name: "Conteo físico", route: "/admin/conteo", what: "Tomas físicas con pistola o cámara; diferencias y aprobación que ajusta inventario (solo administradores)." },
    { name: "Entradas", route: "/admin/entradas", what: "Ingreso de producción a Bodega Central." },
    { name: "Traslados", route: "/admin/traslados", what: "Solicitar, aprobar, despachar y recibir traslados entre bodegas." },
    { name: "Bodegas", route: "/admin/bodegas", what: "Ficha de cada bodega; reglas omnicanal (prestar a la web, margen de seguridad, días bloqueados)." },
    { name: "Pedidos", route: "/admin/pedidos", what: "Nacionales COP, B2B, Internacionales USD y Análisis; filtros por pasarela y venta asistida." },
    { name: "Cambios", route: "/admin/cambios", what: "Cambios y devoluciones de clientas." },
    { name: "Clientes", route: "/admin/clientes", what: "CRM de clientas." },
    { name: "Pedidos · Análisis", route: "/admin/pedidos", what: "Ventas, gráficas y comparación por canal." },
    { name: "Control financiero", route: "/admin/control-financiero", what: "Ingresos, ventas POS y B2B.", roles: ["contabilidad"] },
    { name: "Loyalty", route: "/admin/loyalty", what: "Configuración de puntos y puntos por reseñas." },
    { name: "Promociones y ofertas POS", route: "/admin/promociones", what: "Descuentos web y ofertas de caja." },
    { name: "Email marketing", route: "/admin/email-marketing", what: "Campañas y automatizaciones." },
    { name: "Configuración", route: "/admin/configuracion", what: "Usuarios y roles, facturación R-Count (centros y consecutivos), pasarelas." },
  ],
  tienda: [
    { name: "Productos", route: "/admin/productos", what: "Productos publicados en la tienda online." },
    { name: "Colecciones", route: "/admin/tienda/colecciones", what: "Colecciones y su experiencia editorial." },
    { name: "Experiencias", route: "/admin/tienda/experiencia/our-world", what: "Editor de escenas (Our World, Our Stores, colecciones)." },
    { name: "Pedidos", route: "/admin/pedidos", what: "Pedidos online." },
    { name: "Cambios", route: "/admin/cambios", what: "Solicitudes de cambio y devolución (dinero o Puntos Tu Marca)." },
    { name: "Clientes", route: "/admin/clientes", what: "Clientas de la tienda online." },
    { name: "Promociones", route: "/admin/promociones", what: "Descuentos de la tienda." },
    { name: "Estadísticas", route: "/admin/tienda/estadisticas", what: "Tráfico, carritos y compras." },
    { name: "Portal cliente", route: "/admin/tienda/portal-cliente", what: "Módulos del portal (Mi Closet on/off)." },
    { name: "Configuración", route: "/admin/tienda/configuracion", what: "Navegación, envíos, impuestos, barras de anuncios y entrenamiento de Tu Marca." },
  ],
  b2b: [
    { name: "Dashboard B2B", route: "/admin/b2b", what: "Resumen mayorista." },
    { name: "Pedidos B2B", route: "/admin/b2b/pedidos", what: "Pedidos manuales, venta en firme o consignación." },
    { name: "Preventa", route: "/admin/b2b/preventa", what: "Matriz de cupos por talla, Curva Corte, clientes y POS." },
    { name: "Control de envíos", route: "/admin/b2b/envios", what: "Despachado → En tránsito → Confirmado con remisión firmada." },
    { name: "Devoluciones B2B", route: "/admin/b2b/devoluciones", what: "Rotación de consignación, averías, cambios comerciales; nota crédito." },
    { name: "Inventario B2B", route: "/admin/b2b/inventario", what: "Stock de Bodega Central y bodegas de consignación." },
    { name: "Clientes y accesos", route: "/admin/b2b/clientes", what: "Boutiques, accesos al portal." },
    { name: "Solicitudes Wholesale", route: "/admin/b2b/solicitudes", what: "Aprobar solicitudes y crear cuenta con clave." },
    { name: "Mensajes y portada", route: "/admin/b2b/mensajes", what: "Comunicación y banner del portal B2B." },
  ],
  pos: [
    { name: "Caja", route: "/pos/{sede}", what: "Vender, escanear con cámara, puntos, caja menor, pedido con envío (venta asistida)." },
    { name: "Productos", route: "/pos/{sede}/productos", what: "Catálogo con stock de la tienda." },
    { name: "Inventario", route: "/pos/{sede}/inventario", what: "Stock de la tienda." },
    { name: "Pedidos", route: "/pos/{sede}/pedidos", what: "Pedidos web asignados para despacho: guía y lista de empaque." },
    { name: "Cambios", route: "/pos/{sede}/cambios", what: "Cambio inmediato en tienda por pedido, cédula o teléfono." },
    { name: "Traslados", route: "/pos/{sede}/traslados", what: "Recibir y pedir traslados." },
    { name: "Citas y clientes", route: "/pos/{sede}/citas", what: "Citas en tienda y clientas." },
    { name: "Control financiero", route: "/pos/{sede}/control-financiero", what: "Arqueos y cierres." },
  ],
};

const obj = (props: Record<string, unknown>, required: string[] = []) => ({
  type: "object",
  properties: props,
  required,
  additionalProperties: false,
});

export const ADMIN_TOOLS = {
  admin_modules: {
    description: "Guía de los módulos del portal donde está la persona: qué hace cada uno y en qué ruta está. Úsala para explicar cómo hacer algo en el admin.",
    actors: ["admin"] as const,
    schema: z.object({}),
    parameters: obj({}),
    run: async (actor: ReadyActor) => {
      const p = actor.portal === "other" ? "hub" : actor.portal;
      const mods = MODULES[p].filter((m) => !m.roles || isPrivileged(actor) || m.roles.some((r) => actor.roles.includes(r)));
      return { data: { portal: p, modules: mods } };
    },
  },

  admin_product: {
    description:
      "Ficha interna de un producto buscado por nombre o SKU: variantes, precio, stock por bodega (disponible, reservado) y, solo si el rol lo permite, costo y margen.",
    actors: ["admin"] as const,
    schema: z.object({ query: z.string() }),
    parameters: obj({ query: { type: "string" } }, ["query"]),
    run: async (actor: ReadyActor, args: { query: string }) => {
      const q = args.query.trim().replace(/[%,()]/g, " ");
      const costs = canSeeCosts(actor);
      const sel = `id, name, status, product_type, product_variants(sku, size, color, active, price_cop${costs ? ", cost_cop" : ""}, inventory_levels(on_hand, reserved, locations(code, name)))`;
      let { data } = await actor.db.from("products").select(sel).ilike("name", `%${q}%`).limit(3);
      if (!data?.length) {
        const { data: v } = await actor.db.from("product_variants").select("product_id").ilike("sku", `%${q}%`).limit(5);
        const ids = [...new Set((v ?? []).map((x: any) => x.product_id))];
        if (ids.length) ({ data } = await actor.db.from("products").select(sel).in("id", ids).limit(3));
      }
      const loc = actor.locationCode;
      const products = ((data ?? []) as any[]).map((p) => {
        const variants = (p.product_variants ?? [])
          .filter((v: any) => v.active)
          .map((v: any) => {
            const stock = (v.inventory_levels ?? [])
              .filter((l: any) => !loc || l.locations?.code === loc)
              .map((l: any) => ({
                location: l.locations?.name,
                on_hand: l.on_hand ?? 0,
                reserved: l.reserved ?? 0,
                available: Math.max(0, (l.on_hand ?? 0) - (l.reserved ?? 0)),
              }));
            return {
              sku: v.sku,
              size: v.size,
              color: v.color,
              price_cop: v.price_cop,
              ...(costs
                ? {
                    cost_cop: v.cost_cop,
                    margin_pct: v.cost_cop && v.price_cop ? Math.round((1 - v.cost_cop / v.price_cop) * 100) : null,
                  }
                : {}),
              total_available: stock.reduce((s: number, x: any) => s + x.available, 0),
              stock,
            };
          });
        return {
          name: p.name,
          status: p.status,
          type: p.product_type,
          totals_by_location: stockTotals(variants.flatMap((v: any) => v.stock)),
          variants,
        };
      });
      return {
        data: {
          instructions: "Para cantidades por bodega usa totals_by_location tal cual (available = disponible, on_hand = en mano); no sumes tú las variantes.",
          products,
          costs_visible: costs,
          ...(costs ? {} : { note: "Este usuario no tiene permiso para ver costos." }),
          ...(loc ? { scope: `Solo sede ${loc}` } : {}),
        },
      };
    },
  },

  admin_orders: {
    description:
      "Pedidos con conteo y totales exactos de TODO el historial (sin límite de filas): filtra por estado, número, producto (nombre o SKU) y rango de fechas YYYY-MM-DD. Devuelve summary con conteos/totales calculados y una muestra de los más recientes. En POS se limita a la sede; en B2B a pedidos mayoristas.",
    actors: ["admin"] as const,
    schema: z.object({
      status: z.string().optional(),
      number: z.string().optional(),
      product: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.number().optional(),
    }),
    parameters: obj({
      status: { type: "string" },
      number: { type: "string" },
      product: { type: "string" },
      from: { type: "string" },
      to: { type: "string" },
      limit: { type: "number" },
    }),
    run: async (actor: ReadyActor, args: { status?: string; number?: string; product?: string; from?: string; to?: string; limit?: number }) => {
      let ids: string[] | null = null;
      if (args.product) {
        const term = args.product.replace(/[%,()]/g, " ").trim();
        const items = await pageAll((a, b) =>
          actor.db
            .from("order_items")
            .select("order_id, product_name, product_variants(sku)")
            .or(`product_name.ilike.%${term}%`)
            .order("order_id")
            .range(a, b),
        );
        const bySku = await pageAll((a, b) =>
          actor.db
            .from("order_items")
            .select("order_id, product_variants!inner(sku)")
            .ilike("product_variants.sku", `%${term}%`)
            .order("order_id")
            .range(a, b),
        );
        ids = [...new Set([...items, ...bySku].map((r: any) => r.order_id))];
        if (!ids.length) return { data: { summary: { orders: 0 }, orders: [] } };
      }
      const build = (a: number, b: number, chunk?: string[]) => {
        let q = actor.db
          .from("orders")
          .select("id, number, status, source, currency, total_cop, total_usd:total_usd_exact, payment_status, contact_name, customer_id, b2b_mode, created_at, locations:sold_by_location_id(code)")
          .order("created_at", { ascending: false })
          .range(a, b);
        if (args.status) q = q.eq("status", args.status as never);
        if (args.number) q = q.ilike("number", `%${args.number}%`);
        if (args.from) q = q.gte("created_at", `${args.from}T00:00:00-05:00`);
        if (args.to) q = q.lte("created_at", `${args.to}T23:59:59-05:00`);
        if (chunk) q = q.in("id", chunk);
        if (actor.portal === "b2b") q = q.not("b2b_mode", "is", null);
        if (actor.portal === "tienda") q = q.in("source", ["ecom", "assisted"]);
        return q;
      };
      let rows: any[] = [];
      if (ids) {
        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200);
          rows.push(...(await pageAll((a, b) => build(a, b, chunk))));
        }
        rows.sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)));
      } else rows = await pageAll((a, b) => build(a, b));
      if (actor.locationCode) rows = rows.filter((r) => r.locations?.code === actor.locationCode);
      const live = rows.filter((r) => r.status !== "cancelled");
      const byStatus: Record<string, number> = {};
      for (const r of rows) byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      const summary = {
        orders: rows.length,
        not_cancelled: live.length,
        by_status: byStatus,
        total_cop: live.filter((r) => r.currency !== "USD").reduce((s, r) => s + Number(r.total_cop ?? 0), 0),
        total_usd: live.filter((r) => r.currency === "USD").reduce((s, r) => s + Number(r.total_usd ?? 0), 0),
      };
      const showCustomer =
        actor.roles.some((x) => ["staff_cali", "staff_bogota"].includes(x)) || isPrivileged(actor) || actor.roles.includes("servicio");
      return {
        data: {
          instructions: "Para conteos y totales usa summary tal cual; orders es solo una muestra de los más recientes.",
          summary,
          orders: rows.slice(0, Math.min(args.limit ?? 15, 40)).map(({ locations, contact_name, id, customer_id, ...r }) => ({
            ...r,
            customer: showCustomer ? contact_name : undefined,
          })),
        },
        ui_action: {
          type: "show_order",
          payload: {
            orders: await withKind(actor, rows.slice(0, Math.min(args.limit ?? 15, 40))),
          },
        },
      };
    },
  },
  admin_order_detail: {
    description:
      "Estado completo de UN pedido por número (ej. B2B-09, TM-WEB-35, TM-POS-BOG-16), de cualquier canal: estado, pago, cantidades confirmadas, cajas armadas/despachadas, facturas R-Count, guías y productos. Úsalo siempre que pregunten en qué va un pedido.",
    actors: ["admin"] as const,
    schema: z.object({ number: z.string() }),
    parameters: obj({ number: { type: "string" } }, ["number"]),
    run: async (actor: ReadyActor, args: { number: string }) => {
      const n = args.number.trim().replace(/^#/, "").replace(/[%,()]/g, "");
      const sel = "id, number, status, source, is_manual, b2b_mode, customer_id, currency, total_cop, total_usd:total_usd_exact, payment_status, payment_method, b2b_payment_method, paid_at, credit_due_at, stock_confirmed_at, stock_deducted_at, delivered_at, shipping_carrier, tracking_number, contact_name, created_at, locations:sold_by_location_id(code, name)";
      let { data: o } = await actor.db.from("orders").select(sel).ilike("number", n).maybeSingle();
      if (!o) {
        const { data: list } = await actor.db.from("orders").select(sel).ilike("number", `%${n}%`).order("created_at", { ascending: false }).limit(2);
        o = list?.[0] ?? null;
      }
      if (!o) return { data: { error: `No encontré el pedido ${args.number}.` } };
      const ord: any = o;
      if (actor.locationCode && ord.locations?.code !== actor.locationCode) return { data: { error: "Ese pedido no es de tu sede." } };
      const [isB2B, items, boxes, invoices, shipments, b2bShip] = await Promise.all([
        ord.customer_id ? actor.db.rpc("is_b2b", { _user_id: ord.customer_id } as never).then((r: any) => !!r.data) : Promise.resolve(false),
        actor.db.from("order_items").select("product_name, variant_label, qty").eq("order_id", ord.id),
        actor.db.from("b2b_boxes").select("box_number, status, dispatched_at, carrier, tracking, discount_pct").eq("order_id", ord.id).order("box_number"),
        actor.db.from("invoices").select("number, status, total_amount, currency, issued_at, box_id, error").eq("order_id", ord.id).order("created_at"),
        actor.db.from("order_shipments").select("carrier, tracking, shipped_at").eq("order_id", ord.id),
        actor.db.from("b2b_shipments").select("status, dispatched_at, confirmed_at").eq("order_id", ord.id),
      ]);
      const channel = isB2B ? "B2B" : ord.source === "pos" || ord.source === "assisted" ? `POS ${ord.locations?.name ?? ""}`.trim() : ord.is_manual ? "Pedido Manual" : "Online";
      const its = (items.data ?? []) as any[];
      const bx = (boxes.data ?? []) as any[];
      const inv = (invoices.data ?? []) as any[];
      const steps = {
        cantidades_confirmadas: ord.stock_confirmed_at ? `Sí (${String(ord.stock_confirmed_at).slice(0, 10)})` : "No",
        pago: ord.payment_status === "paid" ? `Pagado${ord.paid_at ? ` (${String(ord.paid_at).slice(0, 10)})` : ""}` : ord.credit_due_at ? `Crédito pendiente, vence ${String(ord.credit_due_at).slice(0, 10)}` : `Pendiente (${ord.payment_status ?? "sin pago"})`,
        cajas: bx.length ? `${bx.length} armada(s), ${bx.filter((b) => b.dispatched_at).length} despachada(s)` : "Sin cajas",
        facturacion: inv.length ? inv.map((i) => `${i.number ?? "sin número"} · ${i.status}${i.error ? " (error)" : ""}`).join("; ") : "Sin facturar",
        despacho: ord.delivered_at ? "Entregado" : (shipments.data ?? []).length || ord.tracking_number ? "Con guía / despachado" : "Sin despachar",
      };
      const summary = {
        number: ord.number,
        channel,
        status: ord.status,
        customer: ord.contact_name,
        total: ord.currency === "USD" ? `US$${Number(ord.total_usd ?? 0).toFixed(2)}` : `$${Math.round(Number(ord.total_cop ?? 0)).toLocaleString("es-CO")}`,
        created: String(ord.created_at).slice(0, 10),
        steps,
        boxes: bx,
        invoices: inv.map(({ box_id, ...r }) => r),
        shipments: [...(shipments.data ?? []), ...(b2bShip.data ?? [])],
        pieces: its.reduce((s, i) => s + (i.qty ?? 0), 0),
        items: its.slice(0, 40),
      };
      return {
        data: { ...summary, instructions: "El enlace al pedido se muestra solo debajo de tu respuesta; no escribas URLs." },
        ui_action: { type: "show_order", payload: { orders: [{ id: ord.id, number: ord.number, status: ord.status, kind: isB2B ? "b2b" : "admin" }] } },
      };
    },
  },

  sales_by_channel: {
    description: "Cifras en vivo idénticas a Pedidos → Análisis: incluye pendientes y excluye cancelados; Todos suma equivalente COP guardado. Fechas/horas Colombia. destination all/nacional/internacional; only_paid solo si piden cobros confirmados.",
    actors: ["admin"] as const,
    schema: z.object({ from: z.string().optional(), to: z.string().optional(), only_paid: z.boolean().optional(), destination: z.enum(["all", "nacional", "internacional"]).optional(), store: z.string().optional() }),
    parameters: obj({ from: { type: "string" }, to: { type: "string" }, only_paid: { type: "boolean" }, destination: { type: "string", enum: ["all", "nacional", "internacional"] }, store: { type: "string" } }),
    run: async (actor: ReadyActor, args: any) => ({ data: await readSalesAnalysis(actor, args, true) }),
  },
};

async function withKind(actor: ReadyActor, rows: any[]) {
  const ids = [...new Set(rows.map((r) => r.customer_id).filter(Boolean))] as string[];
  const b2b = new Set<string>();
  await Promise.all(ids.map(async (id) => {
    const { data } = await actor.db.rpc("is_b2b", { _user_id: id } as never);
    if (data) b2b.add(id);
  }));
  return rows.map((r) => ({ id: r.id, number: r.number, status: r.status, kind: b2b.has(r.customer_id) ? "b2b" : "admin" }));
}

async function pageAll(build: (from: number, to: number) => any, size = 1000): Promise<any[]> {
  const out: any[] = [];
  for (let a = 0; a < 100000; a += size) {
    const { data, error } = await build(a, a + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < size) break;
  }
  return out;
}
