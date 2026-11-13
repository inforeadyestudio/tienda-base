import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Gift, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCOP } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/ofertas-pos")({
  component: OfertasPosPage,
});

type OfferItem = { variant_id: string; qty: number; price_cop: number };
type Offer = {
  id: string;
  name: string;
  kind: "cross_sell" | "upsell";
  image_url: string | null;
  price_cop: number;
  active: boolean;
  position: number;
  items: OfferItem[];
  note: string | null;
  placements: string[] | null;
};

export const OFFER_PLACEMENTS = [
  { id: "pos_cali", label: "POS Eventos" },
  { id: "web_thankyou", label: "Web · Página de gracias" },
] as const;

function OfertasPosPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Offer | null>(null);
  const [creating, setCreating] = useState(false);

  const { data: offers } = useQuery({
    queryKey: ["admin", "pos-offers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pos_offers").select("*").order("position").order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Offer[];
    },
  });

  const toggle = useMutation({
    mutationFn: async (o: Offer) => {
      const { error } = await supabase.from("pos_offers").update({ active: !o.active }).eq("id", o.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin", "pos-offers"] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pos_offers").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Oferta eliminada"); qc.invalidateQueries({ queryKey: ["admin", "pos-offers"] }); },
  });

  return (
    <div className="p-10">
      <header className="mb-8 flex items-start justify-between gap-6">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-moss/70">Sales Hub</p>
          <h1 className="text-4xl mt-1">Ofertas Cross y upsell</h1>
          <p className="text-sm text-moss mt-2 max-w-xl">
            Configura combos de cross-selling y upselling y elige dónde se muestran: en la caja de cada POS o en la página de gracias de la tienda online. Al seleccionarla, todos los productos se agregan al carrito.
          </p>
        </div>
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-ink text-ivory text-sm">
          <Plus className="size-4" /> Nueva oferta
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {offers?.map((o) => (
          <div key={o.id} className="bg-white border border-ink/10 rounded-2xl overflow-hidden">
            <div className="aspect-[4/3] bg-cream/60 flex items-center justify-center">
              {o.image_url ? <img src={o.image_url} alt="" className="w-full h-full object-cover" /> : <Gift className="size-8 text-ink/20" />}
            </div>
            <div className="p-5">
              <div className="flex items-center gap-2">
                <span className={"text-[10px] uppercase tracking-widest px-2 py-0.5 rounded " + (o.kind === "cross_sell" ? "bg-moss/10 text-moss" : "bg-clay/10 text-clay")}>
                  {o.kind === "cross_sell" ? "Cross-sell" : "Upsell"}
                </span>
                {!o.active && <span className="text-[10px] uppercase tracking-widest text-ink/40">Inactiva</span>}
              </div>
              <h3 className="text-xl mt-2">{o.name}</h3>
              <p className="text-xs text-ink/50 mt-1">{o.items?.length ?? 0} artículos · {formatCOP(o.price_cop)}</p>
              <div className="flex flex-wrap gap-1 mt-2">
                {(o.placements ?? []).map((p) => (
                  <span key={p} className="text-[10px] px-2 py-0.5 rounded-full bg-ink/5 text-ink/60">{OFFER_PLACEMENTS.find((x) => x.id === p)?.label ?? p}</span>
                ))}
                {(o.placements ?? []).length === 0 && <span className="text-[10px] text-clay">Sin canales</span>}
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setEditing(o)} className="flex-1 px-3 py-2 rounded-full border border-ink/15 text-xs hover:bg-ink/5">Editar</button>
                <button onClick={() => toggle.mutate(o)} className="px-3 py-2 rounded-full border border-ink/15 text-xs hover:bg-ink/5">{o.active ? "Desactivar" : "Activar"}</button>
                <button onClick={() => { if (confirm("¿Eliminar oferta?")) remove.mutate(o.id); }} className="px-3 py-2 rounded-full border border-ink/15 text-xs text-clay hover:bg-clay/5"><Trash2 className="size-3.5" /></button>
              </div>
            </div>
          </div>
        ))}
        {offers && offers.length === 0 && (
          <p className="col-span-full text-ink/50 text-sm py-16 text-center">Aún no hay ofertas. Crea la primera para el POS.</p>
        )}
      </div>

      {(creating || editing) && (
        <OfferEditor
          offer={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { qc.invalidateQueries({ queryKey: ["admin", "pos-offers"] }); setCreating(false); setEditing(null); }}
        />
      )}
    </div>
  );
}

