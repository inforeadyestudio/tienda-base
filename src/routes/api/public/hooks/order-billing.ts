import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

// Llamado por la base de datos cuando un pedido se paga (web/POS) o se despacha (B2B).
export const Route = createFileRoute("/api/public/hooks/order-billing")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-hook-token") ?? "";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin.from("integration_secrets").select("value").eq("key", "rcount_hook_token").maybeSingle();
        if (!token || !row?.value || token !== row.value) return new Response("Unauthorized", { status: 401 });
        const parsed = z.object({ order_id: z.string().uuid(), trigger: z.enum(["paid", "dispatch"]), box_id: z.string().uuid().optional() }).safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Bad request", { status: 400 });
        const { syncOrderBilling } = await import("@/lib/rcount.server");
        try {
          const r = await syncOrderBilling(parsed.data.order_id, parsed.data.trigger, null, parsed.data.box_id ?? null);
          return Response.json({ ok: r.ok });
        } catch (e) {
          console.error("order-billing hook failed", e);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
