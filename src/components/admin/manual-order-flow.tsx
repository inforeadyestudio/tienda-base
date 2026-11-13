import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Order = {
  id: string;
  status: string;
  payment_status: string | null;
  payment_method?: string | null;
  credit_due_at?: string | null;
  created_at?: string;
  stock_confirmed_at: string | null;
  dispatch_location_id: string | null;
  transfer_id: string | null;
  order_items: { id: string }[];
};

const TRANSFER_LABEL: Record<string, string> = {
  requested: "Solicitado", approved: "Pendiente por enviar", in_transit: "En camino", received: "Recibido", cancelled: "Cancelado",
};

/** Progreso del pedido manual: cantidades y pago en cualquier orden, traslado y despacho. */
export function ManualOrderFlow({ order }: { order: Order }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [proof, setProof] = useState<File | null>(null);

  const { data: info } = useQuery({
    queryKey: ["manual-order-flow", order.id, order.transfer_id],
    queryFn: async () => {
      const [{ data: items }, { data: transfers }] = await Promise.all([
        supabase.from("order_items").select("qty, fulfill_location_id, locations:fulfill_location_id(name)").eq("order_id", order.id),
        supabase.from("transfers").select("id, status, from_location_id, from:from_location_id(name), to:to_location_id(name)").eq("order_id" as any, order.id),
      ]);
      const locs = new Map<string, { id: string; name: string; units: number }>();
      (items ?? []).forEach((i: any) => {
        if (!i.fulfill_location_id) return;
        const c = locs.get(i.fulfill_location_id) ?? { id: i.fulfill_location_id, name: i.locations?.name ?? "Bodega", units: 0 };
        c.units += i.qty; locs.set(i.fulfill_location_id, c);
      });
      return { locs: Array.from(locs.values()).sort((a, b) => b.units - a.units), transfers: (transfers ?? []) as any[] };
    },
  });

  const [pick, setPick] = useState<string | null>(null);
  const dispatch = pick ?? order.dispatch_location_id ?? info?.locs[0]?.id ?? null;
  const stockOk = !!order.stock_confirmed_at;
  const paid = order.payment_status === "paid";
  const credit = String(order.payment_method ?? "").startsWith("credito");
  const due = order.credit_due_at ?? (order.created_at ? new Date(new Date(order.created_at).getTime() + 15 * 864e5).toISOString() : null);
  const daysLeft = due ? Math.ceil((new Date(due).getTime() - Date.now()) / 864e5) : null;
  const done = ["shipped", "delivered"].includes(order.status);
  const pending = (info?.transfers ?? []).filter((t) => !["received", "cancelled"].includes(t.status));
  const transferOk = stockOk && pending.length === 0;
  const ready = stockOk && (paid || credit) && transferOk;

  const refresh = () => qc.invalidateQueries();

  const confirmStock = async () => {
    if (!dispatch) return toast.error("Escoge la bodega de despacho");
    setBusy(true);
    const { data, error } = await supabase.rpc("confirm_manual_order_stock" as any, { _order_id: order.id, _dispatch_location_id: dispatch } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    const r = data as any;
    if (r && r.ok === false) {
      const lines = (r.missing ?? []).map((m: any) => `${m.product} ${m.variant ?? ""}: necesita ${m.needed}, hay ${m.available}`).join("\n");
      return toast.error(`No alcanzan las unidades:\n${lines}`, { duration: 10000 });
    }
    toast.success(r?.transfer_id ? "Cantidades confirmadas · traslado creado" : "Cantidades confirmadas");
    refresh();
  };

  const confirmPay = async () => {
    setBusy(true);
    try {
      // Borrador sin separar: al confirmar el pago se apartan las prendas primero
      // para que el pago las saque del inventario en el mismo paso.
      if (!stockOk) {
        if (!dispatch) throw new Error("Escoge la bodega de despacho");
        const { data, error } = await supabase.rpc("confirm_manual_order_stock" as any, { _order_id: order.id, _dispatch_location_id: dispatch } as any);
        if (error) throw error;
        const r = data as any;
        if (r && r.ok === false) {
          const lines = (r.missing ?? []).map((m: any) => `${m.product} ${m.variant ?? ""}: necesita ${m.needed}, hay ${m.available}`).join("\n");
          throw new Error(`No alcanzan las unidades:\n${lines}`);
        }
      }
      let url: string | null = null;
      if (proof) {
        const path = `manual/${crypto.randomUUID()}.${proof.name.split(".").pop() || "jpg"}`;
        const { error: ue } = await supabase.storage.from("payment-receipts").upload(path, proof, { contentType: proof.type || undefined });
        if (ue) throw new Error("No se pudo subir el comprobante");
        const { data: s } = await supabase.storage.from("payment-receipts").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
        url = s?.signedUrl ?? null;
      }
      const { error } = await supabase.rpc("confirm_manual_order_payment" as any, { _order_id: order.id, _proof_url: url } as any);
      if (error) throw error;
      toast.success("Pago confirmado · pedido confirmado");
      refresh();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo confirmar el pago");
    } finally { setBusy(false); }
  };

  const pickup = async () => {
    if (!window.confirm("¿El cliente recogió el pedido en bodega? Quedará como entregado.")) return;
    setBusy(true);
    const { error } = await supabase.rpc("mark_manual_order_pickup" as any, { _order_id: order.id } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Pedido entregado en bodega");
    refresh();
  };

  const Step = ({ done, title, children }: { done: boolean; title: string; children?: React.ReactNode }) => (
    <li className="flex gap-3">
      <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border ${done ? "bg-ink border-ink text-ivory" : "border-ink/25"}`}>
        {done && <Check className="size-3" />}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-ink">{title}</p>
        {children}
      </div>
    </li>
  );

  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] uppercase tracking-widest text-moss/70">Pedido manual</p>
        <span className="text-[10px] uppercase tracking-widest rounded-full bg-ink/5 px-2 py-1">
          {ready ? "Listo para despachar" : !stockOk ? "Borrador · sin separar" : !paid && !credit ? "Borrador · prendas separadas" : pending.length ? "Esperando traslado" : "Cantidades confirmadas"}
        </span>
      </div>
      <ol className="mt-4 space-y-4">
        <Step done={stockOk} title="Cantidades">
          {!stockOk ? (
            <div className="mt-2 space-y-2">
              <p className="text-xs text-moss/75">Bodega de despacho:</p>
              <div className="flex flex-wrap gap-2">
                {(info?.locs ?? []).map((l) => (
                  <button key={l.id} type="button" onClick={() => setPick(l.id)}
                    className={`px-3 py-1 rounded-full border text-xs ${dispatch === l.id ? "bg-ink text-ivory border-ink" : "border-ink/15"}`}>
                    {l.name} · {l.units} u.
                  </button>
                ))}
              </div>
              <button disabled={busy} onClick={confirmStock} className="rounded-full bg-ink px-4 py-2 text-xs uppercase tracking-widest text-ivory disabled:opacity-50">
                Separar prendas del inventario
              </button>
            </div>
          ) : <p className="text-xs text-moss/75">Prendas apartadas.</p>}
        </Step>
        <Step done={paid || credit} title="Pago">
          {!paid && credit && (
            <p className={`mt-1 text-xs ${daysLeft !== null && daysLeft < 0 ? "text-red-600" : daysLeft !== null && daysLeft <= 3 ? "text-amber-700" : "text-moss/75"}`}>
              A crédito · pago pendiente. Cobrar antes del {due ? new Date(due).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "—"}
              {daysLeft !== null && (daysLeft < 0 ? ` (vencido hace ${-daysLeft} días)` : daysLeft === 0 ? " (vence hoy)" : ` (faltan ${daysLeft} días)`)}
            </p>
          )}
          {!paid ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <label className="cursor-pointer rounded-full border border-dashed border-ink/25 px-3 py-1.5 text-xs">
                {proof ? proof.name : "Subir comprobante (opcional)"}
                <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => setProof(e.target.files?.[0] ?? null)} />
              </label>
              <button disabled={busy} onClick={confirmPay} className="rounded-full bg-ink px-4 py-2 text-xs uppercase tracking-widest text-ivory disabled:opacity-50">
                {credit ? "Registrar pago recibido" : "Confirmar pago"}
              </button>
            </div>
          ) : <p className="text-xs text-moss/75">Pago confirmado.</p>}
        </Step>
        <Step done={transferOk} title="Traslado">
          {!stockOk ? <p className="text-xs text-moss/75">Se crea al confirmar cantidades si hay prendas en otra bodega.</p>
            : (info?.transfers ?? []).length === 0 ? <p className="text-xs text-moss/75">No necesita traslado.</p>
            : (
              <ul className="mt-1 space-y-1">
                {(info?.transfers ?? []).map((t) => (
                  <li key={t.id} className="text-xs text-moss">
                    {t.from?.name} → {t.to?.name}: <span className="text-ink">{t.status === "received" ? "Recibido" : `${TRANSFER_LABEL[t.status] ?? t.status} · pendiente por recibir`}</span>{" "}
                    <Link to="/admin/traslados" className="underline">Ver traslados</Link>
                  </li>
                ))}
              </ul>
            )}
        </Step>
        <Step done={done} title="Despacho">
          {done ? (
            <p className="text-xs text-moss/75">{(order as any).picked_up_at ? "Recogido en bodega · entregado." : order.status === "delivered" ? "Entregado." : "Enviado."}</p>
          ) : ready ? (
            <div className="mt-1 space-y-2">
              <p className="text-xs text-moss/75">Genera la guía abajo o, si el cliente recoge, márcalo como entregado.</p>
              <button disabled={busy} onClick={pickup} className="rounded-full border border-ink/20 px-3 py-1 text-[10px] uppercase tracking-wider text-ink disabled:opacity-50">
                Recogido en bodega · entregado
              </button>
            </div>
          ) : <p className="text-xs text-moss/75">{credit ? "Se desbloquea con cantidades y traslado recibido." : "Se desbloquea con cantidades, pago y traslado recibido."}</p>}
        </Step>
      </ol>
    </section>
  );
}
