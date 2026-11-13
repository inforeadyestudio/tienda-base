import { webSellable } from "@/lib/web-stock";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Check, X, Sparkles, User } from "lucide-react";
import { formatCOP } from "@/lib/format";
import { cn } from "@/lib/utils";
import tryonImg from "@/assets/cuenta/tryon-1.jpg";
import {
  LOOK_SLOTS,
  SLOT_LABELS,
  normalizeTransform,
  pieceStyle,
  slotFromType,
  type LookSlot,
} from "@/lib/looks/board";
import { useSession } from "@/lib/auth-hooks";
import { useCloset } from "@/lib/closet/queries";

export type LookRow = {
  id: string;
  title: string | null;
  image_url: string | null;
  discount_pct: number | null;
  special_price_cop: number | null;
  board?: any;
  product_look_matches?: {
    id: string;
    label: string | null;
    position: number;
    product_look_match_items: { item_id: string }[];
  }[];
  product_look_items: {
    id: string;
    position: number;
    combo_image_url: string | null;
    cutout_url: string | null;
    slot?: string | null;
    transform?: any;
    generic_label?: string | null;
    generic_type?: string | null;
    products: any;
  }[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  look: LookRow | null;
  baseName: string;
  baseVariantLabel: string;
  basePrice: number;
  baseImage: string | null;
  closetIds: string[];
  onAddLook: (
    pieces: { productId: string; slug: string; name: string; variantId: string; label: string; price: number; image: string | null }[],
    discountRatio: number,
  ) => void;
};

function unitsOf(v: any) {
  return ((v.inventory_levels ?? []) as any[]).reduce(
    (s: number, l: any) => s + webSellable(l),
    0,
  );
}

export function LookModal({
  open,
  onClose,
  look,
  baseName,
  baseVariantLabel,
  basePrice,
  baseImage,
  closetIds,
  onAddLook,
}: Props) {
  const [picked, setPicked] = useState<Record<string, string | null>>({}); // productId -> variantId|null
  const [chosen, setChosen] = useState<Partial<Record<LookSlot, string>>>({}); // slot -> item.id
  const [tryOn, setTryOn] = useState(false);
  const { user } = useSession();
  const { data: closet } = useCloset(user?.id);

  const items = useMemo(
    () =>
      (look?.product_look_items ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .filter((i) => (i.products ? i.products.status === "published" : Boolean(i.generic_label))),
    [look],
  );

  const slotOf = (i: (typeof items)[number]): LookSlot =>
    (LOOK_SLOTS as readonly string[]).includes(i.slot ?? "")
      ? (i.slot as LookSlot)
      : slotFromType(i.generic_type ?? i.products?.product_type ?? i.products?.name);

  const bySlot = useMemo(() => {
    const map = new Map<LookSlot, typeof items>();
    for (const i of items) {
      const s = slotOf(i);
      map.set(s, [...(map.get(s) ?? []), i]);
    }
    return map;
  }, [items]);

  const board = (look?.board ?? {}) as any;
  const baseSlot: LookSlot = (LOOK_SLOTS as readonly string[]).includes(board.baseSlot) ? board.baseSlot : "full";
  const baseCutout: string | null = board.baseCutout ?? null;
  const baseTransform = normalizeTransform(board.baseTransform);

  useEffect(() => {
    if (!open) {
      setPicked({});
      setChosen({});
      setTryOn(false);
    }
  }, [open]);

  /** Prenda del closet parecida a una pieza genérica del look. */
  const closetMatch = (i: (typeof items)[number]) => {
    if (i.products) return null;
    const needle = (i.generic_type || i.generic_label || "").toLowerCase();
    if (!needle || !closet?.length) return null;
    return (
      closet.find((c) =>
        [c.garment_type, c.category, c.name, c.color]
          .filter(Boolean)
          .some((f) => needle.includes(String(f).toLowerCase()) || String(f).toLowerCase().includes(needle)),
      ) ?? null
    );
  };

  const selectedItems = LOOK_SLOTS.map((s) => items.find((i) => i.id === chosen[s])).filter(Boolean) as typeof items;
  const selectedProducts = selectedItems.filter((i) => i.products);

  const pieceVariants = (p: any) => (p.product_variants ?? []).filter((v: any) => v.active && unitsOf(v) > 0);

  const priceOf = (p: any) => {
    const chosenVariant = picked[p.id];
    const vs = pieceVariants(p);
    const v = vs.find((x: any) => x.id === chosenVariant);
    if (v) return v.price_cop as number;
    const prices = vs.map((x: any) => x.price_cop).filter(Boolean);
    return prices.length ? Math.min(...prices) : 0;
  };

  const addable = selectedProducts.filter((i) => !closetIds.includes(i.products.id));
  const subtotal = basePrice + addable.reduce((s, i) => s + priceOf(i.products), 0);
  const discountRatio = look?.special_price_cop
    ? Math.min(1, look.special_price_cop / Math.max(1, subtotal))
    : look?.discount_pct
      ? 1 - look.discount_pct / 100
      : 1;
  const finalTotal = look?.special_price_cop ?? Math.round(subtotal * discountRatio);
  const hasDeal = finalTotal < subtotal;

  const missing = addable.some((i) => {
    const vs = pieceVariants(i.products);
    return vs.length > 1 && !picked[i.products.id];
  });

  const heroImage =
    (selectedItems.length ? selectedItems[selectedItems.length - 1].combo_image_url : null) ??
    look?.image_url ??
    baseImage;

  const toggle = (item: (typeof items)[number]) => {
    if (item.products && closetIds.includes(item.products.id)) return;
    const s = slotOf(item);
    setChosen((c) => ({ ...c, [s]: c[s] === item.id ? undefined : item.id }));
    if (item.products) {
      setPicked((p) => {
        if (p[item.products.id]) return p;
        const vs = pieceVariants(item.products);
        return { ...p, [item.products.id]: vs.length === 1 ? vs[0].id : null };
      });
    }
  };

  const matches = (look?.product_look_matches ?? []).slice().sort((a, b) => a.position - b.position);

  const applyMatch = (m: (typeof matches)[number]) => {
    const ids = new Set((m.product_look_match_items ?? []).map((x) => x.item_id));
    const next: Partial<Record<LookSlot, string>> = {};
    for (const i of items) if (ids.has(i.id)) next[slotOf(i)] = i.id;
    setChosen(next);
    setPicked((p) => {
      const copy = { ...p };
      for (const i of items) {
        if (!ids.has(i.id) || !i.products) continue;
        const vs = pieceVariants(i.products);
        if (!copy[i.products.id]) copy[i.products.id] = vs.length === 1 ? vs[0].id : null;
      }
      return copy;
    });
  };

  const submit = () => {
    const pieces = addable.map((i) => {
      const p = i.products;
      const vs = pieceVariants(p);
      const v = vs.find((x: any) => x.id === picked[p.id]) ?? vs[0];
      return {
        productId: p.id,
        slug: p.slug,
        name: p.name,
        variantId: v.id,
        label: [v.color, v.size].filter(Boolean).join(" · ") || "Único",
        price: v.price_cop as number,
        image: p.hero_image_url,
      };
    });
    onAddLook(pieces, look?.special_price_cop ? finalTotal / Math.max(1, subtotal) : discountRatio);
  };

  const hasBoard = Boolean(baseCutout) && items.some((i) => i.cutout_url);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[70]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-x-0 bottom-0 top-0 mx-auto flex max-h-full w-full max-w-6xl flex-col overflow-hidden bg-ivory md:inset-6 md:top-8 md:bottom-8 md:rounded-[2px]"
          >
            <div className="flex items-center justify-between border-b border-ink/10 px-5 py-4 md:px-8">
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink/60">
                {look?.title || "Completa el look"}
              </p>
              <button onClick={onClose} aria-label="Cerrar" className="text-ink/60 transition-colors hover:text-ink">
                <X className="size-4" />
              </button>
            </div>

            <div className="grid flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[1.1fr_1fr]">
              {/* Tablero / fotografía del look */}
              <div className="relative min-h-[38vh] bg-ink/[0.04] md:min-h-0">
                {hasBoard && !tryOn ? (
                  <div className="absolute inset-0">
                    <img
                      src={baseCutout!}
                      alt={baseName}
                      className="pointer-events-none absolute object-contain"
                      style={pieceStyle(baseSlot, baseTransform)}
                    />
                    <AnimatePresence>
                      {selectedItems.map((i) => {
                        const match = closetMatch(i);
                        const src = i.cutout_url ?? match?.image ?? i.products?.hero_image_url;
                        if (!src) return null;
                        return (
                          <motion.img
                            key={i.id}
                            src={src}
                            alt={i.products?.name ?? i.generic_label ?? ""}
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                            className="pointer-events-none absolute object-contain"
                            style={pieceStyle(slotOf(i), normalizeTransform(i.transform))}
                          />
                        );
                      })}
                    </AnimatePresence>
                  </div>
                ) : (
                  <AnimatePresence mode="wait">
                    <motion.img
                      key={(tryOn ? "tryon-" : "model-") + (heroImage ?? "none")}
                      src={tryOn ? tryonImg : (heroImage ?? tryonImg)}
                      alt={`Look con ${baseName}`}
                      initial={{ opacity: 0, scale: 1.03 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute inset-0 size-full object-cover"
                    />
                  </AnimatePresence>
                )}
                <div className="absolute bottom-4 left-4 flex gap-2">
                  <button
                    onClick={() => setTryOn(false)}
                    className={cn(
                      "inline-flex items-center gap-1.5 border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] backdrop-blur",
                      !tryOn ? "border-ink bg-ink text-ivory" : "border-ink/20 bg-ivory/80 text-ink/70",
                    )}
                  >
                    <User className="size-3" /> Ver en modelo
                  </button>
                  <button
                    onClick={() => setTryOn(true)}
                    className={cn(
                      "inline-flex items-center gap-1.5 border px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.18em] backdrop-blur",
                      tryOn ? "border-ink bg-ink text-ivory" : "border-ink/20 bg-ivory/80 text-ink/70",
                    )}
                  >
                    <Sparkles className="size-3" /> Probar en mí
                  </button>
                </div>
              </div>

              {/* Resumen */}
              <div className="flex flex-col justify-between gap-6 p-5 md:p-8">
                <div>
                  <h2 className="font-nm text-2xl md:text-3xl">Completa el look</h2>

                  {matches.length > 0 && (
                    <div className="mt-5">
                      <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-ink/45">Combinaciones</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {matches.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => applyMatch(m)}
                            className="border border-ink/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-ink/70 transition-colors hover:border-ink hover:text-ink"
                          >
                            {m.label || "Match"}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="mt-6 font-mono text-[9px] uppercase tracking-[0.24em] text-ink/45">
                    {selectedItems.length ? "Tu look" : "Tu pieza"}
                  </p>
                  <div className="mt-3 space-y-3">
                    <div className="flex items-start justify-between gap-4 border-b border-ink/10 pb-3">
                      <div>
                        <p className="font-nm text-base">{baseName}</p>
                        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink/55">{baseVariantLabel}</p>
                      </div>
                      <p className="flex items-center gap-1.5 font-nm text-base">
                        {formatCOP(basePrice)} <Check className="size-3.5" strokeWidth={2.5} />
                      </p>
                    </div>

                    <AnimatePresence initial={false}>
                      {selectedItems.map((i) => {
                        const p = i.products;
                        const match = closetMatch(i);
                        const inCloset = p ? closetIds.includes(p.id) : true;
                        const vs = p ? pieceVariants(p) : [];
                        return (
                          <motion.div
                            key={i.id}
                            layout
                            initial={{ opacity: 0, y: 12 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -8 }}
                            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                            className="border-b border-ink/10 pb-3"
                          >
                            <div className="flex items-start justify-between gap-4">
                              <p className="font-nm text-base">{p?.name ?? i.generic_label}</p>
                              {!p ? (
                                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-moss">
                                  {match ? "De tu Closet ✓" : "Prenda tuya"}
                                </p>
                              ) : inCloset ? (
                                <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-moss">
                                  Ya está en tu Closet ✓
                                </p>
                              ) : (
                                <p className="font-nm text-base">{formatCOP(priceOf(p))}</p>
                              )}
                            </div>
                            {p && !inCloset && vs.length > 1 && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {vs.map((v: any) => {
                                  const on = picked[p.id] === v.id;
                                  return (
                                    <button
                                      key={v.id}
                                      onClick={() => setPicked((s) => ({ ...s, [p.id]: v.id }))}
                                      className={cn(
                                        "min-w-10 px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em]",
                                        on ? "bg-ink text-ivory" : "bg-ink/[0.06] text-ink hover:bg-ink/[0.12]",
                                      )}
                                    >
                                      {[v.color, v.size].filter(Boolean).join(" ") || "Único"}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>

                <div>
                  <div className="flex items-end justify-between">
                    <div>
                      {hasDeal && (
                        <p className="font-mono text-xs text-ink/40 line-through">{formatCOP(subtotal)}</p>
                      )}
                      <p className="font-nm text-2xl">{formatCOP(hasDeal ? finalTotal : subtotal)}</p>
                      <p className="font-mono text-[9px] uppercase tracking-[0.2em] text-ink/50">
                        {hasDeal ? "Precio especial del look" : "Completa el look"}
                      </p>
                    </div>
                  </div>
                  <button
                    disabled={missing || addable.length === 0}
                    onClick={submit}
                    className="mt-4 w-full bg-ink py-4 font-mono text-[11px] uppercase tracking-[0.22em] text-ivory transition-opacity disabled:opacity-35"
                  >
                    {addable.length === 0
                      ? "Elige una pieza"
                      : missing
                        ? "Elige la talla"
                        : "Agregar look a la bolsa"}
                  </button>
                </div>
              </div>
            </div>

            {/* Alternativas por zona */}
            {items.length > 0 && (
              <div className="border-t border-ink/10 bg-ivory px-5 py-4 md:px-8">
                <div className="flex gap-8 overflow-x-auto pb-1">
                  {LOOK_SLOTS.filter((s) => (bySlot.get(s) ?? []).length > 0).map((s) => (
                    <div key={s} className="shrink-0">
                      <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-ink/45">
                        {SLOT_LABELS[s]}
                      </p>
                      <div className="flex items-end gap-5">
                        {(bySlot.get(s) ?? []).map((i) => {
                          const p = i.products;
                          const match = closetMatch(i);
                          const inCloset = p ? closetIds.includes(p.id) : false;
                          const on = chosen[s] === i.id;
                          const src = i.cutout_url ?? match?.image ?? p?.hero_image_url ?? "";
                          return (
                            <button
                              key={i.id}
                              onClick={() => toggle(i)}
                              disabled={inCloset}
                              className={cn(
                                "flex shrink-0 flex-col items-center gap-2 transition-transform duration-500",
                                on ? "scale-110" : "scale-100 opacity-80 hover:opacity-100",
                                inCloset && "opacity-45",
                              )}
                            >
                              <div className="flex h-20 items-end">
                                {src ? (
                                  <img src={src} alt={p?.name ?? i.generic_label ?? ""} className="h-20 w-auto object-contain" />
                                ) : (
                                  <span className="flex size-14 items-center justify-center border border-dashed border-ink/25 font-mono text-[9px] text-ink/45">
                                    tuya
                                  </span>
                                )}
                              </div>
                              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-ink/70">
                                {on ? `[ ${p?.name ?? i.generic_label} ]` : (p?.name ?? i.generic_label)}
                              </span>
                              <span className="font-mono text-[9px] text-ink/45">
                                {!p
                                  ? match
                                    ? "De tu Closet ✓"
                                    : "Prenda tuya"
                                  : inCloset
                                    ? "En tu Closet ✓"
                                    : formatCOP(priceOf(p))}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