function OfferEditor({ offer, onClose, onSaved }: { offer: Offer | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(offer?.name ?? "");
  const [kind, setKind] = useState<Offer["kind"]>(offer?.kind ?? "cross_sell");
  const [imageUrl, setImageUrl] = useState(offer?.image_url ?? "");
  const [items, setItems] = useState<OfferItem[]>(offer?.items ?? []);
  const [priceCop, setPriceCop] = useState(offer?.price_cop ?? 0);
  const [note, setNote] = useState(offer?.note ?? "");
  const [active, setActive] = useState(offer?.active ?? true);
  const [placements, setPlacements] = useState<string[]>(offer?.placements ?? ["pos_cali", "pos_bogota"]);
  const [q, setQ] = useState("");

  const { data: variants } = useQuery({
    queryKey: ["admin", "offer-variants", q],
    queryFn: async () => {
      let query = supabase.from("product_variants")
        .select("id, sku, size, color, price_cop, products!inner(name, status)")
        .eq("active", true).eq("products.status", "published").limit(30);
      if (q) query = query.or(`sku.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const suggestedTotal = useMemo(() => items.reduce((s, i) => s + i.price_cop * i.qty, 0), [items]);

  const addVariant = (v: NonNullable<typeof variants>[number]) => {
    setItems((prev) => prev.find((p) => p.variant_id === v.id) ? prev : [...prev, { variant_id: v.id, qty: 1, price_cop: v.price_cop }]);
  };

  const save = async () => {
    if (!name.trim() || items.length === 0) { toast.error("Nombre e ítems requeridos"); return; }
    if (placements.length === 0) { toast.error("Elige al menos un canal"); return; }
    const payload = { name: name.trim(), kind, image_url: imageUrl.trim() || null, items, price_cop: priceCop, note: note.trim() || null, active, placements };
    const res = offer
      ? await supabase.from("pos_offers").update(payload).eq("id", offer.id)
      : await supabase.from("pos_offers").insert(payload);
    if (res.error) { toast.error(res.error.message); return; }
    toast.success("Oferta guardada");
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-6">
      <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-auto">
        <div className="p-6 border-b border-ink/10 flex items-center justify-between">
          <h2 className="text-2xl">{offer ? "Editar oferta" : "Nueva oferta"}</h2>
          <button onClick={onClose} className="text-ink/50 hover:text-ink"><X className="size-5" /></button>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <label className="block text-xs uppercase tracking-widest text-ink/60">Nombre
              <input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 w-full px-4 py-2.5 rounded-full border border-ink/15 text-sm" />
            </label>
            <label className="block text-xs uppercase tracking-widest text-ink/60">Tipo
              <div className="mt-2 flex gap-2">
                {(["cross_sell", "upsell"] as const).map((k) => (
                  <button key={k} onClick={() => setKind(k)} className={"px-4 py-2 rounded-full text-sm border " + (kind === k ? "bg-ink text-ivory border-ink" : "border-ink/15")}>
                    {k === "cross_sell" ? "Cross-sell" : "Upsell"}
                  </button>
                ))}
              </div>
            </label>
            <label className="block text-xs uppercase tracking-widest text-ink/60">Imagen (URL)
              <input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="mt-2 w-full px-4 py-2.5 rounded-full border border-ink/15 text-sm" />
            </label>
            <label className="block text-xs uppercase tracking-widest text-ink/60">Precio total del combo (COP)
              <input type="number" value={priceCop} onChange={(e) => setPriceCop(Number(e.target.value) || 0)} className="mt-2 w-full px-4 py-2.5 rounded-full border border-ink/15 text-sm" />
              <span className="block text-[10px] normal-case tracking-normal text-ink/50 mt-1">Suma de ítems: {formatCOP(suggestedTotal)}</span>
            </label>
            <label className="block text-xs uppercase tracking-widest text-ink/60">Nota (opcional)
              <textarea value={note} onChange={(e) => setNote(e.target.value)} className="mt-2 w-full px-4 py-2 rounded-2xl border border-ink/15 text-sm" />
            </label>
            <div className="text-xs uppercase tracking-widest text-ink/60">Dónde mostrarla
              <div className="mt-2 flex flex-wrap gap-2">
                {OFFER_PLACEMENTS.map((pl) => {
                  const on = placements.includes(pl.id);
                  return (
                    <button key={pl.id} type="button" onClick={() => setPlacements((prev) => on ? prev.filter((x) => x !== pl.id) : [...prev, pl.id])} className={"px-4 py-2 rounded-full text-sm border normal-case tracking-normal " + (on ? "bg-ink text-ivory border-ink" : "border-ink/15")}>
                      {pl.label}
                    </button>
                  );
                })}
              </div>
              {placements.includes("web_thankyou") && <span className="block text-[10px] normal-case tracking-normal text-ink/50 mt-1">En la web los productos se agregan al carrito con su precio normal de la tienda.</span>}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Activa
            </label>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-ink/60 mb-2">Buscar productos</div>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SKU..." className="w-full px-4 py-2.5 rounded-full border border-ink/15 text-sm mb-3" />
            <div className="border border-ink/10 rounded-2xl max-h-48 overflow-auto divide-y divide-ink/5">
              {variants?.map((v) => (
                <button key={v.id} onClick={() => addVariant(v)} className="w-full text-left px-3 py-2 hover:bg-ink/5 text-xs flex justify-between gap-2">
                  <span className="truncate">{v.products?.name} · {[v.color, v.size].filter(Boolean).join(" ")}</span>
                  <span className="text-ink/50">{formatCOP(v.price_cop)}</span>
                </button>
              ))}
            </div>
            <div className="mt-4 text-xs uppercase tracking-widest text-ink/60 mb-2">Ítems del combo</div>
            <div className="space-y-2">
              {items.length === 0 && <p className="text-xs text-ink/40">Sin ítems.</p>}
              {items.map((it, idx) => (
                <div key={it.variant_id} className="flex items-center gap-2 text-xs border border-ink/10 rounded-2xl p-2">
                  <span className="flex-1 truncate font-mono text-ink/60">{it.variant_id.slice(0, 8)}…</span>
                  <input type="number" min={1} value={it.qty} onChange={(e) => setItems((p) => p.map((x, i) => i === idx ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x))} className="w-14 px-2 py-1 rounded-full border border-ink/15" />
                  <input type="number" value={it.price_cop} onChange={(e) => setItems((p) => p.map((x, i) => i === idx ? { ...x, price_cop: Number(e.target.value) || 0 } : x))} className="w-24 px-2 py-1 rounded-full border border-ink/15" />
                  <button onClick={() => setItems((p) => p.filter((_, i) => i !== idx))} className="text-clay"><Trash2 className="size-3.5" /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="p-6 border-t border-ink/10 flex justify-end gap-3">
          <button onClick={onClose} className="px-5 py-2.5 rounded-full border border-ink/15 text-sm">Cancelar</button>
          <button onClick={save} className="px-5 py-2.5 rounded-full bg-ink text-ivory text-sm">Guardar oferta</button>
        </div>
      </div>
    </div>
  );
}