import { createFileRoute } from "@tanstack/react-router";
import { boldEventSchema, verifyBoldSignature } from "@/lib/pagos/bold";

export const Route = createFileRoute("/api/public/pagos/bold-eventos")({
  server: { handlers: {
    POST: async ({ request }) => {
      const secret = process.env["BOLD_ONLINE_SECRET_KEY"] ?? "";
      if (!secret) return new Response("Unavailable", { status: 503 });
      const raw = await request.text();
      if (raw.length > 100_000) return new Response("Too large", { status: 413 });
      if (!await verifyBoldSignature(raw, request.headers.get("x-bold-signature") ?? "", secret)) return new Response("Invalid signature", { status: 401 });
      let event: unknown;
      try { event = JSON.parse(raw); } catch { return new Response("Invalid JSON", { status: 400 }); }
      const parsed = boldEventSchema.safeParse(event);
      // Other products (POS, QR) and reversals must not affect online orders.
      if (!parsed.success || parsed.data.type !== "SALE_APPROVED") return new Response("ok");
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { applyBoldEvent } = await import("@/lib/pagos/bold.server");
        await applyBoldEvent(supabaseAdmin, parsed.data);
      } catch { return new Response("retry", { status: 500 }); }
      return new Response("ok");
    },
  } },
});