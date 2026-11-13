import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { paymentDraftSchema } from "./checkout/payment-draft";

const PF_SECRET = "paguelofacil_token";
const SECONDARY_SECRET = "intl_secondary_secret";

type SettingsRow = { paguelofacil?: { mode?: string; cclw?: string; enabled?: boolean } };

/** Credenciales y entorno de Páguelo Fácil guardados en el panel de administración. */
async function loadPaguelo() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: secret }, { data: setting }] = await Promise.all([
    supabaseAdmin.from("integration_secrets").select("value").eq("key", PF_SECRET).maybeSingle(),
    supabaseAdmin.from("app_settings").select("value").eq("key", "international_settings").maybeSingle(),
  ]);
  const raw = (setting?.value ?? {}) as SettingsRow;
  const live = raw.paguelofacil?.mode === "live";
  return {
    cclw: String(raw.paguelofacil?.cclw ?? "").trim(),
    token: (secret?.value as string | undefined)?.trim() ?? "",
    base: live ? "https://secure.paguelofacil.com" : "https://sandbox.paguelofacil.com",
  };
}

/** Genera el enlace de pago de Páguelo Fácil y registra el intento en el servidor. */
export const createPagueloPayment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      amountUsd: z.number().positive().max(100_000),
      reference: z.string().min(6).max(64),
      description: z.string().max(120).default("Tu Marca"),
      origin: z.string().url().max(200),
      draft: paymentDraftSchema,
    }).parse(data),
  )
  .handler(async ({ data }): Promise<{ url: string }> => {
    const { cclw, token, base } = await loadPaguelo();
    if (!cclw || !token) throw new Error("Páguelo Fácil aún no está configurado.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { beginGatewayAttempt, storeGatewayUrl, rejectGatewayAttempt, safeOrigin } = await import("./payment-guards.server");
    data.origin = safeOrigin(data.origin);
    const savedUrl = await beginGatewayAttempt(supabaseAdmin, data.reference, "paguelofacil", "USD", data.amountUsd, data.draft);
    if (savedUrl) return { url: savedUrl };

    const body = new URLSearchParams({
      CCLW: cclw,
      CMTN: data.amountUsd.toFixed(2),
      CDSC: data.description,
      RETURN_URL: `${data.origin}/api/public/pagos/paguelofacil`,
      PARM_1: data.reference,
      CTAX: "0.00",
    });

    const response = await fetch(`${base}/LinkDeamon.cfm`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: token },
      body: body.toString(),
    });
    const json = (await response.json()) as { success?: boolean; data?: { url?: string }; message?: string };
    const url = json?.data?.url;
    if (!response.ok || !url) {
      if (response.status >= 400 && response.status < 500) await rejectGatewayAttempt(supabaseAdmin, data.reference);
      throw new Error(json?.message ?? "No pudimos iniciar el pago.");
    }
    await storeGatewayUrl(supabaseAdmin, data.reference, url);
    return { url };
  });

/** Consulta si el intento de pago ya fue confirmado por la pasarela. */
export const pagueloPaymentStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ reference: z.string().min(6).max(64) }).parse(data))
  .handler(async ({ data }): Promise<{ status: "pending" | "paid" | "failed"; reference: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("payment_attempts")
      .select("status")
      .eq("reference", data.reference)
      .maybeSingle();
    return {
      status: (row?.status as "pending" | "paid" | "failed") ?? "pending",
      reference: data.reference,
    };
  });

/** Guarda (o borra) las credenciales privadas de las pasarelas internacionales. */
export const saveGatewaySecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ gateway: z.enum(["paguelofacil", "secondary"]), secret: z.string().max(400) }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Solo administradores.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const key = data.gateway === "paguelofacil" ? PF_SECRET : SECONDARY_SECRET;
    const value = data.secret.trim();
    if (!value) {
      await supabaseAdmin.from("integration_secrets").delete().eq("key", key);
      return { ok: true };
    }
    const { error } = await supabaseAdmin
      .from("integration_secrets")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error("No pudimos guardar la credencial.");
    return { ok: true };
  });

/** Indica si cada pasarela ya tiene su credencial privada guardada. */
export const gatewaySecretStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ paguelofacil: boolean; secondary: boolean }> => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Solo administradores.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("integration_secrets").select("key").in("key", [PF_SECRET, SECONDARY_SECRET]);
    const keys = (data ?? []).map((row) => row.key);
    return { paguelofacil: keys.includes(PF_SECRET), secondary: keys.includes(SECONDARY_SECRET) };
  });
