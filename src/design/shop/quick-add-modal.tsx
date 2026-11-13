import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "sonner";
import { catalogQuery, type ShopProduct } from "@/lib/tienda/catalog";
import { useCart } from "@/lib/cart";
import { usePrice } from "@/lib/locale";
import { cn } from "@/lib/utils";
import { compareSizes, displaySize } from "@/lib/size-order";

type Props = {
  productId: string;
  open: boolean;
  onClose: () => void;
  /** Optional preloaded product to skip the catalog lookup */
  product?: ShopProduct;
};

export function QuickAddModal({ productId, open, onClose, product: preloaded }: Props) {
  const { add } = useCart();
  const money = usePrice();
  const { data: catalog, isLoading } = useQuery({ ...catalogQuery(), enabled: open && !preloaded });
  const product = preloaded ?? (catalog as ShopProduct[] | undefined)?.find((p) => p.id === productId);

  const colors = product?.colors ?? [];
  const [color, setColor] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open) return;
    setColor(colors[0]?.name ?? null);
    setSize(null);
  }, [open, product?.id]);

  // Una sola opción por talla, sin el dato de calidad y en orden XS, S, M, L, Único.
  const sizes = useMemo(() => {
    const vs = (product?.variants ?? []).filter(
      (v) => v.active && v.available > 0 && (!color || !v.color || v.color === color),
    );
    const bySize = new Map<string, (typeof vs)[number]>();
    for (const v of vs) {
      const label = displaySize(v.size);
      if (!bySize.has(label)) bySize.set(label, v);
    }
    return Array.from(bySize.entries()).sort(([a], [b]) => compareSizes(a, b));
  }, [product, color]);

  useEffect(() => {
    if (sizes.length === 1) setSize(sizes[0]![0]);
  }, [sizes.length, product?.id, color]);

  if (!open) return null;

  const chosen = sizes.find(([label]) => label === size)?.[1] ?? null;


  const submit = async () => {
    if (!product || !chosen || adding) return;
    setAdding(true);
    try {
      const ok = await add({
        variantId: chosen.id,
        productId: product.id,
        productSlug: product.slug,
        productName: product.name,
        variantLabel: [chosen.color, displaySize(chosen.size)].filter(Boolean).join(" · "),
        priceCop: chosen.price_cop,
        priceUsd: chosen.price_usd ?? null,
        imageUrl: product.images[0] ?? product.hero_image_url ?? null,
        qty: 1,
      });
      if (!ok) return; // talla agotada: add() ya mostró el aviso y el modal queda abierto
      toast.success(`${product.name} agregado`);
      onClose();
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-6">
      <button type="button" aria-label="Cerrar" className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-md bg-shell p-5 shadow-xl sm:p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-3 opacity-50 transition-opacity hover:opacity-100"
          aria-label="Cerrar"
        >
          <X className="size-4" />
        </button>

        {!product ? (
          <p className="py-8 text-center font-nm text-[11px] uppercase tracking-[0.2em] opacity-60">
            {isLoading ? "Cargando…" : "Producto no disponible"}
          </p>
        ) : (
          <>
            <div className="flex items-center gap-4">
              {(product.images[0] ?? product.hero_image_url) && (
                <img
                  src={product.images[0] ?? product.hero_image_url!}
                  alt={product.name}
                  className="h-20 w-16 flex-none object-cover"
                />
              )}
              <div className="min-w-0">
                <p className="truncate font-serif italic text-[17px]">{product.name}</p>
                <p className="mt-1 font-nm text-[11px] uppercase tracking-[0.15em] text-ink/60">
                  {money(chosen?.price_cop ?? product.minPrice, chosen?.price_usd ?? product.minPriceUsd)}
                </p>
              </div>
            </div>

            {colors.length > 1 && (
              <div className="mt-5">
                <p className="font-nm text-[9px] uppercase tracking-[0.2em] opacity-50">Color</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {colors.map((c) => (
                    <button
                      key={c.name}
                      type="button"
                      onClick={() => setColor(c.name)}
                      className={cn(
                        "flex items-center gap-2 border px-2.5 py-1 font-nm text-[10px] uppercase tracking-[0.14em] transition-colors",
                        color === c.name ? "border-ink" : "border-ink/20 hover:border-ink/50",
                      )}
                    >
                      <span className="size-2.5 rounded-full border border-ink/20" style={{ background: c.hex }} />
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5">
              <p className="font-nm text-[9px] uppercase tracking-[0.2em] opacity-50">Talla</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {sizes.length === 0 && (
                  <span className="font-nm text-[10px] uppercase tracking-[0.14em] opacity-50">Agotado</span>
                )}
                {sizes.map(([label]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setSize(label)}
                    className={cn(
                      "min-w-11 border px-3 py-1.5 font-nm text-[10px] uppercase tracking-[0.14em] transition-colors",
                      size === label ? "border-ink bg-ink text-ivory" : "border-ink/20 hover:border-ink/50",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              disabled={!chosen || adding}
              onClick={submit}
              className="mt-6 w-full bg-ink py-3 font-nm text-[10px] uppercase tracking-[0.25em] text-ivory transition-opacity disabled:opacity-40"
            >
              Agregar al carrito
            </button>
          </>
        )}
      </div>
    </div>
  );
}
