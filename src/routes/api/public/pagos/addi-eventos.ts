import { createFileRoute } from "@tanstack/react-router";
import { applyAddiCallback, verifyAddiCallback } from "@/lib/pagos/addi.server";

/**
 * Callback de Addi con el estado final de la solicitud (Basic Auth).
 * Addi exige responder 200 con exactamente el mismo JSON recibido; si no, reintenta cada 30 min.
 */
export const Route = createFileRoute("/api/public/pagos/addi-eventos")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        if (!(await verifyAddiCallback(supabaseAdmin, request.headers.get("authorization")))) {
          return new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": "Basic" } });
        }
        const raw = await request.text();
        let event: unknown;
        try {
          event = JSON.parse(raw);
        } catch {
          return new Response("invalid json", { status: 400 });
        }
        try {
          await applyAddiCallback(supabaseAdmin, event);
          const ref = String((event as any)?.orderId ?? "").slice(0, 64);
          if (ref) {
            const { data: a } = await supabaseAdmin.from("payment_attempts").select("status").eq("reference", ref).maybeSingle();
            if (a?.status === "paid") {
              const { finalizePaidAttempt } = await import("@/lib/checkout/guest-order.server");
              await finalizePaidAttempt(ref);
            }
          }
        } catch {
          return new Response("error", { status: 500 });
        }
        return new Response(raw, { status: 200, headers: { "Content-Type": "application/json" } });
      },
    },
  },
});
