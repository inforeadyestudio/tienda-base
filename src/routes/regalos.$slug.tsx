import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Gift, ShoppingBag } from "lucide-react";
import { SiteNav } from "@/components/storefront/site-nav";
import { SiteFooter } from "@/components/storefront/site-footer";
import { supabase } from "@/integrations/supabase/client";
import { addToCart } from "@/lib/cart";
import { formatCOP } from "@/lib/format";
import { fetchGiftItems, type GiftList } from "@/lib/gifts";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/regalos/$slug")({
  head: ({ params }) =>
    seoHead({
      title: "Lista de regalos | Tu Marca",
      description: "Elige un regalo de esta lista Tu Marca y hazlo llegar donde quieras.",
      path: `/regalos/${params.slug}`,
      noindex: true,
    }),
  component: PublicGiftList,
});

function PublicGiftList() {
  const { slug } = Route.useParams();

  const listQuery = useQuery({
    queryKey: ["public-gift-list", slug],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gift_lists")
        .select("*")
        .eq("slug", slug)
        .eq("is_public", true)
        .maybeSingle();
      if (error) throw error;
      return (data as GiftList | null) ?? null;
    },
  });

  const list = listQuery.data;

  const itemsQuery = useQuery({
    queryKey: ["public-gift-items", list?.id],
    enabled: !!list,
    queryFn: () => fetchGiftItems(list!.id),
  });

  const items = itemsQuery.data ?? [];

  return (
    <div className="min-h-screen bg-ivory">
      <SiteNav />
      <div className="mx-auto max-w-5xl px-6 py-14">
        {listQuery.isLoading ? (
          <p className="py-24 text-center text-moss/70">Cargando lista…</p>
        ) : !list ? (
          <div className="py-24 text-center">
            <Gift className="mx-auto h-7 w-7 text-moss" strokeWidth={1.25} />
            <p className="mt-4 text-moss/70">Esta lista de regalos no está disponible.</p>
            <Link
              to="/coleccion/$slug"
              params={{ slug: "todo" }}
              className="mt-6 inline-block border border-ink/20 px-6 py-4 text-[11px] uppercase tracking-[0.2em] hover:border-ink"
            >
              Explorar piezas
            </Link>
          </div>
        ) : (
          <>
            <header className="mb-12 text-center">
              <p className="text-[11px] uppercase tracking-[0.24em] text-moss">
                {list.occasion || "Lista de regalos"}
              </p>
              <h1 className="mt-3 font-serif italic text-5xl">{list.title}</h1>
              {list.owner_name && <p className="mt-2 text-moss">de {list.owner_name}</p>}
              {list.event_date && (
                <p className="mt-1 text-xs text-moss/70">
                  {new Date(list.event_date + "T00:00:00").toLocaleDateString("es-CO", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                </p>
              )}
              {list.message && (
                <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-moss">{list.message}</p>
              )}
              <p className="mx-auto mt-6 max-w-xl text-xs leading-relaxed text-moss/70">
                Elige una pieza y agrégala al carrito. En el pago puedes decidir si la enviamos a la dirección de la
                lista o a la tuya. Nunca verá quién le regaló qué.
              </p>
            </header>

            {items.length === 0 ? (
              <p className="py-16 text-center text-moss/70">Todavía no hay piezas en esta lista.</p>
            ) : (
              <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((it) => {
                  const taken = it.purchased_qty >= it.qty_wanted;
                  return (
                    <li key={it.id} className="group">
                      <div className="relative aspect-[3/4] overflow-hidden bg-cream">
                        {it.imageUrl && (
                          <img
                            src={it.imageUrl}
                            alt={it.productName}
                            loading="lazy"
                            className={`h-full w-full object-cover transition duration-700 group-hover:scale-105 ${taken ? "opacity-40" : ""}`}
                          />
                        )}
                        {taken && (
                          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1 text-[10px] uppercase tracking-[0.16em] text-ivory">
                            <Check className="h-3 w-3" strokeWidth={2} /> Ya regalado
                          </span>
                        )}
                      </div>
                      <div className="mt-4">
                        <h2 className="font-serif italic text-xl">{it.productName}</h2>
                        <p className="text-xs text-moss">{it.variantLabel || "Talla única"}</p>
                        <p className="mt-1 text-sm">{formatCOP(it.priceCop)}</p>
                        {it.note && <p className="mt-1 text-xs italic text-moss/70">“{it.note}”</p>}
                        {!taken && it.purchased_qty > 0 && (
                          <p className="mt-1 text-[11px] text-moss/70">
                            {it.purchased_qty} de {it.qty_wanted} ya regaladas
                          </p>
                        )}
                        <button
                          disabled={taken || !it.variant_id}
                          onClick={async () => {
                            const ok = await addToCart({
                              variantId: it.variant_id!,
                              productId: it.product_id ?? "",
                              productSlug: it.productSlug,
                              productName: it.productName,
                              variantLabel: it.variantLabel,
                              priceCop: it.priceCop,
                              imageUrl: it.imageUrl,
                              qty: 1,
                              giftItemId: it.id,
                              giftListId: it.list_id,
                              giftListSlug: slug,
                              giftOwnerName: list.owner_name ?? list.title,
                            });
                            if (ok) toast.success("Regalo agregado al carrito");
                          }}
                          className="mt-3 inline-flex w-full items-center justify-center gap-2 border border-ink/20 px-5 py-3 text-[11px] uppercase tracking-[0.2em] transition hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ShoppingBag className="h-4 w-4" strokeWidth={1.5} />
                          {taken ? "Ya lo regalaron" : "Regalar esta pieza"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}
      </div>
      <SiteFooter />
    </div>
  );
}
