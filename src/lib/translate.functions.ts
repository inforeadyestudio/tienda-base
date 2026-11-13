import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function translateBatch(texts: string[]): Promise<string[]> {
  const { aiChat } = await import("@/lib/ai.server");
  const response = await aiChat({
      fast: true,
      messages: [
        {
          role: "system",
          content:
            "Eres traductora de moda de lujo. Traduce del español al inglés con tono editorial y natural. Devuelve SOLO un array JSON de strings, en el mismo orden y con la misma cantidad de elementos que recibes. No agregues comentarios.",
        },
        { role: "user", content: JSON.stringify(texts) },
      ],
  });
  if (response.status === 429) throw new Error("Demasiadas solicitudes de traducción. Intenta en un momento.");
  if (response.status === 402) throw new Error("Se agotaron los créditos de IA para traducir.");
  if (!response.ok) throw new Error("No pudimos traducir en este momento.");
  const json = (await response.json()) as any;
  const raw = String(json?.choices?.[0]?.message?.content ?? "[]");
  const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const parsed = JSON.parse(cleaned) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== texts.length) throw new Error("La traducción llegó incompleta.");
  return parsed.map((item) => String(item ?? ""));
}

/** Traduce al inglés nombres y descripciones de productos y colecciones que aún no la tienen. */
export const translateCatalog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ overwrite: z.boolean().default(false) }).parse(data ?? {}))
  .handler(async ({ data, context }): Promise<{ products: number; collections: number }> => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Solo administradores.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: products } = await supabaseAdmin
      .from("products")
      .select("id, name, description, name_en, description_en")
      .neq("status", "archived")
      .limit(200);

    const pending = (products ?? []).filter((p) => data.overwrite || !p.name_en || (p.description && !p.description_en)).slice(0, 40);
    let translatedProducts = 0;
    if (pending.length) {
      const source = pending.flatMap((p) => [p.name ?? "", p.description ?? ""]);
      const output = await translateBatch(source);
      for (let i = 0; i < pending.length; i += 1) {
        const row = pending[i]!;
        await supabaseAdmin
          .from("products")
          .update({ name_en: output[i * 2] || row.name, description_en: output[i * 2 + 1] || null })
          .eq("id", row.id);
        translatedProducts += 1;
      }
    }

    const { data: collections } = await supabaseAdmin
      .from("collections")
      .select("id, title, subtitle, title_en, subtitle_en")
      .limit(100);
    const pendingCollections = (collections ?? []).filter((c) => data.overwrite || !c.title_en).slice(0, 30);
    let translatedCollections = 0;
    if (pendingCollections.length) {
      const source = pendingCollections.flatMap((c) => [c.title ?? "", c.subtitle ?? ""]);
      const output = await translateBatch(source);
      for (let i = 0; i < pendingCollections.length; i += 1) {
        const row = pendingCollections[i]!;
        await supabaseAdmin
          .from("collections")
          .update({ title_en: output[i * 2] || row.title, subtitle_en: output[i * 2 + 1] || null })
          .eq("id", row.id);
        translatedCollections += 1;
      }
    }

    return { products: translatedProducts, collections: translatedCollections };
  });
