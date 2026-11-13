import { holdToken } from "@/lib/checkout/stock-hold";
import { useEffect, useState } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { findOrderByPaymentReference, hostedPaymentStatus } from "@/lib/payments.functions";
import { placeGuestOrder } from "@/lib/checkout/guest-checkout.functions";
import { SiteNav } from "@/components/storefront/site-nav";
import { readCart, setCartQty } from "@/lib/cart";
import { seoHead, SEO_DEFAULT_DESCRIPTION } from "@/lib/seo";

type Search = { ref?: string; estado?: string };

/** Página a la que vuelve la clienta después de pagar en Wompi: busca el pedido y la lleva a Gracias. */
export const Route = createFileRoute("/pago-retorno")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    ref: typeof search.ref === "string" ? search.ref : undefined,
    estado: typeof search.estado === "string" ? search.estado : undefined,
  }),
  head: () => seoHead({ title: "Pago | Tu Marca", description: SEO_DEFAULT_DESCRIPTION, path: "/pago-retorno", noindex: true }),
  component: PagoRetorno,
});

function PagoRetorno() {
  const { ref, estado } = Route.useSearch();
  const navigate = useNavigate();
  const findOrder = useServerFn(findOrderByPaymentReference);
  const createOrder = useServerFn(placeGuestOrder);
  const paymentStatus = useServerFn(hostedPaymentStatus);
  const [timedOut, setTimedOut] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const failed = estado === "error" || !ref;

  useEffect(() => {
    if (failed || !ref) return;
    let stopped = false;
    const started = Date.now();
    let running = false;
    const check = async () => {
      if (stopped || running) return;
      running = true;
      try {
        await paymentStatus({ data: { reference: ref } });
        let order = await findOrder({ data: { reference: ref } });
        // En móviles la pestaña original puede quedar suspendida. Recupera la compra invitada
        // en esta pestaña; el servidor vuelve a comprobar el pago y recalcula todos los precios.
        if (!order) {
          const saved = localStorage.getItem(`tb-payment-return-${ref}`);
          if (saved) {
            const draft = JSON.parse(saved);
            if (Date.now() - Number(draft.savedAt) < 24 * 60 * 60 * 1000) {
              const payment = await paymentStatus({ data: { reference: ref } });
              if (payment.status === "paid") {
                const token = holdToken();
                order = await createOrder({ data: {
                  items: draft.items, shipTo: draft.shipTo, currency: draft.currency,
                  paymentMethod: "card", paymentReference: ref, idempotencyKey: ref,
                  ...(token ? { holdToken: token } : {}),
                } });
              }
            }
          }
        }
        if (order?.id) {
          stopped = true;
          clearInterval(timer);
          try { localStorage.removeItem(`tb-payment-return-${ref}`); } catch { /* almacenamiento no disponible */ }
          // Quita solo las piezas compradas, sin borrar otras que añadieron durante el pago.
          try {
            const saved = localStorage.getItem(`tb-payment-items-${ref}`);
            if (saved) {
              const purchased = JSON.parse(saved) as { variantId: string; qty: number }[];
              for (const item of purchased) {
                const current = readCart().find((entry) => entry.variantId === item.variantId);
                if (current) setCartQty(item.variantId, current.qty - item.qty);
              }
              localStorage.removeItem(`tb-payment-items-${ref}`);
            }
          } catch { /* almacenamiento no disponible */ }
          navigate({ to: "/gracias/$id", params: { id: order.id }, replace: true });
          return;
        }
      } catch {
        // reintenta en el siguiente ciclo
      }
      if (Date.now() - started > 180_000) {
        stopped = true;
        clearInterval(timer);
        setTimedOut(true);
      }
      running = false;
    };
    const timer = setInterval(check, 3000);
    void check();
    return () => { stopped = true; clearInterval(timer); };
  }, [failed, ref, findOrder, createOrder, paymentStatus, navigate, attempt]);

  return (
    <div className="min-h-screen bg-ivory text-ink">
      <SiteNav />
      <main className="grid min-h-[70vh] place-items-center px-6 py-24 text-center">
      {failed ? (
        <div>
          <XCircle className="mx-auto size-9 text-destructive" />
          <h1 className="mt-5 font-nm text-3xl">El pago no se completó</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-moss">
            No pudimos confirmar el pago. Revisa el estado de la transacción antes de volver a intentarlo.
          </p>
          <Link to="/carrito" className="mt-8 inline-block border border-ink/20 px-6 py-4 text-[11px] uppercase tracking-[0.2em] hover:border-ink">
            Volver al carrito
          </Link>
        </div>
      ) : timedOut ? (
        <div>
          <XCircle className="mx-auto size-9 text-moss" />
          <h1 className="mt-5 font-nm text-3xl">Aún no encontramos tu pedido</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-moss">
            Si ya te cobraron, no pagues de nuevo. Vuelve a intentar la confirmación o escríbenos por WhatsApp con el comprobante y la referencia {ref}.
          </p>
          <Button variant="outline" onClick={() => { setTimedOut(false); setAttempt((value) => value + 1); }} className="mt-8 uppercase">Volver a consultar</Button>
        </div>
      ) : (
        <div>
          <Loader2 className="mx-auto size-9 animate-spin text-moss" />
          <h1 className="mt-5 font-nm text-3xl">Confirmando tu compra</h1>
          <p className="mx-auto mt-2 max-w-sm text-sm text-moss">Estamos verificando el pago y preparando los datos de tu pedido…</p>
        </div>
      )}
      </main>
    </div>
  );
}
