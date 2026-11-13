import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function optionalUserId(): Promise<string | null> {
  const mod = await import("./optional-user.server");
  return mod.optionalUserId();
}

const FASHN_API = "https://api.fashn.ai/v1";
const SECRET_KEY = "fashn_api_key";

const ImageInput = z
  .string()
  .min(16)
  .refine((v) => /^https?:\/\//i.test(v) || v.startsWith("data:image/"), "Imagen inválida");

const RunInput = z.object({
  /** Foto de la persona (URL firmada o data URI). */
  modelImage: ImageInput,
  /** Foto de la prenda (URL pública o data URI). */
  productImage: ImageInput,
  prompt: z.string().max(300).optional(),
  category: z.enum(["tops", "bottoms", "one-pieces"]).optional(),
});

const StatusInput = z.object({ id: z.string().min(4).max(120) });
const SaveInput = z.object({ id: z.string().uuid(), productId: z.string().uuid().nullable().optional() });

type Settings = {
  enabled: boolean;
  model: "tryon-max" | "tryon-v1.6";
  resolution: "1k" | "2k";
  mode: "fast" | "balanced" | "quality";
  guestEnabled: boolean;
};

async function loadConfig(): Promise<{ key: string; settings: Settings }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const [{ data: secret }, { data: setting }] = await Promise.all([
    supabaseAdmin.from("integration_secrets").select("value").eq("key", SECRET_KEY).maybeSingle(),
    supabaseAdmin.from("app_settings").select("value").eq("key", "tryon_settings").maybeSingle(),
  ]);

  const raw = (setting?.value ?? {}) as any;
  const settings: Settings = {
    enabled: Boolean(raw.enabled),
    model: raw.model === "tryon-v1.6" ? "tryon-v1.6" : "tryon-max",
    resolution: raw.resolution === "2k" ? "2k" : "1k",
    mode: ["fast", "balanced", "quality"].includes(raw.mode) ? raw.mode : "balanced",
    guestEnabled: raw.guestEnabled !== false,
  };

  const key = (secret?.value as string | undefined) ?? process.env["FASHN_API_KEY"] ?? "";
  return { key, settings };
}

