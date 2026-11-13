import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { Loader2, Minus, PackagePlus, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { sendRCountAdjustment } from "@/lib/rcount.functions";

type Line = { variant_id: string; qty: number; product_name: string; sku: string; label: string };
type NewVar = { color: string; size: string; sku: string; price: string; qty: string };

const slugify = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
const skuPart = (s: string) => slugify(s).replace(/-/g, "").toUpperCase().slice(0, 6);

// Borrador de la entrada manual: sobrevive cerrar la ventana y recargar la página.
const DRAFT_KEY = "tb-intake-manual-draft";
const readDraft = (): { lines?: Line[]; locationId?: string; note?: string } => {
  try { return JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "{}") ?? {}; } catch { return {}; }
};

export function ManualIntakeModal({ onClose }: { onClose: () => void }) {
  const draft = useMemo(readDraft, []);
  const qc = useQueryClient();
  const [tab, setTab] = useState<"existing" | "new">("existing");
  const [locationId, setLocationId] = useState(draft.locationId ?? "");
  const [note, setNote] = useState(draft.note ?? "");
  const [search, setSearch] = useState("");
  const [lines, setLines] = useState<Line[]>(draft.lines ?? []);
  // producto rápido
  const [pName, setPName] = useState("");
  const [pRef, setPRef] = useState("");
  const [pPrice, setPPrice] = useState("");
  const [colors, setColors] = useState("");
  const [sizes, setSizes] = useState("XS, S, M, L");
  const [newVars, setNewVars] = useState<NewVar[]>([]);

  // Guarda el borrador en cuanto cambia cualquier parte de la entrada.
  useEffect(() => {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ lines, locationId, note })); } catch { /* almacenamiento no disponible */ }
  }, [lines, locationId, note]);

  const { data: locations } = useQuery({
    queryKey: ["intake-locations"],
    queryFn: async () => (await supabase.from("locations").select("id, name").eq("active", true).order("priority")).data ?? [],
  });

  const { data: variants, isFetching } = useQuery({
    queryKey: ["intake-variants", search],
    enabled: tab === "existing",
    queryFn: async () => {
      const term = search.trim();
      let ids: string[] = [];
      if (term) {
        const { data } = await supabase.from("products").select("id")
          .or(`name.ilike.%${term}%,reference_code.ilike.%${term}%`).limit(100);
        ids = (data ?? []).map((p) => p.id);
      }
      let q = supabase.from("product_variants").select("id, sku, size, color, quality, products(name)").eq("active", true).limit(60);
      if (term) q = ids.length ? q.or(`sku.ilike.%${term}%,product_id.in.(${ids.join(",")})`) : q.ilike("sku", `%${term}%`);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as { id: string; sku: string; size: string | null; color: string | null; quality: string | null; products: { name: string } | null }[];
    },
  });

  const total = useMemo(() => lines.reduce((s, l) => s + l.qty, 0), [lines]);

  const generate = () => {
    const cs = colors.split(",").map((c) => c.trim()).filter(Boolean);
    const ss = sizes.split(",").map((c) => c.trim()).filter(Boolean);
    const base = skuPart(pRef || pName) || "REF";
    const out: NewVar[] = [];
    for (const c of cs.length ? cs : [""]) for (const s of ss.length ? ss : [""]) {
      out.push({ color: c, size: s, sku: [base, c && skuPart(c).slice(0, 3), s && s.toUpperCase()].filter(Boolean).join("-"), price: pPrice, qty: "0" });
    }
    setNewVars(out);
  };

  const createProduct = useMutation({
    mutationFn: async () => {
      if (!pName.trim()) throw new Error("Escribe el nombre del producto");
      if (newVars.length === 0) throw new Error("Genera al menos una variante");
      if (newVars.some((v) => !v.sku.trim())) throw new Error("Todas las variantes necesitan SKU");
      const { data: prod, error } = await supabase.from("products").insert({
        name: pName.trim(), reference_code: pRef.trim() || null,
        slug: `${slugify(pName)}-${Date.now().toString(36)}`, status: "draft",
      }).select("id, name").single();
      if (error) throw error;
      const { data: vs, error: e2 } = await supabase.from("product_variants").insert(newVars.map((v) => ({
        product_id: prod.id, sku: v.sku.trim(), color: v.color || null, size: v.size || null,
        price_cop: Number(v.price) || 0, quality: "A",
      }))).select("id, sku, color, size");
      if (e2) { await supabase.from("products").delete().eq("id", prod.id); throw e2; }
      return { prod, vs: vs ?? [] };
    },
    onSuccess: ({ prod, vs }) => {
      const add: Line[] = vs.map((v) => {
        const nv = newVars.find((x) => x.sku.trim() === v.sku);
        return { variant_id: v.id, qty: Math.max(0, Number(nv?.qty) || 0), product_name: prod.name, sku: v.sku, label: [v.color, v.size].filter(Boolean).join(" · ") };
      }).filter((l) => l.qty > 0);
      setLines((p) => [...p, ...add]);
      toast.success(`Producto creado (${vs.length} variantes, en borrador)`);
      setPName(""); setPRef(""); setPPrice(""); setColors(""); setNewVars([]);
      setTab("existing");
      qc.invalidateQueries({ queryKey: ["intake-variants"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const sendRCount = useServerFn(sendRCountAdjustment);
  const submit = useMutation({
    mutationFn: async () => {
      const items = lines.filter((l) => l.qty > 0);
      if (!locationId || items.length === 0) throw new Error("Selecciona bodega y escribe cantidades mayores a cero");
      const since = new Date(Date.now() - 2 * 3600_000).toISOString();
      const { data: recent } = await supabase.from("inventory_movements")
        .select("variant_id, qty").eq("ref_type", "intake").eq("location_id", locationId)
        .gte("created_at", since).in("variant_id", items.map((i) => i.variant_id));
      const dup = items.filter((i) => (recent ?? []).some((r) => r.variant_id === i.variant_id && r.qty === i.qty));
      if (dup.length && !window.confirm(`Esta entrada parece repetida (${dup.map((d) => d.sku).join(", ")} ya se registró con la misma cantidad hace menos de 2 horas). ¿Registrarla de todos modos?`)) {
        throw new Error("Entrada cancelada");
      }
      const { error } = await supabase.rpc("create_intake", {
        _location_id: locationId,
        _items: items.map(({ variant_id, qty }) => ({ variant_id, qty })) as unknown as never,
        _note: note || undefined,
      });
      if (error) throw error;
      try {
        const r = await sendRCount({ data: { kind: "ajuste", reason: note || "Entrada manual Hub", items: items.map(({ variant_id, qty }) => ({ variant_id, qty })), location_id: locationId } });
        r.ok ? toast.success(r.message) : toast.error(r.message, { duration: 12000 });
      } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo enviar a R-Count", { duration: 12000 }); }
    },
    onSuccess: () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } toast.success("Entrada registrada"); qc.invalidateQueries(); onClose(); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });
  const ready = lines.some((l) => l.qty > 0);

  const input = "w-full rounded-full border border-ink/15 px-4 py-2 bg-ivory text-sm outline-none focus:border-ink";

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between px-6 py-4 border-b border-ink/10">
          <h2 className="font-serif italic text-2xl">Entrada manual</h2>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-ink/5"><X className="h-4 w-4" /></button>
        </header>
        <div className="overflow-auto p-6 grid gap-6 lg:grid-cols-[1fr_320px]">
          <section className="space-y-4 min-w-0">
            <div className="flex gap-2">
              {(["existing", "new"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-1.5 text-sm border ${tab === t ? "bg-ink text-ivory border-ink" : "border-ink/15 hover:bg-ink/5"}`}>
                  {t === "existing" ? "Seleccionar productos" : "Crear producto rápido"}
                </button>
              ))}
            </div>

            {tab === "existing" ? (
              <>
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre, referencia o SKU" className={input} />
                <div className="max-h-80 overflow-auto border border-ink/10 rounded-2xl divide-y divide-ink/5">
                  {variants?.map((v) => (
                    <button key={v.id} onClick={() => setLines((p) => p.some((l) => l.variant_id === v.id) ? p : [...p, { variant_id: v.id, qty: 0, product_name: v.products?.name ?? "Producto", sku: v.sku, label: [v.color, v.size, v.quality].filter(Boolean).join(" · ") }])}
                      className="w-full text-left px-4 py-2 hover:bg-ink/5 flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate">{v.products?.name} · <span className="font-mono text-xs text-ink/60">{v.sku}</span> · <span className="text-xs text-moss">{[v.color, v.size, v.quality].filter(Boolean).join(" ")}</span></span>
                      <Plus className="size-4 shrink-0" />
                    </button>
                  ))}
                  {isFetching && <p className="p-4 text-sm text-moss/60">Buscando…</p>}
                  {!isFetching && (variants?.length ?? 0) === 0 && <p className="p-4 text-sm text-moss/60">Sin resultados. Puedes crearlo en «Crear producto rápido».</p>}
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input value={pName} onChange={(e) => setPName(e.target.value)} placeholder="Nombre del producto" className={input} />
                  <input value={pRef} onChange={(e) => setPRef(e.target.value)} placeholder="Referencia" className={input} />
                  <input value={colors} onChange={(e) => setColors(e.target.value)} placeholder="Colores (ej: Brown, Green)" className={input} />
                  <input value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="Tallas (ej: XS, S, M, L)" className={input} />
                  <input value={pPrice} onChange={(e) => setPPrice(e.target.value)} inputMode="numeric" placeholder="Precio COP" className={input} />
                  <button onClick={generate} className="rounded-full border border-ink/15 px-4 py-2 text-sm hover:bg-ink/5">Generar variantes</button>
                </div>
                {newVars.length > 0 && (
                  <div className="border border-ink/10 rounded-2xl overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="text-[10px] uppercase tracking-widest text-moss/70"><tr>
                        <th className="p-2 text-left">Color</th><th className="p-2 text-left">Talla</th><th className="p-2 text-left">SKU</th><th className="p-2 text-left">Precio</th><th className="p-2 text-left">Ingreso</th><th />
                      </tr></thead>
                      <tbody>
                        {newVars.map((v, i) => {
                          const set = (k: keyof NewVar, val: string) => setNewVars((p) => p.map((x, j) => j === i ? { ...x, [k]: val } : x));
                          const cell = "w-full rounded-md border border-ink/10 px-2 py-1 bg-ivory no-spin";
                          return (
                            <tr key={i} className="border-t border-ink/5">
                              <td className="p-1.5"><input value={v.color} onChange={(e) => set("color", e.target.value)} className={cell} /></td>
                              <td className="p-1.5 w-16"><input value={v.size} onChange={(e) => set("size", e.target.value)} className={cell} /></td>
                              <td className="p-1.5"><input value={v.sku} onChange={(e) => set("sku", e.target.value)} className={`${cell} font-mono text-xs`} /></td>
                              <td className="p-1.5 w-28"><input value={v.price} onChange={(e) => set("price", e.target.value)} inputMode="numeric" className={cell} /></td>
                              <td className="p-1.5 w-20"><input value={v.qty} onChange={(e) => set("qty", e.target.value)} inputMode="numeric" className={cell} /></td>
                              <td className="p-1.5"><button onClick={() => setNewVars((p) => p.filter((_, j) => j !== i))} className="text-ink/40 hover:text-clay"><Trash2 className="size-4" /></button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                <button onClick={() => createProduct.mutate()} disabled={createProduct.isPending || newVars.length === 0}
                  className="inline-flex items-center gap-2 rounded-full bg-ink text-ivory px-5 py-2 text-sm disabled:opacity-40">
                  {createProduct.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Crear y agregar a la entrada
                </button>
                <p className="text-xs text-moss/70">El producto se crea en borrador; complétalo luego (fotos, descripción) desde Productos.</p>
              </div>
            )}
          </section>

          <aside className="space-y-4">
            <div>
              <label className="text-[10px] uppercase tracking-widest text-moss/70">Bodega destino</label>
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={`mt-1 ${input}`}>
                <option value="">— Selecciona —</option>
                {locations?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-widest text-moss/70 mb-1">Piezas ({total})</div>
              {lines.length === 0 ? <p className="text-sm text-moss/60">Agrega variantes.</p> : (
                <div className="space-y-2 max-h-72 overflow-auto">
                  {lines.map((l, i) => (
                    <div key={l.variant_id} className="flex items-center gap-2 border border-ink/10 rounded-xl px-3 py-2">
                      <div className="flex-1 min-w-0 text-xs">
                        <div className="truncate font-medium">{l.product_name}</div>
                        <div className="text-moss truncate"><span className="font-mono">{l.sku}</span>{l.label && ` · ${l.label}`}</div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => setLines((p) => p.map((x, j) => j === i ? { ...x, qty: Math.max(0, x.qty - 1) } : x))} type="button" aria-label="Menos"
                          className="w-7 h-7 rounded-full border border-ink/15 flex items-center justify-center hover:bg-ink/5"><Minus className="size-3.5" /></button>
                        <input value={l.qty || ""} inputMode="numeric" placeholder="0" aria-label={`Cantidad ${l.sku}`}
                          onChange={(e) => { const q = Math.max(0, Math.trunc(Number(e.target.value.replace(/\D/g, ""))) || 0); setLines((p) => p.map((x, j) => j === i ? { ...x, qty: q } : x)); }}
                          className="w-12 rounded-full border border-ink/15 px-1 py-1 bg-ivory text-center text-sm" />
                        <button onClick={() => setLines((p) => p.map((x, j) => j === i ? { ...x, qty: x.qty + 1 } : x))} type="button" aria-label="Más"
                          className="w-7 h-7 rounded-full border border-ink/15 flex items-center justify-center hover:bg-ink/5"><Plus className="size-3.5" /></button>
                      </div>
                      <button onClick={() => setLines((p) => p.filter((_, j) => j !== i))} className="text-ink/40 hover:text-clay"><Trash2 className="size-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (lote, remisión…)" className={input} />
            <button onClick={() => submit.mutate()} disabled={submit.isPending || !locationId || !ready}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-ink text-ivory px-5 py-2.5 text-sm disabled:opacity-40">
              <PackagePlus className="size-4" /> Registrar entrada ({total} pza)
            </button>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}
