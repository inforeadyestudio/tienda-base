import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { usePaged } from "@/components/ui/use-paged";
import { useB2BAccounts } from "@/lib/b2b/admin";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/b2b/devoluciones")({
  head: () => ({ meta: [
    { title: "Devoluciones B2B · Tu Marca" },
    { name: "description", content: "Retornos de clientes mayoristas: inspección de calidad en Bodega Central, descargue de consignación y nota crédito." },
    { property: "og:title", content: "Devoluciones B2B · Tu Marca" },
    { property: "og:description", content: "Retornos de clientes mayoristas: inspección de calidad en Bodega Central, descargue de consignación y nota crédito." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: DevolucionesPage,
});

const REASON_LABEL: Record<string, string> = {
  consignment_rotation: "Rotación de consignación",
  damage: "Avería / garantía",
  commercial: "Cambio comercial",
};

function DevolucionesPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: returns } = useQuery({
    queryKey: ["b2b-returns"],
    queryFn: async () => {
      return await fetchAll((from, to) => supabase
        .from("b2b_returns")
        .select("*, orders(number), b2b_return_items(id, qty, condition, product_variants(sku, size, color, products(name, reference_code)))")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to));
    },
  });

  const { pageItems: returnsPage, pager: returnsPager } = usePaged((returns ?? []) as any[]);

  const { data: accounts } = useB2BAccounts();
  const nameOf = (id: string) => accounts?.find((a) => a.userId === id)?.name ?? "Cliente mayorista";

  const receive = async (id: string) => {
    setBusy(id);
    try {
      const { error } = await supabase.rpc("receive_b2b_return" as never, { _return_id: id } as never);
      if (error) throw new Error(error.message);
      toast.success("Devolución recibida en Bodega Central");
      qc.invalidateQueries({ queryKey: ["b2b-returns"] });
      qc.invalidateQueries({ queryKey: ["admin-b2b-inventory"] });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo recibir");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="p-6 md:p-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-moss/70">Operación mayorista</p>
          <h1 className="mt-1 font-serif text-4xl italic">Devoluciones B2B</h1>
          <p className="mt-2 max-w-2xl text-sm text-moss">
            Retornos de clientes mayoristas. Al recibir en Bodega Central, las prendas en Calidad A vuelven al stock disponible y
            las averiadas quedan registradas aparte. La consignación descarga la bodega del cliente; la venta en firme deja
            solicitada la nota crédito.
          </p>
        </div>
        <button onClick={() => setCreating(true)} className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-xs text-ivory">
          <Plus className="size-4" /> Registrar devolución
        </button>
      </header>

      <div className="space-y-4">
        {returnsPage.map((r: any) => {
          const units = (r.b2b_return_items ?? []).reduce((s: number, i: any) => s + i.qty, 0);
          return (
            <div key={r.id} className="rounded-2xl border border-ink/10 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium">{nameOf(r.customer_id)}</p>
                  <p className="text-xs text-moss/70">
                    {r.orders?.number ? `Pedido ${r.orders.number} · ` : ""}{REASON_LABEL[r.reason]} · {units} unidad{units === 1 ? "" : "es"} · {formatDate(r.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={"rounded-full px-2.5 py-1 text-[10px] uppercase tracking-widest " + (r.mode === "consignment" ? "bg-clay/15 text-clay" : "bg-moss/15 text-moss")}>
                    {r.mode === "consignment" ? "Consignación" : "Venta en firme"}
                  </span>
                  <span className={"rounded-full px-2.5 py-1 text-[10px] uppercase tracking-widest " + (r.status === "received" ? "bg-moss/25 text-moss" : "bg-cream text-ink/70")}>
                    {r.status === "received" ? "Recibida" : "Pendiente"}
                  </span>
                  {r.credit_note_status && <span className="rounded-full bg-ink/10 px-2.5 py-1 text-[10px] uppercase tracking-widest text-ink/70">Nota crédito solicitada</span>}
                  {r.status !== "received" && (
                    <button onClick={() => receive(r.id)} disabled={busy === r.id} className="rounded-full bg-ink px-4 py-1.5 text-xs text-ivory disabled:opacity-40">
                      {busy === r.id ? "Recibiendo…" : "Recibir en Bodega Central"}
                    </button>
                  )}
                </div>
              </div>
              <div className="mt-3 grid gap-1 text-xs text-ink/70 sm:grid-cols-2">
                {(r.b2b_return_items ?? []).map((i: any) => (
                  <div key={i.id} className="flex justify-between border-b border-ink/5 py-1">
                    <span>
                      {i.product_variants?.products?.name} · {i.product_variants?.color} {i.product_variants?.size}
                      <span className={"ml-2 " + (i.condition === "damaged" ? "text-clay" : "text-moss")}>{i.condition === "damaged" ? "Avería" : "Calidad A"}</span>
                    </span>
                    <span className="font-medium">{i.qty}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {(returns ?? []).length === 0 && <p className="rounded-2xl border border-ink/10 bg-white px-6 py-10 text-center text-sm text-moss/60">Aún no hay devoluciones registradas.</p>}
        {returnsPager}
      </div>

      {creating && <NewReturnModal onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewReturnModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: accounts } = useB2BAccounts();
  const [customer, setCustomer] = useState("");
  const [orderId, setOrderId] = useState("");
  const [reason, setReason] = useState("consignment_rotation");
  const [note, setNote] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [cond, setCond] = useState<Record<string, "a" | "damaged">>({});
  const [saving, setSaving] = useState(false);

  const { data: orders } = useQuery({
    queryKey: ["b2b-return-orders", customer],
    enabled: !!customer,
    queryFn: async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, number, b2b_mode, created_at, order_items(variant_id, qty, product_variants(sku, size, color, products(name, reference_code)))")
        .eq("customer_id", customer)
        .in("status", ["shipped", "delivered"])
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const order = (orders ?? []).find((o: any) => o.id === orderId);

  const submit = async () => {
    const items = Object.entries(qty).filter(([, q]) => q > 0);
    if (!customer || !items.length) return;
    setSaving(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { data: r, error } = await supabase
        .from("b2b_returns")
        .insert({
          customer_id: customer,
          order_id: orderId || null,
          mode: (order as any)?.b2b_mode === "consignment" ? "consignment" : "direct",
          reason,
          note: note || null,
          created_by: u.user?.id ?? null,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      const { error: iErr } = await supabase.from("b2b_return_items").insert(
        items.map(([variantId, q]) => ({ return_id: r.id, variant_id: variantId, qty: q, condition: cond[variantId] ?? "a" })),
      );
      if (iErr) throw new Error(iErr.message);
      toast.success("Devolución registrada. Queda pendiente de recibir en Bodega Central.");
      qc.invalidateQueries({ queryKey: ["b2b-returns"] });
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo registrar");
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-moss/40";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-xl overflow-auto rounded-t-3xl bg-ivory p-6 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-lg">Registrar devolución</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-ink/5"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3">
          <select className={input + " pr-9"} value={customer} onChange={(e) => { setCustomer(e.target.value); setOrderId(""); setQty({}); }}>
            <option value="">Selecciona el cliente…</option>
            {(accounts ?? []).map((a) => <option key={a.userId} value={a.userId}>{a.name}</option>)}
          </select>
          <select className={input + " pr-9"} value={orderId} onChange={(e) => { setOrderId(e.target.value); setQty({}); }} disabled={!customer}>
            <option value="">Pedido / despacho de origen…</option>
            {(orders ?? []).map((o: any) => (
              <option key={o.id} value={o.id}>{o.number} · {o.b2b_mode === "consignment" ? "Consignación" : "Venta en firme"}</option>
            ))}
          </select>
          <select className={input + " pr-9"} value={reason} onChange={(e) => setReason(e.target.value)}>
            {Object.entries(REASON_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <textarea className={input} rows={2} placeholder="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>

        {order && (
          <div className="mt-4 rounded-xl border border-ink/10 bg-white p-3">
            <p className="mb-2 text-[10px] uppercase tracking-widest text-moss/70">Prendas devueltas</p>
            {((order as any).order_items ?? []).map((i: any) => (
              <div key={i.variant_id} className="flex items-center gap-2 border-b border-ink/5 py-2 text-xs last:border-0">
                <span className="flex-1">
                  {i.product_variants?.products?.name} · {i.product_variants?.color} {i.product_variants?.size}
                  <span className="ml-2 text-moss/60">despachadas {i.qty}</span>
                </span>
                <input
                  type="number" min={0} max={i.qty}
                  value={qty[i.variant_id] ?? ""}
                  onChange={(e) => setQty((q) => ({ ...q, [i.variant_id]: Math.min(i.qty, Math.max(0, Number(e.target.value) || 0)) }))}
                  className="w-16 rounded-lg border border-ink/10 px-2 py-1 text-center"
                />
                <select
                  value={cond[i.variant_id] ?? "a"}
                  onChange={(e) => setCond((c) => ({ ...c, [i.variant_id]: e.target.value as "a" | "damaged" }))}
                  className="rounded-lg border border-ink/10 px-2 py-1"
                >
                  <option value="a">Calidad A</option>
                  <option value="damaged">Avería</option>
                </select>
              </div>
            ))}
          </div>
        )}

        <button onClick={submit} disabled={saving || !customer} className="mt-5 w-full rounded-full bg-ink py-3 text-sm text-ivory disabled:opacity-40">
          {saving ? "Guardando…" : "Registrar devolución"}
        </button>
      </div>
    </div>
  );
}
