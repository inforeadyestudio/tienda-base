import { Link } from "@tanstack/react-router";

type MobileOrder = { id: string; number: string; created_at: string; contact_name: string | null; status: string };

export function MobileOrderList({ orders, loading, b2b = false }: { orders: MobileOrder[]; loading: boolean; b2b?: boolean }) {
  return (
    <div className="md:hidden">
      <div className="grid grid-cols-[minmax(0,1fr)_4rem_minmax(0,1.3fr)] gap-3 border-b border-border px-3 py-3 text-[10px] uppercase text-muted-foreground">
        <span>Pedido</span><span>Fecha</span><span>Cliente</span>
      </div>
      {orders.map((order) => (
        <Link key={order.id} to={b2b ? "/admin/b2b/pedido/$id" : "/admin/pedido/$id"} params={{ id: order.id }}
          className="grid grid-cols-[minmax(0,1fr)_4rem_minmax(0,1.3fr)] items-start gap-3 border-b border-border px-3 py-4 text-xs last:border-b-0 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span className={"min-w-0 break-words font-medium text-foreground" + (order.status === "cancelled" ? " line-through" : "")}>{order.number}</span>
          <time dateTime={order.created_at} className="shrink-0 text-muted-foreground">{new Date(order.created_at).toLocaleDateString("es-CO", { day: "2-digit", month: "2-digit", year: "2-digit" })}</time>
          <span className={"min-w-0 break-words text-foreground" + (order.status === "cancelled" ? " line-through" : "")}>{order.contact_name ?? "—"}</span>
        </Link>
      ))}
      {loading && <p className="px-3 py-8 text-center text-sm text-muted-foreground">Cargando pedidos…</p>}
      {!loading && orders.length === 0 && <p className="px-3 py-8 text-center text-sm text-muted-foreground">Sin pedidos que coincidan con la búsqueda.</p>}
    </div>
  );
}
