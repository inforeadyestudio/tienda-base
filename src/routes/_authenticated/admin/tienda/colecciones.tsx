import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { sceneDef } from "@/lib/scenes/registry";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ACCOUNT_HERO_KEY, DEFAULT_ACCOUNT_HERO, type AccountHero } from "@/lib/account-hero";
import { storefrontHomeQuery, saveStorefrontHome } from "@/lib/storefront-home";

export const Route = createFileRoute("/_authenticated/admin/tienda/colecciones")({
  head: () => ({ meta: [
    { title: "Diseño de colecciones · Tu Marca" },
    { name: "description", content: "Administra las experiencias de colecciones y selecciona la portada de Tu Marca." },
    { property: "og:title", content: "Diseño de colecciones · Tu Marca" },
    { property: "og:description", content: "Administra las experiencias de colecciones y selecciona la portada de Tu Marca." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: TiendaColecciones,
});

const SCOPES = [
  { id: "both", label: "Ambas" },
  { id: "national", label: "Solo nacional" },
  { id: "international", label: "Solo internacional" },
];

function TiendaColecciones() {
  const qc = useQueryClient();
  const { data: selectedHome } = useQuery(storefrontHomeQuery());
  const { data } = useQuery({
    queryKey: ["tienda-collections"],
    queryFn: async () =>
      (await supabase
        .from("collections")
        .select("id, slug, title, subtitle, cover_url, status, scope")
        .eq("is_page", false)
        .order("position")).data ?? [],
  });
  const update = useMutation({
    mutationFn: async ({ id, scope }: { id: string; scope: string }) => {
      const { error } = await supabase.from("collections").update({ scope }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Alcance actualizado"); qc.invalidateQueries({ queryKey: ["tienda-collections"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });
  const chooseHome = useMutation({
    mutationFn: async (slug: string) => {
      if (slug !== "home" && slug !== "page-tienda") {
        const { data: collection, error } = await supabase.from("collections").select("id,status").eq("slug", slug).eq("is_page", false).single();
        if (error || collection?.status !== "published") throw new Error("Publica la colección antes de seleccionarla.");
        const { data: experience, error: experienceError } = await supabase.from("collection_experiences").select("published_at,published_snapshot").eq("collection_id", collection.id).maybeSingle();
        if (experienceError || !experience?.published_at || !Array.isArray((experience.published_snapshot as { scenes?: unknown } | null)?.scenes) || !(experience.published_snapshot as { scenes: unknown[] }).scenes.length) throw new Error("Publica la experiencia antes de seleccionarla.");
      }
      await saveStorefrontHome(slug);
    },
    onSuccess: () => { toast.success("Portada actualizada"); qc.invalidateQueries({ queryKey: ["storefront-home"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "No se pudo actualizar"),
  });
  const { data: pages } = useQuery({
    queryKey: ["tienda-pages"],
    queryFn: async () =>
      (await supabase
        .from("collections")
        .select("id, slug, title, cover_url, status")
        .eq("is_page", true)
        .order("position")).data ?? [],
  });
  const { data: hero } = useQuery({
    queryKey: ["app-setting", ACCOUNT_HERO_KEY],
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", ACCOUNT_HERO_KEY)
        .maybeSingle();
      return { ...DEFAULT_ACCOUNT_HERO, ...((data?.value ?? {}) as Partial<AccountHero>) };
    },
  });
  const navigate = useNavigate();
  const openProducts = useMutation({
    mutationFn: async (collectionId: string) => {
      let { data: exp } = await supabase
        .from("collection_experiences")
        .select("id")
        .eq("collection_id", collectionId)
        .maybeSingle();
      if (!exp) {
        const created = await supabase
          .from("collection_experiences")
          .insert({ collection_id: collectionId })
          .select("id")
          .single();
        if (created.error) throw created.error;
        exp = created.data;
      }
      const { data: scenes } = await supabase
        .from("collection_scenes")
        .select("id, type, position")
        .eq("experience_id", exp.id)
        .order("position");
      const existing = (scenes ?? []).find((s) => s.type === "products");
      if (existing) return existing.id;
      const created = await supabase
        .from("collection_scenes")
        .insert({
          experience_id: exp.id,
          type: "products",
          source: "library",
          position: (scenes?.length ?? 0) + 1,
          props: { ...(sceneDef("products")?.defaults ?? {}), title: "", source: "all", limit: 120 } as any,
          layers: [] as any,
        })
        .select("id")
        .single();
      if (created.error) throw created.error;
      return created.data.id as string;
    },
    onSuccess: (sceneId) =>
      navigate({ to: "/admin/tienda/experiencia/$slug", params: { slug: "page-tienda" }, search: { scene: sceneId } as any }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });
  const PAGE_HINT: Record<string, string> = {
    home: "Portada editorial de la tienda",
    "page-tienda": "Catálogo completo",
    "our-world": "Página de marca",
    "our-stores": "Tiendas y citas",
  };
  return (
    <div className="p-10">
      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-widest text-moss/70">Editorial</p>
        <h1 className="font-serif italic text-4xl mt-1">Colecciones y banners</h1>
        <p className="text-sm text-moss mt-2 max-w-xl">Cada colección puede publicarse en ambas tiendas o solo en una.</p>
      </header>
      <section className="mb-10 border-y border-ink/10 py-6">
        <label htmlFor="home-experience" className="block font-nm text-[10px] uppercase tracking-[0.2em] text-moss/70 mb-2">Experiencia del inicio</label>
        <select id="home-experience" value={selectedHome ?? "home"} disabled={chooseHome.isPending} onChange={(e) => chooseHome.mutate(e.target.value)}
          className="w-full max-w-sm border border-ink/20 bg-white px-4 py-3 text-sm text-ink">
          <option value="home">Home</option>
          <option value="page-tienda">Tienda (catálogo completo)</option>
          {data?.filter((c) => c.status === "published").map((c) => <option key={c.id} value={c.slug}>{c.title}</option>)}
        </select>
      </section>
      <section className="mb-10">
        <p className="font-nm text-[10px] uppercase tracking-[0.2em] text-moss/70 mb-3">Páginas del sitio</p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {pages?.map((p) => (
            <div key={p.id} className="bg-white border border-ink/10 rounded-2xl overflow-hidden">
              <div className="aspect-[4/3] bg-cream overflow-hidden">
                {p.cover_url && <img src={p.cover_url} alt={p.title} className="w-full h-full object-cover" />}
              </div>
              <div className="p-5">
                <p className="text-[10px] uppercase tracking-widest text-moss/70">{PAGE_HINT[p.slug] ?? "Página"}</p>
                <h3 className="font-serif italic text-2xl mt-1">{p.title}</h3>
                <div className="flex flex-col items-start gap-2 mt-2">
                  {p.slug === "home" && <p className="text-xs text-moss/70">Página independiente: /home</p>}
                  <Link
                    to="/admin/tienda/experiencia/$slug"
                    params={{ slug: p.slug }}
                    search={{ scene: undefined }}
                    className="font-nm text-[10px] uppercase tracking-[0.2em] border-b border-ink pb-0.5"
                  >
                    Editar secciones →
                  </Link>
                  {p.slug === "page-tienda" && (
                    <button
                      type="button"
                      disabled={openProducts.isPending}
                      onClick={() => openProducts.mutate(p.id)}
                      className="font-nm text-[10px] uppercase tracking-[0.2em] border-b border-ink pb-0.5 disabled:opacity-40"
                    >
                      Productos y banners del catálogo →
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div className="bg-white border border-ink/10 rounded-2xl overflow-hidden">
            <div className="aspect-[4/3] bg-cream overflow-hidden">
              {hero?.image_url && <img src={hero.image_url} alt="Banner del perfil del cliente" className="w-full h-full object-cover" />}
            </div>
            <div className="p-5">
              <p className="text-[10px] uppercase tracking-widest text-moss/70">Perfil del cliente</p>
              <h3 className="font-serif italic text-2xl mt-1">Portal de clientes</h3>
              <p className="text-xs text-moss mt-1">Foto, título y botón con su enlace.</p>
              <Link
                to="/admin/tienda/portal-cliente"
                className="inline-block mt-2 font-nm text-[10px] uppercase tracking-[0.2em] border-b border-ink pb-0.5"
              >
                Editar banner →
              </Link>
            </div>
          </div>
        </div>
      </section>

      <p className="font-nm text-[10px] uppercase tracking-[0.2em] text-moss/70 mb-3">Colecciones</p>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        {data?.map((c) => (
          <div key={c.id} className="bg-white border border-ink/10 rounded-2xl overflow-hidden">
            <div className="aspect-[4/3] bg-cream overflow-hidden">
              {c.cover_url && <img src={c.cover_url} alt={c.title} className="w-full h-full object-cover" />}
            </div>
            <div className="p-5">
              <p className="text-[10px] uppercase tracking-widest text-moss/70">{c.status}</p>
              <h3 className="font-serif italic text-2xl mt-1">{c.title}</h3>
              <Link
                to="/admin/tienda/experiencia/$slug"
                params={{ slug: c.slug }}
                search={{ scene: undefined }}
                className="inline-block mt-2 font-nm text-[10px] uppercase tracking-[0.2em] border-b border-ink pb-0.5"
              >
                Editar experiencia →
              </Link>
              <div className="mt-3 flex gap-2 flex-wrap">
                {SCOPES.map((s) => (
                  <button key={s.id} onClick={() => update.mutate({ id: c.id, scope: s.id })}
                    className={"px-3 py-1.5 rounded-full text-xs border " + (c.scope === s.id ? "bg-ink text-ivory border-ink" : "bg-white text-ink/70 border-ink/15")}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}