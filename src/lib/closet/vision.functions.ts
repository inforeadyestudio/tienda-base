import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const GARMENT_ZONES = ["superior", "inferior", "set", "otro"] as const;
export type GarmentZone = (typeof GARMENT_ZONES)[number];

const Input = z.object({
  /** Data URL de la foto (image/jpeg | image/webp | image/png). */
  imageDataUrl: z.string().min(32),
  /** Zona de la prenda que se quiere extraer de la foto. */
  zone: z.enum(GARMENT_ZONES).default("otro"),
});

const ZONE_HINTS: Record<GarmentZone, string> = {
  superior: "La foto puede tener varias prendas; identifica SOLO la prenda SUPERIOR (camisa, blusa, sudadera, camiseta, chaqueta...) e ignora el resto.",
  inferior: "La foto puede tener varias prendas; identifica SOLO la prenda INFERIOR (pantalón, jean, short, falda...) e ignora el resto.",
  set: "La foto muestra un CONJUNTO o SET coordinado (superior + inferior que van juntos); identifícalo como una sola pieza tipo set.",
  otro: "",
};

export type GarmentAnalysis = {
  name: string;
  category: string;
  garment_type: string;
  color: string;
  color_hex: string;
  material: string;
  fit: string;
};

const FALLBACK: GarmentAnalysis = {
  name: "Prenda de mi closet",
  category: "otros",
  garment_type: "prenda",
  color: "sin definir",
  color_hex: "#c9c2b4",
  material: "",
  fit: "",
};

function gatewayError(status: number, body: string): Error {
  if (status === 429) return new Error("Muchas solicitudes seguidas. Intenta de nuevo en un momento.");
  if (status === 402) return new Error("Los créditos de IA se agotaron. Recárgalos para seguir usando el closet.");
  if (status === 403) return new Error("La IA está deshabilitada para este espacio de trabajo.");
  return new Error(body.slice(0, 200) || "No pudimos procesar la imagen.");
}

/** Identifica tipo, categoría, color, material y fit de una prenda a partir de una foto. */
export const analyzeGarment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<GarmentAnalysis> => {
    const { aiChat, aiEnabled, aiContent, aiImageMessage } = await import("@/lib/ai.server");
    if (!aiEnabled()) return FALLBACK;

    const system = [
      "Eres estilista de Tu Marca, marca de moda colombiana.",
      "Miras la foto de una prenda y devuelves SOLO JSON válido con estas claves exactas:",
      '{"name":"","category":"","garment_type":"","color":"","color_hex":"","material":"","fit":""}',
      "name: nombre corto y editorial en español (máx 3 palabras), sin marca.",
      "category: una de superior | inferior | set | vestido | abrigo | calzado | accesorio | otros.",
      ZONE_HINTS[data.zone],
      "garment_type: tipo concreto en español (jean, blazer, camisa, botín, cartera...).",
      "color: nombre del color en español. color_hex: hex aproximado.",
      "material: material estimado en español o cadena vacía.",
      "fit: ajustado | natural | holgado | cadena vacía.",
    ].join(" ");

    const res = await aiChat({
      json: true,
      messages: [
        { role: "system", content: system },
        aiImageMessage("Describe esta prenda para el closet digital.", data.imageDataUrl),
      ],
    });
    if (!res.ok) throw gatewayError(res.status, await res.text().catch(() => ""));

    const text = aiContent(await res.json());
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = match ? (JSON.parse(match[0]) as Partial<GarmentAnalysis>) : {};
    return {
      name: parsed.name?.trim() || FALLBACK.name,
      category: parsed.category?.trim() || FALLBACK.category,
      garment_type: parsed.garment_type?.trim() || FALLBACK.garment_type,
      color: parsed.color?.trim() || FALLBACK.color,
      color_hex: /^#[0-9a-fA-F]{6}$/.test(parsed.color_hex ?? "") ? parsed.color_hex! : FALLBACK.color_hex,
      material: parsed.material?.trim() ?? "",
      fit: parsed.fit?.trim() ?? "",
    };
  });

/** Convierte un data URL en Blob para enviarlo como archivo multipart. */
function dataUrlToBlob(dataUrl: string): { blob: Blob; ext: string } {
  const match = dataUrl.match(/^data:([^;,]+);base64,(.+)$/);
  if (!match) throw new Error("La imagen no tiene un formato válido.");
  const mime = match[1]!;
  const bin = atob(match[2]!);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  const ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  return { blob: new Blob([bytes], { type: mime }), ext };
}

/**
 * Edita la foto real de la prenda con gpt-image-2 (/v1/images/edits) para conservar
 * la prenda tal cual y solo limpiar el fondo. Devuelve PNG en base64.
 */
export const cutoutGarment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<{ b64: string | null }> => {
    const { aiImageEdit, aiImageEnabled } = await import("@/lib/ai.server");
    if (!aiImageEnabled()) return { b64: null };

    const ZONE_CUT: Record<GarmentZone, string> = {
      superior: "La foto puede ser de cuerpo completo con varias prendas: extrae SOLO la prenda SUPERIOR (camisa, blusa, sudadera, camiseta, chaqueta). Ignora por completo pantalones, shorts, faldas, calzado y accesorios.",
      inferior: "La foto puede ser de cuerpo completo con varias prendas: extrae SOLO la prenda INFERIOR (pantalón, jean, short o falda). Ignora por completo la parte superior, el calzado y los accesorios.",
      set: "La foto muestra un CONJUNTO/SET coordinado: incluye el superior y el inferior juntos como una sola composición de producto. Ignora calzado y accesorios.",
      otro: "Si hay varias prendas, elige la prenda más protagonista de la foto.",
    };

    const prompt = [
      "Mantén EXACTAMENTE la misma prenda de la foto: mismo corte, mismo color, misma textura,",
      "mismos estampados, logos, costuras y detalles. No la rediseñes ni la reemplaces por otra prenda.",
      ZONE_CUT[data.zone],
      "Solo elimina el fondo original y colócala como fotografía de producto de e-commerce:",
      "prenda centrada y completa, sin persona, sin manos, sin percha visible, sin texto añadido,",
      "fondo liso crema muy claro (#f2ece0), iluminación suave y difusa con una sombra sutil debajo.",
    ].join(" ");

    const { blob, ext } = dataUrlToBlob(data.imageDataUrl);
    const form = new FormData();
    form.append("prompt", prompt);
    form.append("image", blob, `prenda.${ext}`);
    form.append("size", "1024x1024");
    form.append("quality", "medium");

    const res = await aiImageEdit(form);
    if (!res.ok) throw gatewayError(res.status, await res.text().catch(() => ""));

    const json = (await res.json()) as { data?: { b64_json?: string }[] };
    return { b64: json.data?.[0]?.b64_json ?? null };
  });
