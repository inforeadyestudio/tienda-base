import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Camera, CheckCircle2, ClipboardList, Loader2, Plus, Search, ScanLine, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCOP, formatDate } from "@/lib/format";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { useIsAdmin } from "@/lib/auth-hooks";

export const Route = createFileRoute("/_authenticated/admin/conteo")({
  component: PhysicalCountAdminRoute,
  validateSearch: (s: Record<string, unknown>) => ({ location: typeof s.location === "string" ? s.location : undefined }),
  head: () => ({
    meta: [
      { title: "Conteo físico · Sales Hub" },
      { name: "description", content: "Toma física de inventario por bodega con escáner, comparación en tiempo real y ajuste automático." },
    ],
  }),
});

type SessionRow = {
  id: string;
  location_id: string;
  collection_id: string | null;
  status: string;
  note: string | null;
  created_at: string;
  closed_at: string | null;
  total_counted: number;
  total_missing: number;
  total_surplus: number;
  diff_value_cop: number;
  locations: { name: string } | null;
  collections: { title: string } | null;
};

type LineRow = {
  id: string;
  session_id: string;
  variant_id: string;
  system_qty: number;
  counted_qty: number;
  product_variants: {
    id: string; sku: string; size: string | null; color: string | null; quality: string | null;
    price_cop: number | null; cost_cop: number | null;
    products: { id: string; name: string; reference_code: string | null } | null;
  } | null;
};

function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.12;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.09);
  } catch { /* noop */ }
  try { navigator.vibrate?.(60); } catch { /* noop */ }
}

function PhysicalCountAdminRoute() {
  const { location } = Route.useSearch();
  return <PhysicalCount presetLocation={location} />;
}

