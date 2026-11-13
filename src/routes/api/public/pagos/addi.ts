import { createFileRoute } from "@tanstack/react-router";

/**
 * Retorno de Addi: la clienta vuelve aquí al terminar. El resultado ya llegó por el callback,
 * así que solo leemos el intento y la llevamos al carrito con el estado.
 */
export const Route = createFileRoute("/api/public/pagos/addi")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const reference = (url.searchParams.get("ref") ?? "").slice(0, 64);
        let state = "error";
        if (reference) {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data } = await supabaseAdmin.from("payment_attempts").select("status").eq("reference", reference).maybeSingle();
          if (data?.status === "paid") {
            try { const { finalizePaidAttempt } = await import("@/lib/checkout/guest-order.server"); await finalizePaidAttempt(reference); } catch (e) { console.error("addi finalize", e); }
          }
          state = data?.status === "paid" ? "ok" : data?.status === "pending" ? "pendiente" : "error";
        }
        return new Response(null, { status: 303, headers: { Location: `${url.origin}/pago-retorno?estado=${state}${reference ? `&ref=${encodeURIComponent(reference)}` : ""}` } });
      },
    },
  },
});
