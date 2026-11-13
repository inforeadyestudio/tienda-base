import { fetchAll } from "@/lib/fetch-all";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const isQualityA = (q?: string | null) => !q || /(^|\s)a$/i.test(q.trim());
const SIZE_ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "U"];
const sizeLabel = (s?: string | null) => (!s || /unica|única/i.test(s) ? "U" : s.toUpperCase());
import { sizeRank } from "@/lib/size-order";

type Variant = { id: string; size: string | null; color: string | null; quality: string | null };

export function PreventaSelection() {
  const qc = useQueryClient();
  const [locationId, setLocationId] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [search, setSearch] = useState("");
  const [defaultQty, setDefaultQty] = useState(10);
  const [bulk, setBulk] = useState("");
  const [rowFill, setRowFill] = useState<Record<string, string>>({});

  const { data: locations } = useQuery({
    queryKey: ["preventa-locations"],
    queryFn: async () => (await supabase.from("locations").select("id, name").eq("allow_preventa", true).order("priority", { ascending: false })).data ?? [],
  });
  const loc = locationId || locations?.[0]?.id || "";

  const { data: rules } = useQuery({
    queryKey: ["preventa-rules", loc],
    enabled: !!loc,
    queryFn: async () => {
      const data = await fetchAll<any>((f, t) => supabase.from("preventa_rules").select("id, variant_id, max_qty, product_variants(product_id)").eq("location_id", loc).order("id").range(f, t)); const error = null;
      if (error) throw error;
      return data ?? [];
    },
  });
  const ruleMap = useMemo(() => new Map((rules ?? []).map((r) => [r.variant_id, r])), [rules]);
  const productsInPreventa = useMemo(() => new Set((rules ?? []).map((r: any) => r.product_variants?.product_id).filter(Boolean)), [rules]);

  const { data: sold } = useQuery({
    queryKey: ["preventa-used", loc],
    enabled: !!loc,
    queryFn: async () => {
      const data = await fetchAll<any>((f, t) => supabase.from("preventa_allocations").select("variant_id, qty").eq("location_id", loc).eq("status", "pending").order("id").range(f, t));
      const m: Record<string, number> = {};
      (data ?? []).forEach((a) => { m[a.variant_id] = (m[a.variant_id] ?? 0) + a.qty; });
      return m;
    },
  });

  const { data: collections } = useQuery({
    queryKey: ["preventa-collections-counts"],
    queryFn: async () => {
      const [{ data: cols }, { data: cp }] = await Promise.all([
        supabase.from("collections").select("id, title").eq("is_page", false).order("position"),
        fetchAll<any>((f, t) => supabase.from("collection_products").select("collection_id, product_id").order("collection_id").order("product_id").range(f, t)).then((data) => ({ data })),
      ]);
      return (cols ?? []).map((c) => ({ ...c, productIds: (cp ?? []).filter((x) => x.collection_id === c.id).map((x) => x.product_id) }));
    },
  });
  const activeCol = collections?.find((c) => c.id === collectionId);

  const { data: products } = useQuery({
    queryKey: ["preventa-col-products", collectionId],
    enabled: !!activeCol,
    queryFn: async () => {
      const ids = activeCol!.productIds;
      if (!ids.length) return [];
      const { data, error } = await supabase.from("products").select("id, name, reference_code, hero_image_url, product_variants(id, size, color, quality)").in("id", ids).order("name");
      if (error) throw error;
      return (data ?? []).map((p) => {
        const vars = ((p.product_variants ?? []) as Variant[]).filter((v) => isQualityA(v.quality));
        const multiColor = new Set(vars.map((v) => v.color ?? "")).size > 1;
        const cells = vars
          .map((v) => ({ id: v.id, label: sizeLabel(v.size) + (multiColor && v.color ? ` · ${v.color}` : ""), rank: sizeRank(sizeLabel(v.size)), color: v.color ?? "" }))
          .sort((a, b) => a.color.localeCompare(b.color) || a.rank - b.rank);
        return { ...p, cells };
      });
    },
  });

  const refresh = () => { qc.invalidateQueries({ queryKey: ["preventa-rules"] }); qc.invalidateQueries({ queryKey: ["b2b-matrix"] }); };

  const setQty = useMutation({
    mutationFn: async (items: { variantId: string; qty: number }[]) => {
      const up = items.filter((i) => i.qty > 0).map((i) => ({ location_id: loc, variant_id: i.variantId, max_qty: i.qty }));
      const del = items.filter((i) => i.qty <= 0).map((i) => i.variantId);
      if (up.length) { const { error } = await supabase.from("preventa_rules").upsert(up, { onConflict: "location_id,variant_id" }); if (error) throw error; }
      if (del.length) { const { error } = await supabase.from("preventa_rules").delete().eq("location_id", loc).in("variant_id", del); if (error) throw error; }
    },
    onSuccess: refresh,
    onError: (e: any) => toast.error(e?.message ?? "Error al guardar"),
  });

  const list = (products ?? []).filter((p) => {
    const t = search.trim().toLowerCase();
    return !t || p.name.toLowerCase().includes(t) || (p.reference_code ?? "").toLowerCase().includes(t);
  });
  const isOn = (p: { cells: { id: string }[] }) => p.cells.some((c) => ruleMap.has(c.id));

  const toggle = (p: (typeof list)[number]) => {
    if (isOn(p)) {
      const vend = p.cells.reduce((s, c) => s + (sold?.[c.id] ?? 0), 0);
      if (vend > 0 && !confirm(`Este producto tiene ${vend} unidades vendidas en preventa. ¿Quitar sus cupos?`)) return;
      setQty.mutate(p.cells.map((c) => ({ variantId: c.id, qty: 0 })));
    } else setQty.mutate(p.cells.map((c) => ({ variantId: c.id, qty: defaultQty })));
  };

  if (!locations?.length) return <p className="rounded-2xl border border-ink/10 bg-white p-6 text-sm text-moss">Ninguna bodega tiene preventa habilitada. Actívala desde Bodegas.</p>;

  if (!activeCol) {
    return (
      <div>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-moss"><span className="mr-2 rounded-full bg-ink px-2.5 py-0.5 text-[10px] text-ivory">Paso 1</span>Elige la colección</p>
          <select value={loc} onChange={(e) => setLocationId(e.target.value)} className="rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm">
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(collections ?? []).map((c) => {
            const inPre = c.productIds.filter((id) => productsInPreventa.has(id)).length;
            return (
              <button key={c.id} onClick={() => setCollectionId(c.id)} className="rounded-2xl border border-ink/10 bg-white p-5 text-left transition hover:border-ink/30">
                <p className="font-serif text-xl">{c.title}</p>
                <p className="mt-2 text-xs text-moss">{c.productIds.length} productos · <span className={inPre ? "text-ink" : ""}>{inPre} en preventa</span></p>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const onCells = list.filter(isOn).flatMap((p) => p.cells);
  const totalCupo = onCells.reduce((s, c) => s + (ruleMap.get(c.id)?.max_qty ?? 0), 0);
  const totalSold = onCells.reduce((s, c) => s + (sold?.[c.id] ?? 0), 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button onClick={() => setCollectionId("")} className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-4 py-2 text-xs"><ArrowLeft className="h-3.5 w-3.5" /> Cambiar colección</button>
        <p className="font-serif text-2xl">{activeCol.title}</p>
        <select value={loc} onChange={(e) => setLocationId(e.target.value)} className="ml-auto rounded-full border border-ink/10 bg-white px-4 py-2 text-sm">
          {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-moss/50" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar en la colección…" className="w-full rounded-full border border-ink/10 bg-white py-2 pl-9 pr-3 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-xs text-moss">Cupo por defecto
          <input type="number" min={1} value={defaultQty} onChange={(e) => setDefaultQty(Math.max(1, Number(e.target.value) || 1))} className="no-spin w-16 rounded-lg border border-ink/10 px-2 py-1.5 text-right text-sm" />
        </label>
        <button onClick={() => setQty.mutate(list.filter((p) => !isOn(p)).flatMap((p) => p.cells.map((c) => ({ variantId: c.id, qty: defaultQty }))))} className="rounded-full border border-ink/20 px-4 py-2 text-xs">Marcar todos</button>
        <div className="flex items-center gap-1">
          <input type="number" min={0} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder="X" className="no-spin w-16 rounded-lg border border-ink/10 px-2 py-1.5 text-right text-sm" />
          <button disabled={bulk === ""} onClick={() => setQty.mutate(onCells.map((c) => ({ variantId: c.id, qty: Number(bulk) })))} className="rounded-full bg-ink px-4 py-2 text-xs text-ivory disabled:opacity-40">Asignar a marcados</button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white">
        {list.map((p) => {
          const on = isOn(p);
          const total = p.cells.reduce((s, c) => s + (ruleMap.get(c.id)?.max_qty ?? 0), 0);
          return (
            <div key={p.id} className="flex min-w-max items-center gap-4 border-b border-ink/5 px-4 py-3 last:border-0">
              <input type="checkbox" checked={on} onChange={() => toggle(p)} disabled={!p.cells.length} className="h-4 w-4 accent-ink" />
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-cream">{p.hero_image_url && <img src={p.hero_image_url} alt={p.name} className="h-full w-full object-cover" />}</div>
              <div className="w-52 shrink-0">
                <p className="truncate font-serif text-sm">{p.name}</p>
                <p className="font-mono text-[11px] text-ink/60">{p.reference_code ?? "—"}</p>
              </div>
              <div className="flex gap-2">
                {p.cells.map((c) => {
                  const r = ruleMap.get(c.id);
                  const v = sold?.[c.id] ?? 0;
                  const over = !!r && r.max_qty < v;
                  return (
                    <label key={c.id} className="flex w-14 flex-col items-center gap-1">
                      <span className="text-[10px] uppercase tracking-wider text-moss">{c.label}</span>
                      <input
                        key={`${c.id}-${r?.max_qty ?? 0}`}
                        type="number" min={0} defaultValue={r?.max_qty ?? ""} placeholder="0"
                        onBlur={(e) => { const n = Math.max(0, Number(e.target.value) || 0); if (n !== (r?.max_qty ?? 0)) setQty.mutate([{ variantId: c.id, qty: n }]); }}
                        className={"no-spin w-14 rounded-lg border px-1 py-1 text-center text-sm " + (over ? "border-red-400 bg-red-50 text-red-700" : "border-ink/10")}
                      />
                      <span className="h-3 text-[9px] text-moss/70">{v ? `${v} vend.` : ""}</span>
                    </label>
                  );
                })}
                {!p.cells.length && <span className="text-xs text-moss/60">Sin variantes Calidad A</span>}
              </div>
              <div className="ml-auto flex items-center gap-1">
                <input type="number" min={0} value={rowFill[p.id] ?? ""} onChange={(e) => setRowFill({ ...rowFill, [p.id]: e.target.value })} placeholder="Todas" className="no-spin w-16 rounded-lg border border-ink/10 px-2 py-1 text-right text-sm" />
                <button disabled={!rowFill[p.id]} onClick={() => setQty.mutate(p.cells.map((c) => ({ variantId: c.id, qty: Number(rowFill[p.id]) })))} className="rounded-full border border-ink/20 px-3 py-1 text-xs disabled:opacity-40">Aplicar</button>
              </div>
              <p className="w-20 text-right text-sm">Total <span className="font-serif italic">{total}</span></p>
            </div>
          );
        })}
        {!list.length && <p className="px-4 py-8 text-center text-sm text-moss/60">Sin productos en esta colección.</p>}
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        {[["Productos en preventa", list.filter(isOn).length], ["Cupo total", totalCupo], ["Vendido", totalSold], ["Disponible", Math.max(0, totalCupo - totalSold)]].map(([l, v]) => (
          <div key={l as string} className="rounded-2xl border border-ink/10 bg-white p-4">
            <p className="text-[10px] uppercase tracking-widest text-moss/70">{l}</p>
            <p className="mt-1 font-serif text-2xl">{v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
