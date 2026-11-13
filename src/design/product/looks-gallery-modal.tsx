import { webSellable } from "@/lib/web-stock";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { X, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCOP } from "@/lib/format";
import { shopPiecesQuery } from "@/lib/queries";
import {
  slotFromType,
  SLOT_LABELS,
  LOOK_SLOTS,
  normalizeTransform,
  pieceStyle,
  type LookSlot,
} from "@/lib/looks/board";
import type { LookRow } from "@/components/storefront/look-modal";
import type { ClosetPiece } from "@/lib/closet/queries";

type LookItem = LookRow["product_look_items"][number];

type Props = {
  open: boolean;
  onClose: () => void;
  looks: LookRow[];
  productName: string;
  productType?: string | null;
  productImage: string | null;
  basePrice?: number;
  closet: ClosetPiece[];
  onOpenLook: (look: LookRow) => void;
  onAddMatch?: (look: LookRow, items: LookItem[]) => void;
  onAddPair?: (product: any) => void;
  onCombineCloset?: () => void;
};

function publishedPieces(l: LookRow) {
  return (l.product_look_items ?? []).filter((i) =>
    i.products ? i.products.status === "published" : Boolean(i.generic_label),
  );
}

function unitsOf(v: any) {
  return ((v.inventory_levels ?? []) as any[]).reduce(
    (s: number, l: any) => s + webSellable(l),
    0,
  );
}

function pieceMinPrice(p: any) {
  const vs = (p?.product_variants ?? []).filter((v: any) => v.active && unitsOf(v) > 0);
  const prices = vs.map((v: any) => v.price_cop).filter(Boolean);
  return prices.length ? Math.min(...prices) : 0;
}

function slotOf(i: LookItem): LookSlot {
  return (LOOK_SLOTS as readonly string[]).includes(i.slot ?? "")
    ? (i.slot as LookSlot)
    : slotFromType(i.generic_type ?? i.products?.product_type ?? i.products?.name);
}

/** Una opción = un match configurado en el admin (o el look completo si no hay matches). */
type Option = { id: string; label: string; look: LookRow; items: LookItem[] };

function optionsOf(look: LookRow): Option[] {
  const pieces = publishedPieces(look);
  const byId = new Map(pieces.map((p) => [p.id, p]));
  const matches = (look.product_look_matches ?? []).slice().sort((a, b) => a.position - b.position);
  const built = matches
    .map((m, idx) => {
      const items = (m.product_look_match_items ?? [])
        .map((x) => byId.get(x.item_id))
        .filter(Boolean) as LookItem[];
      return { id: m.id, label: m.label || `Opción ${idx + 1}`, look, items };
    })
    .filter((o) => o.items.length > 0);
  if (built.length) return built;
  return pieces.length ? [{ id: look.id, label: look.title || "Look", look, items: pieces }] : [];
}

function OptionCard({
  option,
  productName,
  productImage,
  basePrice,
  onOpenLook,
  onAddMatch,
}: {
  option: Option;
  productName: string;
  productImage: string | null;
  basePrice: number;
  onOpenLook: (look: LookRow) => void;
  onAddMatch?: (look: LookRow, items: LookItem[]) => void;
}) {
  const board = (option.look.board ?? {}) as any;
  const baseSlot: LookSlot = (LOOK_SLOTS as readonly string[]).includes(board.baseSlot) ? board.baseSlot : "full";
  const baseCutout: string | null = board.baseCutout ?? null;
  const baseTransform = normalizeTransform(board.baseTransform);
  const canCompose = Boolean(baseCutout) && option.items.some((i) => i.cutout_url);

  const buyable = option.items.filter((i) => i.products && pieceMinPrice(i.products) > 0);
  const total = basePrice + buyable.reduce((s, i) => s + pieceMinPrice(i.products), 0);
  const count = buyable.length + 1;

  return (
    <div className="group">
      <button onClick={() => onOpenLook(option.look)} className="block w-full text-left">
        <div className="relative aspect-[3/4] overflow-hidden bg-ink/[0.05]">
          {canCompose ? (
            <>
              <img
                src={baseCutout!}
                alt={productName}
                className="pointer-events-none absolute object-contain"
                style={pieceStyle(baseSlot, baseTransform)}
              />
              {option.items.map((i) => {
                const src = i.cutout_url ?? i.products?.hero_image_url;
                if (!src) return null;
                return (
                  <img
                    key={i.id}
                    src={src}
                    alt={i.products?.name ?? i.generic_label ?? ""}
                    className="pointer-events-none absolute object-contain"
                    style={pieceStyle(slotOf(i), normalizeTransform(i.transform))}
                  />
                );
              })}
            </>
          ) : (
            (option.look.image_url ?? productImage) && (
              <img
                src={(option.look.image_url ?? productImage)!}
                alt={option.label}
                className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
              />
            )
          )}
        </div>
      </button>
      <p className="mt-2 font-nm text-sm">{option.label}</p>
      <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink/50">
        {productName}
        {option.items.map((i) => ` + ${i.products?.name ?? i.generic_label}`).join("")}
      </p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="font-nm text-sm">{formatCOP(total)}</p>
        <button
          onClick={() => onOpenLook(option.look)}
          className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink/50 underline-offset-4 hover:text-ink hover:underline"
        >
          Ver look
        </button>
      </div>
      {onAddMatch && buyable.length > 0 && (
        <button
          onClick={() => onAddMatch(option.look, buyable)}
          className="mt-2 inline-flex w-full items-center justify-center gap-2 border border-ink px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors hover:bg-ink hover:text-ivory"
        >
          <ShoppingBag className="size-3.5" /> Agregar {count === 2 ? "ambos" : `los ${count}`} al carrito
        </button>
      )}
    </div>
  );
}

