import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  query: z.string(),
  vocabulary: z.object({
    types: z.array(z.string()),
    colors: z.array(z.string()),
    sizes: z.array(z.string()),
    materials: z.array(z.string()),
    tags: z.array(z.string()),
  }),
  current: z.record(z.string(), z.any()).optional(),
});

export type ParsedShopQuery = {
  types: string[];
  colors: string[];
  sizes: string[];
  materials: string[];
  tags: string[];
  min: number | null;
  max: number | null;
  availability: "all" | "now" | "cali" | "bogota" | "online";
  q: string;
  note: string;
};

const FALLBACK: ParsedShopQuery = {
  types: [],
  colors: [],
  sizes: [],
  materials: [],
  tags: [],
  min: null,
  max: null,
  availability: "all",
  q: "",
  note: "",
};

/** Interpreta lenguaje natural ("algo negro para una cena por menos de 600.000") como filtros de tienda. */
export const parseShopQuery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }): Promise<ParsedShopQuery> => {
    const { aiChat, aiEnabled, aiContent } = await import("@/lib/ai.server");
    if (!aiEnabled()) return { ...FALLBACK, q: data.query };

    const system = [
      "Eres el asistente de compras de Tu Marca, una marca de moda colombiana.",
      "Conviertes lo que dice una clienta en filtros de catálogo.",
      "Responde SOLO con JSON válido con estas claves exactas:",
      '{"types":[],"colors":[],"sizes":[],"materials":[],"tags":[],"min":null,"max":null,"availability":"all","q":"","note":""}',
      "Usa únicamente valores que existan en el vocabulario entregado (copia el texto exacto).",
      "min y max son precios en pesos colombianos (números, sin puntos).",
      "availability: all | now | cali | bogota | online.",
      "q: 1 o 2 palabras de búsqueda libre solo si nada del vocabulario aplica; si no, cadena vacía.",
      "note: una frase corta y cálida en español explicando qué vas a mostrar.",
    ].join(" ");

    const prompt = [
      `Vocabulario disponible: ${JSON.stringify(data.vocabulary)}`,
      data.current ? `Filtros actuales: ${JSON.stringify(data.current)}` : "",
      `Mensaje de la clienta: "${data.query}"`,
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const res = await aiChat({
        json: true,
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      });
      if (!res.ok) {
        const message = await res.text();
        if (res.status === 429) throw new Error("Demasiadas búsquedas seguidas, intenta en un momento.");
        if (res.status === 402) throw new Error("La búsqueda inteligente no está disponible ahora mismo.");
        throw new Error(message.slice(0, 200) || "No pudimos interpretar tu búsqueda.");
      }
      const payload = await res.json();
      const text = aiContent(payload);
      const match = text.match(/\{[\s\S]*\}/);
      const parsed = match ? JSON.parse(match[0]) : {};
      return {
        ...FALLBACK,
        ...parsed,
        types: Array.isArray(parsed.types) ? parsed.types : [],
        colors: Array.isArray(parsed.colors) ? parsed.colors : [],
        sizes: Array.isArray(parsed.sizes) ? parsed.sizes : [],
        materials: Array.isArray(parsed.materials) ? parsed.materials : [],
        tags: Array.isArray(parsed.tags) ? parsed.tags : [],
        min: typeof parsed.min === "number" ? parsed.min : null,
        max: typeof parsed.max === "number" ? parsed.max : null,
        availability: ["all", "now", "cali", "bogota", "online"].includes(parsed.availability)
          ? parsed.availability
          : "all",
        q: typeof parsed.q === "string" ? parsed.q : "",
        note: typeof parsed.note === "string" ? parsed.note : "",
      };
    } catch (error) {
      throw error instanceof Error ? error : new Error("No pudimos interpretar tu búsqueda.");
    }
  });