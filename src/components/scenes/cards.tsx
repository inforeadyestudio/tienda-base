import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { SceneShell, Media } from "@/components/scenes/scene-shell";
import { cn } from "@/lib/utils";
import type { Layer, SceneContext } from "@/lib/scenes/types";

export type ExpandCard = {
  id: string;
  category?: string;
  title?: string;
  content?: string;
  media?: string;
  theme?: "dark" | "light";
  size?: "wide" | "narrow";
  href?: string;
  ctaLabel?: string;
  /** desplazamiento de la imagen dentro de la tarjeta */
  top?: number;
  bottom?: number;
  width?: number;
  left?: number;
};

export function newCard(): ExpandCard {
  return {
    id: Math.random().toString(36).slice(2),
    category: "Categoría",
    title: "Título de la historia",
    content: "",
    media: "",
    theme: "light",
    size: "wide",
    width: 100,
  };
}

const spring = { type: "spring" as const, stiffness: 240, damping: 30 };

function CardInner({ card, open }: { card: ExpandCard; open?: boolean }) {
  const style: React.CSSProperties = {
    width: `${card.width ?? 100}%`,
    left: card.left != null ? `${card.left}%` : 0,
    top: card.top != null ? `${card.top}px` : undefined,
    bottom: card.bottom != null ? `${card.bottom}px` : card.top != null ? undefined : 0,
  };
  return (
    <>
      <motion.div layoutId={`media-${card.id}`} className="absolute inset-0 overflow-hidden">
        {card.media ? (
          <Media url={card.media} alt={card.title ?? ""} className="absolute h-full min-h-full object-cover" style={style} />
        ) : (
          <div className="absolute inset-0 bg-ink/10" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-black/25" />
      </motion.div>

      <motion.div
        layoutId={`title-${card.id}`}
        className={cn("relative max-w-md", open ? "p-8 md:p-10" : "p-5 md:p-6")}
      >
        <span className={cn("text-[11px] uppercase tracking-[0.22em]", card.theme === "dark" ? "text-ink/70" : "text-white/80")}>
          {card.category}
        </span>
        <h3
          className={cn(
            "font-serif leading-[0.95] mt-2",
            card.theme === "dark" ? "text-ink" : "text-white",
            open ? "text-3xl md:text-5xl" : "text-2xl md:text-3xl",
          )}
        >
          {card.title}
        </h3>
      </motion.div>
    </>
  );
}

export function ExpandCardsScene({
  props,
}: {
  props: Record<string, any>;
  layers: Layer[];
  ctx: SceneContext;
}) {
  const cards: ExpandCard[] = Array.isArray(props.cards) ? props.cards : [];
  const [openId, setOpenId] = useState<string | null>(null);
  const active = cards.find((c) => c.id === openId) ?? null;

  useEffect(() => {
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpenId(null);
    window.addEventListener("keydown", esc);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", esc);
    };
  }, [active]);

  return (
    <SceneShell props={props}>
      {(props.eyebrow || props.title) && (
        <header className="mb-8">
          {props.eyebrow && <span className="text-[11px] uppercase tracking-[0.22em] text-moss">{props.eyebrow}</span>}
          {props.title && <h2 className="font-serif text-4xl md:text-6xl leading-[0.95] mt-2">{props.title}</h2>}
        </header>
      )}

      <ul className="flex flex-wrap gap-3 md:gap-5 list-none p-0 m-0">
        {cards.map((card, i) => (
          <li
            key={card.id}
            className={cn(
              "relative h-[280px] md:h-[420px] basis-[calc(50%-6px)] md:grow-0",
              card.size === "narrow"
                ? "md:basis-[calc(40%-10px)]"
                : i % 4 === 0 || i % 4 === 3
                  ? "md:basis-[calc(60%-20px)]"
                  : "md:basis-[calc(40%-10px)]",
            )}
          >
            <motion.button
              type="button"
              layoutId={`card-${card.id}`}
              onClick={() => setOpenId(card.id)}
              transition={spring}
              style={{ borderRadius: 20 }}
              className="relative w-full h-full overflow-hidden text-left flex flex-col justify-end bg-cream"
            >
              <CardInner card={card} />
            </motion.button>
          </li>
        ))}
        {!cards.length && <li className="text-sm text-moss/70">Agrega tarjetas desde el editor.</li>}
      </ul>

      <AnimatePresence>
        {active && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setOpenId(null)}
              className="fixed inset-0 z-[90] bg-black/80"
            />
            <div className="fixed inset-0 z-[95] flex items-center justify-center p-0 md:p-8 pointer-events-none overflow-y-auto">
              <motion.div
                layoutId={`card-${active.id}`}
                transition={spring}
                style={{ borderRadius: 20 }}
                className="pointer-events-auto relative w-full md:w-[700px] max-w-[700px] bg-ivory overflow-hidden my-auto"
              >
                <div className="relative h-[300px] md:h-[420px] overflow-hidden flex flex-col justify-end">
                  <CardInner card={active} open />
                </div>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1, transition: { delay: 0.15 } }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  className="p-7 md:p-9 space-y-4"
                >
                  {(active.content ?? "").split("\n").filter(Boolean).map((p, i) => (
                    <p key={i} className="text-ink/80 leading-relaxed">
                      {p}
                    </p>
                  ))}
                  {active.href && (
                    <a
                      href={active.href}
                      className="inline-block mt-2 px-6 py-3 rounded-full bg-ink text-ivory text-xs uppercase tracking-[0.18em]"
                    >
                      {active.ctaLabel || "Ver más"}
                    </a>
                  )}
                </motion.div>
                <button
                  type="button"
                  onClick={() => setOpenId(null)}
                  aria-label="Cerrar"
                  className="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-ivory/90 text-ink flex items-center justify-center"
                >
                  <X className="size-4" />
                </button>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </SceneShell>
  );
}
