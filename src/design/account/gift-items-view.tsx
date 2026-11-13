// Diseño (editable desde Claude). Datos y acciones llegan en `vm`; no calcules precios ni stock aquí.
import { Gift, Plus, Link2, Trash2, Search, Check, X, MapPin } from "lucide-react";
import { formatCOP } from "@/lib/format";
import { GiftItemsVM, useGiftItems } from "@/logic/account/use-gift-items";
import { VariantRow } from "@/logic/account/use-gift-items";


export function GiftItemsView({ vm }: { vm: GiftItemsVM }) {
  const { query, setQuery, debounced, picking, setPicking, searchQuery, addItem, removeItem, setQty, items, gifted } = vm;
  return (
    <section className="rounded-2xl border border-ink/5 bg-white/60 p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-nm text-xl leading-tight">Piezas de tu lista</h3>
          <p className="text-[11px] text-moss/70">
            {items.length} pieza(s) · {gifted} ya te la(s) regalaron
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-moss" strokeWidth={1.5} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar una pieza…"
            className={inp + " pl-9"}
          />
        </div>
      </div>

      {debounced.length > 1 && (
        <div className="rounded-xl border border-ink/10 bg-cream/40 p-3">
          {searchQuery.isLoading ? (
            <p className="text-xs text-moss">Buscando…</p>
          ) : (searchQuery.data?.length ?? 0) === 0 ? (
            <p className="text-xs text-moss">Sin resultados.</p>
          ) : (
            <ul className="space-y-2">
              {searchQuery.data!.map((p) => (
                <li key={p.id} className="rounded-lg bg-white/70 p-2">
                  <button
                    onClick={() => setPicking(picking?.id === p.id ? null : p)}
                    className="flex w-full items-center gap-3 text-left"
                  >
                    <div className="h-12 w-10 shrink-0 overflow-hidden rounded bg-cream">
                      {p.hero_image_url && <img src={p.hero_image_url} alt="" className="h-full w-full object-cover" />}
                    </div>
                    <span className="flex-1 text-sm">{p.name}</span>
                    <Plus className="h-4 w-4 text-moss" strokeWidth={1.5} />
                  </button>
                  {picking?.id === p.id && (
                    <div className="mt-2 flex flex-wrap gap-1.5 border-t border-ink/10 pt-2">
                      {p.product_variants.length === 0 && <span className="text-xs text-moss">Sin variantes disponibles.</span>}
                      {p.product_variants.map((v) => (
                        <button
                          key={v.id}
                          onClick={() => addItem.mutate({ product: p, variant: v })}
                          className="rounded-full border border-ink/15 px-3 py-1 text-xs hover:border-ink"
                        >
                          {[v.size, v.color].filter(Boolean).join(" · ") || "Única"} · {formatCOP(v.price_cop)}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed border-ink/15 px-4 py-8 text-center text-sm text-moss">
          Busca arriba y agrega las piezas que te encantaría recibir.
        </p>
      ) : (
        <ul className="divide-y divide-ink/10">
          {items.map((it) => {
            const done = it.purchased_qty >= it.qty_wanted;
            return (
              <li key={it.id} className="flex items-center gap-3 py-3">
                <div className="h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-cream">
                  {it.imageUrl && <img src={it.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{it.productName}</p>
                  <p className="text-xs text-moss">{it.variantLabel || "Talla única"} · {formatCOP(it.priceCop)}</p>
                  {it.purchased_qty > 0 && (
                    <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-moss/10 px-2 py-0.5 text-[10px] text-moss">
                      <Check className="h-3 w-3" strokeWidth={2} />
                      {done ? "¡Ya te lo regalaron!" : `${it.purchased_qty} de ${it.qty_wanted} regaladas`}
                    </p>
                  )}
                </div>
                <input
                  type="number"
                  min={1}
                  value={it.qty_wanted}
                  onChange={(e) => setQty.mutate({ id: it.id, qty: Math.max(1, Number(e.target.value) || 1) })}
                  className="w-14 rounded-lg border border-ink/15 bg-white/70 px-2 py-1 text-center text-xs"
                  title="Cuántas quieres"
                />
                <button onClick={() => removeItem.mutate(it.id)} className="text-moss hover:text-clay" title="Quitar">
                  <X className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function ItemsPanel({ listId }: { listId: string }) {
  const vm = useGiftItems({ listId });
  return <GiftItemsView vm={vm} />;
}
const inp =
  "w-full rounded-xl border border-ink/15 bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-ink";
