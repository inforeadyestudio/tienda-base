import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { History, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { sendRCountAdjustment, resendRCountAdjustment } from "@/lib/rcount.functions";

type Loc = { id: string; name: string };
type Line = { id: string; sku: string; label: string; qty: string; img?: string | null; group?: string };
type VariantRow = {
  id: string; sku: string; size: string | null; color: string | null; product_id: string;
  products: { name: string; hero_image_url: string | null } | null;
};

/** Ajuste de inventario: entradas o salidas que quedan en el kardex de cada producto. */
export function InventoryAdjustModal({ locations, onClose, initial, prefix = "Ajuste inventario", onDone }: {
  locations: Loc[]; onClose: () => void;
  initial?: { dir?: "in" | "out"; locationId?: string; note?: string; lines?: Line[] };
  prefix?: string; onDone?: () => void;
}) {
  const qc = useQueryClient();
  const [dir, setDir] = useState<"in" | "out">(initial?.dir ?? "in");
  const [locationId, setLocationId] = useState(initial?.locationId ?? locations[0]?.id ?? "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [q, setQ] = useState("");
  const [listOpen, setListOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>(initial?.lines ?? []);
  const [saving, setSaving] = useState(false);
  const sendRCount = useServerFn(sendRCountAdjustment);
  const [showHistory, setShowHistory] = useState(false);
  const resendFn = useServerFn(resendRCountAdjustment);
  const { data: rcLogs, refetch: refetchRc } = useQuery({
    queryKey: ["rcount-adjust-log"],
    enabled: showHistory,
    queryFn: async () => ((await (supabase as any).from("rcount_adjustment_log").select("id, external_id, status, message, created_at, request").order("created_at", { ascending: false }).limit(20)).data ?? []) as any[],
  });
  const resend = async (id: string) => {
    try { const r = await resendFn({ data: { logId: id } }); r.ok ? toast.success(r.message) : toast.error(r.message, { duration: 12000 }); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
    refetchRc();
  };
  const [actorF, setActorF] = useState("");
  const [fromF, setFromF] = useState("");
  const [toF, setToF] = useState("");
  const searchRef = useRef<HTMLDivElement>(null);
  const locIds = locations.map((l) => l.id);
  const { data: historyData, isFetching: loadingHistory } = useQuery({
    queryKey: ["adjust-history", locIds.join(",")],
    enabled: showHistory && locIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("inventory_movements")
        .select("id, qty, note, created_at, location_id, actor_id, product_variants(sku, size, color, products(name))")
        .eq("kind", "adjustment").in("location_id", locIds)
        .order("created_at", { ascending: false }).limit(300);
      const rows = (data ?? []) as any[];
      // Nombres de quien registró cada ajuste.
      const actorIds = [...new Set(rows.map((m) => m.actor_id).filter(Boolean))] as string[];
      const actorMap = new Map<string, string>();
      for (let i = 0; i < actorIds.length; i += 200) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", actorIds.slice(i, i + 200));
        for (const p of profs ?? []) actorMap.set(p.id, (p.full_name ?? "").trim());
      }
      return { rows, actorMap: [...actorMap.entries()] as [string, string][] };
    },
  });
  const history = historyData?.rows ?? [];
  const actorMap = useMemo(() => new Map<string, string>(historyData?.actorMap ?? []), [historyData]);
  const actorName = (id?: string | null) => (id ? actorMap.get(id) ?? "—" : "—");
  const filteredHistory = useMemo(() => {
    const fromTs = fromF ? new Date(fromF + "T00:00:00").getTime() : null;
    const toTs = toF ? new Date(toF + "T23:59:59.999").getTime() : null;
    return history.filter((m) =>
      (!actorF || actorName(m.actor_id) === actorF) &&
      (!fromTs || new Date(m.created_at).getTime() >= fromTs) &&
      (!toTs || new Date(m.created_at).getTime() <= toTs),
    );
  }, [history, actorMap, actorF, fromF, toF]);
  const actorOptions = useMemo(() => {
    const set = new Set<string>();
    for (const m of history) { const n = actorName(m.actor_id); if (n !== "—") set.add(n); }
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [history, actorMap]);
  const locName = (id: string) => locations.find((l) => l.id === id)?.name ?? "";

  const { data: results, isFetching } = useQuery({
    queryKey: ["adjust-search", q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const t = q.trim();
      const { data: prods } = await supabase.from("products").select("id").ilike("name", `%${t}%`).limit(50);
      const ids = (prods ?? []).map((p) => p.id);
      let query = supabase.from("product_variants")
        .select("id, sku, size, color, product_id, products(name, hero_image_url)")
        .eq("active", true).limit(60);
      query = ids.length ? query.or(`sku.ilike.%${t}%,product_id.in.(${ids.join(",")})`) : query.ilike("sku", `%${t}%`);
      return ((await query).data ?? []) as unknown as VariantRow[];
    },
  });

  // Cierra la lista de resultados al hacer clic fuera o con Escape (sin borrar la búsqueda).
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (!searchRef.current?.contains(e.target as Node)) setListOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setListOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, []);

  const selectedIds = useMemo(() => new Set(lines.map((l) => l.id)), [lines]);

  // Stock actual en la bodega elegida para resultados y líneas seleccionadas.
  const stockIds = useMemo(() => [...new Set([...(results ?? []).map((v) => v.id), ...lines.map((l) => l.id)])].sort(), [results, lines]);
  const { data: stockData } = useQuery({
    queryKey: ["adjust-stock", locationId, stockIds.join(",")],
    enabled: !!locationId && stockIds.length > 0,
    queryFn: async () => {
      const m = new Map<string, number>();
      for (let i = 0; i < stockIds.length; i += 200) {
        const { data } = await supabase.from("inventory_levels").select("variant_id, on_hand").eq("location_id", locationId).in("variant_id", stockIds.slice(i, i + 200));
        for (const r of data ?? []) m.set(r.variant_id, r.on_hand ?? 0);
      }
      return m;
    },
  });
  const stockOf = (id: string) => stockData?.get(id) ?? 0;
  const overLines = dir === "out" ? lines.filter((l) => (Number(l.qty) || 0) > stockOf(l.id)) : [];

  // Historial agrupado: mismo usuario, bodega, motivo y minuto = un ajuste.
  const historyGroups = useMemo(() => {
    const map = new Map<string, { key: string; first: any; items: any[]; units: number }>();
    for (const m of filteredHistory) {
      const key = `${m.actor_id}|${m.location_id}|${m.note}|${String(m.created_at).slice(0, 16)}`;
      const g = map.get(key) ?? { key, first: m, items: [], units: 0 };
      g.items.push(m); g.units += m.qty; map.set(key, g);
    }
    return [...map.values()];
  }, [filteredHistory]);
  const histIn = filteredHistory.reduce((s, m) => s + (m.qty > 0 ? m.qty : 0), 0);
  const histOut = filteredHistory.reduce((s, m) => s + (m.qty < 0 ? m.qty : 0), 0);
  const [openGroup, setOpenGroup] = useState<string | null>(null);

  // Resultados agrupados por producto, sin las variantes ya seleccionadas.
  const groups = useMemo(() => {
    const map = new Map<string, { name: string; img: string | null; variants: VariantRow[] }>();
    for (const v of results ?? []) {
      if (selectedIds.has(v.id)) continue;
      const g = map.get(v.product_id) ?? { name: v.products?.name ?? "Producto", img: v.products?.hero_image_url ?? null, variants: [] };
      g.variants.push(v);
      map.set(v.product_id, g);
    }
    return [...map.values()];
  }, [results, selectedIds]);

  const add = (v: VariantRow) => {
    if (selectedIds.has(v.id)) return;
    const name = v.products?.name ?? "";
    setLines((c) => [...c, {
      id: v.id, sku: v.sku,
      label: `${name} · ${[v.color, v.size].filter(Boolean).join(" · ")}`,
      qty: "1", img: v.products?.hero_image_url ?? null,
      group: `${name} · ${v.color ?? ""}`,
    }]);
    // La búsqueda se conserva para seguir agregando tallas de la misma referencia.
  };

  // Agrega de una vez todas las variantes visibles de un producto.
  const addAll = (vs: VariantRow[]) => {
    const fresh = vs.filter((v) => !selectedIds.has(v.id));
    if (!fresh.length) return;
    setLines((c) => [...c, ...fresh.map((v) => {
      const name = v.products?.name ?? "";
      return {
        id: v.id, sku: v.sku,
        label: `${name} · ${[v.color, v.size].filter(Boolean).join(" · ")}`,
        qty: "1", img: v.products?.hero_image_url ?? null,
        group: `${name} · ${v.color ?? ""}`,
      };
    })]);
  };

  // +1 / −1 al lado de la cantidad; al llegar a 0 la línea se quita (y vuelve al buscador).
  const stepQty = (id: string, delta: number) => {
    setLines((c) => c.flatMap((x) => {
      if (x.id !== id) return [x];
      const next = (Number(x.qty) || 0) + delta;
      return next <= 0 ? [] : [{ ...x, qty: String(next) }];
    }));
  };

  // Líneas agrupadas por referencia (producto + color) con subtotal de unidades.
  const lineGroups = useMemo(() => {
    const map = new Map<string, { img: string | null; items: Line[]; units: number }>();
    for (const l of lines) {
      const key = l.group ?? l.label;
      const g = map.get(key) ?? { img: l.img ?? null, items: [], units: 0 };
      g.items.push(l);
      g.units += Number(l.qty) || 0;
      map.set(key, g);
    }
    return [...map.entries()];
  }, [lines]);

  const totalUnits = lines.reduce((s, l) => s + (Number(l.qty) || 0), 0);

  const save = async () => {
    const valid = lines.filter((l) => Number(l.qty) > 0);
    if (!valid.length) return toast.error("Agrega al menos una referencia con cantidad.");
    if (!note.trim()) return toast.error("Escribe el motivo del ajuste.");
    setSaving(true);
    const label = dir === "in" ? "Entrada" : "Salida";
    let ok = 0;
    const sent: { variant_id: string; qty: number }[] = [];
    for (const l of valid) {
      const n = Math.abs(Math.trunc(Number(l.qty)));
      const { error } = await supabase.rpc("adjust_inventory" as never, {
        _location_id: locationId, _variant_id: l.id, _qty: dir === "in" ? n : -n, _kind: "adjustment", _note: `${prefix} · ${label} · ${note.trim()}`,
      } as never);
      if (error) toast.error(`${l.sku}: ${error.message}`);
      else { ok++; sent.push({ variant_id: l.id, qty: dir === "in" ? n : -n }); }
    }
    if (sent.length) {
      try {
        const r = await sendRCount({ data: { kind: "ajuste", reason: `${prefix} · ${label} · ${note.trim()}`, items: sent, location_id: locationId } });
        r.ok ? toast.success(r.message) : toast.error(r.message, { duration: 12000 });
      } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo enviar a R-Count", { duration: 12000 }); }
    }
    setSaving(false);
    if (ok) {
      toast.success(`${ok} ${ok === 1 ? "referencia ajustada" : "referencias ajustadas"} y registradas en el kardex.`);
      qc.invalidateQueries();
      onDone?.();
      onClose();
    }
  };

  const f = "rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-ink/30";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4">
      <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-3xl bg-ivory p-6">
        <div className="mb-5 flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-moss/70">Kardex</p>
            <h2 className="font-serif italic text-2xl">{prefix === "Ajuste inventario" ? "Ajuste de inventario" : prefix}</h2>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setShowHistory((v) => !v)} className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1.5 text-xs hover:bg-ink/5">
              <History className="h-3.5 w-3.5" /> {showHistory ? "Volver al ajuste" : "Historial"}
            </button>
            <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-ink/5" aria-label="Cerrar"><X className="h-4 w-4" /></button>
          </div>
        </div>

        {showHistory ? (
          <div>
          {!!rcLogs?.length && (
            <div className="mb-4 rounded-xl border border-ink/10 p-3">
              <p className="text-xs font-medium mb-2">Envíos a R-Count</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {rcLogs.map((l) => (
                  <div key={l.id} className="flex items-center gap-2 text-[11px]">
                    <span className={l.status === "sent" ? "text-moss" : "text-destructive"}>{l.status === "sent" ? "Enviado" : l.status === "pending" ? "Sin respuesta" : "Error"}</span>
                    <span className="font-mono">{l.external_id}</span>
                    <span className="text-moss/70">{new Date(l.created_at).toLocaleString("es-CO")}</span>
                    <span className="truncate flex-1 text-moss/70" title={l.message ?? ""}>{(l.request?.data?.items ?? []).map((i: any) => `${i.code} ${i.quantity > 0 ? "+" : ""}${i.quantity}`).join(", ")} {l.message ? `· ${l.message}` : ""}</span>
                    <button type="button" onClick={() => resend(l.id)} className="rounded-full border border-ink/15 px-2 py-0.5 hover:bg-ink/5">Reenviar a R-Count</button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <select value={actorF} onChange={(e) => setActorF(e.target.value)} className={f + " text-xs"}>
              <option value="">Todos los usuarios</option>
              {actorOptions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <input type="date" value={fromF} onChange={(e) => setFromF(e.target.value)} title="Desde" className={f + " text-xs"} />
            <input type="date" value={toF} onChange={(e) => setToF(e.target.value)} title="Hasta" className={f + " text-xs"} />
          </div>
          <div className="rounded-2xl border border-ink/10 bg-white">
            {loadingHistory && <div className="px-4 py-6 text-center text-xs text-ink/50">Cargando…</div>}
            {!loadingHistory && !filteredHistory.length && <div className="px-4 py-6 text-center text-xs text-ink/50">Aún no hay ajustes registrados.</div>}
            {!!filteredHistory.length && (
              <div className="flex items-center justify-between border-b border-ink/10 px-4 py-2 text-xs text-ink/60">
                <span>{historyGroups.length} {historyGroups.length === 1 ? "ajuste" : "ajustes"}</span>
                <span><span className="font-medium text-moss">Entradas +{histIn}</span> · <span className="font-medium text-clay">Salidas {histOut}</span></span>
              </div>
            )}
            <div className="divide-y divide-ink/5">
              {historyGroups.map((g) => {
                const m = g.first; const open = openGroup === g.key;
                return (
                <div key={g.key}>
                  <button type="button" onClick={() => setOpenGroup(open ? null : g.key)} className="flex w-full items-start gap-3 px-4 py-2.5 text-left text-sm hover:bg-ink/[0.03]">
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium">{m.note || "Ajuste"}</p>
                      <p className="truncate text-xs text-moss">{new Date(m.created_at).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}{locations.length > 1 ? ` · ${locName(m.location_id)}` : ""} · {g.items.length} {g.items.length === 1 ? "variante" : "variantes"} · {open ? "Ocultar detalle" : "Ver detalle"}</p>
                    </div>
                    <span className="hidden shrink-0 whitespace-nowrap px-2 text-xs text-ink/60 sm:block">Hecho por: {actorName(m.actor_id)}</span>
                    <span className={"shrink-0 font-medium " + (g.units > 0 ? "text-moss" : "text-clay")}>{g.units > 0 ? `+${g.units}` : g.units} u.</span>
                  </button>
                  {open && g.items.map((it) => (
                    <div key={it.id} className="flex items-center gap-3 bg-ink/[0.02] px-4 py-1.5 pl-8 text-xs">
                      <span className="font-mono text-ink/60">{it.product_variants?.sku}</span>
                      <span className="flex-1 truncate">{it.product_variants?.products?.name} {[it.product_variants?.color, it.product_variants?.size].filter(Boolean).join(" · ")}</span>
                      <span className={it.qty > 0 ? "text-moss" : "text-clay"}>{it.qty > 0 ? `+${it.qty}` : it.qty}</span>
                    </div>
                  ))}
                </div>
                );
              })}
            </div>
          </div>
          </div>
        ) : (<>

        <div className="mb-4 flex rounded-full border border-ink/10 bg-white p-1 text-sm">
          {(["in", "out"] as const).map((d) => (
            <button key={d} type="button" onClick={() => setDir(d)} className={"flex-1 rounded-full px-3 py-2 " + (dir === d ? "bg-ink text-ivory" : "text-ink/60")}>
              {d === "in" ? "Entrada (+)" : "Salida (−)"}
            </button>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-xs text-moss">Bodega
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className={f + " mt-1 w-full"}>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <label className="text-xs text-moss">Motivo
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. prenda averiada, sobrante de conteo" className={f + " mt-1 w-full"} />
          </label>
        </div>

        <div className="relative mt-4" ref={searchRef}>
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/40" />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setListOpen(true); }}
            onFocus={() => setListOpen(true)}
            placeholder="Buscar por SKU o nombre de la prenda…"
            className={f + " w-full pl-9"}
          />
          {listOpen && q.trim().length >= 2 && (
            <div className="absolute z-10 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-ink/10 bg-white shadow-lg">
              {isFetching && <div className="px-3 py-2 text-xs text-ink/50">Buscando…</div>}
              {!isFetching && !groups.length && <div className="px-3 py-2 text-xs text-ink/50">Sin resultados</div>}
              {groups.map((g) => (
                <div key={g.name} className="border-b border-ink/5 last:border-0">
                  <div className="flex items-center gap-2 bg-ink/[0.03] px-3 py-1.5">
                    {g.img && <img src={g.img} alt="" className="h-7 w-7 rounded-md object-cover" />}
                    <span className="flex-1 truncate text-xs font-medium uppercase tracking-wide text-ink/70">{g.name}</span>
                    <button type="button" onClick={() => addAll(g.variants)} className="shrink-0 rounded-full border border-moss/40 px-2.5 py-1 text-[11px] text-moss hover:bg-moss/10">
                      Agregar todas ({g.variants.length})
                    </button>
                  </div>
                  {g.variants.map((v) => (
                    <button key={v.id} type="button" onClick={() => add(v)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-ink/5">
                      <Plus className="h-3.5 w-3.5 shrink-0 text-moss" />
                      <span className="font-mono text-xs text-ink/60">{v.sku}</span>
                      <span className="flex-1 truncate">{[v.color, v.size].filter(Boolean).join(" · ")}</span>
                      <span className={"shrink-0 text-xs " + (stockOf(v.id) > 0 ? "text-ink/50" : "text-clay")}>Hay {stockOf(v.id)}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="mt-4 rounded-2xl border border-ink/10 bg-white">
          {!!lines.length && (
            <div className="flex items-center justify-between border-b border-ink/10 px-4 py-2 text-xs text-ink/60">
              <span>{lines.length} {lines.length === 1 ? "variante" : "variantes"}</span>
              <span className="font-medium text-ink">{totalUnits} {totalUnits === 1 ? "unidad" : "unidades"}</span>
            </div>
          )}
          {!lines.length && <div className="px-4 py-6 text-center text-xs text-ink/50">Agrega las referencias a ajustar.</div>}
          {lineGroups.map(([key, g]) => (
            <div key={key} className="border-b border-ink/5 last:border-0">
              <div className="flex items-center gap-2 px-4 pt-2">
                {g.img && <img src={g.img} alt="" className="h-9 w-9 rounded-lg object-cover" />}
                <span className="flex-1 truncate text-xs font-medium uppercase tracking-wide text-ink/70">{key}</span>
                <span className="text-xs text-ink/50">{g.units} {g.units === 1 ? "unidad" : "unidades"}</span>
              </div>
              {g.items.map((l) => {
                const have = stockOf(l.id);
                const over = dir === "out" && (Number(l.qty) || 0) > have;
                return (
                <div key={l.id} className={"flex items-center gap-3 px-4 py-2 pl-14 text-sm " + (over ? "bg-clay/10" : "")}>
                  <span className="font-mono text-xs text-ink/60">{l.sku}</span>
                  <span className="flex-1 truncate">{l.label.split(" · ").slice(-1)[0]}</span>
                  <span className={"shrink-0 text-xs " + (over ? "font-medium text-clay" : "text-ink/50")}>Hay {have}</span>
                  <div className={"flex items-center rounded-lg border " + (over ? "border-clay" : "border-ink/10")}>
                    <button type="button" onClick={() => stepQty(l.id, -1)} className="px-2 py-1 text-ink/60 hover:bg-ink/5" aria-label="Quitar una unidad">−</button>
                    <input value={l.qty} inputMode="numeric" onChange={(e) => setLines((c) => c.map((x) => (x.id === l.id ? { ...x, qty: e.target.value.replace(/\D/g, "") } : x)))} className="w-12 border-x border-ink/10 bg-transparent px-1 py-1 text-center outline-none" />
                    <button type="button" disabled={dir === "out" && (Number(l.qty) || 0) >= have} onClick={() => stepQty(l.id, 1)} className="px-2 py-1 text-ink/60 hover:bg-ink/5 disabled:opacity-30" aria-label="Sumar una unidad">+</button>
                  </div>
                  <button type="button" onClick={() => setLines((c) => c.filter((x) => x.id !== l.id))} className="rounded-full p-1.5 text-ink/50 hover:bg-ink/5" aria-label="Quitar"><Trash2 className="h-4 w-4" /></button>
                </div>
                );
              })}
            </div>
          ))}
        </div>

        {overLines.length > 0 && (
          <p className="mt-3 text-xs text-clay">No hay suficientes unidades en esta bodega para {overLines.length === 1 ? "1 referencia" : `${overLines.length} referencias`}. Ajusta la cantidad para registrar la salida.</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-ink/15 px-5 py-2.5 text-sm">Cancelar</button>
          <button type="button" onClick={save} disabled={saving || overLines.length > 0} className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm text-ivory disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Registrar {dir === "in" ? "entrada" : "salida"}
          </button>
        </div>
        </>)}
      </div>
    </div>
  );
}
