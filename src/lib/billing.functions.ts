import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeBillingSettings, providerForCurrency, type BillingProvider } from "@/lib/billing";

const SECRET_KEYS = {
  factus_client_secret: "factus_client_secret",
  factus_password: "factus_password",
  efactura_api_key: "efactura_api_key",
} as const;

type SecretName = keyof typeof SECRET_KEYS;

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (!isAdmin) throw new Error("Solo administradores.");
}

async function loadConfig() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: setting }, { data: secretRows }] = await Promise.all([
    supabaseAdmin.from("app_settings").select("value").eq("key", "billing_settings").maybeSingle(),
    supabaseAdmin.from("integration_secrets").select("key, value").in("key", Object.values(SECRET_KEYS)),
  ]);
  const map = new Map((secretRows ?? []).map((row: any) => [row.key, String(row.value ?? "")]));
  return {
    settings: normalizeBillingSettings(setting?.value),
    secrets: {
      clientSecret: map.get(SECRET_KEYS.factus_client_secret) ?? "",
      password: map.get(SECRET_KEYS.factus_password) ?? "",
      apiKey: map.get(SECRET_KEYS.efactura_api_key) ?? "",
    },
  };
}

/** Guarda o borra una credencial privada de facturación. */
export const saveBillingSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ name: z.enum(["factus_client_secret", "factus_password", "efactura_api_key"]), secret: z.string().max(600) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const value = data.secret.trim();
    if (!value) {
      await supabaseAdmin.from("integration_secrets").delete().eq("key", data.name);
      return { ok: true };
    }
    const { error } = await supabaseAdmin
      .from("integration_secrets")
      .upsert({ key: data.name, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error("No pudimos guardar la credencial.");
    return { ok: true };
  });

/** Indica qué credenciales de facturación ya están guardadas. */
export const billingSecretStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Record<SecretName, boolean>> => {
    await assertAdmin(context as any);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin.from("integration_secrets").select("key").in("key", Object.values(SECRET_KEYS));
    const keys = (data ?? []).map((row: any) => row.key);
    return {
      factus_client_secret: keys.includes(SECRET_KEYS.factus_client_secret),
      factus_password: keys.includes(SECRET_KEYS.factus_password),
      efactura_api_key: keys.includes(SECRET_KEYS.efactura_api_key),
    };
  });

/** Prueba la conexión con un emisor sin emitir documentos. */
export const testBillingConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ provider: z.enum(["factus", "efactura_pa"]) }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string }> => {
    await assertAdmin(context as any);
    const { settings, secrets } = await loadConfig();
    const { testProvider } = await import("@/lib/billing/providers.server");
    return testProvider(data.provider as BillingProvider, settings, secrets);
  });

/** Emite la factura electrónica de un pedido: pesos → Factus, dólares → eFactura Panamá. */
export const issueInvoiceForOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: boolean; message: string; invoiceId?: string; number?: string | null }> => {
    await assertAdmin(context as any);
    const { issueInvoiceCore } = await import("@/lib/billing/issue.server");
    return issueInvoiceCore(data.orderId, context.userId);
  });
