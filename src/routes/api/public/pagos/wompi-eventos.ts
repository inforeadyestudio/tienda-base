import { createFileRoute } from "@tanstack/react-router";
import { confirmWompiTransaction, wompiBase } from "@/lib/pagos/wompi.server";

/**
 * URL de eventos de Wompi: aviso automático de que el pago quedó aprobado,
 * incluso si la clienta cierra el navegador antes de volver a la tienda.
 * La transacción siempre se revalida contra la API de Wompi antes de marcarla pagada.
 */
export const Route = createFileRoute("/api/public/pagos/wompi-eventos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let event: any = null;
        try {
          event = await request.json();
        } catch {
          return Response.json({ received: true });
        }
        const transactionId = String(event?.data?.transaction?.id ?? "");
        if (!transactionId) return Response.json({ received: true });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const base = await wompiBase(supabaseAdmin);
        let result: Awaited<ReturnType<typeof confirmWompiTransaction>> = null;
        try {
          result = await confirmWompiTransaction(supabaseAdmin, base, transactionId);
        } catch {
          // Un fallo temporal devuelve 500 para que Wompi reintente la entrega.
          return new Response("error", { status: 500 });
        }
        // Con PSE o navegadores internos (Facebook/Instagram) la clienta muchas veces
        // no vuelve a la tienda: el aviso de Wompi también debe crear el pedido.
        if (result?.paid && result.reference) {
          try {
            const { finalizePaidAttempt } = await import("@/lib/checkout/guest-order.server");
            await finalizePaidAttempt(result.reference);
          } catch (e) {
            console.error("No se pudo crear el pedido desde el aviso de Wompi", result.reference, e);
            return new Response("retry", { status: 500 });
          }
        }
        return Response.json({ received: true });
      },
    },
  },
});
