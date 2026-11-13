import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, ChevronUp, Minus, Plus, X } from "lucide-react";
import { ProductSaleNotice, ProductSalePrice, type SaleNoticeState } from "@/components/storefront/product-sale";
import { usePrice } from "@/lib/locale";
import type { JourneyBlock, JourneyMedia } from "@/lib/journey";
import { FavoriteButton } from "@/components/storefront/favorite-button";
import { AutoVideo } from "@/components/media/auto-video";

const EASE = [0.22, 1, 0.36, 1] as const;

export type ConfPanel = "open" | "compact" | "closed";
export type ConfColor = { color: string; hex: string | null };
export type ConfSize = { id: string; label: string; disabled: boolean; storeOnly: boolean };
export type ConfVersion = { slug: string; label: string; current: boolean };

type Props = {
  name: string;
  priceCop: number;
  priceUsd?: number | null;
  compareAtCop?: number | null;
  compareAtUsd?: number | null;
  saleState: SaleNoticeState;
  description?: string | null;
  media: JourneyMedia[];
  blocks: JourneyBlock[];
  versions?: ConfVersion[];
  onPickVersion?: (slug: string) => void;
  colors: ConfColor[];
  color: string;
  colorTouched: boolean;
  onPickColor: (c: string) => void;
  sizes: ConfSize[];
  variantId: string | null;
  sizeTouched: boolean;
  onPickSize: (id: string) => void;
  availabilityLabel: string;
  urgent: boolean;
  soldOut: boolean;
  onAdd: (qty: number) => void;
  onSizeGuide: () => void;
  recommendations?: { id: string; name: string; imageUrl?: string | null }[];
  lookCount?: number;
  onOpenLook?: () => void;
  panel: ConfPanel;
  onPanelChange: (next: ConfPanel) => void;
};

