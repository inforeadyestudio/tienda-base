import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCOP } from "@/lib/format";
import { toast } from "sonner";
import { InventoryErrorSwapModal } from "@/components/admin/inventory-error-swap-modal";

type Scope =
  | { kind: "global" }
  | { kind: "ecom" }
  | { kind: "location"; locationCode: string; locationId: string | null };

type ReturnRow = {
  id: string;
  order_id: string;
  location_id: string | null;
  source: string;
  kind: "cambio" | "devolucion" | "puntos";
  status: "pendiente" | "en_revision" | "aprobado" | "rechazado" | "cambiado" | "reembolsado" | "completado" | "reembolso_docs";
  items?: { name: string; variant_label: string | null; qty: number; unit_price_cop: number }[] | null;
  desired?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  reason: string;
  notes: string | null;
  refund_cop: number;
  created_at: string;
  resolved_at: string | null;
  orders: { number: string; contact_name: string | null; total_cop: number; source: string } | null;
  locations: { code: string; name: string } | null;
};

const STATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  en_revision: "En revisión",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  cambiado: "Cambiado",
  reembolsado: "Devolución de dinero",
  reembolso_docs: "Dinero · documentos pendientes",
  completado: "Completado",
};

const STATUSES: ReturnRow["status"][] = ["pendiente", "en_revision", "aprobado", "rechazado", "cambiado", "reembolso_docs", "reembolsado", "completado"];

const BOARD: ReturnRow["status"][] = ["pendiente", "en_revision", "aprobado", "cambiado", "reembolso_docs", "reembolsado"];

const CLOSED: ReturnRow["status"][] = ["cambiado", "reembolsado", "rechazado", "completado"];

function todayISO(offset = 0) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

