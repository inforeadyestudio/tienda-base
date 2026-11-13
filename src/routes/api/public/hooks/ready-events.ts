import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({ order_id: z.string().uuid() });

// Llamado por la base de datos (trigger orders_ready_event) cuando un pedido queda pagado.
export const Route = createFileRoute("/api/public/hooks/ready-events")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-hook-token") ?? "";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin
          .from("integration_secrets")
          .select("value")
          .eq("key", "rcount_hook_token")
          .maybeSingle();
        if (!token || !row?.value || token !== row.value) return new Response("Unauthorized", { status: 401 });
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Bad request", { status: 400 });
        try {
          const { handleReadySaleEvent } = await import("@/lib/ready-events.server");
          const result = await handleReadySaleEvent(parsed.data.order_id);
          return Response.json({ ok: true, ...result });
        } catch (e) {
          console.error("ready-events hook failed", e);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