function cutoutOf(p: any): string | null {
  const looks = (p?.product_looks ?? []) as any[];
  for (const l of looks) {
    const c = (l?.board ?? {})?.baseCutout;
    if (c) return c as string;
  }
  return (p?.hero_image_url as string) ?? null;
}

/** Compositor vertical: la pieza base abajo (o arriba) y un carrusel de prendas de la tienda al frente. */
function StackComposer({
  baseSlot,
  baseCutout,
  productName,
  basePrice,
  onAddPair,
}: {
  baseSlot: LookSlot;
  baseCutout: string | null;
  productName: string;
  basePrice: number;
  onAddPair?: (product: any) => void;
}) {
  const { data: pieces } = useQuery(shopPiecesQuery());
  const [index, setIndex] = useState(0);

  const candidates = useMemo(() => {
    const wanted: LookSlot = baseSlot === "bottom" ? "top" : baseSlot === "top" ? "bottom" : "top";
    const all = (pieces ?? []).map((p: any) => ({
      p,
      slot: slotFromType(p.product_type ?? p.name),
      price: pieceMinPrice(p),
      img: cutoutOf(p),
    }));
    const strict = all.filter((c) => c.slot === wanted && c.price > 0 && c.img);
    if (strict.length) return strict.slice(0, 12);
    // Fallback: cualquier pieza de la otra zona o con imagen disponible.
    const loose = all.filter((c) => c.slot !== baseSlot && c.price > 0 && c.img);
    return (loose.length ? loose : all.filter((c) => c.price > 0 && c.img)).slice(0, 12);
  }, [pieces, baseSlot]);

  if (!baseCutout || candidates.length === 0) return null;

  const current = candidates[Math.min(index, candidates.length - 1)];

  return (
    <div className="mb-8 border-b border-ink/10 pb-8">
      <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-ink/45">Arma el look</p>

      <div className="mt-4 flex flex-col gap-2">
        {/* Recuadro superior: carrusel de prendas que combinan */}
        <div className="relative">
          <div
            onScroll={(e) => {
              const w = e.currentTarget.clientWidth || 1;
              setIndex(Math.round(e.currentTarget.scrollLeft / w));
            }}
            className="flex snap-x snap-mandatory overflow-x-auto rounded-[2px] border border-ink/10 bg-white [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {candidates.map((c) => (
              <div key={c.p.id} className="w-full shrink-0 snap-center">
                <div className="flex aspect-square items-center justify-center p-5">
                  <img src={c.img!} alt={c.p.name} className="max-h-full max-w-full object-contain" loading="lazy" />
                </div>
              </div>
            ))}
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1">
            {candidates.map((c, i) => (
              <span
                key={c.p.id + "-dot"}
                className={cn("h-1 rounded-full transition-all", i === index ? "w-4 bg-ink/60" : "w-1 bg-ink/25")}
              />
            ))}
          </div>
        </div>

        {/* Recuadro inferior: la prenda base en PNG */}
        <div className="flex aspect-square items-center justify-center rounded-[2px] border border-ink/10 bg-white p-5">
          <img src={baseCutout} alt={productName} className="max-h-full max-w-full object-contain" />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-nm text-sm">
            {productName} + {current.p.name}
          </p>
          <p className="font-mono text-[10px] tracking-[0.16em] text-ink/55">{formatCOP(basePrice + current.price)}</p>
        </div>
        {onAddPair && (
          <button
            onClick={() => onAddPair(current.p)}
            className="inline-flex shrink-0 items-center gap-2 border border-ink px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] transition-colors hover:bg-ink hover:text-ivory"
          >
            <ShoppingBag className="size-3.5" /> Agregar ambos
          </button>
        )}
      </div>
      <p className="mt-2 text-center font-mono text-[9px] uppercase tracking-[0.18em] text-ink/40">
        Desliza el recuadro de arriba para cambiar la prenda
      </p>
    </div>
  );
}