/** Lanza una prueba virtual. Devuelve el id de la predicción para consultar el estado. */
export const startTryOn = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => RunInput.parse(data))
  .handler(async ({ data }): Promise<{ id: string }> => {
    const userId = await optionalUserId();
    const { key, settings } = await loadConfig();
    if (!settings.enabled) throw new Error("El probador virtual está desactivado por ahora.");
    if (!userId && !settings.guestEnabled) throw new Error("Inicia sesión para usar el probador virtual.");
    if (!key) throw new Error("Falta configurar la clave del probador virtual.");

    const inputs: Record<string, unknown> = {
      model_image: data.modelImage,
      product_image: data.productImage,
      output_format: "jpeg",
    };
    // Siempre usamos tryon-max: es el modelo con mejor calidad de resultado.
    inputs["resolution"] = settings.resolution;
    // El proveedor espera "performance" para el modo rápido.
    inputs["generation_mode"] = settings.mode === "fast" ? "performance" : settings.mode;
    if (data.prompt) inputs["prompt"] = data.prompt;

    const res = await fetch(`${FASHN_API}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model_name: "tryon-max", inputs }),
    });

    const payload = (await res.json().catch(() => ({}))) as any;
    if (!res.ok || !payload?.id) {
      const apiMsg = String(payload?.message ?? "").toLowerCase();
      if (res.status === 401) throw new Error("La clave del probador virtual no es válida.");
      if (res.status === 402 || apiMsg.includes("credit"))
        throw new Error("El probador virtual no está disponible en este momento. Inténtalo más tarde. ✨");
      if (res.status === 429) throw new Error("Hay muchas pruebas en curso. Intenta de nuevo en un momento.");
      throw new Error(payload?.message || "No pudimos iniciar la prueba virtual.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("tryon_jobs" as any).insert({ prediction_id: String(payload.id), user_id: userId } as any);
    return { id: String(payload.id) };
  });

/** Consulta el estado de una prueba virtual. */
export const tryOnStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => StatusInput.parse(data))
  .handler(async ({ data }): Promise<{ status: string; output: string[]; error: string | null }> => {
    const userId = await optionalUserId();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: job } = await supabaseAdmin.from("tryon_jobs" as any).select("prediction_id, user_id").eq("prediction_id", data.id).maybeSingle();
    if (!job || ((job as any).user_id && (job as any).user_id !== userId)) throw new Error("Esta prueba no pertenece a tu cuenta.");
    const { key } = await loadConfig();
    if (!key) throw new Error("Falta configurar la clave del probador virtual.");

    const res = await fetch(`${FASHN_API}/status/${encodeURIComponent(data.id)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    const payload = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw new Error(payload?.message || "No pudimos consultar la prueba virtual.");

    const err = payload?.error;
    const errMsg = err ? String(err.message ?? err) : null;
    return {
      status: String(payload?.status ?? "processing"),
      output: Array.isArray(payload?.output) ? payload.output.map(String) : [],
      error: errMsg?.toLowerCase().includes("credit")
        ? "El probador virtual no está disponible en este momento. Inténtalo más tarde. ✨"
        : errMsg,
    };
  });

/** Conserva una copia privada del resultado antes de que expire el enlace del proveedor. */
export const saveTryOnResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SaveInput.parse(data))
  .handler(async ({ data, context }): Promise<{ url: string }> => {
    const { data: job } = await context.supabase.from("tryon_jobs" as any).select("prediction_id").eq("prediction_id", data.id).maybeSingle();
    if (!job) throw new Error("Esta prueba no pertenece a tu cuenta.");
    const { key } = await loadConfig();
    if (!key) throw new Error("El probador no está disponible.");
    const response = await fetch(`${FASHN_API}/status/${encodeURIComponent(data.id)}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!response.ok) throw new Error("No pudimos recuperar el resultado de la prueba.");
    const prediction = (await response.json()) as { status?: string; output?: string[] };
    const source = prediction.status === "completed" ? prediction.output?.[0] : undefined;
    if (!source || !/^https:\/\/media\.fashn\.ai\//.test(source)) throw new Error("La imagen de la prueba no está disponible.");

    const path = `${context.userId}/results/${data.id}.jpg`;
    const imageResponse = await fetch(source);
    if (!imageResponse.ok) throw new Error("No pudimos descargar la imagen de la prueba.");
    const bytes = await imageResponse.arrayBuffer();
    const { error: uploadError } = await context.supabase.storage.from("tryon").upload(path, bytes, {
      contentType: "image/jpeg",
      upsert: true,
    });
    if (uploadError) throw new Error("No pudimos guardar la imagen de la prueba.");

    const { error: insertError } = await context.supabase.from("tryon_results").insert({
      user_id: context.userId,
      product_id: data.productId ?? null,
      prediction_id: data.id,
      output_url: path,
    });
    if (insertError) throw new Error("No pudimos guardar la prueba en tu perfil.");
    const { data: signed, error: signError } = await context.supabase.storage.from("tryon").createSignedUrl(path, 60 * 60);
    if (signError || !signed?.signedUrl) throw new Error("No pudimos abrir la imagen guardada.");
    return { url: signed.signedUrl };
  });

/** Estado de la clave guardada (solo administradores). */
export const tryOnKeyStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ configured: boolean; masked: string | null }> => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Solo administradores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("integration_secrets")
      .select("value")
      .eq("key", SECRET_KEY)
      .maybeSingle();
    const value = (data?.value as string | undefined) ?? "";
    if (!value) return { configured: Boolean(process.env["FASHN_API_KEY"]), masked: null };
    return { configured: true, masked: `••••••••${value.slice(-4)}` };
  });

/** Guarda o borra la clave del proveedor de try-on (solo administradores). */
export const saveTryOnKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ apiKey: z.string().max(300) }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Solo administradores.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const apiKey = data.apiKey.trim();

    if (!apiKey) {
      await supabaseAdmin.from("integration_secrets").delete().eq("key", SECRET_KEY);
      return { ok: true };
    }

    const { error } = await supabaseAdmin
      .from("integration_secrets")
      .upsert({ key: SECRET_KEY, value: apiKey, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error("No pudimos guardar la clave.");
    return { ok: true };
  });

/** Prueba la clave contra el proveedor consultando el saldo de créditos. */
export const testTryOnKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; message: string }> => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Solo administradores.");

    const { key } = await loadConfig();
    if (!key) return { ok: false, message: "Aún no hay clave guardada." };

    const res = await fetch(`${FASHN_API}/credits`, { headers: { Authorization: `Bearer ${key}` } });
    if (res.status === 401) return { ok: false, message: "La clave no es válida." };
    if (!res.ok) return { ok: false, message: "El proveedor no respondió correctamente." };
    const payload = (await res.json().catch(() => ({}))) as any;
    const total = payload?.credits?.total ?? payload?.total ?? null;
    return { ok: true, message: total !== null ? `Conexión correcta · ${total} créditos` : "Conexión correcta" };
  });
