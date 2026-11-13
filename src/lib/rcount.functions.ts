import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (!data) throw new Error("Solo administradores.");
}

export const saveRCountKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ entity: z.enum(["co", "pa"]), secret: z.string().max(600) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const key = `rcount_${data.entity}_key`;
    const value = data.secret.trim();
    if (!value) await supabaseAdmin.from("integration_secrets").delete().eq("key", key);
    else await supabaseAdmin.from("integration_secrets").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    return { ok: true };
  });

export const rcountKeyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("integration_secrets").select("key").in("key", ["rcount_co_key", "rcount_pa_key"]);
    const k = (data ?? []).map((r: any) => r.key);
    return { co: k.includes("rcount_co_key"), pa: k.includes("rcount_pa_key") };
  });

export const resendOrderBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: staff } = await (context as any).supabase.rpc("is_staff", { _user_id: (context as any).userId });
    if (!staff) throw new Error("No autorizado");
    const { syncOrderBilling } = await import("@/lib/rcount.server");
    return syncOrderBilling(data.orderId, "manual", (context as any).userId);
  });

export const getReconciledOrderInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderIds: z.array(z.string().uuid()).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: staff } = await (context as any).supabase.rpc("is_staff", { _user_id: (context as any).userId });
    if (!staff) throw new Error("No autorizado");
    const { reconcileRCountInvoices } = await import("@/lib/rcount.server");
    return reconcileRCountInvoices(data.orderIds);
  });

export const sendRCountAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    kind: z.enum(["entrada_manual", "ajuste"]),
    reason: z.string().max(500),
    items: z.array(z.object({ variant_id: z.string().uuid(), qty: z.number().int() })).min(1).max(500),
    location_id: z.string().uuid().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: staff } = await (context as any).supabase.rpc("is_staff", { _user_id: (context as any).userId });
    if (!staff) throw new Error("No autorizado");
    const { sendInventoryAdjustment } = await import("@/lib/rcount.server");
    const r = await sendInventoryAdjustment(data, (context as any).userId);
    return { ok: r.ok, message: r.message };
  });

export const resendRCountAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ logId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: staff } = await (context as any).supabase.rpc("is_staff", { _user_id: (context as any).userId });
    if (!staff) throw new Error("No autorizado");
    const { resendInventoryAdjustment } = await import("@/lib/rcount.server");
    const r = await resendInventoryAdjustment(data.logId);
    return { ok: r.ok, message: r.message, response: JSON.stringify((r as any).response ?? null) };
  });

export const syncRCountItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: staff } = await (context as any).supabase.rpc("is_staff", { _user_id: (context as any).userId });
    if (!staff) throw new Error("No autorizado");
    const { syncProductItems } = await import("@/lib/rcount.server");
    return syncProductItems(data.productId);
  });

export const resendBoxBilling = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    orderId: z.string().uuid(),
    boxId: z.string().uuid(),
    billingValueMode: z.enum(["total", "customs"]),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: staff } = await (context as any).supabase.rpc("is_staff", { _user_id: (context as any).userId });
    if (!staff) throw new Error("No autorizado");
    const { syncOrderBilling } = await import("@/lib/rcount.server");
    return syncOrderBilling(data.orderId, "dispatch", (context as any).userId, data.boxId, data.billingValueMode);
  });
