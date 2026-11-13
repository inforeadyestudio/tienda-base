import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function staff(context: any) {
  const { data } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (!data) throw new Error("No autorizado");
}

export const searchRCountInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ q: z.string().trim().min(1).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    await staff(context);
    const { searchInvoice } = await import("./pos-credit.server");
    try { return { ok: true as const, invoices: await searchInvoice(data.q) }; }
    catch (e) { return { ok: false as const, invoices: [], message: e instanceof Error ? e.message : "No se pudo buscar en R-Count" }; }
  });

export const issuePosCreditNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    orderId: z.string().uuid(),
    invoiceNumber: z.string().min(1).max(60),
    resolution: z.enum(["reembolso", "cambio"]),
    notes: z.string().max(500).optional(),
    lines: z.array(z.object({
      sku: z.string().min(1).max(80),
      quantity: z.number().int().min(1).max(1000),
      reason: z.enum(["talla", "decision_propia", "defecto"]),
      condition: z.enum(["buena", "defectuosa"]),
    })).min(1).max(100),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await staff(context);
    const { issueCreditNote } = await import("./pos-credit.server");
    try { return { ok: true as const, ...(await issueCreditNote(data, (context as any).userId, (context as any).supabase)) }; }
    catch (e) { return { ok: false as const, status: "error", message: e instanceof Error ? e.message : "No se pudo emitir" }; }
  });

export const refreshPosCreditNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await staff(context);
    const { refreshCreditNotes } = await import("./pos-credit.server");
    try { return { ok: true as const, ...(await refreshCreditNotes(data.orderId)) }; }
    catch (e) { return { ok: false as const, message: e instanceof Error ? e.message : "No se pudo consultar" }; }
  });
