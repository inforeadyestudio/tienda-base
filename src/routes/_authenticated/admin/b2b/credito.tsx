import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/b2b/portal";

export const Route = createFileRoute("/_authenticated/admin/b2b/credito")({
  head: () => ({ meta: [
    { title: "Ventas a crédito | Tu Marca" },
    { name: "description", content: "Seguimiento de pedidos a crédito, vencimientos y pagos." },
    { property: "og:title", content: "Ventas a crédito | Tu Marca" },
    { property: "og:description", content: "Seguimiento de pedidos a crédito, vencimientos y pagos." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: CreditPage,
});

const METHODS = [
  { id: "transferencia", label: "Transferencia" },
  { id: "efectivo", label: "Efectivo" },
  { id: "tarjeta", label: "Tarjeta" },
  { id: "datafono", label: "Datáfono" },
  { id: "link_pago", label: "Link de pago" },
  { id: "wompi", label: "Wompi" },
  { id: "paypal", label: "PayPal" },
];
const methodLabel = (m: string | null) => METHODS.find((x) => x.id === m)?.label ?? m ?? "";

type Row = {
  id: string; number: string; contact_name: string | null; created_at: string; status: string;
  is_manual: boolean; payment_method: string | null; b2b_payment_method: string | null; payment_status: string | null;
  credit_due_at: string | null; paid_at: string | null; credit_paid_method: string | null;
  currency: string | null; total_cop: number | null; total_usd: number | null;
};

function dueDate(o: Row) {
  if (o.credit_due_at) return new Date(o.credit_due_at);
  const m = String(o.b2b_payment_method ?? o.payment_method ?? "");
  const days = Number(m.replace(/\D/g, "")) || 15;
  return new Date(new Date(o.created_at).getTime() + days * 86400_000);
}
const isPaid = (o: Row) => o.payment_status === "paid";
const amount = (o: Row) => (o.currency === "USD" ? Number(o.total_usd ?? 0) : Number(o.total_cop ?? 0));
const cur = (o: Row) => (o.currency === "USD" ? "USD" : "COP") as "USD" | "COP";

function CreditPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"todos" | "pendiente" | "vencido" | "pagado">("todos");
  const [paying, setPaying] = useState<Row | null>(null);
  const [method, setMethod] = useState("transferencia");
  const [saving, setSaving] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admin-credit-orders"],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders")
        .select("id, number, contact_name, created_at, status, is_manual, payment_method, b2b_payment_method, payment_status, credit_due_at, paid_at, credit_paid_method, currency, total_cop, total_usd:total_usd_exact" as any)
        .or("payment_method.like.credito%,b2b_payment_method.like.credito%")
        .not("status", "in", "(cancelled,refunded)")
        .order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  const now = Date.now();
  const stateOf = (o: Row) => (isPaid(o) ? "pagado" : dueDate(o).getTime() < now ? "vencido" : "pendiente");
  const list = useMemo(() => [...rows].filter((o) => filter === "todos" || stateOf(o) === filter)
    .sort((a, b) => dueDate(a).getTime() - dueDate(b).getTime()), [rows, filter]);

  const sum = (st: string, c: "USD" | "COP") => rows.filter((o) => stateOf(o) === st && cur(o) === c).reduce((s, o) => s + amount(o), 0);
  const totals = (st: string) => [sum(st, "COP") ? formatMoney(sum(st, "COP"), "COP") : null, sum(st, "USD") ? formatMoney(sum(st, "USD"), "USD") : null].filter(Boolean).join(" · ") || "—";
  const count = (st: string) => rows.filter((o) => stateOf(o) === st).length;

  async function confirmPay() {
    if (!paying) return;
    setSaving(true);
    const { error } = await supabase.rpc("mark_credit_order_paid" as any, { _order_id: paying.id, _method: method } as any);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Pedido ${paying.number} marcado como pagado`);
    setPaying(null);
    qc.invalidateQueries({ queryKey: ["admin-credit-orders"] });
    qc.invalidateQueries({ queryKey: ["admin-b2b-orders"] });
  }

  const cards = [
    { key: "pendiente", label: "Por cobrar", tone: "text-ink" },
    { key: "vencido", label: "Vencidos", tone: "text-destructive" },
    { key: "pagado", label: "Pagados", tone: "text-moss" },
  ] as const;

  return (
    <div className="p-6 md:p-10">
      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.2em] text-moss/70">Panel B2B · Cartera</p>
        <h1 className="font-serif text-3xl md:text-4xl text-ink mt-1">Ventas a crédito</h1>
        <p className="text-sm text-ink/60 mt-2">Pedidos B2B y manuales a crédito, con su vencimiento y estado de pago.</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {cards.map((c) => (
          <button key={c.key} onClick={() => setFilter(filter === c.key ? "todos" : c.key)}
            className={`text-left p-5 rounded-3xl bg-white border transition-colors ${filter === c.key ? "border-ink/40" : "border-ink/10 hover:border-ink/25"}`}>
            <div className="text-[11px] uppercase tracking-[0.15em] text-ink/50">{c.label} · {count(c.key)}</div>
            <div className={`text-2xl font-serif mt-3 ${c.tone}`}>{totals(c.key)}</div>
          </button>
        ))}
      </div>

      <div className="flex gap-2 mt-8 mb-3 flex-wrap">
        {(["todos", "pendiente", "vencido", "pagado"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs uppercase tracking-[0.12em] border ${filter === f ? "bg-secondary border-ink/30 text-ink" : "border-ink/10 text-ink/60"}`}>
            {f === "todos" ? "Todos" : f === "pendiente" ? "Por cobrar" : f === "vencido" ? "Vencidos" : "Pagados"}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-ink/10 overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="text-[10px] uppercase tracking-[0.15em] text-ink/50 text-left">
            <tr className="border-b border-ink/10">
              <th className="px-5 py-3">Pedido</th><th className="px-5 py-3">Cliente</th><th className="px-5 py-3">Canal</th>
              <th className="px-5 py-3">Plazo</th><th className="px-5 py-3">Vence</th><th className="px-5 py-3">Estado</th>
              <th className="px-5 py-3 text-right">Total</th><th className="px-5 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((o) => {
              const st = stateOf(o);
              const d = dueDate(o);
              const days = Math.ceil((d.getTime() - now) / 86400_000);
              const plazo = String(o.b2b_payment_method ?? o.payment_method ?? "").replace("credito_", "") + " días";
              return (
                <tr key={o.id} className="border-b border-ink/5 last:border-0">
                  <td className="px-5 py-3 font-medium">
                    {o.is_manual
                      ? <Link to="/admin/pedido/$id" params={{ id: o.id }} className="underline decoration-ink/20">{o.number}</Link>
                      : <Link to="/admin/b2b/pedido/$id" params={{ id: o.id }} className="underline decoration-ink/20">{o.number}</Link>}
                  </td>
                  <td className="px-5 py-3 text-ink/70">{o.contact_name ?? "—"}</td>
                  <td className="px-5 py-3 text-ink/60">{o.is_manual ? "Manual" : "B2B"}</td>
                  <td className="px-5 py-3 text-ink/60">{plazo}</td>
                  <td className="px-5 py-3">{formatDate(d.toISOString())}</td>
                  <td className="px-5 py-3">
                    {st === "pagado" && <span className="text-xs px-2.5 py-1 rounded-full bg-moss/10 text-moss">Pagado{o.credit_paid_method ? ` · ${methodLabel(o.credit_paid_method)}` : ""}{o.paid_at ? ` · ${formatDate(o.paid_at)}` : ""}</span>}
                    {st === "vencido" && <span className="text-xs px-2.5 py-1 rounded-full bg-destructive/10 text-destructive">Vencido hace {Math.abs(days)} {Math.abs(days) === 1 ? "día" : "días"}</span>}
                    {st === "pendiente" && <span className="text-xs px-2.5 py-1 rounded-full bg-ink/5 text-ink/70">{days === 0 ? "Vence hoy" : `Vence en ${days} ${days === 1 ? "día" : "días"}`}</span>}
                  </td>
                  <td className="px-5 py-3 text-right">{formatMoney(amount(o), cur(o))}</td>
                  <td className="px-5 py-3 text-right">
                    {st !== "pagado" && (
                      <button onClick={() => { setPaying(o); setMethod("transferencia"); }}
                        className="text-xs px-3 py-1.5 rounded-full border border-ink/20 hover:bg-secondary">Marcar pagado</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {!list.length && <tr><td colSpan={8} className="px-5 py-8 text-ink/50">{isLoading ? "Cargando…" : "No hay pedidos a crédito en este filtro."}</td></tr>}
          </tbody>
        </table>
      </div>

      {paying && (
        <div className="fixed inset-0 z-[100] bg-ink/30 flex items-center justify-center p-4" onClick={() => !saving && setPaying(null)}>
          <div className="bg-background rounded-3xl p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-serif text-xl text-ink">Registrar pago</h2>
            <p className="text-sm text-ink/60 mt-1">{paying.number} · {paying.contact_name} · {formatMoney(amount(paying), cur(paying))}</p>
            <label className="block text-[11px] uppercase tracking-[0.15em] text-ink/50 mt-5 mb-2">Método de pago</label>
            <div className="grid grid-cols-2 gap-2">
              {METHODS.map((m) => (
                <button key={m.id} onClick={() => setMethod(m.id)}
                  className={`px-3 py-2 rounded-xl text-sm border text-left ${method === m.id ? "bg-secondary border-ink/40" : "border-ink/10"}`}>{m.label}</button>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button onClick={() => setPaying(null)} disabled={saving} className="px-4 py-2 text-sm text-ink/60">Cancelar</button>
              <button onClick={confirmPay} disabled={saving} className="px-4 py-2 rounded-full bg-primary text-primary-foreground text-sm">{saving ? "Guardando…" : "Confirmar pago"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
