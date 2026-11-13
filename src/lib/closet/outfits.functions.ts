import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Piece = z.object({
  id: z.string(),
  name: z.string(),
  garment_type: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
});

const Input = z.object({
  base: Piece.extend({ kind: z.enum(["closet", "product"]) }),
  closet: z.array(Piece).default([]),
});

export type ComboProductRef = {
  id: string;
  slug: string;
  name: string;
  image: string | null;
  price_cop: number | null;
};

export type ComboGroup = {
  key: "closet" | "complete" | "ways";
  title: string;
  looks: Array<{
    title: string;
    reason: string;
    closetIds: string[];
    products: ComboProductRef[];
  }>;
};

export type CombineResult = { groups: ComboGroup[]; note: string };

function gatewayError(status: number, body: string): Error {
  if (status === 429) return new Error("Muchas solicitudes seguidas. Intenta de nuevo en un momento.");
  if (status === 402) return new Error("El saldo de la cuenta de IA se agotó. Recárgalo para seguir combinando.");
  if (status === 403) return new Error("La llave de IA no tiene permiso para este modelo.");
  return new Error(body.slice(0, 200) || "No pudimos armar las combinaciones.");
}

/** Cruza una prenda base con el guardarropa real y el catálogo publicado. */
export const suggestCombinations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }): Promise<CombineResult> => {
    const { data: rows, error } = await context.supabase
      .from("products")
      .select("id, slug, name, product_type, tags, hero_image_url, product_variants(price_cop, active)")
      .eq("status", "published").or("available_national.eq.true,available_international.eq.true")
      .limit(60);
    if (error) throw error;

    const catalog = ((rows ?? []) as any[]).map((p) => {
      const prices = (p.product_variants ?? [])
        .filter((v: any) => v.active)
        .map((v: any) => v.price_cop as number);
      return {
        id: p.id as string,
        slug: p.slug as string,
        name: p.name as string,
        image: (p.hero_image_url as string | null) ?? null,
        price_cop: prices.length ? Math.min(...prices) : null,
        type: (p.product_type as string | null) ?? "",
        tags: (p.tags as string[]) ?? [],
      };
    });
    const byId = new Map(catalog.map((c) => [c.id, c]));

    const { aiChat, aiEnabled, aiContent } = await import("@/lib/ai.server");
    if (!aiEnabled() || catalog.length === 0) {
      return {
        groups: [
          {
            key: "complete",
            title: "Completa el look",
            looks: catalog.slice(0, 3).map((c) => ({
              title: c.name,
              reason: "Pieza de la colección que combina con tu prenda.",
              closetIds: [],
              products: [{ id: c.id, slug: c.slug, name: c.name, image: c.image, price_cop: c.price_cop }],
            })),
          },
        ],
        note: "",
      };
    }

    const system = [
      "Eres estilista de Tu Marca, marca de moda colombiana. Hablas español colombiano, cálido y breve.",
      "Recibes una prenda base, el closet real de la clienta y el catálogo publicado.",
      "Devuelves SOLO JSON válido:",
      '{"note":"","groups":[{"key":"closet|complete|ways","title":"","looks":[{"title":"","reason":"","closet_ids":[],"product_ids":[]}]}]}',
      "Incluye siempre los tres grupos en este orden: closet ('Con lo que ya tienes'), complete ('Completa el look'), ways ('3 formas de usarlo': día, noche, viaje o trabajo).",
      "El grupo closet usa SOLO prendas del closet (closet_ids); si el closet tiene menos de 2 prendas además de la base, devuélvelo con looks vacíos.",
      "complete: 1 o 2 product_ids por look, máximo 3 looks. ways: exactamente 3 looks, cada uno puede mezclar closet_ids y product_ids.",
      "Usa únicamente ids que existan en los datos entregados. reason: una sola frase corta.",
    ].join(" ");

    const prompt = [
      `Prenda base: ${JSON.stringify(data.base)}`,
      `Closet de la clienta: ${JSON.stringify(data.closet)}`,
      `Catálogo: ${JSON.stringify(catalog.map((c) => ({ id: c.id, name: c.name, type: c.type, tags: c.tags })))}`,
    ].join("\n");

    const res = await aiChat({
      json: true,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    });
    if (!res.ok) throw gatewayError(res.status, await res.text().catch(() => ""));

    const text = aiContent(await res.json());
    const match = text.match(/\{[\s\S]*\}/);
    const parsed = match ? JSON.parse(match[0]) : {};
    const closetIdSet = new Set(data.closet.map((c) => c.id));

    const titles: Record<ComboGroup["key"], string> = {
      closet: "Con lo que ya tienes",
      complete: "Completa el look",
      ways: "3 formas de usarlo",
    };

    const groups: ComboGroup[] = (["closet", "complete", "ways"] as const).map((k) => {
      const raw = (parsed.groups ?? []).find((g: any) => g?.key === k);
      const looks = ((raw?.looks ?? []) as any[])
        .map((l) => ({
          title: typeof l?.title === "string" ? l.title : "",
          reason: typeof l?.reason === "string" ? l.reason : "",
          closetIds: (Array.isArray(l?.closet_ids) ? l.closet_ids : []).filter((id: string) => closetIdSet.has(id)),
          products: (Array.isArray(l?.product_ids) ? l.product_ids : [])
            .map((id: string) => byId.get(id))
            .filter(Boolean)
            .map((c: any) => ({ id: c.id, slug: c.slug, name: c.name, image: c.image, price_cop: c.price_cop })),
        }))
        .filter((l) => l.closetIds.length > 0 || l.products.length > 0)
        .slice(0, 3);
      return { key: k, title: typeof raw?.title === "string" && raw.title ? raw.title : titles[k], looks };
    });

    return { groups, note: typeof parsed.note === "string" ? parsed.note : "" };
  });
