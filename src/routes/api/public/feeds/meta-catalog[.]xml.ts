import { createFileRoute } from "@tanstack/react-router";
import { normalizeMetaCatalog, META_CATALOG_KEY } from "@/lib/meta-catalog";
import { webSellable } from "@/lib/web-stock";
import { SITE_ORIGIN } from "@/lib/site";

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Feed público de productos para el catálogo de Meta. Solo datos públicos de la tienda.
export const Route = createFileRoute("/api/public/feeds/meta-catalog.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const usd = url.searchParams.get("currency")?.toLowerCase() === "usd";
        const origin = SITE_ORIGIN;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: setRow } = await supabaseAdmin.from("app_settings").select("value").eq("key", META_CATALOG_KEY).maybeSingle();
        const cfg = normalizeMetaCatalog(setRow?.value);

        let ids: string[] | null = null;
        if (cfg.mode === "products") ids = cfg.products;
        if (cfg.mode === "collections") {
          const { data } = cfg.collections.length
            ? await supabaseAdmin.from("collection_products").select("product_id").in("collection_id", cfg.collections)
            : { data: [] as { product_id: string }[] };
          ids = Array.from(new Set((data ?? []).map((r: any) => r.product_id as string)));
        }

        let products: any[] = [];
        if (!ids || ids.length) {
          let q = supabaseAdmin
            .from("products")
            .select("id, slug, name, name_en, description, description_en, product_type, hero_image_url, available_national, available_international, product_images(url, position), product_variants(id, sku, size, color, price_cop, price_usd, active, inventory_levels(on_hand, reserved, locations(kind, web_lending, web_safety_stock)))")
            .eq("status", "published")
            .limit(1000);
          q = usd ? q.eq("available_international", true) : q.eq("available_national", true);
          if (ids) q = q.in("id", ids.slice(0, 900));
          const { data, error } = await q;
          if (error) return new Response("Feed error", { status: 500 });
          products = data ?? [];
        }

        const items: string[] = [];
        for (const p of products) {
          const imgs = [p.hero_image_url, ...((p.product_images ?? []) as any[]).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)).map((i) => i.url)]
            .filter((v: string, i: number, a: string[]) => v && a.indexOf(v) === i);
          if (!imgs.length) continue;
          const title = usd ? p.name_en || p.name : p.name;
          const desc = ((usd ? p.description_en || p.description : p.description) || title).replace(/<[^>]+>/g, " ").slice(0, 4900);
          for (const v of (p.product_variants ?? []) as any[]) {
            if (!v.active || !v.sku) continue;
            const stock = ((v.inventory_levels ?? []) as any[]).reduce((s, l) => s + webSellable(l), 0);
            if (cfg.onlyInStock && stock <= 0) continue;
            const price = usd ? (v.price_usd ? `${Number(v.price_usd).toFixed(2)} USD` : null) : v.price_cop ? `${Math.round(v.price_cop)} COP` : null;
            if (!price) continue;
            items.push(`<item>
<g:id>${esc(v.sku)}</g:id>
<g:item_group_id>${esc(p.id)}</g:item_group_id>
<g:title>${esc(title)}</g:title>
<g:description>${esc(desc)}</g:description>
<g:link>${esc(`${origin}/producto/${p.slug}`)}</g:link>
<g:image_link>${esc(imgs[0])}</g:image_link>
${imgs.slice(1, 10).map((i: string) => `<g:additional_image_link>${esc(i)}</g:additional_image_link>`).join("")}
<g:brand>Tu Marca</g:brand>
<g:condition>new</g:condition>
<g:availability>${stock > 0 ? "in stock" : "out of stock"}</g:availability>
<g:inventory>${stock}</g:inventory>
<g:price>${price}</g:price>
${v.size ? `<g:size>${esc(v.size)}</g:size>` : ""}${v.color ? `<g:color>${esc(v.color)}</g:color>` : ""}${p.product_type ? `<g:product_type>${esc(p.product_type)}</g:product_type>` : ""}
</item>`);
          }
        }

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss xmlns:g="http://base.google.com/ns/1.0" version="2.0"><channel>
<title>Tu Marca</title><link>${origin}</link><description>Catálogo Tu Marca</description>
${items.join("\n")}
</channel></rss>`;
        return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=900" } });
      },
    },
  },
});
