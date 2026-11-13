import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { addToCart, itemUsd } from "@/lib/cart";
import { formatCOP, formatUSD } from "@/lib/format";

type OfferItem = { variant_id: string; qty: number };

/** Ofertas cross/upsell marcadas para la página de gracias. Se agregan al carrito con precio normal de tienda. */
export function ThankYouOffers({ currency }: { currency: "COP" | "USD" | string }) {
  const { data } = useQuery({
    queryKey: ["web-offers", "web_thankyou"],
    queryFn: async () => {
      const { data: offers } = await supabase
        .from("pos_offers")
        .select("id, name, kind, image_url, note, items, placements")
        .eq("active", true)
        .contains("placements", ["web_thankyou"])
        .order("position");
      const list = (offers ?? []) as unknown as Array<{ id: string; name: string; kind: string; image_url: string | null; note: string | null; items: OfferItem[] }>;
      const ids = [...new Set(list.flatMap((o) => (o.items ?? []).map((i) => i.variant_id)))];
      if (!ids.length) return [];
      const { data: variants } = await supabase
        .from("product_variants")
        .select("id, size, color, price_cop, price_usd, products!inner(id, slug, name, hero_image_url, status)")
        .in("id", ids)
        .eq("active", true);
      const byId = new Map((variants ?? []).map((v: any) => [v.id, v]));
      return list
        .map((o) => ({ ...o, lines: (o.items ?? []).map((i) => ({ qty: i.qty, v: byId.get(i.variant_id) as any })).filter((l) => l.v) }))
        .filter((o) => o.lines.length > 0);
    },
  });

  if (!data?.length) return null;
  const usd = currency === "USD";

  const price = (cop: number, priceUsd: number | null, qty: number) =>
    usd ? formatUSD(itemUsd({ priceCop: cop, priceUsd } as any, 4000) * qty) : formatCOP(cop * qty);

  const add = async (o: (typeof data)[number]) => {
    const results = await Promise.all(o.lines.map(({ v, qty }) =>
      addToCart({
        variantId: v.id,
        productId: v.products.id,
        productSlug: v.products.slug,
        productName: v.products.name,
        variantLabel: [v.color, v.size].filter(Boolean).join(" · "),
        priceCop: Number(v.price_cop),
        priceUsd: v.price_usd,
        imageUrl: v.products.hero_image_url,
        qty,
      })));
    if (results.some((r) => !r)) return;
    toast.success(`${o.name} agregado a tu selección`);
  };

  return (
    <section className="mt-14 text-left">
      <p className="text-[11px] uppercase tracking-[0.2em] text-moss/70 text-center">Completa tu look</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {data.map((o) => (
          <div key={o.id} className="border border-ink/10 bg-ivory/60">
            {(o.image_url || o.lines[0]?.v.products.hero_image_url) && (
              <img src={o.image_url || o.lines[0].v.products.hero_image_url} alt={o.name} loading="lazy" className="aspect-[4/5] w-full object-cover" />
            )}
            <div className="p-4">
              <div className="font-serif italic text-lg">{o.name}</div>
              {o.note && <p className="mt-1 text-xs text-moss">{o.note}</p>}
              <ul className="mt-3 space-y-1 text-xs text-moss">
                {o.lines.map(({ v, qty }) => (
                  <li key={v.id} className="flex justify-between gap-2">
                    <span>{v.products.name}{v.size ? ` · ${v.size}` : ""}{qty > 1 ? ` x${qty}` : ""}</span>
                    <span>{price(Number(v.price_cop), v.price_usd, qty)}</span>
                  </li>
                ))}
              </ul>
              <button onClick={() => add(o)} className="mt-4 w-full border border-ink px-4 py-3 text-[11px] uppercase tracking-[0.2em] hover:bg-ink hover:text-ivory">
                Agregar a mi selección
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
