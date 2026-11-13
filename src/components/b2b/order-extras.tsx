import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gift } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatUSD } from "@/lib/format";


export const B2B_PAYMENT_METHODS: Record<string, string> = {
  transferencia: "Transferencia",
  credito_15: "Crédito a 15 días",
  credito_30: "Crédito 30 días",
  credito_60: "Crédito 60 días",
  efectivo: "Efectivo",
  link_pago: "Link de pago",
  otro: "Otro",
};

/** Estado de alerta según la fecha estimada de envío. */
export function etaStatus(eta?: string | null, status?: string) {
  if (!eta || ["shipped", "delivered", "cancelled", "refunded"].includes(status ?? "")) return null;
  const days = Math.ceil((new Date(eta + "T12:00:00").getTime() - Date.now()) / 86400000);
  if (days < 0) return { days, label: "Atrasado", tone: "bad" as const };
  if (days <= 3) return { days, label: `Envío en ${days} día${days === 1 ? "" : "s"}`, tone: "bad" as const };
  if (days <= 7) return { days, label: `Envío en ${days} días`, tone: "warn" as const };
  return { days, label: null, tone: "ok" as const };
}

export function EtaBadge({ eta, status }: { eta?: string | null; status?: string }) {
  const s = etaStatus(eta, status);
  if (!s?.label) return null;
  return (
    <span className={"text-[10px] uppercase tracking-[0.12em] px-2.5 py-1 rounded-full " +
      (s.tone === "bad" ? "bg-clay/20 text-clay" : "bg-amber-50 text-amber-700")}>{s.label}</span>
  );
}

export type B2BGoal = { id: string; amount_usd: number; amount_cop: number; reward: string; active: boolean };

export function useB2BGoals() {
  return useQuery({
    queryKey: ["b2b-goals"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "b2b_goals").maybeSingle();
      return (((data as any)?.value?.goals ?? []) as B2BGoal[]);
    },
  });
}

/** Barra de meta: «Agrega X más y ganarás…». */
export function GoalProgress({ total, currency }: { total: number; currency: "USD" | "COP" }) {
  const { data: goals } = useB2BGoals();
  const active = (goals ?? []).filter((g) => g.active)
    .map((g) => ({ ...g, amt: currency === "USD" ? Number(g.amount_usd) || 0 : Number(g.amount_cop) || 0 }))
    .filter((g) => g.amt > 0).sort((a, b) => a.amt - b.amt);
  if (!active.length) return null;
  const next = active.find((g) => g.amt > total);
  const reached = [...active].reverse().find((g) => g.amt <= total);
  const fmt = (n: number) => currency === "USD" ? formatUSD(n, 0) : `$ ${Math.round(n).toLocaleString("es-CO")}`;

  const pct = next ? Math.min(100, (total / next.amt) * 100) : 100;
  return (
    <div className="rounded-2xl border border-moss/20 bg-moss/5 px-4 py-3">
      <p className="flex items-center gap-2 text-xs text-ink">
        <Gift className="size-3.5 text-moss" />
        {next ? <>Agrega <b>{fmt(next.amt - total)}</b> más y ganarás <b>{next.reward}</b></> : <>Meta alcanzada: ganaste <b>{reached?.reward}</b></>}
      </p>
      <div className="mt-2 h-1.5 rounded-full bg-ink/10 overflow-hidden"><div className="h-full bg-moss" style={{ width: `${pct}%` }} /></div>
      {next && reached && <p className="mt-1 text-[11px] text-moss">Ya ganaste: {reached.reward}</p>}
    </div>
  );
}

export function reachedReward(goals: B2BGoal[] | undefined, total: number, currency: "USD" | "COP") {
  return (goals ?? []).filter((g) => g.active)
    .filter((g) => { const a = currency === "USD" ? Number(g.amount_usd) : Number(g.amount_cop); return a > 0 && a <= total; })
    .sort((a, b) => (currency === "USD" ? b.amount_usd - a.amount_usd : b.amount_cop - a.amount_cop))[0]?.reward ?? null;
}

