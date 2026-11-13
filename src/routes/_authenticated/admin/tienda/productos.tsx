import { redirect, createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpDown, Eye, History, Search, X } from "lucide-react";
import { toast } from "sonner";
import { CatalogOrderEditor } from "@/components/admin/catalog-order-editor";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { formatCOP, formatUSD } from "@/lib/format";
import { KardexModal } from "@/components/admin/kardex-modal";

export const Route = createFileRoute("/_authenticated/admin/tienda/productos")({
  beforeLoad: () => { throw redirect({ to: "/admin/productos", search: {} as any }); },
  head: () => ({
    meta: [
      { title: "Productos · Tienda Online Tu Marca" },
      { name: "description", content: "Catálogo unificado de la tienda online: precios COP/USD, alcance, disponibilidad y kardex por producto." },
      { property: "og:title", content: "Productos · Tienda Online Tu Marca" },
      { property: "og:description", content: "Consulta productos, colecciones, disponibilidad y movimientos de inventario." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: TiendaProducts,
});

type Scope = "online" | "national" | "international";

const PAGE_SIZE = 25;

function TiendaProducts() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [scope, setScope] = useState<Scope>("online");
  const [collectionId, setCollectionId] = useState("");
  const [page, setPage] = useState(1);
  const [viewId, setViewId] = useState<string | null>(null);
  const [kardex, setKardex] = useState<{ id: string; name: string } | null>(null);
  const [orderOpen, setOrderOpen] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => { setPage(1); }, [debouncedQuery, scope, collectionId]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "draft" | "published" | "archived" }) => {
      const { error } = await supabase.from("products").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_v, vars) => {
      toast.success(vars.status === "published" ? "Producto publicado" : vars.status === "draft" ? "Producto pasado a borrador" : "Producto archivado");
      await queryClient.invalidateQueries({ queryKey: ["tienda-products"] });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo actualizar el estado"),
  });

  const { data: pageData, isLoading } = useQuery({
    queryKey: ["tienda-products", { q: debouncedQuery, scope, collectionId, page }],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select(
          "id, name, name_en, slug, status, product_type, available_national, available_international, available_pos_cali, available_pos_bogota, hero_image_url, collection_products(collection_id, collections(title)), product_variants(id, sku, size, color, price_cop, price_usd, active, inventory_levels(on_hand, reserved, locations(kind)))",
          { count: "exact" },
        )
        .order("created_at", { ascending: false });
      if (scope === "national") q = q.eq("available_national", true);
      else if (scope === "international") q = q.eq("available_international", true);
      else q = q.or("available_national.eq.true,available_international.eq.true");
      if (debouncedQuery) {
        const safe = debouncedQuery.replace(/[,%()]/g, " ");
        q = q.or(`name.ilike.%${safe}%,name_en.ilike.%${safe}%,slug.ilike.%${safe}%,product_type.ilike.%${safe}%`);
      }
      if (collectionId) {
        const { data: cps } = await supabase
          .from("collection_products")
          .select("product_id")
          .eq("collection_id", collectionId)
          .limit(2000);
        const ids = (cps ?? []).map((r: any) => r.product_id);
        if (ids.length === 0) return { rows: [] as any[], total: 0 };
        q = q.in("id", ids);
      }
      const from = (page - 1) * PAGE_SIZE;
      const { data, error, count } = await q.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: (data ?? []) as any[], total: count ?? 0 };
    },
  });
  const rows = pageData?.rows ?? [];
  const total = pageData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { data: collections } = useQuery({
    queryKey: ["tienda-collections-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("collections").select("id, title").order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="p-6 md:p-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-moss/70">Catálogo unificado</p>
          <h1 className="font-serif italic text-3xl md:text-4xl mt-1">Productos</h1>
          <p className="text-sm text-moss mt-2 max-w-xl">Un solo producto, dos precios (COP/USD), dos idiomas (ES/EN) y selector de tienda pública.</p>
        </div>
        <Button type="button" variant="outline" onClick={() => setOrderOpen(true)}><ArrowUpDown /> Ordenar productos</Button>
      </header>

      <div className="mb-5 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-moss/50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar producto…"
            className="w-full pl-9 pr-3 py-2.5 rounded-full bg-white border border-ink/10 text-sm focus:outline-none focus:border-ink/30"
          />
        </div>
        <div className="flex gap-1 rounded-full bg-white border border-ink/10 p-1">
          {([["online", "Online"], ["national", "Nacional"], ["international", "Internacional"]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setScope(k)}
              className={"px-3.5 py-1.5 rounded-full text-xs transition-colors " + (scope === k ? "bg-ink text-ivory" : "text-ink/60 hover:bg-ink/5")}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={collectionId}
          onChange={(e) => setCollectionId(e.target.value)}
          className="pill-select py-2.5 rounded-full bg-white border border-ink/10 text-sm"
        >
          <option value="">Todas las colecciones</option>
          {(collections ?? []).map((c: any) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-ink/10 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[900px]">
          <thead className="text-xs uppercase tracking-widest text-moss/70">
            <tr>
              <th className="text-left px-4 py-3">Producto</th>
              <th className="text-left">ES / EN</th>
              <th className="text-left">Estado</th>
              <th className="text-left">Alcance</th>
              <th className="text-right">Disponible</th>
              <th className="text-right">Precio COP</th>
              <th className="text-right">Precio USD</th>
              <th className="px-4"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p: any) => {
              const variants = p.product_variants ?? [];
              const copVals = variants.map((v: any) => v.price_cop).filter((n: any) => Number.isFinite(n));
              const cop = copVals.length ? Math.min(...copVals) : null;
              const usdVals = variants.map((v: any) => v.price_usd).filter((n: any): n is number => Number.isFinite(n));
              const usd = usdVals.length ? Math.min(...usdVals) : null;
              const available = variants.reduce(
                (s: number, v: any) =>
                  s + (v.inventory_levels ?? []).filter((l: any) => l.locations?.kind === "ecom").reduce((a: number, l: any) => a + Math.max(0, (l.on_hand ?? 0) - (l.reserved ?? 0)), 0),
                0,
              );
              return (
                <tr key={p.id} className="border-t border-ink/5 hover:bg-cream/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-12 bg-cream overflow-hidden shrink-0">
                        {p.hero_image_url && <img src={p.hero_image_url} alt="" loading="lazy" className="w-full h-full object-cover" />}
                      </div>
                      <Link to="/admin/productos/$id" params={{ id: p.id }} search={{ edit: undefined }} className="font-serif italic text-lg hover:underline">{p.name}</Link>
                    </div>
                  </td>
                   <td className="text-xs">
                     <div>{p.name}</div>
                     <div className="text-moss/60 italic">{p.name_en ?? "—"}</div>
                   </td>
                   <td>
                     <button
                       type="button"
                       disabled={updateStatus.isPending && updateStatus.variables?.id === p.id}
                       onClick={() => updateStatus.mutate({ id: p.id, status: p.status === "published" ? "draft" : "published" })}
                       title="Cambiar entre draft y published"
                       className={
                         "text-[9px] uppercase tracking-widest px-2 py-0.5 rounded transition-colors disabled:opacity-50 " +
                         (p.status === "published" ? "bg-moss/15 text-moss hover:bg-moss/25" : "bg-ink/10 text-ink/60 hover:bg-ink/20")
                       }
                     >
                       {updateStatus.isPending && updateStatus.variables?.id === p.id ? "…" : p.status}
                     </button>
                     {p.status !== "published" && (p.available_pos_cali || p.available_pos_bogota) && (
                       <div className="mt-1 text-[9px] uppercase tracking-widest text-clay">Activo en POS</div>
                     )}
                   </td>
                   <td>
                    <div className="flex gap-1 flex-wrap">
                      {p.available_national && <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded bg-moss/10 text-moss">Nacional</span>}
                      {p.available_international && <span className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded bg-clay/10 text-clay">Internacional</span>}
                    </div>
                  </td>
                  <td className={"text-right " + (available > 0 ? "" : "text-clay")}>{available}</td>
                  <td className="text-right">{cop !== null ? formatCOP(cop) : "—"}</td>
                  <td className="text-right">{usd !== null ? formatUSD(usd) : "—"}</td>
                  <td className="px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setViewId(p.id)}
                      title="Ver configuración"
                      className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-3 py-1.5 text-xs hover:border-ink/30"
                    >
                      <Eye className="w-3.5 h-3.5" /> Ver
                    </button>
                    <button
                      type="button"
                      onClick={() => setKardex({ id: p.id, name: p.name })}
                      title="Kardex"
                      className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-3 py-1.5 text-xs hover:border-ink/30"
                    >
                      <History className="w-3.5 h-3.5" /> Kardex
                    </button>
                  </td>
                </tr>
              );
            })}
            {!isLoading && rows.length === 0 && (
<tr><td colSpan={8} className="px-6 py-10 text-center text-moss/60">Sin resultados.</td></tr>
             )}
             {isLoading && (
               <tr><td colSpan={8} className="px-6 py-10 text-center text-moss/60">Cargando…</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-moss/70">
        <span>{total} productos</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-full border border-ink/10 px-3 py-1.5 disabled:opacity-40 hover:border-ink/30"
          >
            Anterior
          </button>
          <span>Página {page} de {totalPages}</span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="rounded-full border border-ink/10 px-3 py-1.5 disabled:opacity-40 hover:border-ink/30"
          >
            Siguiente
          </button>
        </div>
      </div>

      {viewId && <ProductViewModal product={rows.find((p: any) => p.id === viewId)} onClose={() => setViewId(null)} />}
      {kardex && <KardexModal productId={kardex.id} productName={kardex.name} onClose={() => setKardex(null)} />}
      <CatalogOrderEditor open={orderOpen} onOpenChange={setOrderOpen} />
    </div>
  );
}

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/45 p-4" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-ink/10 px-6 py-5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-moss/70">{subtitle}</p>
            <h2 className="mt-1 font-serif italic text-2xl">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-ink/5" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function ProductViewModal({ product, onClose }: { product: any; onClose: () => void }) {
  if (!product) return null;
  const variants = product.product_variants ?? [];
  const cols = (product.collection_products ?? []).map((cp: any) => cp.collections?.title).filter(Boolean);
  return (
    <ModalShell title={product.name} subtitle="Configuración del producto" onClose={onClose}>
      <div className="grid gap-6 md:grid-cols-[160px_minmax(0,1fr)]">
        <div className="aspect-[3/4] bg-cream overflow-hidden rounded-xl">
          {product.hero_image_url && <img src={product.hero_image_url} alt={product.name} className="w-full h-full object-cover" />}
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <Info label="Nombre EN" value={product.name_en ?? "—"} />
          <Info label="Estado" value={product.status} />
          <Info label="Tipo" value={product.product_type ?? "—"} />
          <Info label="Slug" value={product.slug} />
          <Info label="Alcance" value={[product.available_national && "Nacional", product.available_international && "Internacional"].filter(Boolean).join(" · ") || "Sin canales"} />
          <Info label="Colecciones" value={cols.length ? cols.join(", ") : "—"} />
        </dl>
      </div>

      <h3 className="mt-8 mb-2 text-[10px] uppercase tracking-widest text-moss/70">Variantes</h3>
      <table className="w-full text-sm">
        <thead className="text-[10px] uppercase tracking-widest text-moss/70">
          <tr>
            <th className="text-left py-2">Variante</th>
            <th className="text-left">SKU</th>
            <th className="text-right">COP</th>
            <th className="text-right">USD</th>
            <th className="text-right">Disponible</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v: any) => {
            const avail = (v.inventory_levels ?? []).filter((l: any) => l.locations?.kind === "ecom").reduce((a: number, l: any) => a + Math.max(0, (l.on_hand ?? 0) - (l.reserved ?? 0)), 0);
            return (
              <tr key={v.id} className="border-t border-ink/5">
                <td className="py-2">{[v.color, v.size].filter(Boolean).join(" · ") || "Único"}</td>
                <td className="font-mono text-[11px] text-ink/60">{v.sku}</td>
                <td className="text-right">{Number.isFinite(v.price_cop) ? formatCOP(v.price_cop) : "—"}</td>
                <td className="text-right">{Number.isFinite(v.price_usd) ? formatUSD(v.price_usd) : "—"}</td>
                <td className={"text-right " + (avail > 0 ? "" : "text-clay")}>{avail}</td>
              </tr>
            );
          })}
          {variants.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-moss/60">Sin variantes.</td></tr>}
        </tbody>
      </table>

      <div className="mt-6 flex justify-end">
        <Link to="/admin/productos/$id" params={{ id: product.id }} search={{ edit: undefined }} preload="intent" className="rounded-full bg-ink px-5 py-2.5 text-xs uppercase tracking-widest text-ivory">
          Editar producto
        </Link>
      </div>
    </ModalShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-moss/70">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
