import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { BulkPriceTable } from "@/components/admin/bulk-price-table";
import { usdPricePatch, type PriceRows } from "@/lib/bulk-price-fill";
import { CatalogOrderEditor } from "@/components/admin/catalog-order-editor";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCOP, formatUSD } from "@/lib/format";
import { useEffect, useMemo, useState } from "react";
import { Pencil, Search, Trash2, Loader2, ChevronLeft, ChevronRight, FileUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductEditorModal } from "@/components/admin/product-editor-modal";
import { ShopifyImportModal } from "@/components/admin/shopify-import-modal";
import { SalePriceImportModal } from "@/components/admin/sale-price-import-modal";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/productos")({
  validateSearch: (search: Record<string, unknown>) => ({
    edit: typeof search.edit === "string" ? search.edit : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Productos admin · Tu Marca Sales Hub" },
      { name: "description", content: "Administra productos, colecciones, precios, inventario y multimedia de Tu Marca." },
      { property: "og:title", content: "Productos admin · Tu Marca Sales Hub" },
      { property: "og:description", content: "Panel interno para editar el catálogo omnicanal de Tu Marca." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ProductsAdmin,
});

const CHANNELS = [
  { key: "available_national", label: "Nacional" },
  { key: "available_international", label: "Internacional" },
  { key: "available_pos_cali", label: "POS Eventos" },
] as const;

const PAGE_SIZE = 25;


function ProductsAdmin() {
  const qc = useQueryClient();
  const [orderOpen, setOrderOpen] = useState(false);
  const navigate = useNavigate();
  const { edit } = Route.useSearch();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [fType, setFType] = useState<string>("");
  const [fCollection, setFCollection] = useState<string>("");
  const [fStatus, setFStatus] = useState<string>("");
  const [fChannel, setFChannel] = useState<string>("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; name: string } | null>(null);
  const [stockView, setStockView] = useState<{ id: string; name: string } | null>(null);
  const [channelEdit, setChannelEdit] = useState<any | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkStatus, setBulkStatus] = useState<string>("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkModal, setBulkModal] = useState<null | "price" | "channels">(null);
  const [priceImportOpen, setPriceImportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const [page, setPage] = useState(1);

  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);
  useEffect(() => { setPage(1); }, [debouncedQuery, fType, fCollection, fStatus, fChannel]);
  useEffect(() => {
    if (edit) setEditingId(edit);
  }, [edit]);

  const closeEditor = () => {
    setEditingId(null);
    if (edit) navigate({ to: "/admin/productos", search: { edit: undefined }, replace: true });
  };

  const { data: pageData, isLoading } = useQuery({
    queryKey: ["admin", "products", { q: debouncedQuery, fType, fCollection, fStatus, fChannel, page }],
    placeholderData: (prev) => prev,
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id, slug, name, status, hero_image_url, product_type, tags, available_national, available_international, available_pos_cali, available_pos_bogota, collection_products(collection_id, collections(title)), product_variants(id, sku, price_cop, compare_at_cop, price_usd, compare_at_usd, inventory_levels(on_hand, reserved))", { count: "exact" })
        .order("created_at", { ascending: false });
      if (debouncedQuery) {
        const safe = debouncedQuery.replace(/[,%()]/g, " ");
        const clauses = [`name.ilike.%${safe}%`, `slug.ilike.%${safe}%`];
        const { data: skuHits } = await supabase
          .from("product_variants")
          .select("product_id")
          .ilike("sku", `%${safe}%`)
          .limit(2000);
        const skuIds = Array.from(new Set((skuHits ?? []).map((r: any) => r.product_id)));
        if (skuIds.length) clauses.push(`id.in.(${skuIds.join(",")})`);
        q = q.or(clauses.join(","));
      }
      if (fType) q = q.eq("product_type", fType);
      if (fStatus) q = q.eq("status", fStatus as any);
      if (fChannel) q = q.eq(fChannel as any, true);
      if (fCollection) {
        const { data: cps } = await supabase.from("collection_products").select("product_id").eq("collection_id", fCollection).limit(2000);
        const ids = (cps ?? []).map((r: any) => r.product_id);
        if (ids.length === 0) return { rows: [], total: 0 };
        q = q.in("id", ids);
      }
      const from = (page - 1) * PAGE_SIZE;
      const { data, error, count } = await q.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });
  const rows = pageData?.rows ?? [];
  const total = pageData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const { data: collections } = useQuery({
    queryKey: ["admin", "collections", "min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("collections").select("id, title").order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: types } = useQuery({
    queryKey: ["admin", "products", "types"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("product_type").not("product_type", "is", null).limit(1000);
      if (error) throw error;
      const s = new Set<string>();
      (data ?? []).forEach((r: any) => r.product_type && s.add(r.product_type));
      return Array.from(s).sort();
    },
  });

  const doDelete = async () => {
    if (!confirmDelete) return;
    const id = confirmDelete.id;
    setBusyId(id);
    const { error } = await supabase.from("products").delete().eq("id", id);
    setBusyId(null);
    setConfirmDelete(null);
    if (error) { toast.error("No se pudo eliminar. Puede tener pedidos asociados."); return; }
    toast.success("Producto eliminado");
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
  };

  const selectedProducts = useMemo(
    () => rows.filter((p: any) => selected.includes(p.id)),
    [rows, selected]
  );
  const allVisibleSelected = rows.length > 0 && rows.every((p: any) => selected.includes(p.id));
  const toggleAll = () =>
    setSelected(allVisibleSelected ? [] : rows.map((p: any) => p.id));
  const toggleOne = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const applyBulkStatus = async () => {
    if (!bulkStatus || selected.length === 0) return;
    setBulkSaving(true);
    const { error } = await supabase.from("products").update({ status: bulkStatus as any }).in("id", selected);
    setBulkSaving(false);
    if (error) { toast.error("No se pudo actualizar el estado"); return; }
    toast.success(`${selected.length} productos actualizados`);
    setBulkStatus("");
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
  };

  return (
    <div className="p-4 md:p-10 pb-28">
      <div className="mb-8 flex flex-col gap-5 md:grid md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-x-3 md:gap-y-8">
        <header className="order-1 min-w-0 md:col-start-1 md:row-start-1">
          <p className="text-[10px] uppercase tracking-widest text-moss/70">Catálogo</p>
          <h1 className="font-serif italic text-3xl md:text-4xl mt-1 truncate">Productos</h1>
        </header>

        <div className="order-2 grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center md:order-2 md:col-span-2 md:row-start-2">
          <div className="relative col-span-2 sm:col-span-1 sm:flex-1 sm:min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-moss/50" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, slug o SKU…"
              className="w-full pl-9 pr-3 py-2.5 rounded-full bg-white border border-ink/10 text-sm focus:outline-none focus:border-ink/30"
            />
          </div>
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}
            className="pill-select w-full min-w-0 sm:w-auto py-2.5 rounded-full bg-white border border-ink/10 text-sm">
            <option value="">Todos los estados</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
          <select value={fChannel} onChange={(e) => setFChannel(e.target.value)}
            className="pill-select w-full min-w-0 sm:w-auto py-2.5 rounded-full bg-white border border-ink/10 text-sm">
            <option value="">Todos los canales</option>
            {CHANNELS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <select value={fType} onChange={(e) => setFType(e.target.value)}
            className="pill-select w-full min-w-0 sm:w-auto py-2.5 rounded-full bg-white border border-ink/10 text-sm">
            <option value="">Todos los tipos</option>
            {(types ?? []).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={fCollection} onChange={(e) => setFCollection(e.target.value)}
            className="pill-select w-full min-w-0 sm:w-auto py-2.5 rounded-full bg-white border border-ink/10 text-sm">
            <option value="">Todas las colecciones</option>
            {(collections ?? []).map((c: any) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          {(query || fType || fCollection || fStatus || fChannel) && (
            <button onClick={() => { setQuery(""); setFType(""); setFCollection(""); setFStatus(""); setFChannel(""); }}
              className="text-xs text-moss/70 underline">limpiar</button>
          )}
        </div>

        <div className="order-3 flex flex-wrap gap-2 md:order-3 md:col-start-2 md:row-start-1 md:justify-end">
          <Button variant="outline" onClick={() => setOrderOpen(true)} className="rounded-full border-ink/15 bg-background px-4 text-ink hover:bg-ink/5">
            Ordenar productos
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)} className="rounded-full border-ink/15 bg-background px-4 text-ink hover:bg-ink/5">
            <FileUp /> Importar
          </Button>
          <Button variant="outline" onClick={() => setPriceImportOpen(true)} className="rounded-full border-ink/15 bg-background px-4 text-ink hover:bg-ink/5">
            <FileUp /> Subir precios (Excel)
          </Button>
          {priceImportOpen && (
            <SalePriceImportModal
              onClose={() => setPriceImportOpen(false)}
              onSaved={() => { setPriceImportOpen(false); qc.invalidateQueries({ queryKey: ["admin", "products"] }); }}
            />
          )}
          <Button onClick={() => setEditingId("new")} className="rounded-full bg-ink px-5 text-ivory hover:bg-ink/85">
            Nuevo producto
          </Button>
        </div>
      </div>

      <div className="bg-white border border-ink/10 rounded-2xl overflow-x-auto">
        <table className="w-full text-[13px] min-w-[820px]">
          <thead className="text-[10px] uppercase tracking-widest text-moss/70">
            <tr>
              <th className="px-3 py-2 w-8">
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll} className="size-3.5 accent-ink align-middle" aria-label="Seleccionar todos" />
              </th>
              <th className="text-left px-3 py-2">Producto</th>
              <th className="text-left">Estado</th>
              <th className="text-left">Colección</th>
              <th className="text-left">Canales</th>
              <th className="text-right">Var.</th>
              <th className="text-right">Stock global</th>
              <th className="text-right">Precio COP</th>
              <th className="text-right px-3">Precio USD</th>
              <th className="px-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p: any) => {
              const stock = (p.product_variants ?? []).reduce((s: number, v: any) =>
                 s + (v.inventory_levels ?? []).reduce((a: number, l: any) => a + (l.on_hand ?? 0), 0), 0);
              const priceFrom = Math.min(...(p.product_variants ?? []).map((v: any) => v.price_cop).filter(Boolean));
              const priceFromUsd = Math.min(...(p.product_variants ?? []).map((v: any) => v.price_usd).filter((n: any): n is number => Number.isFinite(n)));
              const cols = (p.collection_products ?? []).map((cp: any) => cp.collections?.title).filter(Boolean);
              const chans = CHANNELS.filter((c) => p[c.key]);
              const skus = (p.product_variants ?? []).map((v: any) => v.sku).filter(Boolean);
              const sku = skus[0] ?? "";
              const skuMore = skus.length > 1 ? ` +${skus.length - 1}` : "";
              return (
                <tr key={p.id} className={"border-t border-ink/5 hover:bg-cream/40 " + (selected.includes(p.id) ? "bg-cream/60" : "")}>
                  <td className="px-3">
                    <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleOne(p.id)} className="size-3.5 accent-ink align-middle" aria-label={`Seleccionar ${p.name}`} />
                  </td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-9 bg-cream overflow-hidden shrink-0">
{p.hero_image_url && <img src={p.hero_image_url} alt="" loading="lazy" className="w-full h-full object-cover" />}
                      </div>
                      <div className="min-w-0">
                        <button type="button" onClick={() => setEditingId(p.id)} className="block text-left font-normal hover:underline truncate">{p.name}</button>
                        {sku && (
                          <button
                            type="button"
                            onClick={() => setQuery(sku)}
                            title={skus.join("\n")}
                            className="block font-mono text-[10px] leading-tight tracking-tight text-moss/55 hover:text-ink"
                          >
                            {sku}{skuMore}
                          </button>
                        )}
                      </div>
                    </div>
                  </td>
                  <td>
                    <button
                      type="button"
                       onClick={() => setChannelEdit(p)}
                       title="Configurar estado por canal"
                       className={"text-[9px] uppercase tracking-widest px-2 py-0.5 rounded transition-colors " +
                         (p.status === "published" ? "bg-data text-ink hover:bg-data-soft" : "bg-ink/10 text-ink/60 hover:bg-ink/20")}>
                        {p.status}
                     </button>
                   </td>
                  <td className="text-xs text-moss/80 max-w-[180px] truncate" title={cols.join(", ")}>
                    {cols.length ? cols.join(", ") : "—"}
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => setChannelEdit(p)}
                      title="Editar canales"
                      className="text-[10px] px-2 py-1 rounded-full border border-ink/10 hover:border-ink/30 text-ink/70 max-w-[190px] truncate">
                      {chans.length ? chans.map((c) => c.label).join(" · ") : "Sin canales"}
                    </button>
                  </td>
                  <td className="text-right">{p.product_variants?.length ?? 0}</td>
                  <td className="text-right">
                    <button
                      type="button"
                      onClick={() => setStockView({ id: p.id, name: p.name })}
                      title="Ver stock por bodega"
                      className="tabular-nums underline-offset-2 hover:underline hover:text-ink"
                    >
                      {stock}
                    </button>
                  </td>
                  <td className="text-right">{Number.isFinite(priceFrom) ? formatCOP(priceFrom) : "—"}</td>
                  <td className="text-right px-3 whitespace-nowrap">{Number.isFinite(priceFromUsd) ? formatUSD(priceFromUsd) : "—"}</td>
                  <td className="text-right px-3 whitespace-nowrap">
                    <button type="button" onClick={() => setEditingId(p.id)}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-full hover:bg-ink/5 text-ink/70"
                      aria-label="Editar">
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" onClick={() => setConfirmDelete({ id: p.id, name: p.name })}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-full hover:bg-red-50 text-ink/50 hover:text-red-600"
                      aria-label="Eliminar">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && !isLoading && (
              <tr><td colSpan={10} className="px-6 py-10 text-center text-moss/60">Sin resultados.</td></tr>
            )}
            {isLoading && (
              <tr><td colSpan={10} className="px-6 py-10 text-center text-moss/60">
                <Loader2 className="w-4 h-4 animate-spin inline-block" />
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center justify-between text-xs text-moss/70">
        <span>
          {total} producto{total === 1 ? "" : "s"} · página {page} de {totalPages}
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-ink/10 bg-white hover:border-ink/30 disabled:opacity-40"
          >
            <ChevronLeft className="w-3.5 h-3.5" /> Anterior
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-ink/10 bg-white hover:border-ink/30 disabled:opacity-40"
          >
            Siguiente <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {selected.length > 0 && (
        <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-[100]">
          <div className="flex items-center gap-2 bg-ink text-ivory rounded-full px-3 py-1.5 shadow-2xl text-[11px]">
            <span className="uppercase tracking-widest">{selected.length}</span>
            <button onClick={() => setSelected([])} className="underline text-ivory/60">limpiar</button>
            <div className="w-px h-3.5 bg-ivory/20" />
            <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)}
              className="px-2 py-1 rounded-full bg-ivory/10 border border-ivory/20 text-[11px]">
              <option value="" className="text-ink">Estado…</option>
              <option value="published" className="text-ink">Published</option>
              <option value="draft" className="text-ink">Draft</option>
              <option value="archived" className="text-ink">Archived</option>
            </select>
            <button onClick={applyBulkStatus} disabled={!bulkStatus || bulkSaving}
              className="px-2.5 py-1 rounded-full bg-ivory text-ink text-[11px] inline-flex items-center gap-1 disabled:opacity-40">
              {bulkSaving && <Loader2 className="w-3 h-3 animate-spin" />} Guardar
            </button>
            <div className="w-px h-3.5 bg-ivory/20" />
            <button onClick={() => setBulkModal("price")} className="px-2.5 py-1 rounded-full border border-ivory/30 text-[11px] hover:bg-ivory/10">
              Precios
            </button>
            <button onClick={() => setBulkModal("channels")} className="px-2.5 py-1 rounded-full border border-ivory/30 text-[11px] hover:bg-ivory/10">
              Canales
            </button>
          </div>
        </div>
      )}

      {bulkModal === "price" && (
        <BulkPriceModal
          products={selectedProducts}
          onClose={() => setBulkModal(null)}
          onSaved={() => { setBulkModal(null); qc.invalidateQueries({ queryKey: ["admin", "products"] }); }}
        />
      )}

      {bulkModal === "channels" && (
        <BulkChannelsModal
          ids={selected}
          onClose={() => setBulkModal(null)}
          onSaved={() => { setBulkModal(null); qc.invalidateQueries({ queryKey: ["admin", "products"] }); }}
        />
      )}

      {channelEdit && (
        <ChannelModal
          product={channelEdit}
          onClose={() => setChannelEdit(null)}
          onSaved={() => { setChannelEdit(null); qc.invalidateQueries({ queryKey: ["admin", "products"] }); }}
        />
      )}

      {stockView && (
        <StockByLocationModal
          productId={stockView.id}
          productName={stockView.name}
          onClose={() => setStockView(null)}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setConfirmDelete(null)} />
          <div className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl">
            <div className="font-serif italic text-2xl">Eliminar producto</div>
            <p className="text-sm text-moss mt-2">
              ¿Seguro que quieres eliminar «{confirmDelete.name}»? Esta acción no se puede deshacer.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 rounded-full text-sm border border-ink/15">Cancelar</button>
              <button onClick={doDelete} disabled={busyId === confirmDelete.id}
                className="px-4 py-2 rounded-full text-sm bg-red-600 text-white inline-flex items-center gap-2 disabled:opacity-60">
                {busyId === confirmDelete.id && <Loader2 className="w-4 h-4 animate-spin" />} Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {editingId && (
        <ProductEditorModal
          productId={editingId === "new" ? undefined : editingId}
          onClose={closeEditor}
          onSaved={() => qc.invalidateQueries({ queryKey: ["admin", "products"] })}
          onDeleted={() => qc.invalidateQueries({ queryKey: ["admin", "products"] })}
        />
      )}

      {importOpen && (
        <ShopifyImportModal
          onClose={() => setImportOpen(false)}
          onImported={() => qc.invalidateQueries({ queryKey: ["admin", "products"] })}
        />
      )}
      <CatalogOrderEditor open={orderOpen} onOpenChange={setOrderOpen} />

    </div>
  );
}

function ChannelModal({ product, onClose, onSaved }: { product: any; onClose: () => void; onSaved: () => void }) {
  const [sel, setSel] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CHANNELS.map((c) => [c.key, product.status === "published" && !!product[c.key]])));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const anyPublished = CHANNELS.some((channel) => sel[channel.key]);
    const { error } = await supabase
      .from("products")
      .update({ ...sel, status: anyPublished ? "published" : "draft" } as any)
      .eq("id", product.id);
    setSaving(false);
    if (error) { toast.error("No se pudieron guardar los estados"); return; }
    toast.success(anyPublished ? "Estados por canal actualizados" : "Producto en draft en todos los canales");
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl">
        <div className="text-[10px] uppercase tracking-widest text-moss/70">Estado por canal</div>
        <div className="font-serif italic text-2xl mt-1">{product.name}</div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSel(Object.fromEntries(CHANNELS.map((c) => [c.key, true])))}
            className="rounded-full bg-data px-3 py-2 text-xs font-medium text-ink transition-colors hover:bg-data-soft"
          >
            Publicar en todos
          </button>
          <button
            type="button"
            onClick={() => setSel(Object.fromEntries(CHANNELS.map((c) => [c.key, false])))}
            className="rounded-full border border-ink/15 px-3 py-2 text-xs text-ink/70 transition-colors hover:bg-ink/5"
          >
            Draft en todos
          </button>
        </div>
        <div className="mt-5 space-y-2">
          {CHANNELS.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl border border-ink/10">
              <span className="text-sm">{c.label}</span>
              <div className="flex rounded-full bg-ink/5 p-0.5">
                <button
                  type="button"
                  onClick={() => setSel((current) => ({ ...current, [c.key]: false }))}
                  className={"rounded-full px-3 py-1.5 text-[10px] uppercase tracking-wider transition-colors " +
                    (!sel[c.key] ? "bg-white text-ink shadow-sm" : "text-ink/45")}
                >
                  Draft
                </button>
                <button
                  type="button"
                  onClick={() => setSel((current) => ({ ...current, [c.key]: true }))}
                  className={"rounded-full px-3 py-1.5 text-[10px] uppercase tracking-wider transition-colors " +
                    (sel[c.key] ? "bg-data text-ink shadow-sm" : "text-ink/45")}
                >
                  Published
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-full text-sm border border-ink/15">Cancelar</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 rounded-full text-sm bg-ink text-ivory inline-flex items-center gap-2 disabled:opacity-60">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkPriceModal({ products, onClose, onSaved }: { products: any[]; onClose: () => void; onSaved: () => void }) {
  const [rows, setRows] = useState<PriceRows>(() =>
    Object.fromEntries(
      products.map((p) => {
        const v = (p.product_variants ?? [])[0] ?? {};
        return [p.id, { price: v.price_cop ? String(v.price_cop) : "", compare: v.compare_at_cop ? String(v.compare_at_cop) : "", priceUsd: v.price_usd ? String(v.price_usd) : "", compareUsd: v.compare_at_usd ? String(v.compare_at_usd) : "" }];
      })
    )
  );
  const [saving, setSaving] = useState(false);


  const save = async () => {
    try {
      for (const p of products) usdPricePatch(rows[p.id], (p.product_variants ?? [])[0] ?? {});
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Revisa los precios en US$");
      return;
    }
    setSaving(true);
    let failed = 0;
    for (const p of products) {
      const row = rows[p.id];
      const price = Number(row.price);
      if (!Number.isFinite(price) || price <= 0) { failed++; continue; }
      const compare = row.compare ? Number(row.compare) : null;
      const patch = { price_cop: Math.round(price), compare_at_cop: compare && compare > 0 ? Math.round(compare) : null, ...usdPricePatch(row, (p.product_variants ?? [])[0] ?? {}) };
      const ids = (p.product_variants ?? []).map((v: any) => v.id);
      if (!ids.length) continue;
      const { error } = await supabase.from("product_variants").update(patch as any).in("id", ids);
      if (error) failed++;
    }
    setSaving(false);
    if (failed) toast.error(`${failed} productos no se actualizaron (revisa el precio)`);
    else toast.success(`${products.length} productos actualizados`);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-5xl bg-white rounded-3xl p-6 shadow-2xl max-h-[85vh] flex flex-col">
        <div className="text-[10px] uppercase tracking-widest text-moss/70">Edición masiva</div>
        <div className="font-serif italic text-2xl mt-1">Precios y descuentos</div>
        <p className="text-xs text-moss/70 mt-1">
          En «Precio» va el valor final (con descuento) y en «Comparación» el precio full tachado. Se aplica a todas las variantes del producto.
        </p>

        <BulkPriceTable products={products} rows={rows} setRows={setRows} disabled={saving} />

        <div className="mt-6 flex justify-end gap-2 shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-full text-sm border border-ink/15">Cancelar</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 rounded-full text-sm bg-ink text-ivory inline-flex items-center gap-2 disabled:opacity-60">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function BulkChannelsModal({ ids, onClose, onSaved }: { ids: string[]; onClose: () => void; onSaved: () => void }) {
  const [sel, setSel] = useState<Record<string, "keep" | "on" | "off">>(() =>
    Object.fromEntries(CHANNELS.map((c) => [c.key, "keep"])) as Record<string, "keep" | "on" | "off">);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const patch: Record<string, boolean> = {};
    CHANNELS.forEach((c) => { if (sel[c.key] !== "keep") patch[c.key] = sel[c.key] === "on"; });
    if (Object.keys(patch).length === 0) { toast.error("Elige al menos un cambio"); return; }
    setSaving(true);
    const { error } = await supabase.from("products").update(patch as any).in("id", ids);
    setSaving(false);
    if (error) { toast.error("No se pudieron guardar los canales"); return; }
    toast.success(`${ids.length} productos actualizados`);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl">
        <div className="text-[10px] uppercase tracking-widest text-moss/70">Edición masiva</div>
        <div className="font-serif italic text-2xl mt-1">Canales de venta</div>
        <p className="text-xs text-moss/70 mt-1">{ids.length} productos seleccionados</p>

        <div className="mt-5 space-y-2">
          {CHANNELS.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-2xl border border-ink/10">
              <span className="text-sm">{c.label}</span>
              <div className="flex gap-1">
                {([["keep", "Sin cambio"], ["on", "Activar"], ["off", "Desactivar"]] as const).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setSel((s) => ({ ...s, [c.key]: k }))}
                    className={"text-[10px] px-2.5 py-1 rounded-full border transition-colors " +
                      (sel[c.key] === k ? "bg-ink text-ivory border-ink" : "border-ink/15 text-ink/60 hover:border-ink/30")}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-full text-sm border border-ink/15">Cancelar</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 rounded-full text-sm bg-ink text-ivory inline-flex items-center gap-2 disabled:opacity-60">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

function StockByLocationModal({ productId, productName, onClose }: { productId: string; productName: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "product-stock", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, sku, size, color, inventory_levels(on_hand, reserved, locations(id, name, kind))")
        .eq("product_id", productId)
        .order("created_at");
      if (error) throw error;
      return data ?? [];
    },
  });

  const KIND_ORDER: Record<string, number> = { ecom: 0, warehouse: 1, store: 2, wholesale: 3 };
  const KIND_LABEL: Record<string, string> = { ecom: "Ecommerce", warehouse: "Bodega", store: "Tienda", wholesale: "Wholesale" };

  const groups = useMemo(() => {
    const map = new Map<string, { id: string; name: string; kind: string; variants: { sku: string; size: string; color: string; onHand: number; reserved: number }[] }>();
    for (const v of data ?? []) {
      for (const l of v.inventory_levels ?? []) {
        const loc = l.locations;
        if (!loc) continue;
        let g = map.get(loc.id);
        if (!g) {
          g = { id: loc.id, name: loc.name, kind: loc.kind ?? "", variants: [] };
          map.set(loc.id, g);
        }
        g.variants.push({
          sku: v.sku ?? "—",
          size: v.size ?? "Único",
          color: v.color ?? "",
          onHand: l.on_hand ?? 0,
          reserved: l.reserved ?? 0,
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || a.name.localeCompare(b.name),
    );
  }, [data]);

  const totalOnHand = groups.reduce((s, g) => s + g.variants.reduce((a, r) => a + r.onHand, 0), 0);

  return (
    <div className="fixed inset-0 z-[125] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-white rounded-3xl p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-moss/70">Stock por bodega</div>
            <div className="font-serif italic text-2xl mt-1">{productName}</div>
            <p className="text-xs text-moss/70 mt-1">
              {isLoading ? "Cargando…" : `Total: ${totalOnHand} unidades en ${groups.length} ${groups.length === 1 ? "bodega" : "bodegas"}`}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-ink/5" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 flex-1 overflow-y-auto -mx-1 px-1 space-y-4">
          {isLoading && (
            <p className="py-10 text-center text-sm text-moss/60">
              <Loader2 className="w-4 h-4 animate-spin inline-block" />
            </p>
          )}
          {!isLoading && groups.length === 0 && (
            <p className="py-10 text-center text-sm text-moss/60">Sin inventario registrado.</p>
          )}
          {!isLoading && groups.map((g) => {
            const rows = g.variants.filter((r) => r.onHand !== 0 || r.reserved !== 0);
            const onHand = g.variants.reduce((a, r) => a + r.onHand, 0);
            const reserved = g.variants.reduce((a, r) => a + r.reserved, 0);
            return (
              <div key={g.id} className="rounded-2xl border border-ink/10 overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-cream/50">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{g.name}</span>
                    <span className="text-[9px] uppercase tracking-widest px-2 py-0.5 rounded bg-ink/10 text-ink/60">
                      {KIND_LABEL[g.kind] ?? g.kind}
                    </span>
                  </div>
                  <span className="text-xs text-moss/70 tabular-nums">
                    {onHand} unidades{reserved > 0 ? ` · ${reserved} reservadas` : ""}
                  </span>
                </div>
                {rows.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-moss/60">Sin unidades en esta bodega.</p>
                ) : (
                  <table className="w-full text-[12px]">
                    <thead className="text-[9px] uppercase tracking-widest text-moss/70">
                      <tr>
                        <th className="text-left px-4 py-1.5">Variante</th>
                        <th className="text-left">SKU</th>
                        <th className="text-right pr-4">Disponible</th>
                        <th className="text-right pr-4">Reservadas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => (
                        <tr key={i} className="border-t border-ink/5">
                          <td className="px-4 py-1.5">
                            {[r.color, r.size].filter(Boolean).join(" · ") || "Único"}
                          </td>
                          <td className="font-mono text-[10px] text-ink/60">{r.sku}</td>
                          <td className={"text-right pr-4 tabular-nums " + (r.onHand - r.reserved > 0 ? "" : "text-clay")}>
                            {r.onHand - r.reserved}
                          </td>
                          <td className="text-right pr-4 tabular-nums text-ink/50">{r.reserved || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex justify-end shrink-0">
          <button onClick={onClose} className="px-4 py-2 rounded-full text-sm border border-ink/15">Cerrar</button>
        </div>
      </div>
    </div>
  );
}