/** Medio de pago, fecha estimada y tipo de venta. Staff edita todo; el cliente solo el medio de pago (readOnlyMeta). */
export function OrderMetaEditor({ order, allowMode = true, readOnlyMeta = false, onSaved }: { order: any; allowMode?: boolean; readOnlyMeta?: boolean; onSaved?: () => void }) {
  const [pay, setPay] = useState(order.b2b_payment_method ?? "");
  const [eta, setEta] = useState(order.b2b_ship_eta ?? "");
  const [mode, setMode] = useState(order.b2b_mode ?? "direct");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setPay(order.b2b_payment_method ?? ""); setEta(order.b2b_ship_eta ?? ""); setMode(order.b2b_mode ?? "direct"); }, [order.b2b_payment_method, order.b2b_ship_eta, order.b2b_mode]);
  const draft = order.status === "draft";
  const dirty = pay !== (order.b2b_payment_method ?? "") || eta !== (order.b2b_ship_eta ?? "") || mode !== (order.b2b_mode ?? "direct");
  const save = async () => {
    setBusy(true);
    const { error } = await (supabase.rpc as any)("update_b2b_order_meta", {
      _order_id: order.id, _payment: pay || null, _eta: eta || null, _mode: draft ? mode : order.b2b_mode,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Pedido actualizado");
    onSaved?.();
  };
  const field = "rounded-full border border-ink/15 bg-white px-3 py-1.5 text-xs";
  const fmtEta = (d?: string | null) => d ? new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" }) : "Por definir";
  if (readOnlyMeta) {
    return (
      <div className="flex flex-wrap items-end gap-3">
        {allowMode && (
          <div className="text-[10px] uppercase tracking-widest text-moss">Tipo de venta
            <p className="mt-1 text-xs text-ink normal-case tracking-normal">{mode === "consignment" ? "Consignación" : "Venta en firme"}</p>
          </div>
        )}
        <label className="text-[10px] uppercase tracking-widest text-moss">Medio de pago
          <select value={pay} onChange={(e) => setPay(e.target.value)} className={field + " mt-1 block normal-case tracking-normal"}>
            <option value="">Sin definir</option>
            {Object.entries(B2B_PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <div className="text-[10px] uppercase tracking-widest text-moss">Fecha estimada de envío
          <p className="mt-1 text-xs text-ink normal-case tracking-normal">{fmtEta(order.b2b_ship_eta)}</p>
        </div>
        <EtaBadge eta={order.b2b_ship_eta} status={order.status} />
        {pay !== (order.b2b_payment_method ?? "") && (
          <button disabled={busy} onClick={save} className="px-4 py-1.5 rounded-full bg-ink text-ivory text-xs disabled:opacity-50">Guardar cambios</button>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-3">
      {allowMode && (
        <label className="text-[10px] uppercase tracking-widest text-moss">Tipo de venta
          <div className="mt-1 flex rounded-full border border-ink/15 p-0.5 normal-case tracking-normal">
            {[["direct", "Venta en firme"], ["consignment", "Consignación"]].map(([v, l]) => (
              <button key={v} type="button" disabled={!draft} onClick={() => setMode(v)}
                className={"px-3 py-1 rounded-full text-xs disabled:opacity-60 " + (mode === v ? "bg-ink text-ivory" : "text-ink/70")}>{l}</button>
            ))}
          </div>
        </label>
      )}
      <label className="text-[10px] uppercase tracking-widest text-moss">Medio de pago
        <select value={pay} onChange={(e) => setPay(e.target.value)} className={field + " mt-1 block normal-case tracking-normal"}>
          <option value="">Sin definir</option>
          {Object.entries(B2B_PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="text-[10px] uppercase tracking-widest text-moss">Fecha estimada de envío
        <input type="date" value={eta} onChange={(e) => setEta(e.target.value)} className={field + " mt-1 block normal-case tracking-normal"} />
      </label>
      <EtaBadge eta={order.b2b_ship_eta} status={order.status} />
      {dirty && <button disabled={busy} onClick={save} className="px-4 py-1.5 rounded-full bg-ink text-ivory text-xs disabled:opacity-50">Guardar cambios</button>}
    </div>
  );
}

const FIELD_LABEL: Record<string, string> = { medio_pago: "Medio de pago", fecha_envio: "Fecha de envío", tipo_venta: "Tipo de venta" };
const VAL = (v: any) => v == null || v === "" ? "—" : v === "direct" ? "Venta en firme" : v === "consignment" ? "Consignación" : (B2B_PAYMENT_METHODS[v] ?? String(v));

/** Historial de cambios en tiempo real. */
export function OrderHistory({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const key = ["b2b-order-events", orderId];
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data } = await (supabase.from as any)("b2b_order_events").select("*").eq("order_id", orderId).order("created_at", { ascending: false }).limit(60);
      return (data ?? []) as any[];
    },
  });
  useEffect(() => {
    const ch = supabase.channel(`b2b-ev-${orderId}`)
      .on("postgres_changes" as any, { event: "INSERT", schema: "public", table: "b2b_order_events", filter: `order_id=eq.${orderId}` }, () => {
        qc.invalidateQueries({ queryKey: key });
        qc.invalidateQueries({ queryKey: ["admin", "order", orderId] });
        qc.invalidateQueries({ queryKey: ["b2b-my-orders"] });
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!data?.length) return <p className="text-xs text-ink/40">Sin cambios registrados todavía.</p>;
  return (
    <ul className="divide-y divide-ink/5">
      {data.map((e) => (
        <li key={e.id} className="py-2 text-xs">
          <div className="flex justify-between gap-3">
            <span><b className="text-ink">{e.actor_name ?? "Usuario"}</b> <span className={"ml-1 px-2 py-0.5 rounded-full text-[10px] " + (e.actor_kind === "client" ? "bg-clay/15 text-clay" : "bg-ink/5 text-moss")}>{e.actor_kind === "client" ? "Cliente" : "Admin"}</span></span>
            <span className="text-ink/40">{new Date(e.created_at).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
          </div>
          <p className="text-moss mt-0.5">
            {e.action === "cantidad"
              ? `${e.diff?.referencia ?? "Referencia"}: ${e.diff?.from} → ${e.diff?.to}`
              : Object.entries(e.diff ?? {}).map(([k, v]: any) => `${FIELD_LABEL[k] ?? k}: ${VAL(v?.from)} → ${VAL(v?.to)}`).join(" · ")}
          </p>
        </li>
      ))}
    </ul>
  );
}
