import { createFileRoute } from "@tanstack/react-router";
import { confirmWompiTransaction, wompiBase } from "@/lib/pagos/wompi.server";

/** Retorno de Wompi: verifica la transacción en el servidor y marca el intento como pagado. */
export const Route = createFileRoute("/api/public/pagos/wompi")({
  server: {
    handlers: {
      GET: ({ request }) => handle(request),
      POST: ({ request }) => handle(request),
    },
  },
});

async function handle(request: Request) {
  const url = new URL(request.url);
  const transactionId = url.searchParams.get("id") ?? "";
  const back = (state: string, reference?: string) =>
    Response.redirect(`${url.origin}/pago-retorno?estado=${state}${reference ? `&ref=${encodeURIComponent(reference)}` : ""}`, 303);
  if (!transactionId) return back("error");

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const base = await wompiBase(supabaseAdmin);
  const result = await confirmWompiTransaction(supabaseAdmin, base, transactionId);
  if (result?.paid && result.reference) {
    try { const { finalizePaidAttempt } = await import("@/lib/checkout/guest-order.server"); await finalizePaidAttempt(result.reference); }
    catch (e) { console.error("No se pudo crear el pedido tras Wompi", result.reference, e); }
  }
  return back(result?.paid ? "ok" : result?.pending ? "pendiente" : result ? "error" : "verificando", result?.reference);
}
