import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMetaCampaignReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ from: z.string().datetime(), to: z.string().datetime() })
    .refine((value) => new Date(value.to) > new Date(value.from), "Rango de fechas inválido")
    .parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (error || !isAdmin) throw new Error("No tienes permiso para consultar las campañas.");
    const { readMetaReport } = await import("./meta-report.server");
    try {
      const { data: tagged } = await context.supabase.from("orders")
        .select("ad_campaign, total_cop, total_usd:total_usd_exact, currency")
        .eq("payment_status", "paid").not("ad_campaign", "is", null)
        .gte("paid_at", data.from).lte("paid_at", data.to).limit(1000);
      const hub: Record<string, { orders: number; cop: number; usd: number }> = {};
      for (const o of tagged ?? []) {
        const h = (hub[o.ad_campaign as string] ??= { orders: 0, cop: 0, usd: 0 });
        h.orders += 1;
        if (o.currency === "USD") h.usd += Number(o.total_usd ?? 0); else h.cop += Number(o.total_cop ?? 0);
      }
      return { report: await readMetaReport(data.from, data.to), hub, error: null };
    } catch (error) {
      return { report: null, hub: {} as Record<string, { orders: number; cop: number; usd: number }>, error: error instanceof Error ? error.message : "No se pudo consultar Meta." };
    }
  });

export const getMetaCampaignName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().regex(/^\d{6,30}$/) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) return { name: null };
    const { readMetaCampaignName } = await import("./meta-report.server");
    try { return { name: await readMetaCampaignName(data.id) }; } catch { return { name: null }; }
  });
