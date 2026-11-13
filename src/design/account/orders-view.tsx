// Diseño (editable desde Claude). Datos y acciones llegan en `vm`; no calcules precios ni stock aquí.
import { formatDate, formatCOP, formatUSD } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/cuenta/ui";
import { OrderReviewModal } from "@/components/cuenta/order-review-modal";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronRight, Package } from "lucide-react";
import type { OrdersPageVM } from "@/logic/account/use-orders-page";
const STATUS: Record<string, string> = {
  draft: "Pendiente de confirmación", reserved: "Pedido confirmado", paid: "Pago confirmado",
  preparing: "Preparando envío", shipped: "Enviado", delivered: "Entregado",
  cancelled: "Cancelado", refunded: "Reembolsado",
};

function productPhoto(item: any): string | null {
  const product = item.product_variants?.products;
  return product?.hero_image_url || product?.product_images?.[0]?.url || null;
}

function ProductImage({ item, className }: { item: any; className: string }) {
  const photo = productPhoto(item);
  return <div className={`${className} shrink-0 overflow-hidden rounded-sm bg-muted flex items-center justify-center`}>
    {photo ? <img src={photo} alt={item.product_name ?? "Prenda del pedido"} loading="lazy" className="h-full w-full object-cover" /> : <Package aria-label="Sin foto" className="size-5 text-muted-foreground" />}
  </div>;
}

export function OrdersView({ vm }: { vm: OrdersPageVM }) {
  const { user, review, setReview, setSelectedId, orders, isLoading, selected, selectedItems, address, money } = vm;
  return (
    <>
      <PageHeader title="Pedidos" subtitle="El estado y el historial completo de tus compras." />

      {isLoading ? (
        <p className="text-xs text-moss/70">Cargando pedidos…</p>
      ) : (orders?.length ?? 0) === 0 ? (
        <EmptyState title="Aún no tienes pedidos" description="Cuando hagas tu primera compra vas a poder seguirla aquí paso a paso." />
      ) : (
        <ul className="space-y-3">
          {orders?.map((o) => (
            <li key={o.id} className="border-b border-border last:border-0">
              <Button variant="ghost" onClick={() => setSelectedId(o.id)} className="h-auto w-full justify-start gap-4 px-0 py-4 text-left hover:bg-transparent">
                <ProductImage item={o.order_items?.find((it) => productPhoto(it)) ?? o.order_items?.[0]} className="h-16 w-14" />
                <span className="min-w-0 flex-1 whitespace-normal">
                  <span className="block text-sm font-medium">Pedido {o.number}</span>
                  <span className="block text-xs font-normal text-muted-foreground">{formatDate(o.created_at)} · {STATUS[o.status] ?? o.status}</span>
                </span>
                <span className="shrink-0 text-right text-sm font-normal">{o.currency === "USD" && o.total_usd != null
                  ? formatUSD(o.total_usd)
                  : formatCOP(o.total_cop)}
                </span>

                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto bg-background p-5 sm:p-8">
          {selected && <>
            <DialogHeader className="text-left">
              <DialogTitle className="font-nm text-2xl font-normal">Pedido {selected.number}</DialogTitle>
              <DialogDescription>{formatDate(selected.created_at)} · {STATUS[selected.status] ?? selected.status}</DialogDescription>
            </DialogHeader>
            <section className="border-y border-border py-5">
              <h3 className="mb-3 text-xs font-medium uppercase text-muted-foreground">Estado del pedido</h3>
              <p className="text-sm font-medium">{selected.status === "delivered" ? "Entregado" : selected.status === "shipped" || selected.tracking_number ? "Enviado" : ["cancelled", "refunded"].includes(selected.status) ? STATUS[selected.status] : "Pendiente de envío"}</p>
              {selected.tracking_number && <p className="mt-2 text-sm">Guía: <span className="font-medium select-all">{selected.tracking_number}</span></p>}
              {selected.shipping_carrier && <p className="mt-1 text-sm">Transportadora: {selected.shipping_carrier}</p>}
              {selected.b2b_ship_eta && !["shipped", "delivered"].includes(selected.status) && <p className="mt-1 text-sm">Fecha estimada de envío: {formatDate(selected.b2b_ship_eta)}</p>}
            </section>
            <section>
              <h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">Productos · {selectedItems.reduce((sum, item) => sum + item.qty, 0)} {selectedItems.reduce((sum, item) => sum + item.qty, 0) === 1 ? "unidad" : "unidades"}</h3>
              <div className="divide-y divide-border">
                {selectedItems.map((item) => <div key={item.id} className="flex items-center gap-4 py-3">
                  <ProductImage item={item} className="h-20 w-16" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">{item.variant_label || [item.product_variants?.size, item.product_variants?.color].filter(Boolean).join(" · ") || "Prenda"} · Cantidad: {item.qty}</p>
                  </div>
                  <span className="text-sm">{money(item.unit_price_cop * item.qty)}</span>
                </div>)}
              </div>
            </section>
            {address && <section className="border-t border-border pt-4"><h3 className="mb-2 text-xs font-medium uppercase text-muted-foreground">Dirección de entrega</h3><p className="text-sm">{address}</p></section>}
            <section className="space-y-1 border-t border-border pt-4 text-sm">
              {selected.currency !== "USD" && <>
                <div className="flex justify-between"><span>Subtotal</span><span>{formatCOP(selected.subtotal_cop)}</span></div>
                {selected.discount_cop > 0 && <div className="flex justify-between"><span>Descuento</span><span>−{formatCOP(selected.discount_cop)}</span></div>}
                <div className="flex justify-between"><span>Envío</span><span>{formatCOP(selected.shipping_cop)}</span></div>
              </>}
              <div className="flex justify-between pt-2 font-medium"><span>Total</span><span>{selected.currency === "USD" && selected.total_usd != null
                ? formatUSD(selected.total_usd)
                : formatCOP(selected.total_cop)}</span></div>

            </section>
            {["paid", "preparing", "shipped", "delivered"].includes(selected.status) &&
              <Button variant="outline" onClick={() => { setReview({ id: selected.id, number: selected.number }); setSelectedId(null); }} className="justify-self-start">Dejar reseña</Button>}
          </>}
        </DialogContent>
      </Dialog>
      {review && user && (
        <OrderReviewModal orderId={review.id} orderNumber={review.number} userId={user.id} onClose={() => setReview(null)} />
      )}
    </>
  );
}