export function MobileConfigurator(p: Props) {
  const money = usePrice();
  const panel = p.panel;
  const setPanel = p.onPanelChange;
  const [qty, setQty] = useState(1);
  const [slide, setSlide] = useState(0);
  const railRef = useRef<HTMLDivElement>(null);

  const media = useMemo(() => {
    const seen = new Set<string>();
    return p.media.filter((item) => {
      if (!item?.url || seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  }, [p.media]);

  // Al cambiar de color la galería cambia: vuelve a la primera foto.
  const mediaKey = media.map((m) => m.url).join("|");
  useEffect(() => {
    setSlide(0);
    railRef.current?.scrollTo({ left: 0 });
  }, [mediaKey]);

  const colorDone = p.colors.length <= 1 || p.colorTouched;
  const canBuy = colorDone && p.sizeTouched && !p.soldOut;
  const chosenSize = p.sizes.find((s) => s.id === p.variantId)?.label;
  const ctaLabel = p.soldOut ? "Agotado" : !colorDone ? "Elige un color" : !p.sizeTouched ? "Elige tu talla" : "Agregar al carrito";

  const add = () => {
    if (!canBuy) {
      setPanel("open");
      return;
    }
    p.onAdd(qty);
  };

  return (
    <section className="relative md:hidden">
      <div
        ref={railRef}
        onScroll={(event) => {
          const width = event.currentTarget.clientWidth || 1;
          setSlide(Math.round(event.currentTarget.scrollLeft / width));
        }}
        className="flex h-[76svh] snap-x snap-mandatory overflow-x-auto bg-surface [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {media.map((item, index) => (
          <figure key={`${item.url}-${index}`} className="h-full w-full shrink-0 snap-center">
            {item.type === "video" ? (
              <AutoVideo src={item.url} priority={index === 1} className="size-full object-cover" />
            ) : (
              <img src={item.url} alt={item.alt ?? `${p.name} ${index + 1}`} loading={index === 0 ? "eager" : "lazy"} className="size-full object-cover" />
            )}
          </figure>
        ))}
      </div>

      {media.length > 1 && (
        <div className="pointer-events-none absolute inset-x-0 top-[calc(76svh-2rem)] z-10 flex justify-center gap-1.5">
          {media.map((item, index) => (
            <span key={`${item.url}-dot`} className={`h-1 rounded-full transition-all ${slide === index ? "w-5 bg-ivory" : "w-1 bg-ivory/50"}`} />
          ))}
        </div>
      )}


      <AnimatePresence>
        {panel !== "closed" && (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.45, ease: EASE }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={0.16}
            onDragEnd={(_, info) => {
              if (info.offset.y > 110 || info.velocity.y > 650) setPanel("closed");
              else if (info.offset.y > 45) setPanel("compact");
              else if (info.offset.y < -35) setPanel("open");
            }}
            className="fixed inset-x-3 bottom-2 z-50 overflow-hidden rounded-xl border border-ivory/15 bg-ink text-ivory shadow-2xl touch-pan-x"
          >
            <div className="flex justify-center pt-1">
              <span className="h-0.5 w-8 rounded-full bg-ivory/30" />
            </div>

            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 pb-2 pt-1">
              <div className="min-w-0">
                <p className="truncate font-nm text-sm leading-tight">{p.name}</p>
                <ProductSalePrice variant={{ price_cop: p.priceCop, price_usd: p.priceUsd, compare_at_cop: p.compareAtCop, compare_at_usd: p.compareAtUsd }} />
              </div>
              <div className="flex shrink-0 items-center gap-0">
                <FavoriteButton variantId={p.variantId} tone="light" className="size-7 border-0" />
                <button onClick={() => setPanel(panel === "open" ? "compact" : "open")} aria-label={panel === "open" ? "Minimizar" : "Abrir opciones"} className="grid size-7 place-items-center text-ivory/75">
                  {panel === "open" ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
                </button>
                <button onClick={() => setPanel("closed")} aria-label="Cerrar opciones" className="grid size-7 place-items-center text-ivory">
                  <X className="size-3.5" />
                </button>
              </div>
            </div>

            <AnimatePresence initial={false}>
              {panel === "open" && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.35, ease: EASE }} className="overflow-hidden">
                  <div className="max-h-[52svh] overflow-y-auto border-t border-ivory/20 px-3.5 pb-3.5 pt-3">
                    {(p.versions?.length ?? 0) > 1 && (
                      <div className="mb-3">
                        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-ivory/55">Versión</p>
                        <div className="mt-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Versión">
                          {p.versions!.map((v) => (
                            <button key={v.slug} role="radio" aria-checked={v.current} onClick={() => p.onPickVersion?.(v.slug)} className={`flex items-center gap-1.5 border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] ${v.current ? "border-ivory bg-ivory text-ink" : "border-ivory/20 text-ivory/60"}`}>
                              {v.label}{v.current && <Check className="size-2.5" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {p.colors.length > 1 && (
                      <div>
                        <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-ivory/55">Color</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {p.colors.map((c) => {
                            const active = p.colorTouched && p.color === c.color;
                            return (
                              <button key={c.color} onClick={() => p.onPickColor(c.color)} className={`flex items-center gap-1.5 border px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.14em] ${active ? "border-ivory text-ivory" : "border-ivory/20 text-ivory/60"}`}>
                                <span className="size-2.5 rounded-full border border-ivory/30" style={{ background: c.hex ?? "#aaa" }} />
                                {c.color}{active && <Check className="size-2.5" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className={p.colors.length > 1 ? "mt-3" : ""}>
                      <p className="font-nm text-lg">Elige tu talla</p>
                      <div className="mt-2.5 grid grid-cols-4 gap-1.5">
                        {p.sizes.map((size) => {
                          const active = p.sizeTouched && size.id === p.variantId;
                          return (
                            <button key={size.id} disabled={size.disabled} onClick={() => p.onPickSize(size.id)} className={`relative h-9 rounded-md border font-mono text-[10px] uppercase tracking-[0.14em] ${active ? "border-ivory bg-ivory text-ink" : size.disabled ? "border-ivory/10 text-ivory/25 line-through" : "border-ivory/25 text-ivory"}`}>
                              {size.label}
                              {size.storeOnly && !size.disabled && <span className="absolute right-1 top-1 size-1 rounded-full bg-moss" />}
                            </button>
                          );
                        })}
                      </div>
                      <button onClick={p.onSizeGuide} className="mt-2.5 font-mono text-[9px] uppercase tracking-[0.18em] text-ivory/70 underline">¿Cuál es mi talla?</button>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-ivory/15 pt-2.5">
                      <div>
                        <p className="font-mono text-[8px] uppercase tracking-[0.18em] text-ivory/45">Disponibilidad</p>
                        <p className={`mt-0.5 text-[11px] ${p.soldOut ? "text-ivory/45" : p.urgent ? "text-accent" : "text-moss-light"}`}>{p.availabilityLabel}</p>
                      </div>
                      <div className="flex items-center gap-2.5">
                        <button onClick={() => setQty((value) => Math.max(1, value - 1))} aria-label="Restar" className="grid size-7 place-items-center border border-ivory/25"><Minus className="size-2.5" /></button>
                        <span className="w-3.5 text-center font-mono text-[11px]">{qty}</span>
                        <button onClick={() => setQty((value) => value + 1)} aria-label="Sumar" className="grid size-7 place-items-center border border-ivory/25"><Plus className="size-2.5" /></button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="border-t border-ivory/15 px-3 pb-2.5 pt-2">
              {panel === "compact" && (p.sizeTouched || p.colorTouched) && <p className="mb-1.5 truncate text-center font-mono text-[8px] uppercase tracking-[0.16em] text-ivory/55">{[p.colorTouched ? p.color : null, chosenSize].filter(Boolean).join(" · ")}</p>}
              <ProductSaleNotice state={p.saleState} />
              <button disabled={p.soldOut} onClick={add} className="flex min-h-[54px] w-full items-center justify-center gap-2 rounded-xl bg-ivory px-4 py-3.5 font-mono text-[11px] uppercase tracking-[0.18em] text-ink transition active:scale-[0.98] disabled:bg-ivory/25 disabled:text-ivory/50">{ctaLabel}{canBuy ? ` · ${money(p.priceCop * qty, p.priceUsd ? p.priceUsd * qty : null)}` : ""}</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </section>
  );
}
