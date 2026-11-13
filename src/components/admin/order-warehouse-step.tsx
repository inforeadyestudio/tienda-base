import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Warehouse } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SkydropxLabelCard } from "@/components/admin/skydropx-label-card";

const TRANSFER_LABEL: Record<string, string> = {
  requested: "Solicitado", approved: "Pendiente por enviar", in_transit: "En camino", received: "Recibido", cancelled: "Cancelado",
};

type Loc = { id: string; name: string; units: number };

/** Hook: bodegas del pedido, modo elegido, traslados logísticos y guías por bodega. */
export function useOrderWarehouses(orderId: string) {
  return useQuery({
    queryKey: ["order-warehouses", orderId],
    queryFn: async () => {
      const [{ data: items }, { data: order }, { data: transfers }, { data: shipments }] = await Promise.all([
        supabase.from("order_items").select("qty, fulfill_location_id, locations:fulfill_location_id(name)").eq("order_id", orderId),
        supabase.from("orders").select("split_mode, dispatch_location_id, status").eq("id", orderId).maybeSingle(),
        supabase.from("transfers").select("id, status, handoff, from:from_location_id(name)").eq("order_id", orderId).eq("handoff" as any, true),
        (supabase.from as any)("order_shipments").select("location_id, carrier, tracking, label_url").eq("order_id", orderId),
      ]);
      const map = new Map<string, Loc>();
      (items ?? []).forEach((i: any) => {
        if (!i.fulfill_location_id || i.qty <= 0) return;
        const c = map.get(i.fulfill_location_id) ?? { id: i.fulfill_location_id, name: i.locations?.name ?? "Bodega", units: 0 };
        c.units += i.qty; map.set(i.fulfill_location_id, c);
      });
      const locs = Array.from(map.values()).sort((a, b) => b.units - a.units);
      const live = ((transfers ?? []) as any[]).filter((t) => t.status !== "cancelled");
      const ships = (shipments ?? []) as { location_id: string; carrier: string | null; tracking: string | null; label_url: string | null }[];
      const mode = ((order as any)?.split_mode ?? null) as null | "consolidate" | "split";
      const multi = locs.length > 1;
      const done = !multi || (mode === "consolidate" && live.every((t) => t.status === "received"))
        || (mode === "split" && locs.every((l) => ships.some((s) => s.location_id === l.id)));
      return { locs, mode, dispatch: (order as any)?.dispatch_location_id as string | null, transfers: live, ships, multi, done };
    },
  });
}