export function ReturnsPanel({ scope, title, subtitle, onNew }: { scope: Scope; title: string; subtitle: string; onNew?: () => void }) {
  const qc = useQueryClient();
  const [from, setFrom] = useState(todayISO(-29));
  const [to, setTo] = useState(todayISO(0));
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [storeFilter, setStoreFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [creating, setCreating] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [showStats, setShowStats] = useState(false);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["returns", scope, from, to],
    queryFn: async () => {
      let q = supabase
        .from("returns")
        .select("id, order_id, location_id, source, kind, status, reason, notes, refund_cop, items, desired, contact_name, contact_phone, created_at, resolved_at, orders(number, contact_name, total_cop, source), locations(code, name)")
        .gte("created_at", `${from}T00:00:00`)
        .lte("created_at", `${to}T23:59:59`)
        .order("created_at", { ascending: false });
      if (scope.kind === "ecom") q = q.eq("source", "ecom");
      if (scope.kind === "location" && scope.locationId) q = q.eq("location_id", scope.locationId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as ReturnRow[];
    },
  });

  const filtered = useMemo(() => {
    if (!rows) return [];
    return rows.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (kindFilter !== "all" && r.kind !== kindFilter) return false;
      if (scope.kind === "global" && storeFilter !== "all") {
        const code = r.locations?.code ?? (r.source === "ecom" ? "ecom" : r.source);
        if (code !== storeFilter) return false;
      }
      return true;
    });
  }, [rows, statusFilter, kindFilter, storeFilter, scope.kind]);

  const kpis = useMemo(() => {
    const total = filtered.length;
    const pending = filtered.filter((r) => r.status === "pendiente").length;
    const cambios = filtered.filter((r) => r.kind === "cambio").length;
    const devoluciones = filtered.filter((r) => r.kind === "devolucion").length;
    const refunded = filtered.filter((r) => r.status === "reembolsado" || r.status === "completado").reduce((s, r) => s + (r.refund_cop ?? 0), 0);
    return { total, pending, cambios, devoluciones, refunded };
  }, [filtered]);

  const byStore = useMemo(() => {
    const map = new Map<string, { count: number; refund: number }>();
    for (const r of filtered) {
      const code = r.locations?.code ?? (r.source === "ecom" ? "ecom" : r.source);
      const cur = map.get(code) ?? { count: 0, refund: 0 };
      cur.count += 1;
      if (r.status === "reembolsado" || r.status === "completado") cur.refund += r.refund_cop ?? 0;
      map.set(code, cur);
    }
    return Array.from(map.entries()).sort((a, b) => b[1].count - a[1].count);
  }, [filtered]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ReturnRow["status"] }) => {
      const patch: { status: ReturnRow["status"]; resolved_at?: string; resolved_by?: string } = { status };
      if (CLOSED.includes(status)) {
        patch.resolved_at = new Date().toISOString();
        const { data: u } = await supabase.auth.getUser();
        if (u.user) patch.resolved_by = u.user.id;
      }
      const { error } = await supabase.from("returns").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["returns"] });
      toast.success("Solicitud actualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-moss/70">{subtitle}</p>
          <h1 className="font-serif italic text-4xl mt-1">{title}</h1>
        </div>
        <div className="flex items-center gap-2">
          {scope.kind !== "location" && (
            <button onClick={() => setSwapping(true)} className="rounded-full border border-ink/15 px-4 py-2 text-sm hover:bg-ink/5">
              Cambio por error de inventario
            </button>
          )}
          <button
            onClick={() => setShowStats(true)}
            className="rounded-full border border-ink/15 text-sm px-5 py-2.5 hover:bg-ink/5"
          >
            Estadísticas
          </button>
          <button
            onClick={() => (onNew ? onNew() : setCreating(true))}
            className="rounded-full bg-ink text-ivory text-sm px-5 py-2.5 hover:bg-ink/90"
          >
            Nueva solicitud
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-end gap-3 mb-6">
        <Field label="Desde"><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-full border border-ink/10 px-4 py-2 text-sm bg-white" /></Field>
        <Field label="Hasta"><input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-full border border-ink/10 px-4 py-2 text-sm bg-white" /></Field>
        <Field label="Estado">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-full border border-ink/10 px-4 py-2 text-sm bg-white">
            <option value="all">Todos</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
          </select>
        </Field>
        <Field label="Tipo">
          <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value)} className="rounded-full border border-ink/10 px-4 py-2 text-sm bg-white">
            <option value="all">Todos</option>
            <option value="cambio">Cambio</option>
            <option value="devolucion">Devolución</option><option value="puntos">Puntos Tu Marca</option>
          </select>
        </Field>
        {scope.kind === "global" && (
          <Field label="Tienda">
            <select value={storeFilter} onChange={(e) => setStoreFilter(e.target.value)} className="rounded-full border border-ink/10 px-4 py-2 text-sm bg-white">
              <option value="all">Todas</option>
              <option value="ecom">Ecommerce</option>
              <option value="cali">POS Eventos</option>
            </select>
          </Field>
        )}
      </div>

      {isLoading && <div className="text-center py-10 text-moss">Cargando…</div>}

      {!isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {BOARD.map((col) => {
            const cards = filtered.filter((r) => r.status === col || (col === "cambiado" && r.status === "completado" && r.kind === "cambio"));
            return (
              <div
                key={col}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  if (id) updateStatus.mutate({ id, status: col });
                }}
                className="rounded-2xl border border-ink/10 bg-white/70 p-3 min-h-[220px]"
              >
                <div className="flex items-center justify-between mb-3 px-1">
                  <span className="text-[10px] uppercase tracking-widest text-moss/70">{STATUS_LABEL[col]}</span>
                  <span className="text-xs text-moss">{cards.length}</span>
                </div>
                <div className="space-y-2">
                  {cards.map((r) => (
                    <article
                      key={r.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", r.id)}
                      className="rounded-xl border border-ink/10 bg-white p-3 cursor-grab active:cursor-grabbing"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px]">{r.orders?.number ?? "—"}</span>
                        <span className="text-[10px] uppercase tracking-widest text-moss/70">{r.kind}</span>
                      </div>
                      <p className="text-sm mt-1 truncate">{r.contact_name ?? r.orders?.contact_name ?? "Cliente"}</p>
                      <p className="text-[11px] text-moss/70 mt-0.5 line-clamp-2">{r.reason}</p>
                      {r.desired && <p className="text-[11px] text-moss mt-1">Quiere: {r.desired}</p>}
                      {Array.isArray(r.items) && r.items.length > 0 && (
                        <ul className="mt-2 space-y-0.5">
                          {r.items.map((it, i) => (
                            <li key={i} className="text-[11px] text-moss/80 truncate">
                              {it.qty} × {it.name}{it.variant_label ? ` · ${it.variant_label}` : ""}
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-[11px] text-moss">{new Date(r.created_at).toLocaleDateString("es-CO")}</span>
                        {r.refund_cop > 0 && <span className="text-xs">{formatCOP(r.refund_cop)}</span>}
                      </div>
                      <select
                        value={r.status}
                        onChange={(e) => updateStatus.mutate({ id: r.id, status: e.target.value as ReturnRow["status"] })}
                        className="mt-2 w-full rounded-full border border-ink/10 px-3 py-1 text-[11px] bg-white"
                      >
                        {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                      </select>
                    </article>
                  ))}
                  {cards.length === 0 && <p className="text-[11px] text-moss/50 px-1">Sin solicitudes</p>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!isLoading && filtered.some((r) => r.status === "rechazado") && (
        <div className="mt-6 rounded-2xl border border-ink/10 bg-white/70 p-4">
          <div className="text-[10px] uppercase tracking-widest text-moss/70 mb-2">Rechazadas</div>
          <ul className="space-y-1 text-sm">
            {filtered.filter((r) => r.status === "rechazado").map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3">
                <span className="truncate">{r.orders?.number ?? "—"} · {r.reason}</span>
                <button onClick={() => updateStatus.mutate({ id: r.id, status: "pendiente" })} className="text-[11px] underline text-moss">Reabrir</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {creating && <NewReturnModal scope={scope} onClose={() => setCreating(false)} />}
      {showStats && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setShowStats(false)} />
          <div className="relative w-full max-w-2xl bg-white rounded-3xl p-6 shadow-2xl">
            <div className="flex items-start justify-between mb-5">
              <div>
                <div className="font-serif italic text-2xl">Estadísticas</div>
                <p className="text-xs text-moss/70 mt-1">Del {from} al {to}</p>
              </div>
              <button onClick={() => setShowStats(false)} className="text-moss/60 hover:text-ink text-xl leading-none px-2">×</button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <Kpi label="Solicitudes" value={kpis.total.toString()} />
              <Kpi label="Pendientes" value={kpis.pending.toString()} />
              <Kpi label="Cambios" value={kpis.cambios.toString()} />
              <Kpi label="Devoluciones" value={kpis.devoluciones.toString()} />
              <Kpi label="Reembolsado" value={formatCOP(kpis.refunded)} />
            </div>
            {scope.kind === "global" && byStore.length > 0 && (
              <div className="mt-5">
                <div className="text-xs uppercase tracking-widest text-moss/70 mb-3">Por tienda</div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {byStore.map(([code, v]) => (
                    <div key={code} className="rounded-xl border border-ink/5 p-4">
                      <div className="text-xs text-moss/70">{code}</div>
                      <div className="text-2xl font-serif mt-1">{v.count}</div>
                      <div className="text-xs text-moss mt-1">Reembolsos {formatCOP(v.refund)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      {swapping && <InventoryErrorSwapModal onClose={() => setSwapping(false)} />}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-widest text-moss/70">{label}</span>
      {children}
    </label>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-ink/10 rounded-2xl p-5">
      <div className="text-xs uppercase tracking-widest text-moss/70">{label}</div>
      <div className="text-3xl font-serif mt-2">{value}</div>
    </div>
  );
}

function NewReturnModal({ scope, onClose }: { scope: Scope; onClose: () => void }) {
  const qc = useQueryClient();
  const [orderNumber, setOrderNumber] = useState("");
  const [kind, setKind] = useState<"cambio" | "devolucion">("cambio");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [refund, setRefund] = useState<number>(0);

  const create = useMutation({
    mutationFn: async () => {
      const { data: order, error: oe } = await supabase
        .from("orders")
        .select("id, source")
        .eq("number", orderNumber.trim())
        .maybeSingle();
      if (oe) throw oe;
      if (!order) throw new Error("Pedido no encontrado");
      let locId: string | null = null;
      if (scope.kind === "location") locId = scope.locationId;
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("returns").insert({
        order_id: order.id,
        location_id: locId,
        source: order.source,
        kind,
        reason,
        notes: notes || null,
        refund_cop: refund,
        created_by: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["returns"] });
      toast.success("Solicitud creada");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-3xl p-6 shadow-2xl">
        <div className="font-serif italic text-2xl mb-5">Nueva solicitud</div>
        <div className="space-y-3">
          <Field label="Número de pedido">
            <input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="TM-WEB-01" className="rounded-full border border-ink/10 px-4 py-2 text-sm bg-white" />
          </Field>
          <Field label="Tipo">
            <select value={kind} onChange={(e) => setKind(e.target.value as "cambio" | "devolucion")} className="rounded-full border border-ink/10 px-4 py-2 text-sm bg-white">
              <option value="cambio">Cambio</option>
              <option value="devolucion">Devolución</option>
            </select>
          </Field>
          <Field label="Motivo">
            <input value={reason} onChange={(e) => setReason(e.target.value)} className="rounded-full border border-ink/10 px-4 py-2 text-sm bg-white" />
          </Field>
          <Field label="Notas">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="rounded-2xl border border-ink/10 px-4 py-2 text-sm bg-white" />
          </Field>
          <Field label="Reembolso COP (si aplica)">
            <input type="number" min={0} value={refund} onChange={(e) => setRefund(Number(e.target.value) || 0)} className="rounded-full border border-ink/10 px-4 py-2 text-sm bg-white" />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="rounded-full px-5 py-2.5 text-sm text-ink/70 hover:bg-ink/5">Cancelar</button>
          <button
            disabled={!orderNumber.trim() || !reason.trim() || create.isPending}
            onClick={() => create.mutate()}
            className="rounded-full bg-ink text-ivory px-5 py-2.5 text-sm hover:bg-ink/90 disabled:opacity-50"
          >
            {create.isPending ? "Guardando…" : "Crear solicitud"}
          </button>
        </div>
      </div>
    </div>
  );
}