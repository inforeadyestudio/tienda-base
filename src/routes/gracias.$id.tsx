import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { Check, Clock, Loader2 } from "lucide-react";
import { track } from "@/lib/analytics";
import { SiteNav } from "@/components/storefront/site-nav";
import { Button } from "@/components/ui/button";
import { formatCOP, formatUSD } from "@/lib/format";
import { orderConfirmation } from "@/lib/checkout/confirmation.functions";
import { paymentsSettingsQuery } from "@/lib/payments";
import { ThankYouOffers } from "@/components/storefront/thankyou-offers";
import { TransferDetails, TransferProofUpload } from "@/components/checkout/transfer-proof";
import { seoHead, SEO_DEFAULT_DESCRIPTION } from "@/lib/seo";

export const Route = createFileRoute("/gracias/$id")({
  head: () => seoHead({ title: "Gracias por tu compra | Tu Marca", description: SEO_DEFAULT_DESCRIPTION, path: "/gracias", noindex: true }),
  component: ThankYouPage,
});

function ThankYouPage() {
  const { id } = Route.useParams();
  const fetchOrder = useServerFn(orderConfirmation);
  const { data: order, isLoading, error } = useQuery({
    queryKey: ["order-confirmation", id],
    queryFn: () => fetchOrder({ data: { id } }),
    retry: false,
  });
  const { data: payments } = useQuery(paymentsSettingsQuery());

  const money = (cop: number) =>
    order?.currency === "USD" && order.totalCop > 0
      ? formatUSD((cop / order.totalCop) * (order.totalUsd ?? 0))
      : formatCOP(cop);

  // Evento Purchase para Meta: se envía una sola vez por pedido cuando el pago ya está confirmado.
  useEffect(() => {
    if (!order || order.paymentStatus !== "paid") return;
    const key = `tb-purchase-${order.id}`;
    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch { /* noop */ }
    track("purchase", {
      value: order.currency === "USD" && order.totalUsd ? order.totalUsd : order.totalCop,
      currency: order.currency,
      order: order.number,
      event_id: `purchase-${order.id}`,
      items: order.items.length,
      contents: order.items.map((i) => ({ id: i.name, quantity: i.qty, item_price: i.unitPriceCop })),
    });
  }, [order]);

  const pending = order?.paymentStatus === "pending" || order?.paymentStatus === "review";
  const isTransfer = order?.paymentMethod === "transfer";

  return (
    <div className="min-h-screen bg-shell">
      <SiteNav />
      <div className="mx-auto max-w-2xl px-6 py-20">
        {isLoading && <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-moss" /></div>}
        {error && (
          <div className="py-16 text-center">
            <h1 className="font-serif italic text-4xl">No encontramos este pedido</h1>
            <p className="mt-4 text-sm text-moss">Revisa el enlace de confirmación o escríbenos y lo buscamos por ti.</p>
            <Link to="/" className="mt-8 inline-block border border-ink/20 px-6 py-4 text-[11px] uppercase tracking-[0.2em] hover:border-ink">Volver a la tienda</Link>
          </div>
        )}

        {order && (
          <div className="text-center">
            {pending ? <Clock className="mx-auto size-9 text-moss" /> : <Check className="mx-auto size-9 text-moss" />}
            <p className="mt-6 text-[11px] uppercase tracking-[0.2em] text-moss/70">Gracias por tu compra</p>
            <h1 className="mt-3 font-serif italic text-5xl">Pedido {order.number}</h1>
            <p className="mt-5 text-sm text-moss">
              {isTransfer && order.paymentStatus !== "paid"
                ? order.hasProof
                  ? "Recibimos tu comprobante. Confirmaremos el pago muy pronto."
                  : "Tu pedido queda pendiente por confirmar el pago."
                : pending
                  ? "Estamos confirmando tu pago. Te avisamos por correo apenas quede listo."
                  : "Tu pago fue aprobado. Te enviamos la confirmación por correo."}
            </p>
            {order.contactEmail && <p className="mt-1 text-xs text-moss/70">Enviaremos las novedades a {order.contactEmail}</p>}

            <div className="mt-10 border-y border-ink/10 text-left">
              <ul className="divide-y divide-ink/10">
                {order.items.map((item, index) => (
                  <li key={`${item.name}-${index}`} className="flex justify-between gap-4 py-4 text-sm">
                    <div>
                      <div className="font-serif italic">{item.name}</div>
                      <div className="text-xs text-moss">{[item.variant, `x${item.qty}`].filter(Boolean).join(" · ")}</div>
                    </div>
                    <div>{money(item.unitPriceCop * item.qty)}</div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-2 py-4 text-left text-sm">
              <div className="flex justify-between"><span className="text-moss">Subtotal</span><span>{money(order.subtotalCop)}</span></div>
              <div className="flex justify-between"><span className="text-moss">Envío</span><span>{order.shippingCop === 0 ? "Gratis" : money(order.shippingCop)}</span></div>
              {order.deliveryLabel && <div className="flex justify-between"><span className="text-moss">Entrega</span><span className="text-right">{order.deliveryLabel}{order.city ? ` · ${order.city}` : ""}</span></div>}
              <div className="flex justify-between border-t border-ink/10 pt-3 font-serif italic text-xl"><span>Total</span><span>{money(order.totalCop)}</span></div>
            </div>

            {isTransfer && order.paymentStatus !== "paid" && payments && (
              <div className="mx-auto mt-6 max-w-sm text-left">
                <TransferDetails transfer={payments.transfer} />
                {!order.hasProof && <TransferProofUpload orderNumber={order.number} />}
              </div>
            )}

            <div className="mt-10 grid gap-3 sm:grid-cols-2">
              <Button asChild variant="outline" className="h-12 uppercase tracking-[0.16em]"><Link to="/cuenta/pedidos">Ver mis pedidos</Link></Button>
              <Button asChild className="h-12 uppercase tracking-[0.16em]"><Link to="/">Seguir viendo</Link></Button>
            </div>
            <ThankYouOffers currency={order.currency} />
          </div>
        )}
      </div>
    </div>
  );
}
