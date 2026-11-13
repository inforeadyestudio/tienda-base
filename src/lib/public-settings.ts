import { supabase } from "@/integrations/supabase/client";

/**
 * Agrupa en una sola petición las lecturas de app_settings que la tienda hace
 * al cargar (anuncios, internacional, envíos, puntos, probador…).
 * Las lecturas que llegan en la misma ventana corta comparten una consulta;
 * la ventana es breve para que los cambios guardados en admin se vean enseguida.
 */
const WINDOW_MS = 5_000;
const KEYS = [
  "coming_soon",
  "announcement_bars",
  "international_settings",
  "loyalty",
  "carrier_settings",
  "tryon_settings",
  "shipping_settings",
  "tax_settings",
  "payment_settings",
  "site_nav",
] as const;

let batch: { at: number; p: Promise<Map<string, unknown>> } | null = null;

function loadBatch(): Promise<Map<string, unknown>> {
  const now = Date.now();
  if (batch && now - batch.at < WINDOW_MS) return batch.p;
  const p = (async () => {
    const { data, error } = await supabase.from("app_settings").select("key, value").in("key", [...KEYS]);
    if (error) throw error;
    return new Map((data ?? []).map((r: any) => [r.key as string, r.value]));
  })();
  batch = { at: now, p };
  p.catch(() => { if (batch?.p === p) batch = null; });
  return p;
}

/** Olvida la lectura agrupada: la próxima lectura va directo a la base (checkout). */
export function clearAppSettingsBatch() {
  batch = null;
}

/** Devuelve el valor guardado de un ajuste (o null). Lanza si la lectura falla. */
export async function readAppSetting(key: string): Promise<unknown> {
  if (typeof window === "undefined" || !(KEYS as readonly string[]).includes(key)) {
    const { data, error } = await supabase.from("app_settings").select("value").eq("key", key).maybeSingle();
    if (error) throw error;
    return data?.value ?? null;
  }
  const map = await loadBatch();
  return map.get(key) ?? null;
}
