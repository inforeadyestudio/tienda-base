import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type InventoryInsight = {
  kind: "oportunidad" | "problema" | "idea";
  title: string;
  detail: string;
  action: string;
};

export const inventoryRecommendation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ summary: string; insights: InventoryInsight[] }> => {
    const { aiChat, aiEnabled } = await import("@/lib/ai.server");
    if (!aiEnabled()) throw new Error("Falta la clave de IA.");

    const { supabase } = context;

    const [locRes, prodRes, salesRes] = await Promise.all([
      supabase.from("locations").select("id, name, code").eq("active", true),
      supabase
        .from("products")
        .select("id, name, product_type, product_variants(id, sku, size, color, active, price_cop, inventory_levels(location_id, on_hand, reserved))")
        .eq("status", "published")
        .order("name")
        .limit(300),
      supabase.rpc("product_sales_rank", { _days: 90 }),
    ]);

    const locations = locRes.data ?? [];
    const locName = new Map(locations.map((l) => [l.id, l.name]));
    const sales = new Map(((salesRes.data as { product_id: string; units: number }[] | null) ?? []).map((r) => [r.product_id, r.units]));

    const lines: string[] = [];
    for (const p of prodRes.data ?? []) {
      const variants = (p.product_variants ?? []).filter((v) => v.active);
      if (!variants.length) continue;
      const byLoc = new Map<string, number>();
      let total = 0;
      for (const v of variants) {
        for (const lvl of v.inventory_levels ?? []) {
          const free = (lvl.on_hand ?? 0) - (lvl.reserved ?? 0);
          byLoc.set(lvl.location_id, (byLoc.get(lvl.location_id) ?? 0) + free);
          total += free;
        }
      }
      const dist = locations
        .map((l) => `${locName.get(l.id)}:${byLoc.get(l.id) ?? 0}`)
        .join(" | ");
      const price = variants[0]?.price_cop ?? 0;
      lines.push(
        `${p.name} (${p.product_type ?? "s/tipo"}) · precio ${price} COP · stock ${total} · ventas90d ${sales.get(p.id) ?? 0} · ${dist}`,
      );
    }

    const prompt = `Eres analista de inventario de una marca de moda colombiana (Tu Marca) con bodega principal Bodega Central, ecommerce, tiendas Cali y Bogotá y bodega mayorista.
Analiza este inventario y responde SOLO con JSON válido:
{"summary":"2 frases","insights":[{"kind":"oportunidad|problema|idea","title":"...","detail":"...","action":"..."}]}
Máximo 6 insights, concretos, en español, mencionando productos y bodegas reales. Prioriza: quiebres de stock en productos que venden, stock muerto, desbalance entre tiendas (sugerir traslados con cantidades), y oportunidades de promoción o preventa.

INVENTARIO:
${lines.join("\n")}`;

    const res = await aiChat({ fast: true, json: true, messages: [{ role: "user", content: prompt }] });

    if (!res.ok) {
      const text = await res.text();
      if (res.status === 429) throw new Error("Demasiadas solicitudes, intenta en unos segundos.");
      if (res.status === 402) throw new Error("Se agotó el saldo de la cuenta de IA.");
      throw new Error(`No se pudo generar la recomendación (${res.status}): ${text.slice(0, 200)}`);
    }

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const content = json.choices?.[0]?.message?.content ?? "{}";
    try {
      const parsed = JSON.parse(content) as { summary?: string; insights?: InventoryInsight[] };
      return { summary: parsed.summary ?? "", insights: parsed.insights ?? [] };
    } catch {
      return { summary: content.slice(0, 500), insights: [] };
    }
  });
