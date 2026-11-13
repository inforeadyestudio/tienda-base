import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { META_CATALOG_KEY, normalizeMetaCatalog, type MetaCatalogSettings } from "@/lib/meta-catalog";
import { SITE_ORIGIN } from "@/lib/site";

export const Route = createFileRoute("/_authenticated/admin/tienda/catalogo-meta")({
  head: () => ({ meta: [
    { title: "Catálogo Meta · Tu Marca" },
    { name: "description", content: "Elige qué colecciones y prendas salen en el catálogo de Meta." },
    { property: "og:title", content: "Catálogo Meta · Tu Marca" },
    { property: "og:description", content: "Configuración del catálogo de productos para Meta." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: MetaCatalogPage,
});

const FEED = `${SITE_ORIGIN}/api/public/feeds/meta-catalog.xml`;

function MetaCatalogPage() {
  const qc = useQueryClient();
  const settings = useQuery({
    queryKey: ["store-settings", META_CATALOG_KEY],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", META_CATALOG_KEY).maybeSingle();
      return normalizeMetaCatalog(data?.value);
    },
  });
  const collections = useQuery({
    queryKey: ["meta-catalog", "collections"],
    queryFn: async () => {
      const { data } = await supabase.from("collections").select("id, title, collection_products(product_id)").eq("is_page", false).order("position");
      return (data ?? []) as any[];
    },
  });
  const products = useQuery({
    queryKey: ["meta-catalog", "products"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, hero_image_url").eq("status", "published").order("name").limit(1000);
      return (data ?? []) as any[];
    },
  });
  const [cfg, setCfg] = useState<MetaCatalogSettings | null>(null);
  const [q, setQ] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (settings.data && !cfg) setCfg(settings.data); }, [settings.data, cfg]);

  const filtered = useMemo(() => (products.data ?? []).filter((p) => p.name.toLowerCase().includes(q.toLowerCase())), [products.data, q]);
  if (!cfg) return <div className="p-8 text-sm text-ink/60">Cargando…</div>;

  const toggle = (k: "collections" | "products", id: string) =>
    setCfg({ ...cfg, [k]: cfg[k].includes(id) ? cfg[k].filter((x) => x !== id) : [...cfg[k], id] });

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("app_settings").upsert({ key: META_CATALOG_KEY, value: cfg as any }, { onConflict: "key" });
    setSaving(false);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["store-settings", META_CATALOG_KEY] });
    toast.success("Catálogo Meta guardado");
  };
  const copy = (u: string) => { navigator.clipboard.writeText(u); toast.success("Enlace copiado"); };

  const modes: [MetaCatalogSettings["mode"], string][] = [["all", "Toda la tienda"], ["collections", "Por colecciones"], ["products", "Prenda por prenda"]];

  return (
    <div className="p-6 md:p-10 max-w-4xl w-full space-y-8">
      <header>
        <h1 className="font-nm text-3xl text-ink">Catálogo Meta</h1>
        <p className="text-sm text-ink/60 mt-1">Elige qué prendas salen en el catálogo de Facebook e Instagram. Meta lo actualiza solo desde el enlace.</p>
      </header>

      <section className="rounded-2xl border border-ink/10 bg-white p-5 space-y-3">
        <h2 className="font-medium text-ink">Enlaces para pegar en Meta</h2>
        {[[FEED, "Nacional (COP)"], [`${FEED}?currency=usd`, "Internacional (US$)"]].map(([u, l]) => (
          <div key={u} className="flex items-center gap-2 text-sm">
            <span className="w-40 shrink-0 text-ink/60">{l}</span>
            <code className="flex-1 min-w-0 truncate rounded bg-ivory px-2 py-1">{u}</code>
            <Button size="sm" variant="outline" onClick={() => copy(u)}><Copy className="size-4" /></Button>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {modes.map(([m, l]) => (
            <Button key={m} variant={cfg.mode === m ? "default" : "outline"} onClick={() => setCfg({ ...cfg, mode: m })}>{l}</Button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-ink/80">
          <input type="checkbox" checked={cfg.onlyInStock} onChange={(e) => setCfg({ ...cfg, onlyInStock: e.target.checked })} />
          Solo tallas con unidades disponibles
        </label>
      </section>

      {cfg.mode === "collections" && (
        <section className="grid gap-2 sm:grid-cols-2">
          {(collections.data ?? []).map((c) => (
            <label key={c.id} className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white p-3 text-sm cursor-pointer">
              <input type="checkbox" checked={cfg.collections.includes(c.id)} onChange={() => toggle("collections", c.id)} />
              <span className="flex-1">{c.title}</span>
              <span className="text-ink/50">{c.collection_products?.length ?? 0} prendas</span>
            </label>
          ))}
        </section>
      )}

      {cfg.mode === "products" && (
        <section className="space-y-3">
          <div className="flex gap-2 items-center">
            <Input placeholder="Buscar prenda…" value={q} onChange={(e) => setQ(e.target.value)} />
            <span className="text-sm text-ink/60 shrink-0">{cfg.products.length} elegidas</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 max-h-[60vh] overflow-y-auto">
            {filtered.map((p) => (
              <label key={p.id} className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white p-2 text-sm cursor-pointer">
                <input type="checkbox" checked={cfg.products.includes(p.id)} onChange={() => toggle("products", p.id)} />
                {p.hero_image_url && <img src={p.hero_image_url} alt="" className="size-10 rounded object-cover" />}
                <span className="flex-1 min-w-0 truncate">{p.name}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
    </div>
  );
}
