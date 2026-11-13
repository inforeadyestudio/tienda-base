import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";
import { toast } from "sonner";
import { X, Pencil, GripVertical, ChevronUp, ChevronDown, Trash2, AlertTriangle, ExternalLink, Link2 } from "lucide-react";
import { uploadSceneMedia } from "@/lib/scenes/data";
import { publicUrl } from "@/lib/site";
import { applyCollectionPositions } from "@/lib/collection-order";

export const Route = createFileRoute("/_authenticated/admin/colecciones")({
  head: () => ({ meta: [
    { title: "Colecciones | Tu Marca" },
    { name: "description", content: "Edita las colecciones, sus productos y portadas de Tu Marca." },
    { property: "og:title", content: "Colecciones | Tu Marca" },
    { property: "og:description", content: "Edita las colecciones, sus productos y portadas de Tu Marca." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: CollectionsAdmin,
});

type Collection = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  cover_url: string | null;
  status: string;
  position: number;
  scope: string;
  channels?: string[] | null;
  collection_products?: { product_id: string }[];
};

export const CHANNEL_KEYS = ["national", "international", "pos_cali", "pos_bogota", "b2b"] as const;
export type ChannelKey = (typeof CHANNEL_KEYS)[number];
export const CHANNEL_PRODUCT_FIELD: Record<Exclude<ChannelKey, "b2b">, string> = {
  national: "available_national",
  international: "available_international",
  pos_cali: "available_pos_cali",
  pos_bogota: "available_pos_bogota",
};

function copyCollectionLink(slug: string) {
  const url = publicUrl(`/coleccion/${slug}`);
  navigator.clipboard
    .writeText(url)
    .then(() => toast.success("Enlace copiado al portapapeles"))
    .catch(() => toast.error(`Copia manual: ${url}`));
}

function CollectionsAdmin() {
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [editing, setEditing] = useState<Collection | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Collection | null>(null);
  const [deleting, setDeleting] = useState(false);
  const { data } = useQuery({
    queryKey: ["admin", "collections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("collections")
        .select("id, slug, title, subtitle, cover_url, board_shape, b2b_discount_pct, status, position, scope, channels, is_page, collection_products(product_id)")
        .order("position");
      if (error) throw error;
      return (data ?? []) as Collection[];
    },
  });

  const collections = data?.filter((c) => c.slug !== "home" && !(c as any).is_page) ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin", "collections"] });

  async function doDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    const { error } = await supabase.from("collections").delete().eq("id", confirmDelete.id);
    setDeleting(false);
    if (error) {
      toast.error(error.message ?? "No se pudo eliminar la colección");
      return;
    }
    toast.success(`Colección “${confirmDelete.title}” eliminada`);
    qc.invalidateQueries({ queryKey: ["admin", "collections"] });
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
    setConfirmDelete(null);
  }

  return (
    <div className="p-10">
      <header className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-moss/70">Editorial</p>
          <h1 className="font-nm text-4xl mt-1">Colecciones</h1>
          <p className="text-sm text-moss mt-2 max-w-lg">Aquí defines el nombre y las piezas de cada colección. La experiencia editorial se edita en Tienda Online.</p>
        </div>
        <button onClick={() => setOpenNew(true)} className="px-5 py-2.5 rounded-full bg-ink text-ivory text-sm hover:bg-ink/85">
          Nueva colección
        </button>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
        {collections.map((c) => (
          <div key={c.id} className="bg-white border border-ink/10 rounded-2xl overflow-hidden group">
          <div className="aspect-[4/3] bg-cream overflow-hidden relative">
            {c.cover_url && <img src={c.cover_url} alt={c.title} className="w-full h-full object-cover" />}
            <div className="absolute top-3 right-3 flex gap-2 opacity-0 group-hover:opacity-100 transition">
              <button
                onClick={() => setEditing(c)}
                className="size-9 rounded-full bg-ivory/90 backdrop-blur flex items-center justify-center"
                aria-label="Editar colección"
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => setConfirmDelete(c)}
                className="size-9 rounded-full bg-ivory/90 backdrop-blur flex items-center justify-center hover:bg-red-50"
                aria-label="Eliminar colección"
              >
                <Trash2 className="w-4 h-4 text-red-500" />
              </button>
            </div>
          </div>
            <div className="p-5">
              <p className="text-[10px] uppercase tracking-widest text-moss/70">{c.status}</p>
              <h3 className="font-nm text-2xl mt-1">{c.title}</h3>
              {c.subtitle && <p className="text-xs text-moss mt-2">{c.subtitle}</p>}
              <p className="text-xs text-moss/60 mt-4">{c.collection_products?.length ?? 0} piezas</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <button onClick={() => setEditing(c)} className="px-4 py-2 rounded-full border border-ink/15 text-xs hover:bg-ink/5">
                  Editar
                </button>
                <a
                  href={publicUrl(`/coleccion/${c.slug}`)}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 rounded-full border border-ink/15 text-xs hover:bg-ink/5 inline-flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> Ver colección
                </a>
                <button
                  onClick={() => copyCollectionLink(c.slug)}
                  className="px-4 py-2 rounded-full border border-ink/15 text-xs hover:bg-ink/5 inline-flex items-center gap-1.5"
                >
                  <Link2 className="w-3.5 h-3.5" /> Copiar enlace
                </button>
              </div>
            </div>
          </div>
        ))}
        {collections.length === 0 && <p className="text-moss/60 text-sm">Sin colecciones aún.</p>}
      </div>

      {openNew && (
        <CollectionModal
          onClose={() => setOpenNew(false)}
          onSaved={() => { refresh(); setOpenNew(false); }}
          nextPosition={(data?.length ?? 0) + 1}
        />
      )}
      {editing && (
        <CollectionModal
          collection={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { refresh(); setEditing(null); }}
        />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[60] bg-ink/40 flex items-center justify-center p-4" onClick={() => !deleting && setConfirmDelete(null)}>
          <div className="bg-ivory rounded-2xl w-full max-w-md p-8 text-center" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-4 size-12 rounded-full bg-red-50 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="font-nm text-2xl">Eliminar colección</h3>
            <p className="text-sm text-moss mt-2">
              Vas a eliminar <strong>“{confirmDelete.title}”</strong>. Los productos no se borran, solo quedan sin esta colección. Esta acción no se puede deshacer.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button type="button" onClick={() => setConfirmDelete(null)} disabled={deleting}
                className="px-5 py-2.5 rounded-full text-sm hover:bg-ink/5 disabled:opacity-50">Cancelar</button>
              <button type="button" onClick={doDelete} disabled={deleting}
                className="px-5 py-2.5 rounded-full bg-red-500 text-white text-sm hover:bg-red-600 disabled:opacity-50">
                {deleting ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type PickProduct = { id: string; name: string; hero_image_url: string | null; status: string };

function CollectionModal({
  collection,
  onClose,
  onSaved,
  nextPosition = 1,
}: {
  collection?: Collection;
  onClose: () => void;
  onSaved: () => void;
  nextPosition?: number;
}) {
  const [title, setTitle] = useState(collection?.title ?? "");
  const [slug, setSlug] = useState(collection?.slug ?? "");
  const [subtitle, setSubtitle] = useState(collection?.subtitle ?? "");
  const [cover, setCover] = useState(collection?.cover_url ?? "");
  const [boardShape, setBoardShape] = useState((collection as any)?.board_shape ?? "oval");
  const [b2bDiscount, setB2bDiscount] = useState<string>((collection as any)?.b2b_discount_pct == null ? "" : String((collection as any).b2b_discount_pct));
  const [status, setStatus] = useState(collection?.status ?? "draft");
  const initialChannels = (collection?.channels?.length
    ? collection.channels
    : ["national", "international", "pos_cali", "pos_bogota"]) as ChannelKey[];
  const [channels, setChannels] = useState<ChannelKey[]>(initialChannels);
  const hasCh = (k: ChannelKey) => channels.includes(k);
  const toggleCh = (k: ChannelKey, on: boolean) =>
    setChannels((prev) => (on ? Array.from(new Set([...prev, k])) : prev.filter((c) => c !== k)));
  const onlineOn = hasCh("national") || hasCh("international");
  const toggleOnline = (on: boolean) =>
    setChannels((prev) => {
      const rest = prev.filter((c) => c !== "national" && c !== "international");
      return on ? [...rest, "national", "international"] : rest;
    });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pQuery, setPQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(true);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [orderQuery, setOrderQuery] = useState("");
  const [positionDrafts, setPositionDrafts] = useState<Record<string, string>>({});
  const hasPositionDrafts = picked.some((id) => positionDrafts[id] !== undefined);

  const { data: allProducts } = useQuery({
    queryKey: ["admin", "collection-picker-products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, hero_image_url, status")
        .order("name");
      if (error) throw error;
      return (data ?? []) as PickProduct[];
    },
  });

  useQuery({
    queryKey: ["admin", "collection-products", collection?.id],
    enabled: !!collection?.id,
    queryFn: async () => {
      if (!collection?.id) return [];
      const { data, error } = await supabase
        .from("collection_products")
        .select("product_id, position")
        .eq("collection_id", collection.id)
        .order("position");
      if (error) throw error;
      setPicked((data ?? []).map((r: any) => r.product_id));
      return data ?? [];
    },
  });

  const byId = new Map((allProducts ?? []).map((p) => [p.id, p]));
  const pickedProducts = picked.map((id) => byId.get(id)).filter(Boolean) as PickProduct[];
  const availableFiltered = (allProducts ?? []).filter((p) => {
    if (!pQuery.trim()) return true;
    return p.name.toLowerCase().includes(pQuery.trim().toLowerCase());
  });

  function move(from: number, to: number) {
    if (hasPositionDrafts) return;
    if (to < 0 || to >= picked.length || from === to) return;
    setPicked((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  async function syncProducts(collectionId: string, orderedProducts: string[]) {
    await supabase.from("collection_products").delete().eq("collection_id", collectionId);
    if (orderedProducts.length) {
      await supabase.from("collection_products").insert(
        orderedProducts.map((product_id, i) => ({ collection_id: collectionId, product_id, position: i })) as any,
      );
    }
  }


  const slugify = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    let orderedProducts: string[];
    try {
      orderedProducts = applyCollectionPositions(picked, positionDrafts);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Revisa las posiciones de las prendas.");
      return;
    }
    setSaving(true);
    const payload = {
      title: title.trim(),
      slug: slugify(slug) || slugify(title),
      subtitle: subtitle.trim() || null,
      cover_url: cover.trim() || null,
      board_shape: boardShape,
      b2b_discount_pct: b2bDiscount.trim() === "" ? null : Math.min(90, Math.max(0, Number(b2bDiscount) || 0)),
      status,
      scope: hasCh("national") && hasCh("international") ? "both" : hasCh("national") ? "national" : hasCh("international") ? "international" : "none",
      channels,
    };
    let savedId = collection?.id;
    let error: any = null;
    if (collection) {
      ({ error } = await supabase.from("collections").update(payload as any).eq("id", collection.id));
    } else {
      const res = await supabase.from("collections").insert({ ...payload, position: nextPosition } as any).select("id").single();
      error = res.error;
      savedId = res.data?.id;
    }
    if (!error && savedId) {
      try { await syncProducts(savedId, orderedProducts); } catch (err: any) { error = err; }
      // Propagar canales apagados/encendidos a los productos de la colección
      const changed = CHANNEL_KEYS.filter((k) => k !== "b2b" && initialChannels.includes(k) !== channels.includes(k)) as Exclude<ChannelKey, "b2b">[];
      if (!error && changed.length && picked.length) {
        const patch: Record<string, boolean> = {};
        changed.forEach((k) => { patch[CHANNEL_PRODUCT_FIELD[k]] = channels.includes(k); });
        const res = await supabase.from("products").update(patch as any).in("id", picked);
        if (res.error) error = res.error;
      }
    }
    setSaving(false);
    if (error) { toast.error(error.message ?? "No se pudo guardar"); return; }
    toast.success(collection ? "Colección actualizada" : "Colección creada");
    onSaved();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setUploading(true);
    try {
      setCover(await uploadSceneMedia(file, { maxDim: 1920, quality: 0.78 }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "No se pudo subir");
    } finally {
      setUploading(false);
    }
  }

  const input = "w-full px-4 py-2.5 rounded-full bg-white border border-ink/10 mb-4 text-sm focus:outline-none focus:border-ink/30";
  const label = "block text-xs uppercase tracking-widest text-moss/70 mb-1";

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="bg-ivory rounded-2xl w-full max-w-3xl relative flex flex-col max-h-[92vh] overflow-hidden">
        <div className="px-8 pt-8 pb-4 border-b border-ink/10 shrink-0">
          <button type="button" onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full hover:bg-ink/5 flex items-center justify-center">
            <X className="w-4 h-4" />
          </button>
          <p className="text-[10px] uppercase tracking-widest text-moss/70">Editorial</p>
          <h2 className="font-nm text-3xl mt-1">{collection ? "Editar colección" : "Nueva colección"}</h2>
        </div>

        <div className="overflow-y-auto px-8 py-6 grid md:grid-cols-2 gap-x-8">
        <div>
        <label className={label}>Título</label>
        <input value={title} onChange={(e) => { setTitle(e.target.value); if (!collection && !slug) setSlug(slugify(e.target.value)); }}
          autoFocus className={input} />

        <label className={label}>Slug</label>
        <input value={slug} onChange={(e) => setSlug(e.target.value)} onBlur={() => setSlug((s) => slugify(s))} className={input} />

        <label className={label}>Subtítulo</label>
        <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)} className={input} />

        <label className={label}>Portada</label>
        {cover && <img src={cover} alt="" className="w-full aspect-[4/3] object-cover rounded-xl mb-3" />}
        <input value={cover} onChange={(e) => setCover(e.target.value)} placeholder="URL de la imagen" className={input} />
        <label className="inline-flex items-center gap-2 text-xs text-moss mb-4 cursor-pointer">
          <input type="file" accept="image/*" onChange={onFile} className="hidden" />
          <span className="px-4 py-2 rounded-full border border-ink/15 hover:bg-ink/5">
            {uploading ? "Subiendo…" : "Subir imagen"}
          </span>
        </label>

        <label className={label}>Forma de la portada</label>
        <select value={boardShape} onChange={(e) => setBoardShape(e.target.value)} className={input}>
          <option value="oval">Óvalo (recortada)</option>
          <option value="rect">Rectangular</option>
        </select>

        <label className={label}>Estado</label>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className={input}>
          <option value="draft">Borrador</option>
          <option value="published">Publicada</option>
          <option value="archived">Archivada</option>
        </select>

        <label className={label}>Canales</label>
        <div className="rounded-2xl border border-ink/10 bg-white px-4 py-3 mb-4 space-y-2">
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input type="checkbox" checked={onlineOn} onChange={(e) => toggleOnline(e.target.checked)}
              className="w-4 h-4 accent-[#4a4034]" />
            <span>Tienda Online</span>
          </label>
          <div className="pl-7 space-y-1.5">
            <label className={`flex items-center gap-2.5 text-[13px] cursor-pointer ${onlineOn ? "" : "opacity-40"}`}>
              <input type="checkbox" disabled={!onlineOn} checked={hasCh("national")}
                onChange={(e) => toggleCh("national", e.target.checked)} className="w-3.5 h-3.5 accent-[#4a4034]" />
              <span>Nacional</span>
            </label>
            <label className={`flex items-center gap-2.5 text-[13px] cursor-pointer ${onlineOn ? "" : "opacity-40"}`}>
              <input type="checkbox" disabled={!onlineOn} checked={hasCh("international")}
                onChange={(e) => toggleCh("international", e.target.checked)} className="w-3.5 h-3.5 accent-[#4a4034]" />
              <span>Internacional</span>
            </label>
          </div>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input type="checkbox" checked={hasCh("pos_cali")} onChange={(e) => toggleCh("pos_cali", e.target.checked)}
              className="w-4 h-4 accent-[#4a4034]" />
            <span>POS Eventos</span>
          </label>
          <label className="flex items-center gap-2.5 text-sm cursor-pointer">
            <input type="checkbox" checked={hasCh("b2b")} onChange={(e) => toggleCh("b2b", e.target.checked)}
              className="w-4 h-4 accent-ink" />
            <span>Portal Wholesale (B2B)</span>
          </label>
          {hasCh("b2b") && (
            <label className="flex items-center gap-2.5 text-sm pl-6">
              <span className="text-moss/80">Descuento B2B (%)</span>
              <input type="number" min={0} max={90} inputMode="decimal" value={b2bDiscount}
                onChange={(e) => setB2bDiscount(e.target.value)} placeholder="General"
                className="w-20 rounded-[10px] border border-ink/15 bg-transparent px-2 py-1 text-sm" />
            </label>
          )}
          <p className="text-[11px] text-moss/70 pt-1 leading-snug">
            Al apagar un canal, todos los productos de esta colección se apagan en ese canal.
          </p>
        </div>


        </div>

        <div className="flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-1">
            <label className={`${label} mb-0`}>Productos de la colección</label>
            {picked.length > 0 && (
              <button
                type="button"
                onClick={() => setPickerOpen((v) => !v)}
                className="text-[11px] text-moss/70 hover:text-ink flex items-center gap-1.5 px-2 py-1 rounded-full hover:bg-ink/5"
              >
                {pickerOpen ? "Minimizar buscador" : "Buscar más"}
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${pickerOpen ? "" : "rotate-180"}`} />
              </button>
            )}
          </div>

          {pickerOpen && (
            <>
              <div className="relative mb-3">
                <input
                  value={pQuery}
                  onChange={(e) => setPQuery(e.target.value)}
                  placeholder="Buscar producto por nombre…"
                  className="w-full pl-10 pr-4 py-2.5 rounded-full bg-white border border-ink/10 text-sm focus:outline-none focus:border-ink/30"
                />
                <svg className="w-4 h-4 text-moss/50 absolute left-4 top-1/2 -translate-y-1/2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
              </div>

              <div className="rounded-2xl border border-ink/10 bg-white overflow-hidden mb-4">
                <div className="flex items-center justify-between px-3 py-2 border-b border-ink/10 bg-cream/40">
                  <span className="text-[11px] uppercase tracking-widest text-moss/70">
                    {availableFiltered.length} disponibles
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const ids = availableFiltered.map((p) => p.id);
                      setPicked((prev) => Array.from(new Set([...prev, ...ids])));
                    }}
                    className="text-[11px] px-3 py-1 rounded-full bg-ink text-ivory hover:bg-ink/85"
                  >
                    Agregar todos
                  </button>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-ink/5">
                  {availableFiltered.map((p) => {
                    const inCol = picked.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-ink/5"
                      >
                        <input
                          type="checkbox"
                          checked={inCol}
                          onChange={() => {
                            if (inCol) setPicked((prev) => prev.filter((id) => id !== p.id));
                            else setPicked((prev) => [...prev, p.id]);
                          }}
                          className="accent-ink w-4 h-4 shrink-0"
                        />
                        <span className="w-8 h-10 rounded bg-cream overflow-hidden shrink-0">
                          {p.hero_image_url && <img src={p.hero_image_url} alt="" className="w-full h-full object-cover" />}
                        </span>
                        <span className="text-sm flex-1 truncate">{p.name}</span>
                        <span className="text-[10px] uppercase tracking-widest text-moss/60">{p.status}</span>
                      </label>
                    );
                  })}
                  {availableFiltered.length === 0 && (
                    <p className="text-xs text-moss/60 px-3 py-4 text-center">
                      {allProducts?.length ? "Sin resultados para tu búsqueda." : "Cargando productos…"}
                    </p>
                  )}
                </div>
              </div>
            </>
          )}

          <p className="text-[11px] text-moss/70 mb-2 flex items-center justify-between">
            <span>{picked.length} piezas en la colección</span>
            <span className="text-moss/50">arrastra o escribe el número</span>
          </p>
          {picked.length > 0 && (
            <input
              type="search"
              value={orderQuery}
              onChange={(e) => setOrderQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
              placeholder="Buscar prenda en la colección…"
              className="w-full mb-2 px-3 py-2 rounded-xl bg-white border border-ink/10 text-sm outline-none focus:border-ink/30"
            />
          )}
          <div className="space-y-1.5 max-h-52 overflow-y-auto">
            {pickedProducts.map((p, i) => ({ p, i })).filter(({ p }) => !orderQuery.trim() || (p.name ?? "").toLowerCase().includes(orderQuery.trim().toLowerCase())).map(({ p, i }) => (
              <div
                key={p.id}
                draggable={!orderQuery.trim() && !hasPositionDrafts}
                onDragStart={() => setDragIdx(i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { e.preventDefault(); if (dragIdx !== null) move(dragIdx, i); setDragIdx(null); }}
                onDragEnd={() => setDragIdx(null)}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl bg-white border border-ink/10 cursor-grab active:cursor-grabbing ${dragIdx === i ? "opacity-40" : ""}`}
              >
                <GripVertical className="w-4 h-4 text-moss/50 shrink-0" />
                <input
                  type="number"
                  min={1}
                  max={pickedProducts.length}
                  value={positionDrafts[p.id] ?? i + 1}
                  onChange={(e) => {
                    const value = e.target.value;
                    setPositionDrafts((prev) => ({ ...prev, [p.id]: value }));
                  }}
                  draggable={false}
                  onMouseDown={(e) => e.stopPropagation()}
                  onDragStart={(e) => { e.preventDefault(); e.stopPropagation(); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
                  aria-label="Posición"
                  className="w-11 shrink-0 text-center text-xs rounded-lg border border-ink/15 bg-ivory py-1 outline-none focus:border-ink/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                />
                <span className="w-8 h-10 rounded bg-cream overflow-hidden shrink-0">
                  {p.hero_image_url && <img src={p.hero_image_url} alt="" className="w-full h-full object-cover" />}
                </span>
                <span className="text-sm flex-1 truncate">{p.name}</span>
                <button type="button" disabled={hasPositionDrafts} onClick={() => move(i, i - 1)} className="p-1 rounded hover:bg-ink/5 disabled:opacity-30" aria-label="Subir">
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button type="button" disabled={hasPositionDrafts} onClick={() => move(i, i + 1)} className="p-1 rounded hover:bg-ink/5 disabled:opacity-30" aria-label="Bajar">
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPicked((prev) => prev.filter((id) => id !== p.id))}
                  className="p-1 rounded hover:bg-ink/5"
                  aria-label="Quitar"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            {picked.length === 0 && (
              <p className="text-xs text-moss/60">Aún no hay productos en esta colección.</p>
            )}
          </div>
        </div>
        </div>

        <div className="flex justify-end gap-2 px-8 py-4 border-t border-ink/10 bg-ivory shrink-0">
          <button type="button" onClick={onClose} className="px-5 py-2.5 rounded-full text-sm hover:bg-ink/5">Cancelar</button>
          <button type="submit" disabled={saving || uploading || !title.trim()}
            className="px-5 py-2.5 rounded-full bg-ink text-ivory text-sm hover:bg-ink/85 disabled:opacity-50">
            {saving ? "Guardando…" : collection ? "Guardar cambios" : "Crear colección"}
          </button>
        </div>
      </form>
    </div>
  );
}
