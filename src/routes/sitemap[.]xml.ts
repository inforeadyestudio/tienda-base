import { createFileRoute } from "@tanstack/react-router";
import { SITE_ORIGIN } from "@/lib/site";
import { supabase } from "@/integrations/supabase/client";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Mapa del sitio para buscadores: páginas fijas, colecciones, tipos y productos publicados.
// Usa el cliente público: solo lee lo que cualquier visitante puede ver.
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const [products, collections, types] = await Promise.all([
          supabase
            .from("products")
            .select("slug, updated_at")
            .eq("status", "published")
            .or("available_national.eq.true,available_international.eq.true")
            .limit(5000),
          supabase.from("collections").select("slug, updated_at, is_page").eq("status", "published").limit(1000),
          supabase.from("product_types").select("slug, updated_at").eq("active", true).limit(200),
        ]);
        const urls: { loc: string; lastmod?: string | null; priority: string }[] = [
          { loc: "/", priority: "1.0" },
          { loc: "/tienda", priority: "0.9" },
          { loc: "/coleccion/todo", priority: "0.8" },
          { loc: "/our-world", priority: "0.5" },
          { loc: "/contacto", priority: "0.3" },
          { loc: "/wholesale", priority: "0.3" },
          { loc: "/cambios-y-devoluciones", priority: "0.2" },
          { loc: "/terminos", priority: "0.1" },
          { loc: "/privacidad", priority: "0.1" },
          ...(types.data ?? []).map((t) => ({ loc: `/tipo/${t.slug}`, lastmod: t.updated_at, priority: "0.8" })),
          ...(collections.data ?? [])
            .filter((c) => c.slug && c.slug !== "home")
            .map((c) => ({ loc: `/coleccion/${c.slug}`, lastmod: c.updated_at, priority: "0.7" })),
          ...(products.data ?? []).map((p) => ({ loc: `/producto/${p.slug}`, lastmod: p.updated_at, priority: "0.8" })),
        ];
        const body =
          `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
          urls
            .map(
              (u) =>
                `  <url><loc>${esc(SITE_ORIGIN + u.loc)}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString().slice(0, 10)}</lastmod>` : ""}<priority>${u.priority}</priority></url>`,
            )
            .join("\n") +
          `\n</urlset>\n`;
        return new Response(body, {
          headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" },
        });
      },
    },
  },
});
