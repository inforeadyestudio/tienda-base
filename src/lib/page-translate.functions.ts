import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function sha(text: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function aiTranslate(texts: string[]): Promise<string[]> {
  const { aiChat, aiEnabled } = await import("@/lib/ai.server");
  if (!aiEnabled()) throw new Error("missing key");
  const res = await aiChat({
      fast: true,
      messages: [
        {
          role: "system",
          content:
            "You translate a luxury Colombian fashion e-commerce site (Tu Marca) from Spanish to English. Editorial, natural tone. Keep brand names, product proper names, sizes (XS, S, M, L, U), SKUs, numbers, prices and punctuation unchanged. If a string is already English or not translatable, return it unchanged. Return ONLY a JSON array of strings, same order and length as the input.",
        },
        { role: "user", content: JSON.stringify(texts) },
      ],
  });
  if (!res.ok) throw new Error(`ai ${res.status}`);
  const json = (await res.json()) as any;
  const raw = String(json?.choices?.[0]?.message?.content ?? "[]").replace(/^```(?:json)?/i, "").replace(/```\s*$/, "").trim();
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.length !== texts.length) throw new Error("incomplete");
  return parsed.map((v, i) => (typeof v === "string" && v.trim() ? v : texts[i]!));
}

/** Traduce al inglés textos visibles de la tienda, con caché compartida en la base. */
export const translateTexts = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({ texts: z.array(z.string().min(1).max(4000)).max(80) }).parse(data),
  )
  .handler(async ({ data }): Promise<Record<string, string>> => {
    const unique = Array.from(new Set(data.texts.map((t) => t.trim()).filter(Boolean)));
    if (!unique.length) return {};
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const hashes = await Promise.all(unique.map(sha));
    const byHash = new Map(hashes.map((h, i) => [h, unique[i]!]));
    const out: Record<string, string> = {};
    const { data: rows } = await supabaseAdmin.from("ui_translations").select("source_hash, en").in("source_hash", hashes);
    for (const row of rows ?? []) {
      const src = byHash.get(row.source_hash);
      if (src) out[src] = row.en;
    }
    const missing = unique.filter((t) => !(t in out));
    for (let i = 0; i < missing.length; i += 40) {
      const chunk = missing.slice(i, i + 40);
      try {
        const en = await aiTranslate(chunk);
        const insert = await Promise.all(chunk.map(async (src, j) => ({ source_hash: await sha(src), source: src, en: en[j]! })));
        chunk.forEach((src, j) => (out[src] = en[j]!));
        await supabaseAdmin.from("ui_translations").upsert(insert, { onConflict: "source_hash", ignoreDuplicates: true });
      } catch (error) {
        console.error("translateTexts", error);
      }
    }
    return out;
  });
