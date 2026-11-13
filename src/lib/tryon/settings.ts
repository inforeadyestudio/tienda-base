import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const TRYON_SETTINGS_KEY = "tryon_settings";

export type TryOnSettings = {
  /** Probador virtual activo en la tienda y el portal. */
  enabled: boolean;
  /** Modelo de FASHN a usar. */
  model: "tryon-max" | "tryon-v1.6";
  resolution: "1k" | "2k";
  mode: "fast" | "balanced" | "quality";
  /** Permitir que clientas sin cuenta suban una foto y prueben el look. */
  guestEnabled: boolean;
};

export const DEFAULT_TRYON_SETTINGS: TryOnSettings = {
  enabled: false,
  model: "tryon-max",
  resolution: "1k",
  mode: "balanced",
  guestEnabled: true,
};

export function normalizeTryOnSettings(raw: any): TryOnSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_TRYON_SETTINGS;
  const model = raw.model === "tryon-v1.6" ? "tryon-v1.6" : "tryon-max";
  const resolution = raw.resolution === "2k" ? "2k" : "1k";
  const mode = ["fast", "balanced", "quality"].includes(raw.mode) ? raw.mode : "balanced";
  return {
    enabled: Boolean(raw.enabled),
    model,
    resolution,
    mode,
    guestEnabled: raw.guestEnabled !== false,
  };
}

export const tryOnSettingsQuery = () =>
  queryOptions({
    queryKey: ["tryon-settings"],
    staleTime: 60_000,
    queryFn: async (): Promise<TryOnSettings> => {
      const { readAppSetting } = await import("@/lib/public-settings");
      return normalizeTryOnSettings(await readAppSetting(TRYON_SETTINGS_KEY).catch(() => null));
    },
  });

export async function saveTryOnSettings(settings: TryOnSettings) {
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: TRYON_SETTINGS_KEY, value: settings as any }, { onConflict: "key" });
  if (error) throw error;
}
