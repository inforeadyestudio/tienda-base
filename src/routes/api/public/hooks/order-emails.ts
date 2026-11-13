import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("order"), order_id: z.string().uuid(), events: z.array(z.enum(["paid", "created", "label", "b2b_confirmed", "b2b_shipped", "b2b_delivered"])).min(1) }),
  z.object({ kind: z.literal("pos_closing"), session_id: z.string().uuid() }),
  z.object({ kind: z.literal("abandoned") }),
  z.object({ kind: z.literal("welcome"), user_id: z.string().uuid() }),
  z.object({ kind: z.literal("backup") }),
  z.object({ kind: z.literal("credit") }),
  z.object({ kind: z.literal("review") }),
  z.object({ kind: z.literal("transfer"), transfer_id: z.string().uuid() }),
  z.object({ kind: z.literal("store_web"), fulfillment_id: z.string().uuid() }),
]);

// Llamado por la base de datos (pedidos, cierres de caja y revisión de carritos abandonados).
export const Route = createFileRoute("/api/public/hooks/order-emails")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = request.headers.get("x-hook-token") ?? "";
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin.from("integration_secrets").select("value").eq("key", "rcount_hook_token").maybeSingle();
        if (!token || !row?.value || token !== row.value) return new Response("Unauthorized", { status: 401 });
        const parsed = Body.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return new Response("Bad request", { status: 400 });
        const ev = await import("@/lib/email/events.server");
        try {
          const b = parsed.data;
          if (b.kind === "order") await ev.handleOrderEvents(b.order_id, b.events);
          else if (b.kind === "pos_closing") await ev.handlePosClosing(b.session_id);
          else if (b.kind === "backup") await (await import("@/lib/email/backup.server")).handleBackup();
          else if (b.kind === "transfer") await ev.handleTransferCreated(b.transfer_id);
          else if (b.kind === "store_web") await ev.handleStoreWebOrder(b.fulfillment_id);
          else if (b.kind === "review") await ev.handleReviewRequests();
          else if (b.kind === "credit") await ev.handleCreditReminders();
          else if (b.kind === "welcome") await ev.handleWelcome(b.user_id);
          else await ev.handleAbandoned();
          return Response.json({ ok: true });
        } catch (e) {
          console.error("order-emails hook failed", e);
          return Response.json({ ok: false }, { status: 500 });
        }
      },
    },
  },
});
