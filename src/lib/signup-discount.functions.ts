import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeSignupSettings, signupInputSchema, signupSettingsSchema, SIGNUP_SETTINGS_KEY } from "./signup-discount";

export const getSignupSettings = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const db = createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => {
      const headers = new Headers(init?.headers);
      if (headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
      headers.set("apikey", key);
      return fetch(input, { ...init, headers, signal: AbortSignal.timeout(6000) });
    } },
  });
  const { data, error } = await db.from("app_settings").select("value").eq("key", SIGNUP_SETTINGS_KEY).maybeSingle();
  if (error) throw new Error("No se pudo cargar la ventana de inscripción");
  return normalizeSignupSettings(data?.value);
});

export const saveSignupSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => signupSettingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: admin, error: accessError } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (accessError || !admin) throw new Error("No tienes permiso para cambiar esta configuración");
    const { error } = await context.supabase.from("app_settings").upsert({ key: SIGNUP_SETTINGS_KEY, value: data }, { onConflict: "key" });
    if (error) throw new Error("No se pudo guardar la ventana de inscripción");
    return data;
  });

export const subscribeSignupDiscount = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => signupInputSchema.parse(input))
  .handler(async ({ data }) => {
    // Issuance is atomic in PostgreSQL; never expose subscribers through this public endpoint.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: code, error } = await supabaseAdmin.rpc("subscribe_signup_discount", { _name: data.name, _email: data.email });
    if (error || !code) throw new Error("No pudimos guardar tu inscripción. Intenta nuevamente.");
    const { data: promo, error: promoError } = await supabaseAdmin.from("promotions").select("value").eq("code", code).single();
    if (promoError) throw new Error("No pudimos recuperar tu descuento. Intenta nuevamente.");
    return { code, discountPct: promo.value };
  });