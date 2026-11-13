import { createFileRoute, Link } from "@tanstack/react-router";
import { Users, ClipboardList, Boxes, MessageSquare } from "lucide-react";
import { useB2BAccounts, useB2BOrders, useWholesaleInventory } from "@/lib/b2b/admin";
import { formatCOP, formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/b2b/portal";
import { TrmBadge } from "@/components/b2b/trm-badge";

export const Route = createFileRoute("/_authenticated/admin/b2b/")({
  component: B2BResumen,
});

function B2BResumen() {
  const { data: accounts } = useB2BAccounts();
  const { data: orders } = useB2BOrders();
  const { data: inv } = useWholesaleInventory();

  // Facturación: pedidos con cantidades confirmadas (excluye borradores y cancelados), por moneda.
  const confirmed = (orders ?? []).filter((o: any) => !["draft", "cancelled", "refunded"].includes(o.status));
  const revenueCOP = confirmed.filter((o: any) => o.currency !== "USD").reduce((s: number, o: any) => s + Number(o.total_cop ?? 0), 0);
  const revenueUSD = confirmed.filter((o: any) => o.currency === "USD").reduce((s: number, o: any) => s + Number(o.total_usd ?? 0), 0);
  const units = (inv?.rows ?? []).reduce((s: number, r: any) => s + (r.on_hand ?? 0), 0);

  const cards = [
    { label: "Cuentas mayoristas", value: String(accounts?.length ?? 0), icon: Users, to: "/admin/b2b/clientes" },
    { label: "Pedidos B2B", value: String(orders?.length ?? 0), icon: ClipboardList, to: "/admin/b2b/pedidos" },
    { label: "Unidades en bodega B2B", value: String(units), icon: Boxes, to: "/admin/b2b/inventario" },
    { label: "Mensajes", value: "0", icon: MessageSquare, to: "/admin/b2b/mensajes" },
  ];

  return (
    <div className="p-6 md:p-10">
      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.2em] text-moss/70">Panel B2B · Mayoristas</p>
        <div className="flex flex-wrap items-center gap-4 mt-1">
          <h1 className="font-serif text-3xl md:text-4xl text-ink">Resumen</h1>
          <TrmBadge />
        </div>
        <p className="text-sm text-ink/60 mt-2">Facturación acumulada: {formatCOP(revenueCOP)}{revenueUSD > 0 && <> · {formatMoney(revenueUSD, "USD")}</>}</p>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c) => (
          <Link
            key={c.label}
            to={c.to as "/admin/b2b"}
            className="p-5 rounded-3xl bg-white border border-ink/10 hover:border-ink/25 transition-colors"
          >
            <c.icon className="size-5 text-ink/50" />
            <div className="text-3xl font-serif text-ink mt-6">{c.value}</div>
            <div className="text-[11px] uppercase tracking-[0.15em] text-ink/50 mt-1">{c.label}</div>
          </Link>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="text-sm uppercase tracking-[0.18em] text-ink/50 mb-3">Últimos pedidos</h2>
        <div className="bg-white rounded-3xl border border-ink/10 overflow-hidden">
          {(orders ?? []).slice(0, 8).map((o: any) => (
            <Link key={o.id} to="/admin/b2b/pedido/$id" params={{ id: o.id }} className={`flex items-center justify-between px-5 py-3 border-b border-ink/5 last:border-0 text-sm hover:bg-ink/[0.02] ${o.status === "cancelled" ? "text-ink/40 line-through decoration-moss/50" : ""}`}>
              <span className="font-medium">{o.number}</span>
              <span className="text-ink/60 truncate flex-1 mx-4">{o.contact_name ?? "—"}</span>
              <span className="text-ink/50 mr-4">{formatDate(o.created_at)}</span>
              <span>{o.currency === "USD" ? formatMoney(Number(o.total_usd ?? 0), "USD") : formatCOP(o.total_cop ?? 0)}</span>
            </Link>
          ))}
          {!orders?.length && <div className="px-5 py-8 text-sm text-ink/50">Aún no hay pedidos mayoristas.</div>}
        </div>
      </section>
    </div>
  );
}
