import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

export const Route = createFileRoute("/api/public/pagos/bold")({
  server: { handlers: { GET: async ({ request }) => {
    const url = new URL(request.url);
    const parsed = z.string().uuid().safeParse(url.searchParams.get("bold-order-id"));
    if (!parsed.success) return Response.redirect(`${url.origin}/pago-retorno?estado=error`, 303);
    const reference = parsed.data;
    const apiKey = process.env["BOLD_ONLINE_API_KEY"] ?? "";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    try {
      const { reconcileBoldPayment } = await import("@/lib/pagos/bold.server");
      await reconcileBoldPayment(supabaseAdmin, reference, apiKey);
    } catch { /* Missing provider confirmation stays pending, never trust bold-tx-status. */ }
    const { data } = await supabaseAdmin.from("payment_attempts").select("status").eq("reference", reference).eq("provider", "bold").maybeSingle();
    if (data?.status === "paid") {
      const { finalizePaidAttempt } = await import("@/lib/checkout/guest-order.server");
      try { await finalizePaidAttempt(reference); } catch { /* status screen retries */ }
    }
    return Response.redirect(`${url.origin}/pago-retorno?estado=${data?.status === "paid" ? "ok" : "pendiente"}&ref=${encodeURIComponent(reference)}`, 303);
  } } },
});