/** Conteo físico reutilizable: en el POS se fija a la bodega de la tienda. */
export function PhysicalCount({ presetLocation, lockedLocationId, lockedName }: { presetLocation?: string; lockedLocationId?: string; lockedName?: string }) {
  const [activeId, setActiveId] = useState<string | null>(null);
  if (lockedLocationId) presetLocation = lockedLocationId;
  const [creating, setCreating] = useState(!!presetLocation && !lockedLocationId);

  const { data: sessions, isLoading } = useQuery({
    queryKey: ["count-sessions", lockedLocationId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("count_sessions")
        .select("id, location_id, collection_id, status, note, created_at, closed_at, total_counted, total_missing, total_surplus, diff_value_cop, locations(name), collections(title)")
        .order("created_at", { ascending: false });
      if (lockedLocationId) q = q.eq("location_id", lockedLocationId);
      return ((await q).data ?? []) as unknown as SessionRow[];
    },
  });

  const active = sessions?.find((s) => s.id === activeId) ?? null;

  if (active) {
    return <CountSession session={active} onBack={() => setActiveId(null)} />;
  }

  return (
    <div className="p-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-moss/70">Operación</p>
          <h1 className="font-serif italic text-4xl mt-1">Conteo físico</h1>
          <p className="mt-1 text-xs text-moss">
            {lockedName ? `Toma física de ${lockedName}:` : "Toma física por bodega:"} escanea cada prenda, compara contra el sistema y ajusta con aprobación.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm text-ivory hover:bg-ink/85"
        >
          <Plus className="h-4 w-4" /> Nueva toma física
        </button>
      </header>

      {creating && (
        <NewSessionModal
          presetLocation={presetLocation}
          locked={!!lockedLocationId}
          onClose={() => setCreating(false)}
          onCreated={(id) => { setCreating(false); setActiveId(id); }}
        />
      )}

      <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-widest text-moss/70">
            <tr>
              <th className="px-5 py-3 text-left">Fecha</th>
              <th className="text-left">Bodega</th>
              <th className="text-left">Alcance</th>
              <th className="text-right">Contadas</th>
              <th className="text-right">Faltantes</th>
              <th className="text-right">Sobrantes</th>
              <th className="text-right">Valor diferencia</th>
              <th className="px-5 text-right">Estado</th>
            </tr>
          </thead>
          <tbody>
            {(sessions ?? []).map((s) => (
              <tr
                key={s.id}
                onClick={() => setActiveId(s.id)}
                className="cursor-pointer border-t border-ink/5 hover:bg-cream/50"
              >
                <td className="px-5 py-3 whitespace-nowrap">{formatDate(s.created_at)}</td>
                <td className="py-3">{s.locations?.name ?? "—"}</td>
                <td className="py-3 text-ink/60">{s.collections?.title ?? "Inventario completo"}</td>
                <td className="py-3 text-right">{s.total_counted}</td>
                <td className={"py-3 text-right " + (s.total_missing > 0 ? "text-clay" : "text-ink/40")}>{s.total_missing}</td>
                <td className={"py-3 text-right " + (s.total_surplus > 0 ? "text-blue-600" : "text-ink/40")}>{s.total_surplus}</td>
                <td className="py-3 text-right font-mono text-xs">{s.status === "closed" ? formatCOP(s.diff_value_cop) : "—"}</td>
                <td className="px-5 py-3 text-right">
                  <span className={
                    "rounded-full px-2.5 py-1 text-[10px] uppercase tracking-widest " +
                    (s.status === "open" ? "bg-clay/10 text-clay" : "bg-moss/10 text-moss")
                  }>
                    {s.status === "open" ? "En proceso" : "Cerrada"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!isLoading && (sessions ?? []).length === 0 && (
          <div className="px-6 py-12 text-center text-moss/60">
            <ClipboardList className="mx-auto mb-3 h-8 w-8 opacity-40" />
            Aún no hay tomas físicas. Crea la primera para empezar a contar.
          </div>
        )}
      </div>
    </div>
  );
}

function NewSessionModal({ onClose, onCreated, presetLocation, locked }: { onClose: () => void; onCreated: (id: string) => void; presetLocation?: string; locked?: boolean }) {
  const [locationId, setLocationId] = useState(presetLocation ?? "");
  const [collectionId, setCollectionId] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: locations } = useQuery({
    queryKey: ["locations", "active"],
    queryFn: async () =>
      ((await supabase.from("locations").select("id, name, kind").eq("active", true)).data ?? [])
        .filter((l) => l.kind !== "wholesale"),
  });
  const { data: collections } = useQuery({
    queryKey: ["inv-collections"],
    queryFn: async () => (await supabase.from("collections").select("id, title").order("position")).data ?? [],
  });

  const create = async () => {
    if (!locationId) { toast.error("Elige la bodega a contar"); return; }
    setSaving(true);
    const { data: user } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("count_sessions")
      .insert({
        location_id: locationId,
        collection_id: collectionId || null,
        note: note.trim() || null,
        created_by: user.user?.id ?? null,
      })
      .select("id")
      .single();
    setSaving(false);
    if (error || !data) { toast.error("No se pudo crear la toma física"); return; }
    toast.success("Toma física creada — empieza a escanear");
    onCreated(data.id);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink/40">Conteo físico</div>
            <div className="mt-1 font-serif text-2xl text-ink">Nueva toma física</div>
          </div>
          <button onClick={onClose} className="flex size-9 items-center justify-center rounded-full text-ink/60 hover:bg-ink/5" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>
        <label className="mb-1 block text-[10px] uppercase tracking-widest text-ink/50">Bodega</label>
        <select
          value={locationId}
          disabled={locked}
          onChange={(e) => setLocationId(e.target.value)}
          className="mb-4 w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm focus:border-ink/30 focus:outline-none"
        >
          <option value="">Elegir bodega…</option>
          {(locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
        <label className="mb-1 block text-[10px] uppercase tracking-widest text-ink/50">Alcance</label>
        <select
          value={collectionId}
          onChange={(e) => setCollectionId(e.target.value)}
          className="mb-4 w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm focus:border-ink/30 focus:outline-none"
        >
          <option value="">Inventario completo de la bodega</option>
          {(collections ?? []).map((c) => <option key={c.id} value={c.id}>Solo colección: {c.title}</option>)}
        </select>
        <label className="mb-1 block text-[10px] uppercase tracking-widest text-ink/50">Motivo (opcional)</label>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ej. Toma física periódica de fin de mes"
          className="mb-6 w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm focus:border-ink/30 focus:outline-none"
        />
        <button
          type="button"
          onClick={create}
          disabled={saving}
          className="w-full rounded-full bg-ink py-3 text-sm text-ivory hover:bg-ink/85 disabled:opacity-50"
        >
          {saving ? "Creando…" : "Empezar a contar"}
        </button>
        <p className="mt-3 text-center text-[11px] text-ink/40">
          Mientras la toma está en proceso, el inventario del sistema no se modifica.
        </p>
      </div>
    </div>
  );
}

function CountSession({ session, onBack }: { session: SessionRow; onBack: () => void }) {
  const queryClient = useQueryClient();
  const { data: isAdmin } = useIsAdmin();
  const open = session.status === "open";
  const [query, setQuery] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const { data: lines, refetch } = useQuery({
    queryKey: ["count-lines", session.id],
    queryFn: async () =>
      ((await supabase
        .from("count_session_lines")
        .select("id, session_id, variant_id, system_qty, counted_qty, product_variants(id, sku, size, color, quality, price_cop, cost_cop, products(id, name, reference_code))")
        .eq("session_id", session.id)).data ?? []) as unknown as LineRow[],
  });

  // Variant search for manual entry, scoped to the session's collection
  const { data: searchResults } = useQuery({
    queryKey: ["count-search", session.id, query, session.collection_id],
    enabled: open && query.trim().length >= 2,
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select("id, name, reference_code, collection_products(collection_id), product_variants(id, sku, size, color, quality, active)")
        .or(`name.ilike.%${query.trim()}%,reference_code.ilike.%${query.trim()}%`)
        .limit(6);
      const { data } = await q;
      return (data ?? [])
        .filter((p) => !session.collection_id || (p.collection_products ?? []).some((cp) => cp.collection_id === session.collection_id))
        .map((p) => ({ ...p, product_variants: (p.product_variants ?? []).filter((v) => v.active) }))
        .filter((p) => p.product_variants.length > 0);
    },
  });

  const systemQty = async (variantId: string) => {
    const { data } = await supabase
      .from("inventory_levels")
      .select("on_hand, reserved")
      .eq("variant_id", variantId)
      .eq("location_id", session.location_id)
      .maybeSingle();
    return data ? data.on_hand - data.reserved : 0;
  };

  const addCount = async (variantId: string, delta: number) => {
    if (!open) return;
    const existing = (lines ?? []).find((l) => l.variant_id === variantId);
    if (existing) {
      const next = Math.max(0, existing.counted_qty + delta);
      await supabase.from("count_session_lines").update({ counted_qty: next }).eq("id", existing.id);
    } else {
      const sys = await systemQty(variantId);
      await supabase.from("count_session_lines").insert({
        session_id: session.id,
        variant_id: variantId,
        system_qty: sys,
        counted_qty: Math.max(0, delta),
      });
    }
    refetch();
  };

  const scanCode = async (code: string) => {
    const { data: v } = await supabase
      .from("product_variants")
      .select("id, sku, products(name, collection_products(collection_id))")
      .or(`barcode.eq.${code},sku.eq.${code}`)
      .limit(1)
      .maybeSingle();
    if (!v) { toast.error(`Código no encontrado: ${code}`); return; }
    const prod = v.products as unknown as { name: string; collection_products: { collection_id: string }[] } | null;
    if (session.collection_id && !(prod?.collection_products ?? []).some((cp) => cp.collection_id === session.collection_id)) {
      toast.error(`${prod?.name ?? code} no hace parte del alcance de esta toma`);
      return;
    }
    beep();
    await addCount(v.id, 1);
    toast.success(`+1 · ${prod?.name ?? ""} · ${v.sku}`);
  };

  useBarcodeScanner((code) => { if (open && !cameraOpen && !reviewOpen) void scanCode(code); }, { enabled: open && !cameraOpen && !reviewOpen });

  const grouped = useMemo(() => {
    const map = new Map<string, { name: string; reference: string | null; lines: LineRow[] }>();
    (lines ?? []).forEach((l) => {
      const p = l.product_variants?.products;
      const key = p?.id ?? l.variant_id;
      if (!map.has(key)) map.set(key, { name: p?.name ?? "—", reference: p?.reference_code ?? null, lines: [] });
      map.get(key)!.lines.push(l);
    });
    return Array.from(map.values());
  }, [lines]);

  const totals = useMemo(() => {
    const ls = lines ?? [];
    return {
      counted: ls.reduce((s, l) => s + l.counted_qty, 0),
      missing: ls.reduce((s, l) => s + Math.max(0, l.system_qty - l.counted_qty), 0),
      surplus: ls.reduce((s, l) => s + Math.max(0, l.counted_qty - l.system_qty), 0),
      value: ls.reduce((s, l) => s + (l.counted_qty - l.system_qty) * (l.product_variants?.cost_cop ?? l.product_variants?.price_cop ?? 0), 0),
    };
  }, [lines]);

  const removeLine = async (id: string) => {
    await supabase.from("count_session_lines").delete().eq("id", id);
    refetch();
  };

  return (
    <div className="p-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <button onClick={onBack} className="mb-2 inline-flex items-center gap-1 text-xs text-moss/70 hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" /> Todas las tomas
          </button>
          <h1 className="font-serif italic text-4xl">{session.locations?.name ?? "Conteo"}</h1>
          <p className="mt-1 text-xs text-moss">
            {session.collections?.title ? `Solo colección ${session.collections.title} · ` : "Inventario completo · "}
            {open ? "En proceso — el sistema no cambia mientras cuentas." : `Cerrada el ${session.closed_at ? formatDate(session.closed_at) : "—"}`}
            {session.note ? ` · ${session.note}` : ""}
          </p>
        </div>
        {open && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCameraOpen(true)}
              className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-5 py-2.5 text-sm hover:bg-ink/5"
            >
              <Camera className="h-4 w-4" /> Escanear con cámara
            </button>
            <button
              type="button"
              onClick={() => setReviewOpen(true)}
              className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm text-ivory hover:bg-ink/85"
            >
              <CheckCircle2 className="h-4 w-4" /> Revisar y ajustar
            </button>
          </div>
        )}
      </header>

      {open && (
        <div className="mb-5 rounded-2xl border border-ink/10 bg-white p-4">
          <div className="flex items-center gap-3">
            <ScanLine className="h-4 w-4 shrink-0 text-moss/60" />
            <p className="text-xs text-moss">
              Escanea con la pistola o la cámara: cada lectura suma <strong>+1</strong> a la referencia y talla exacta. También puedes buscar manualmente:
            </p>
          </div>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-moss/50" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre o referencia…"
              className="w-full rounded-full border border-ink/10 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-ink/30 focus:outline-none"
            />
          </div>
          {query.trim().length >= 2 && (
            <div className="mt-2 space-y-2">
              {(searchResults ?? []).map((p) => (
                <div key={p.id} className="rounded-xl border border-ink/10 px-4 py-3">
                  <div className="mb-2 flex items-baseline gap-2">
                    <span className="text-sm">{p.name}</span>
                    <span className="font-mono text-[11px] text-ink/50">{p.reference_code ?? ""}</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {p.product_variants.map((v) => {
                      const counted = (lines ?? []).find((l) => l.variant_id === v.id)?.counted_qty ?? 0;
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => { void addCount(v.id, 1); beep(); }}
                          className="rounded-full border border-ink/15 px-3 py-1.5 text-xs hover:bg-ink hover:text-ivory"
                        >
                          {[v.size, v.color].filter(Boolean).join(" · ") || v.sku}
                          {counted > 0 && <span className="ml-1.5 rounded-full bg-moss/15 px-1.5 text-moss">{counted}</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {(searchResults ?? []).length === 0 && <p className="px-2 py-1 text-xs text-ink/40">Sin resultados.</p>}
            </div>
          )}
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Unidades contadas" value={String(totals.counted)} />
        <StatCard label="Faltantes" value={String(totals.missing)} tone={totals.missing > 0 ? "text-clay" : ""} />
        <StatCard label="Sobrantes" value={String(totals.surplus)} tone={totals.surplus > 0 ? "text-blue-600" : ""} />
        <StatCard label="Valor diferencia" value={formatCOP(totals.value)} tone={totals.value < 0 ? "text-clay" : totals.value > 0 ? "text-blue-600" : ""} />
      </div>

      <div className="space-y-6">
        {grouped.map((g) => (
          <div key={g.name} className="overflow-x-auto rounded-2xl border border-ink/10 bg-white">
            <div className="flex flex-wrap items-baseline gap-3 border-b border-ink/5 px-5 py-4">
              <h2 className="font-serif text-[15px]">{g.name}</h2>
              <span className="font-mono text-[11px] text-ink/50">{g.reference ?? "—"}</span>
            </div>
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-xs uppercase tracking-widest text-moss/70">
                <tr>
                  <th className="px-5 py-3 text-left">Talla</th>
                  <th className="text-left">Color</th>
                  <th className="text-left">SKU</th>
                  <th className="text-right">Stock sistema</th>
                  <th className="text-right">Conteo físico</th>
                  <th className="text-right">Diferencia</th>
                  {open && <th className="px-5"></th>}
                </tr>
              </thead>
              <tbody>
                {g.lines.map((l) => {
                  const v = l.product_variants;
                  const diff = l.counted_qty - l.system_qty;
                  return (
                    <tr key={l.id} className="border-t border-ink/5">
                      <td className="px-5 py-2.5">{v?.size ?? "—"}</td>
                      <td className="py-2.5 text-ink/60">{v?.color ?? "—"}</td>
                      <td className="py-2.5 font-mono text-xs text-ink/50">{v?.sku ?? "—"}</td>
                      <td className="py-2.5 text-right">{l.system_qty}</td>
                      <td className="py-2.5 text-right">
                        {open ? (
                          <span className="inline-flex items-center gap-1">
                            <button type="button" onClick={() => void addCount(l.variant_id, -1)} className="size-6 rounded-full border border-ink/15 text-xs hover:bg-ink/5">−</button>
                            <span className="w-8 text-center font-medium">{l.counted_qty}</span>
                            <button type="button" onClick={() => void addCount(l.variant_id, 1)} className="size-6 rounded-full border border-ink/15 text-xs hover:bg-ink/5">+</button>
                          </span>
                        ) : l.counted_qty}
                      </td>
                      <td className={
                        "py-2.5 text-right font-medium " +
                        (diff === 0 ? "text-moss" : diff > 0 ? "text-blue-600" : "text-clay")
                      }>
                        {diff === 0 ? "0 ✓" : diff > 0 ? `+${diff}` : diff}
                      </td>
                      {open && (
                        <td className="px-5 py-2.5 text-right">
                          <button type="button" onClick={() => void removeLine(l.id)} className="text-ink/30 hover:text-clay" aria-label="Quitar línea">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
        {grouped.length === 0 && (
          <div className="rounded-2xl border border-ink/10 bg-white px-6 py-10 text-center text-moss/60">
            {open ? "Empieza a escanear prendas o búscalas manualmente para armar el conteo." : "Esta toma no tiene líneas registradas."}
          </div>
        )}
      </div>

      {cameraOpen && (
        <CountCameraModal
          onClose={() => setCameraOpen(false)}
          onScan={(code) => void scanCode(code)}
        />
      )}
      {reviewOpen && (
        <ReviewModal
          session={session}
          lines={lines ?? []}
          totals={totals}
          isAdmin={!!isAdmin}
          onClose={() => setReviewOpen(false)}
          onDone={() => {
            setReviewOpen(false);
            queryClient.invalidateQueries({ queryKey: ["count-sessions"] });
            queryClient.invalidateQueries({ queryKey: ["inventory-tree"] });
            onBack();
          }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-white px-5 py-4">
      <div className="text-[10px] uppercase tracking-widest text-ink/40">{label}</div>
      <div className={"mt-1 font-serif text-2xl " + (tone || "text-ink")}>{value}</div>
    </div>
  );
}

function CountCameraModal({ onClose, onScan }: { onClose: () => void; onScan: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const lastRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  useEffect(() => {
    let cancelled = false;
    let controls: { stop: () => void } | null = null;
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        if (cancelled || !videoRef.current) return;
        controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } }, audio: false },
          videoRef.current,
          (result) => {
            if (!result || cancelled) return;
            const code = result.getText();
            const now = Date.now();
            // Evita sumar dos veces la misma etiqueta si queda quieta frente a la cámara
            if (lastRef.current.code === code && now - lastRef.current.at < 1500) return;
            lastRef.current = { code, at: now };
            onScan(code);
          },
        );
      } catch {
        if (!cancelled) setError("No se pudo abrir la cámara. Revisa el permiso del navegador.");
      }
    })();
    return () => { cancelled = true; controls?.stop(); };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-ink shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 text-ivory">
          <div className="text-sm">Escaneando para el conteo — cada lectura suma +1</div>
          <button onClick={onClose} className="flex size-9 items-center justify-center rounded-full hover:bg-white/10" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>
        <div className="relative aspect-[4/3] bg-black">
          <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-40 w-64 rounded-2xl border-2 border-ivory/70" />
          </div>
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-ink/80 p-6 text-center text-sm text-ivory">{error}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function ReviewModal({
  session, lines, totals, isAdmin, onClose, onDone,
}: {
  session: SessionRow;
  lines: LineRow[];
  totals: { counted: number; missing: number; surplus: number; value: number };
  isAdmin: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [motivo, setMotivo] = useState("Ajuste por toma física periódica");
  const diffs = lines.filter((l) => l.counted_qty !== l.system_qty);

  const approve = useMutation({
    mutationFn: async () => {
      for (const l of diffs) {
        const diff = l.counted_qty - l.system_qty;
        const { error } = await supabase.rpc("adjust_inventory" as never, {
          _location_id: session.location_id,
          _variant_id: l.variant_id,
          _qty: diff,
          _kind: "count",
          _note: motivo.trim() || "Ajuste por toma física",
        } as never);
        if (error) throw error;
      }
      const { data: user } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("count_sessions")
        .update({
          status: "closed",
          closed_by: user.user?.id ?? null,
          closed_at: new Date().toISOString(),
          total_counted: totals.counted,
          total_missing: totals.missing,
          total_surplus: totals.surplus,
          diff_value_cop: totals.value,
          note: session.note ? `${session.note} · ${motivo}` : motivo,
        })
        .eq("id", session.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Inventario ajustado según el conteo físico");
      onDone();
    },
    onError: () => toast.error("No se pudo aplicar el ajuste"),
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-ink/5 px-6 py-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink/40">Revisión final</div>
            <div className="mt-1 font-serif text-2xl text-ink">Aprobar y ajustar inventario</div>
          </div>
          <button onClick={onClose} className="flex size-9 items-center justify-center rounded-full text-ink/60 hover:bg-ink/5" aria-label="Cerrar">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Contadas" value={String(totals.counted)} />
            <StatCard label="Faltantes" value={String(totals.missing)} tone={totals.missing > 0 ? "text-clay" : ""} />
            <StatCard label="Sobrantes" value={String(totals.surplus)} tone={totals.surplus > 0 ? "text-blue-600" : ""} />
            <StatCard label="Valor diferencia" value={formatCOP(totals.value)} tone={totals.value !== 0 ? "text-clay" : ""} />
          </div>
          {diffs.length > 0 ? (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-widest text-moss/70">
                <tr>
                  <th className="py-2 text-left">Pieza</th>
                  <th className="text-right">Sistema</th>
                  <th className="text-right">Conteo</th>
                  <th className="text-right">Ajuste</th>
                </tr>
              </thead>
              <tbody>
                {diffs.map((l) => {
                  const v = l.product_variants;
                  const diff = l.counted_qty - l.system_qty;
                  return (
                    <tr key={l.id} className="border-t border-ink/5">
                      <td className="py-2.5">
                        {v?.products?.name ?? "—"} · {[v?.size, v?.color].filter(Boolean).join(" · ")}
                        <span className="ml-2 font-mono text-[11px] text-ink/40">{v?.sku}</span>
                      </td>
                      <td className="py-2.5 text-right">{l.system_qty}</td>
                      <td className="py-2.5 text-right">{l.counted_qty}</td>
                      <td className={"py-2.5 text-right font-medium " + (diff > 0 ? "text-blue-600" : "text-clay")}>
                        {diff > 0 ? `+${diff}` : diff}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="rounded-xl bg-moss/10 px-4 py-3 text-sm text-moss">
              El conteo coincide exactamente con el sistema. No se requieren ajustes.
            </p>
          )}
          <label className="mb-1 mt-5 block text-[10px] uppercase tracking-widest text-ink/50">Motivo del ajuste</label>
          <input
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            className="w-full rounded-xl border border-ink/10 bg-white px-4 py-2.5 text-sm focus:border-ink/30 focus:outline-none"
          />
          <p className="mt-3 text-[11px] leading-relaxed text-ink/40">
            Al aprobar se generan movimientos automáticos de entrada/salida en el kardex para que el stock del sistema quede idéntico al conteo. La toma queda cerrada en la bitácora con fecha, responsable y motivo, y no se puede editar.
          </p>
        </div>
        <div className="border-t border-ink/5 px-6 py-4">
          {isAdmin ? (
            <button
              type="button"
              onClick={() => approve.mutate()}
              disabled={approve.isPending}
              className="w-full rounded-full bg-ink py-3 text-sm text-ivory hover:bg-ink/85 disabled:opacity-50"
            >
              {approve.isPending ? (
                <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Aplicando ajustes…</span>
              ) : diffs.length > 0 ? "Aprobar y ajustar inventario" : "Cerrar toma sin ajustes"}
            </button>
          ) : (
            <p className="text-center text-xs text-clay">
              Solo un administrador o jefe de bodega puede aprobar el ajuste final.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
