import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Envía la nota crédito de una devolución a R-Count (con o sin cuenta por pagar). */
export const sendReturnCreditNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ returnId: z.string().uuid(), withPayable: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: staff } = await (context as any).supabase.rpc("is_staff", { _user_id: (context as any).userId });
    if (!staff) throw new Error("No autorizado");
    const { sendReturnCreditNote: send } = await import("@/lib/rcount.server");
    try {
      return await send(data.returnId, data.withPayable, (context as any).userId);
    } catch (e) {
      console.error("credit note failed", e);
      return { ok: false, message: "No se pudo enviar la nota crédito" };
    }
  });

/** Datos mínimos para el formulario público de solicitud de devolución de dinero. */
export const getRefundRequest = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: r } = await (supabaseAdmin as any)
      .from("returns")
      .select("refund_cop, contact_name, created_at, resolution, items, orders(number)")
      .eq("refund_token", data.token)
      .maybeSingle();
    if (!r || r.resolution !== "refund") return null;
    const { data: s } = await supabaseAdmin.from("app_settings").select("value").eq("key", "returns_contacts").maybeSingle();
    const contacts = (s?.value ?? {}) as { accounting?: string };
    return {
      orderNumber: (r.orders?.number as string) ?? "",
      name: (r.contact_name as string) ?? "",
      amount: Number(r.refund_cop ?? 0),
      date: String(r.created_at),
      items: ((r.items ?? []) as any[]).map((i) => ({ name: String(i.name ?? ""), label: String(i.variant_label ?? ""), qty: Number(i.qty ?? 1) })),
      accountingEmail: contacts.accounting ?? "",
    };
  });
