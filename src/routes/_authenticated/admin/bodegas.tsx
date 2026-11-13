import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ClipboardList, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { RCOUNT_CENTERS } from "@/lib/rcount";

type LocationKind = Database["public"]["Enums"]["location_kind"];
type LocationRow = Database["public"]["Tables"]["locations"]["Row"];

export const Route = createFileRoute("/_authenticated/admin/bodegas")({
  component: WarehousesPage,
});

export const CHANNELS: { id: string; label: string }[] = [
  { id: "online", label: "Página online" },
  { id: "online_intl", label: "Página internacional" },
  { id: "pos_cali", label: "POS Eventos" },
  { id: "b2b", label: "Página mayoristas" },
];

const KINDS: { id: LocationKind; label: string }[] = [
  { id: "warehouse", label: "Distribución" },
  { id: "store", label: "Tienda física" },
  { id: "ecom", label: "Online" },
  { id: "wholesale", label: "Mayorista" },
  { id: "event", label: "Evento de la marca" },
];

type Draft = {
  id?: string;
  code: string;
  name: string;
  kind: LocationKind;
  city: string;
  priority: number;
  active: boolean;
  channels: string[];
  allow_preventa: boolean;
  lend_to_web: boolean;
  web_safety_stock: number;
  web_schedule: Schedule;
  web_lend_priority: number;
  manager_user_id: string;
  sole_transfer_origin: boolean;
  b2b_auto_packing: boolean;
  b2b_preliminary_max_days: number;
  ecom_restock_min: number;
  allow_international: boolean;
  rcount_center: string;
};

type DayRule = { blocked: boolean; from?: string; to?: string; block_from?: string; block_to?: string };
type Schedule = Record<string, DayRule>;
const DAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const defaultSchedule = (): Schedule =>
  Object.fromEntries(
    [0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), d === 0 || d >= 5 ? { blocked: true } : { blocked: false, from: "00:00", to: "23:59" }]),
  );

const emptyDraft: Draft = {
  code: "",
  name: "",
  kind: "warehouse",
  city: "",
  priority: 1,
  active: true,
  channels: [],
  allow_preventa: false,
  lend_to_web: false,
  web_safety_stock: 2,
  web_schedule: defaultSchedule(),
  web_lend_priority: 0,
  manager_user_id: "",
  sole_transfer_origin: false,
  b2b_auto_packing: false,
  b2b_preliminary_max_days: 15,
  ecom_restock_min: 0,
  allow_international: true,
  rcount_center: "",
};

