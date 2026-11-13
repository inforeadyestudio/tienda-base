import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { legacyCreditSchema } from "./legacy-credit";

async function authorize(context: any) {
  const { data, error } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (error || !data) throw new Error("No autorizado");
}
export const issueLegacyPosCredit = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => legacyCreditSchema.parse(input))
  .handler(async ({ data, context }) => {
    await authorize(context);
    const { issueLegacyCredit } = await import("./legacy-credit.server");
    return issueLegacyCredit(data, context.userId);
  });
export const refreshLegacyPosCredit = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await authorize(context);
    const { refreshLegacyCredit } = await import("./legacy-credit.server");
    return refreshLegacyCredit(data.id);
  });