import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Guarda el carrito de quien escribió su correo en el checkout (para el recordatorio a las 4 horas).
export const saveCheckoutLead = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({
    sessionKey: z.string().min(8).max(80),
    email: z.string().trim().email().max(200),
    name: z.string().trim().max(120).optional(),
    items: z.array(z.object({ name: z.string().max(200), label: z.string().max(120).optional(), qty: z.number().int().min(1).max(99), price: z.number().min(0).max(1e9), image: z.string().url().max(500).optional() })).min(1).max(40),
  }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const subtotal = data.items.reduce((a, i) => a + i.qty * i.price, 0);
    const { data: existing } = await supabaseAdmin.from("checkout_leads" as any).select("id,order_id,reminder_sent_at").eq("session_key", data.sessionKey).maybeSingle();
    const ex = existing as { id: string; order_id: string | null; reminder_sent_at: string | null } | null;
    if (ex && (ex.order_id || ex.reminder_sent_at)) return { ok: true };
    await supabaseAdmin.from("checkout_leads" as any).upsert({
      session_key: data.sessionKey, email: data.email.toLowerCase(), name: data.name ?? null,
      items: data.items, subtotal_cop: subtotal, updated_at: new Date().toISOString(),
    }, { onConflict: "session_key" });
    return { ok: true };
  });