function WarehousesPage() {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);

  const { data: locations } = useQuery({
    queryKey: ["admin-locations"],
    queryFn: async () => {
      const { data, error } = await supabase.from("locations").select("*").order("priority", { ascending: false });
      if (error) throw error;
      return (data ?? []) as LocationRow[];
    },
  });

  const { data: staff } = useQuery({
    queryKey: ["staff-profiles"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id, role");
      const ids = [...new Set((roles ?? []).filter((r: any) => r.role !== "b2b").map((r: any) => r.user_id))];
      if (!ids.length) return [];
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", ids);
      return (data ?? []) as { id: string; full_name: string | null }[];
    },
  });

  const save = useMutation({
    mutationFn: async (d: Draft) => {
      const row = {
        code: d.code.trim(),
        name: d.name.trim(),
        kind: d.kind,
        city: d.city.trim() || null,
        priority: d.priority,
        active: d.active,
        channels: d.channels,
        allow_preventa: d.allow_preventa,
        lend_to_web: d.lend_to_web,
        web_safety_stock: Math.max(0, Math.floor(d.web_safety_stock || 0)),
        web_schedule: d.web_schedule,
        web_lend_priority: d.web_lend_priority,
        manager_user_id: d.manager_user_id || null,
        sole_transfer_origin: d.sole_transfer_origin,
        b2b_auto_packing: d.b2b_auto_packing,
        b2b_preliminary_max_days: Math.max(1, Math.floor(d.b2b_preliminary_max_days || 15)),
        ecom_restock_min: Math.max(0, Math.floor(d.ecom_restock_min || 0)),
        allow_international: d.allow_international,
        rcount_center: d.rcount_center || null,
      } as any;
      if (d.kind === "ecom") {
        row.channels = d.allow_international
          ? [...new Set([...d.channels, "online_intl"])]
          : d.channels.filter((c) => c !== "online_intl");
      }
      if (!row.code || !row.name) throw new Error("Nombre y código son obligatorios");
      const { error } = d.id
        ? await supabase.from("locations").update(row).eq("id", d.id)
        : await supabase.from("locations").insert(row);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Bodega guardada");
      setDraft(null);
      qc.invalidateQueries({ queryKey: ["admin-locations"] });
      qc.invalidateQueries({ queryKey: ["locations"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  return (
    <div className="p-6 md:p-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-moss/70">Operación</p>
          <h1 className="mt-1 font-serif text-4xl italic">Bodegas</h1>
          <p className="mt-2 max-w-xl text-sm text-moss">
            Cada bodega se asocia a uno o varios canales de venta. Al facturar, el stock se descuenta únicamente de las
            bodegas del canal correspondiente. Bodega Central no vende: solo recibe de R Wear y distribuye.
          </p>
        </div>
        <button
          onClick={() => setDraft({ ...emptyDraft })}
          className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm text-ivory"
        >
          <Plus className="h-4 w-4" /> Nueva bodega
        </button>
      </header>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(locations ?? []).map((l) => (
          <button
            key={l.id}
            onClick={() =>
              setDraft({
                id: l.id,
                code: l.code,
                name: l.name,
                kind: l.kind,
                city: l.city ?? "",
                priority: l.priority,
                active: l.active,
                channels: (l as LocationRow & { channels: string[] }).channels ?? [],
                allow_preventa: (l as LocationRow & { allow_preventa: boolean }).allow_preventa ?? false,
                lend_to_web: (l as any).lend_to_web ?? false,
                web_safety_stock: (l as any).web_safety_stock ?? 2,
                web_schedule: { ...defaultSchedule(), ...(((l as any).web_schedule as Schedule) ?? {}) },
                web_lend_priority: (l as any).web_lend_priority ?? 0,
                manager_user_id: (l as any).manager_user_id ?? "",
                sole_transfer_origin: (l as any).sole_transfer_origin ?? false,
                b2b_auto_packing: (l as any).b2b_auto_packing ?? false,
                b2b_preliminary_max_days: (l as any).b2b_preliminary_max_days ?? 15,
                ecom_restock_min: (l as any).ecom_restock_min ?? 0,
                allow_international: (l as any).allow_international ?? true,
                rcount_center: (l as any).rcount_center ?? "",
              })
            }
            className="rounded-2xl border border-ink/10 bg-white p-5 text-left transition-colors hover:border-ink/30"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-serif text-xl">{l.name}</h2>
                <p className="font-mono text-[11px] uppercase tracking-widest text-moss/60">{l.code}</p>
              </div>
              <span className={"rounded-full px-2.5 py-1 text-[10px] uppercase tracking-widest " + (l.active ? "bg-moss/10 text-moss" : "bg-ink/5 text-ink/40")}>
                {l.active ? "Activa" : "Inactiva"}
              </span>
            </div>
            <p className="mt-3 text-xs text-moss">{KINDS.find((k) => k.id === l.kind)?.label ?? l.kind}{l.city ? ` · ${l.city}` : ""}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {(((l as LocationRow & { channels: string[] }).channels) ?? []).map((c) => (
                <span key={c} className="rounded-full border border-ink/10 px-2.5 py-1 text-[10px] uppercase tracking-widest text-ink/60">
                  {CHANNELS.find((x) => x.id === c)?.label ?? c}
                </span>
              ))}
              {!(((l as LocationRow & { channels: string[] }).channels) ?? []).length && (
                <span className="text-[10px] uppercase tracking-widest text-moss/50">Solo distribución</span>
              )}
            </div>
            {(l as LocationRow & { allow_preventa: boolean }).allow_preventa && (
              <p className="mt-3 text-[10px] uppercase tracking-widest text-clay">Preventa habilitada</p>
            )}
            {(l as any).lend_to_web && (
              <p className="mt-2 text-[10px] uppercase tracking-widest text-moss">
                Presta a la web · margen {(l as any).web_safety_stock}
              </p>
            )}
          </button>
        ))}
      </div>

      {draft && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-4" onMouseDown={() => setDraft(null)}>
          <div onMouseDown={(e) => e.stopPropagation()} className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-5 flex items-start justify-between">
              <h2 className="font-serif text-2xl italic">{draft.id ? "Editar bodega" : "Nueva bodega"}</h2>
              <button onClick={() => setDraft(null)} className="rounded-full p-2 hover:bg-ink/5" aria-label="Cerrar">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 text-sm">
              <Field label="Nombre">
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={inputCls} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Código">
                  <input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Ciudad">
                  <input value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} className={inputCls} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Tipo">
                  <select value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as LocationKind })} className={inputCls}>
                    {KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
                  </select>
                </Field>
                <Field label="Prioridad">
                  <input type="number" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) })} className={inputCls} />
                </Field>
              </div>

              <Field label="Canales de venta">
                <div className="flex flex-wrap gap-2">
                  {CHANNELS.map((c) => {
                    const on = draft.channels.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            channels: on ? draft.channels.filter((x) => x !== c.id) : [...draft.channels, c.id],
                          })
                        }
                        className={"rounded-full border px-3 py-1.5 text-xs " + (on ? "border-ink bg-ink text-ivory" : "border-ink/15 text-ink/60")}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="Centro de operación en R-Count">
                <select value={draft.rcount_center} onChange={(e) => setDraft({ ...draft, rcount_center: e.target.value })} className={inputCls}>
                  <option value="">Según el canal de venta (por defecto)</option>
                  {RCOUNT_CENTERS.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.label}</option>)}
                </select>
                <p className="mt-1 text-xs text-moss">
                  Las ventas que salen de esta bodega se facturan con la resolución de este centro en R-Count Colombia.
                  Si lo dejas sin elegir, se usa el centro del canal (tienda online, POS o B2B).
                </p>
              </Field>

              <Field label="Responsable / auditor">
                <select value={draft.manager_user_id} onChange={(e) => setDraft({ ...draft, manager_user_id: e.target.value })} className={inputCls}>
                  <option value="">Sin asignar</option>
                  {(staff ?? []).map((u) => <option key={u.id} value={u.id}>{u.full_name || u.id.slice(0, 8)}</option>)}
                </select>
              </Field>
              {draft.id && draft.kind !== "wholesale" && (
                <Link to="/admin/conteo" search={{ location: draft.id }} className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-xs">
                  <ClipboardList className="h-4 w-4" /> Iniciar toma física
                </Link>
              )}

              {draft.kind === "warehouse" && (
                <Section title="Recepción y despacho">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={draft.sole_transfer_origin} onChange={(e) => setDraft({ ...draft, sole_transfer_origin: e.target.checked })} />
                    Único punto de entrada desde R Wear y origen de traslados
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={draft.b2b_auto_packing} onChange={(e) => setDraft({ ...draft, b2b_auto_packing: e.target.checked })} />
                    Generar lista de empaque y guía al despachar B2B
                  </label>
                  <Field label="Días máximos de un pedido B2B en preliminar">
                    <input type="number" min={1} value={draft.b2b_preliminary_max_days} onChange={(e) => setDraft({ ...draft, b2b_preliminary_max_days: Number(e.target.value) })} className={inputCls} />
                  </Field>
                </Section>
              )}

              {draft.kind === "ecom" && (
                <Section title="Reglas de Ecommerce">
                  <Field label="Stock mínimo por talla (reabastecer desde Bodega Central)">
                    <input type="number" min={0} value={draft.ecom_restock_min} onChange={(e) => setDraft({ ...draft, ecom_restock_min: Number(e.target.value) })} className={inputCls} />
                  </Field>
                  <p className="text-xs text-moss">
                    {draft.ecom_restock_min > 0
                      ? `Cuando una talla baje de ${draft.ecom_restock_min} disponibles, se crea una solicitud de traslado desde Bodega Central para aprobar.`
                      : "En 0 no se solicitan traslados automáticos."}
                  </p>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={draft.allow_international} onChange={(e) => setDraft({ ...draft, allow_international: e.target.checked })} />
                    Vender en USD (página internacional) desde esta bodega
                  </label>
                </Section>
              )}

              {draft.kind === "wholesale" && draft.id && (
                <Section title="Mayorista">
                  <Link to="/admin/b2b/preventa" className="text-xs underline">Editar cupos por talla en la parrilla de preventa →</Link>
                </Section>
              )}

              <label className="flex items-center gap-2">
                <input type="checkbox" checked={draft.allow_preventa} onChange={(e) => setDraft({ ...draft, allow_preventa: e.target.checked })} />
                Permitir preventa (vender sobre cupo antes de recibir mercancía)
              </label>
              {draft.kind === "store" && (
                <div className="rounded-xl border border-ink/10 bg-ivory/50 p-4 space-y-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-moss/70">Reglas omnicanal</p>
                    <p className="mt-1 text-xs text-moss">
                      Si una talla se agota en Ecommerce, la web puede venderla desde esta tienda. La tienda recibe el aviso en Despachos.
                    </p>
                  </div>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={draft.lend_to_web} onChange={(e) => setDraft({ ...draft, lend_to_web: e.target.checked })} />
                    Prestar inventario a la web cuando se agote en Ecommerce
                  </label>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Margen de seguridad (unidades)">
                      <input type="number" min={0} value={draft.web_safety_stock} onChange={(e) => setDraft({ ...draft, web_safety_stock: Number(e.target.value) })} className={inputCls} />
                    </Field>
                    <Field label="Prioridad entre tiendas">
                      <input type="number" value={draft.web_lend_priority} onChange={(e) => setDraft({ ...draft, web_lend_priority: Number(e.target.value) })} className={inputCls} />
                    </Field>
                  </div>
                  <p className="text-xs text-moss">
                    Con margen {draft.web_safety_stock}, esta tienda solo ofrece una talla a la web si tiene {draft.web_safety_stock + 1} o más unidades,
                    y presta solo lo que pase de {draft.web_safety_stock}. Las demás unidades quedan para la venta en tienda.
                  </p>
                  <Field label="Horario en que comparte con la web">
                    <div className="space-y-1.5 overflow-x-auto">
                      {DAY_ORDER.map((d) => {
                        const rule = draft.web_schedule[String(d)] ?? { blocked: false };
                        const set = (patch: Partial<DayRule>) =>
                          setDraft({ ...draft, web_schedule: { ...draft.web_schedule, [String(d)]: { ...rule, ...patch } } });
                        return (
                          <div key={d} className="flex items-center gap-2 text-xs">
                            <span className="w-20">{DAY_LABELS[d]}</span>
                            <button
                              type="button"
                              onClick={() => set({ blocked: !rule.blocked, from: rule.from ?? "00:00", to: rule.to ?? "23:59" })}
                              className={"rounded-full border px-2.5 py-1 " + (rule.blocked ? "border-clay/40 text-clay" : "border-moss/30 text-moss")}
                            >
                              {rule.blocked ? "Bloqueado" : "Comparte"}
                            </button>
                            {!rule.blocked && (
                              <>
                                <input type="time" value={rule.from ?? "00:00"} onChange={(e) => set({ from: e.target.value })} className="rounded-lg border border-ink/10 px-2 py-1" />
                                <span>a</span>
                                <input type="time" value={rule.to ?? "23:59"} onChange={(e) => set({ to: e.target.value })} className="rounded-lg border border-ink/10 px-2 py-1" />
                                <span className="ml-2 text-clay">pausa</span>
                                <input type="time" value={rule.block_from ?? ""} onChange={(e) => set({ block_from: e.target.value })} className="rounded-lg border border-ink/10 px-2 py-1" />
                                <input type="time" value={rule.block_to ?? ""} onChange={(e) => set({ block_to: e.target.value })} className="rounded-lg border border-ink/10 px-2 py-1" />
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </Field>
                </div>
              )}
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
                Bodega activa
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setDraft(null)} className="rounded-full border border-ink/15 px-5 py-2.5 text-sm">Cancelar</button>
              <button disabled={save.isPending} onClick={() => save.mutate(draft)} className="rounded-full bg-ink px-5 py-2.5 text-sm text-ivory disabled:opacity-50">
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm focus:border-ink/30 focus:outline-none";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] uppercase tracking-widest text-moss/70">{label}</p>
      {children}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 rounded-xl border border-ink/10 bg-ivory/50 p-4">
      <p className="text-[10px] uppercase tracking-widest text-moss/70">{title}</p>
      {children}
    </div>
  );
}