export function LooksGalleryModal({
  open,
  onClose,
  looks,
  productName,
  productType,
  productImage,
  basePrice = 0,
  closet,
  onOpenLook,
  onAddMatch,
  onAddPair,
  onCombineCloset,
}: Props) {
  const baseSlotType: LookSlot = slotFromType(productType);

  const baseCutout = useMemo(() => {
    for (const l of looks ?? []) {
      const c = ((l as any).board ?? {})?.baseCutout;
      if (c) return c as string;
    }
    return productImage;
  }, [looks, productImage]);

  const options = useMemo(() => looks.flatMap((l) => optionsOf(l)), [looks]);

  /** Prendas del closet que complementan la pieza (zona distinta a la del producto). */
  const suggestions = useMemo(() => {
    return (closet ?? [])
      .map((c) => ({ piece: c, slot: slotFromType(c.garment_type ?? c.category ?? c.name) }))
      .filter((s) => s.slot !== baseSlotType && s.piece.image)
      .slice(0, 8);
  }, [closet, baseSlotType]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[75]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-x-0 bottom-0 top-0 mx-auto flex max-h-full w-full max-w-5xl flex-col overflow-hidden bg-ivory md:inset-8 md:rounded-[2px]"
          >
            <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4 md:px-8">
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink/60">
                Looks con {productName}
              </p>
              <button onClick={onClose} aria-label="Cerrar" className="text-ink/60 transition-colors hover:text-ink">
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-6 md:px-8 md:py-8">
              <StackComposer
                baseSlot={baseSlotType}
                baseCutout={baseCutout ?? null}
                productName={productName}
                basePrice={basePrice}
                onAddPair={onAddPair}
              />
              {options.length > 0 ? (
                <>
                  <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-ink/45">
                    Propuestas de la marca
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-5 md:grid-cols-3">
                    {options.map((o) => (
                      <OptionCard
                        key={o.look.id + "-" + o.id}
                        option={o}
                        productName={productName}
                        productImage={productImage}
                        basePrice={basePrice}
                        onOpenLook={onOpenLook}
                        onAddMatch={onAddMatch}
                      />
                    ))}
                  </div>
                </>
              ) : (
                <p className="font-serif text-[15px] text-ink/60">
                  Todavía no hay looks propuestos para esta pieza.
                </p>
              )}

              <div className="mt-10 border-t border-ink/10 pt-6">
                <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-ink/45">
                  Combina con tu closet
                </p>
                {suggestions.length > 0 ? (
                  <>
                    <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                      {suggestions.map(({ piece, slot }) => (
                        <div key={piece.id} className="group">
                          <div className="relative aspect-[3/4] overflow-hidden bg-ink/[0.05]">
                            {productImage && (
                              <img
                                src={productImage}
                                alt={productName}
                                className="absolute inset-0 size-full object-cover opacity-90"
                              />
                            )}
                            <img
                              src={piece.image!}
                              alt={piece.name}
                              className={cn(
                                "absolute bottom-2 right-2 h-2/5 w-auto max-w-[60%] border border-ivory object-cover shadow-sm",
                              )}
                            />
                          </div>
                          <p className="mt-2 font-nm text-sm">{piece.name}</p>
                          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink/50">
                            Tu closet · {SLOT_LABELS[slot]}
                          </p>
                        </div>
                      ))}
                    </div>
                    {onCombineCloset && (
                      <button
                        onClick={onCombineCloset}
                        className="mt-5 border border-ink px-4 py-3 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors hover:bg-ink hover:text-ivory"
                      >
                        Probar la combinación
                      </button>
                    )}
                  </>
                ) : (
                  <p className="mt-3 font-serif text-[15px] text-ink/60">
                    Cuando agregues prendas a tu closet te mostramos aquí cómo combinarlas con esta pieza.
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
