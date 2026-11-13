import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function staff(context: any) {
  const { data } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (!data) throw new Error("No autorizado");
}

export const getBoldTerminalSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await staff(context);
    const { readSettings } = await import("./bold-terminal.server");
    return { ...(await readSettings()), keyConfigured: !!process.env["BOLD_TERMINAL_API_KEY"] };
  });

export const fetchBoldTerminals = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await staff(context);
    const { listBoundTerminals } = await import("./bold-terminal.server");
    try { return { ok: true as const, terminals: await listBoundTerminals() }; }
    catch (e) { return { ok: false as const, terminals: [], message: e instanceof Error ? e.message : "No se pudo consultar Bold" }; }
  });

export const saveBoldTerminalSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    terminals: z.array(z.object({ serial: z.string().min(1).max(60), model: z.string().max(40), name: z.string().max(80), location_id: z.string().uuid().nullable() })).max(50),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await staff(context);
    const { saveSettings } = await import("./bold-terminal.server");
    await saveSettings(data);
    return { ok: true };
  });

export const startBoldTerminalPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    locationId: z.string().uuid(),
    sessionId: z.string().uuid().nullable(),
    amount: z.number().int().min(1000).max(100_000_000),
    terminalSerial: z.string().max(60).optional(),
    description: z.string().max(100).default("Venta Tu Marca"),
    payer: z.object({ email: z.string().max(200).nullable().optional(), phone: z.string().max(40).nullable().optional(), document: z.string().max(40).nullable().optional() }).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await staff(context);
    const { readSettings, createCheckout, admin } = await import("./bold-terminal.server");
    const { terminals } = await readSettings();
    const mine = terminals.filter((t) => t.location_id === data.locationId);
    const terminal = mine.find((t) => t.serial === data.terminalSerial) ?? mine[0];
    if (!terminal) return { ok: false as const, message: "Esta tienda no tiene un datáfono Bold asignado." };
    const sb = await admin();
    const sellerEmail = String((context as any).claims?.email ?? "");
    const { data: row, error } = await sb.from("pos_terminal_payments").insert({
      location_id: data.locationId, session_id: data.sessionId, amount_cop: data.amount,
      terminal_serial: terminal.serial, terminal_model: terminal.model, created_by: (context as any).userId,
    }).select("id").single();
    if (error || !row) return { ok: false as const, message: "No se pudo registrar el cobro" };
    try {
      const integrationId = await createCheckout({ amount: data.amount, terminal, reference: row.id, sellerEmail, description: data.description, payer: data.payer });
      await sb.from("pos_terminal_payments").update({ integration_id: integrationId, updated_at: new Date().toISOString() }).eq("id", row.id);
      return { ok: true as const, id: row.id, terminalName: terminal.name || terminal.serial };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Bold no respondió";
      await sb.from("pos_terminal_payments").update({ status: "error", error: message, updated_at: new Date().toISOString() }).eq("id", row.id);
      return { ok: false as const, message: `Bold: ${message}` };
    }
  });

export const cancelBoldTerminalPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await staff(context);
    const { admin } = await import("./bold-terminal.server");
    const sb = await admin();
    await sb.from("pos_terminal_payments").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", data.id).eq("status", "pending");
    return { ok: true };
  });

export const getBoldTerminalPaymentStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await staff(context);
    const { admin } = await import("./bold-terminal.server");
    const sb = await admin();
    const { data: row } = await sb.from("pos_terminal_payments").select("status, error").eq("id", data.id).maybeSingle();
    return { status: String(row?.status ?? "pending"), error: (row?.error as string | null) ?? null };
  });