/** Paso «Bodega»: una bodega despacha con traslados, o cada bodega despacha lo suyo con su propia guía. */
export function OrderWarehouseStep({ orderId, international }: { orderId: string; international?: boolean }) {
  const qc = useQueryClient();
  const { data } = useOrderWarehouses(orderId);
  const [mode, setMode] = useState<"consolidate" | "split" | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, { carrier: string; tracking: string; label: string }>>({});

  if (!data?.multi) return null;
  const locked = data.ships.length > 0 || data.transfers.some((t) => ["in_transit", "received"].includes(t.status));
  const current = mode ?? data.mode;
  const dispatch = pick ?? data.dispatch ?? data.locs[0]?.id;
  const changing = mode !== null && mode !== data.mode || (mode === "consolidate" && pick && pick !== data.dispatch);
  const refresh = () => qc.invalidateQueries();

  const save = async () => {
    if (!current) return;
    setBusy(true);
    const { error } = await (supabase.rpc as any)("set_order_split_mode", { _order_id: orderId, _mode: current, _dispatch_location: current === "consolidate" ? dispatch : null });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(current === "consolidate" ? "Bodega elegida · traslados creados" : "Cada bodega despachará su parte");
    setMode(null); setPick(null); refresh();
  };

  const ship = async (locationId: string) => {
    const f = form[locationId] ?? { carrier: "", tracking: "", label: "" };
    if (!f.carrier.trim() || !f.tracking.trim()) return toast.error("Escribe la transportadora y el número de guía");
    setBusy(true);
    const { data: r, error } = await (supabase.rpc as any)("record_order_shipment", {
      _order_id: orderId, _location_id: locationId, _carrier: f.carrier.trim(), _tracking: f.tracking.trim(), _label_url: f.label.trim() || null,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(r?.done >= r?.total ? "Todas las guías listas · pedido enviado" : `Guía guardada (${r?.done} de ${r?.total})`);
    refresh();
  };

  const name = (id: string | null | undefined) => data.locs.find((l) => l.id === id)?.name ?? "Bodega";
  const summary = data.mode === "consolidate"
    ? `Desde ${name(data.dispatch)}${data.transfers.length ? `, traslado desde ${data.transfers.map((t: any) => `${t.from?.name} (${(TRANSFER_LABEL[t.status] ?? t.status).toLowerCase()})`).join(", ")}` : ""}`
    : data.mode === "split" ? `Cada bodega despacha (${data.ships.length} de ${data.locs.length} guías)` : "Pendiente: escoge cómo sale el pedido";

  const pill = (on: boolean) => `px-3 py-1.5 rounded-full border text-xs ${on ? "bg-ink text-ivory border-ink" : "border-ink/15 bg-white"}`;

  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-5">
      <div className="flex items-center gap-2">
        <Warehouse className="size-4 text-moss" />
        <p className="text-[10px] uppercase tracking-widest text-moss/70">Bodega</p>
        <span className={`ml-auto text-[10px] uppercase tracking-widest rounded-full px-2 py-1 ${data.done ? "bg-ink/5" : "bg-yellow-100"}`}>{data.done ? "Listo" : "Pendiente"}</span>
      </div>
      <p className="mt-2 text-sm text-ink">{summary}</p>
      <p className="mt-1 text-xs text-moss/75">Este pedido tiene prendas en {data.locs.map((l) => `${l.name} (${l.units} u.)`).join(", ")}.</p>

      {!locked && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-2">
            <button type="button" className={pill(current === "consolidate")} onClick={() => setMode("consolidate")}>Una bodega despacha (con traslado)</button>
            <button type="button" className={pill(current === "split")} onClick={() => setMode("split")}>Cada bodega despacha lo suyo</button>
          </div>
          {current === "consolidate" && (
            <div className="space-y-1.5">
              <p className="text-xs text-moss/75">¿Qué bodega despacha al cliente?</p>
              <div className="flex flex-wrap gap-2">
                {data.locs.map((l) => (
                  <button key={l.id} type="button" className={pill(dispatch === l.id)} onClick={() => setPick(l.id)}>{l.name}</button>
                ))}
              </div>
            </div>
          )}
          {current === "split" && <p className="text-xs text-moss/75">Cada bodega genera su guía. El pedido queda enviado cuando todas las bodegas tengan la suya.</p>}
          {current && (!data.mode || changing) && (
            <button disabled={busy} onClick={save} className="rounded-full bg-ink px-4 py-2 text-xs uppercase tracking-widest text-ivory disabled:opacity-50">Guardar</button>
          )}
        </div>
      )}

      {data.mode === "consolidate" && data.transfers.length > 0 && (
        <ul className="mt-3 space-y-1">
          {data.transfers.map((t: any) => (
            <li key={t.id} className="text-xs text-moss">
              {t.from?.name} → {name(data.dispatch)}: <span className="text-ink">{TRANSFER_LABEL[t.status] ?? t.status}</span>{" "}
              <Link to="/admin/traslados" className="underline">Ver traslados</Link>
            </li>
          ))}
        </ul>
      )}

      {data.mode === "split" && (
        <div className="mt-4 space-y-3">
          {data.locs.map((l) => {
            const s = data.ships.find((x) => x.location_id === l.id);
            const f = form[l.id] ?? { carrier: "", tracking: "", label: "" };
            const set = (k: "carrier" | "tracking" | "label", v: string) => setForm((p) => ({ ...p, [l.id]: { ...f, [k]: v } }));
            return (
              <div key={l.id} className="rounded-xl border border-ink/10 p-3">
                <p className="text-xs font-medium text-ink">{l.name} · {l.units} u.</p>
                {s ? (
                  <p className="mt-1 text-xs text-moss">Guía {s.carrier} · {s.tracking}{s.label_url && <> · <a href={s.label_url} target="_blank" rel="noreferrer" className="underline">Etiqueta</a></>}</p>
                ) : (
                  <>
                  {!international && (
                    <div className="mt-2">
                      <SkydropxLabelCard orderId={orderId} locationId={l.id} title={`Guía Skydropx desde ${l.name}`}
                        carrier={null} tracking={null} labelUrl={null} shipmentId={null} onCreated={() => refresh()} />
                      <p className="mt-2 text-[11px] text-moss/70">O escribe una guía hecha por fuera:</p>
                    </div>
                  )}
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <input value={f.carrier} onChange={(e) => set("carrier", e.target.value)} placeholder={international ? "FedEx / DHL" : "Transportadora"} className="rounded-lg border border-ink/15 px-2 py-1.5 text-xs" />
                    <input value={f.tracking} onChange={(e) => set("tracking", e.target.value)} placeholder="Número de guía" className="rounded-lg border border-ink/15 px-2 py-1.5 text-xs" />
                    <input value={f.label} onChange={(e) => set("label", e.target.value)} placeholder="Enlace etiqueta (opcional)" className="rounded-lg border border-ink/15 px-2 py-1.5 text-xs" />
                    <button disabled={busy} onClick={() => ship(l.id)} className="sm:col-span-3 justify-self-start rounded-full bg-ink px-4 py-1.5 text-xs uppercase tracking-widest text-ivory disabled:opacity-50">Guardar guía de {l.name}</button>
                  </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
