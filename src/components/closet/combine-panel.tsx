import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Link } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { X, Loader2, Sparkles } from "lucide-react";
import { suggestCombinations, type CombineResult } from "@/lib/closet/outfits.functions";
import type { ClosetPiece } from "@/lib/closet/queries";
import { formatCOP } from "@/lib/format";

export type CombineBase = {
  id: string;
  name: string;
  kind: "closet" | "product";
  garment_type?: string | null;
  color?: string | null;
  category?: string | null;
};

export function CombinePanel({
  open,
  onClose,
  base,
  closet,
}: {
  open: boolean;
  onClose: () => void;
  base: CombineBase | null;
  closet: ClosetPiece[];
}) {
  const run = useServerFn(suggestCombinations);
  const byId = useMemo(() => new Map(closet.map((c) => [c.id, c])), [closet]);

  const mutation = useMutation<CombineResult>({
    mutationFn: async () => {
      if (!base) throw new Error("Selecciona una prenda.");
      return run({
        data: {
          base: {
            id: base.id,
            name: base.name,
            kind: base.kind,
            garment_type: base.garment_type ?? null,
            color: base.color ?? null,
            category: base.category ?? null,
          },
          closet: closet
            .filter((c) => c.id !== base.id)
            .slice(0, 40)
            .map((c) => ({
              id: c.id,
              name: c.name,
              garment_type: c.garment_type,
              color: c.color,
              category: c.category,
            })),
        },
      });
    },
  });

  const runKey = open && base ? `${base.kind}-${base.id}` : "";
  const lastKey = useRef("");
  const mutate = mutation.mutate;
  useEffect(() => {
    if (!runKey || lastKey.current === runKey) return;
    lastKey.current = runKey;
    mutate();
  }, [runKey, mutate]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[90] bg-ink/40 backdrop-blur-[2px]"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 34 }}
            className="fixed inset-y-0 right-0 z-[91] w-full max-w-md overflow-y-auto bg-ivory shadow-2xl"
            role="dialog"
            aria-label="Combinar con mi closet"
          >
            <header className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-ink/10 bg-ivory px-6 py-5">
              <div>
                <p className="text-[10px] uppercase tracking-[0.28em] text-moss">Combinar con mi closet</p>
                <h2 className="font-nm mt-1 text-2xl leading-tight">{base?.name}</h2>
              </div>
              <button onClick={onClose} aria-label="Cerrar" className="text-moss">
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </header>

            <div className="space-y-8 px-6 py-6">
              {mutation.isPending && (
                <div className="flex flex-col items-center gap-3 py-16 text-moss">
                  <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} />
                  <p className="text-xs">Armando combinaciones con tu guardarropa…</p>
                </div>
              )}

              {mutation.isError && (
                <div className="rounded-2xl border border-clay/40 bg-clay/10 p-4 text-xs text-ink">
                  {(mutation.error as Error).message}
                  <button
                    onClick={() => mutation.mutate()}
                    className="mt-3 block text-[10px] uppercase tracking-[0.2em] text-moss underline underline-offset-4"
                  >
                    Reintentar
                  </button>
                </div>
              )}

              {mutation.data?.note && !mutation.isPending && (
                <p className="font-serif text-lg italic leading-snug text-ink/80">{mutation.data.note}</p>
              )}

              {mutation.data?.groups.map((group) => (
                <section key={group.key}>
                  <h3 className="font-nm text-xl">{group.title}</h3>
                  {group.looks.length === 0 ? (
                    <p className="mt-2 text-[11px] leading-relaxed text-moss/80">
                      {group.key === "closet"
                        ? "Sube un par de prendas más y aquí verás combinaciones con lo que ya tienes."
                        : "Sin propuestas por ahora."}
                    </p>
                  ) : (
                    <ul className="mt-4 space-y-5">
                      {group.looks.map((look, i) => (
                        <li key={`${group.key}-${i}`} className="rounded-2xl border border-ink/5 bg-white/60 p-4">
                          <p className="text-sm font-medium">{look.title}</p>
                          <p className="mt-0.5 text-[11px] leading-relaxed text-moss">{look.reason}</p>
                          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                            {look.closetIds.map((id) => {
                              const piece = byId.get(id);
                              if (!piece) return null;
                              return (
                                <figure key={id} className="w-16 shrink-0">
                                  <div className="aspect-[3/4] overflow-hidden rounded-lg bg-cream">
                                    {piece.image && (
                                      <img src={piece.image} alt={piece.name} className="h-full w-full object-cover" />
                                    )}
                                  </div>
                                  <figcaption className="mt-1 truncate text-[9px] text-moss">{piece.name}</figcaption>
                                </figure>
                              );
                            })}
                            {look.products.map((p) => (
                              <Link
                                key={p.id}
                                to="/producto/$slug"
                                params={{ slug: p.slug }}
                                onClick={onClose}
                                className="w-16 shrink-0"
                              >
                                <div className="aspect-[3/4] overflow-hidden rounded-lg bg-cream ring-1 ring-clay/50">
                                  {p.image && <img src={p.image} alt={p.name} className="h-full w-full object-cover" />}
                                </div>
                                <figcaption className="mt-1 truncate text-[9px] text-ink">{p.name}</figcaption>
                                {p.price_cop != null && (
                                  <p className="text-[9px] text-moss">{formatCOP(p.price_cop)}</p>
                                )}
                              </Link>
                            ))}
                          </div>
                          {look.products.length > 0 && (
                            <p className="mt-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-moss">
                              <Sparkles className="h-3 w-3" strokeWidth={1.5} /> De la colección
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ))}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
