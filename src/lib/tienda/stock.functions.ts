import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

/** Stock vendible en vivo de varias tallas (sin caché). Lo usa «Agregar al carrito». */
export const checkVariantStock = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ variantIds: z.array(z.string().uuid()).min(1).max(20) }).parse(d))
  .handler(async ({ data }) => {
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const sb = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h, signal: init?.signal ?? AbortSignal.timeout(3_000) });
        },
      },
    });
    const { data: rows, error } = await sb
      .from("inventory_levels")
      .select("variant_id, on_hand, reserved, locations(kind, web_lending, web_safety_stock)")
      .in("variant_id", data.variantIds);
    if (error) throw new Error("No pudimos revisar el stock");
    const levels: Record<string, any[]> = {};
    for (const id of data.variantIds) levels[id] = [];
    for (const r of rows ?? []) levels[(r as any).variant_id]?.push(r);
    return { levels };
  });
