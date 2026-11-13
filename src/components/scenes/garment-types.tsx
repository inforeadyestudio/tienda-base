import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { motion } from "motion/react";
import { SceneShell, Media } from "./scene-shell";
import { productTypesQuery } from "@/lib/product-types";
import type { Layer, SceneContext } from "@/lib/scenes/types";
import { cn } from "@/lib/utils";

export type GarmentTypeItem = {
  id: string;
  /** slug del tipo de prenda (product_types.slug) */
  slug?: string;
  /** nombre visible; si está vacío se usa el del tipo */
  label?: string;
  /** imagen propia de esta escena; si está vacía se usa la portada del tipo */
  image?: string;
  overlay?: number;
};

export function newGarmentTypeItem(): GarmentTypeItem {
  return { id: Math.random().toString(36).slice(2), slug: "", label: "", image: "", overlay: 0.15 };
}

type P = { props: Record<string, any>; layers: Layer[]; ctx: SceneContext };

const COLS: Record<string, string> = {
  "2": "grid-cols-2",
  "3": "grid-cols-2 md:grid-cols-3",
  "4": "grid-cols-2 md:grid-cols-4",
};

const RATIO: Record<string, string> = {
  portrait: "aspect-[3/4]",
  square: "aspect-square",
  wide: "aspect-[4/3]",
};

export function GarmentTypesScene({ props }: P) {
  const { data: types } = useQuery(productTypesQuery());
  const all = (types ?? []).filter((t) => t.active !== false);
  const manual: GarmentTypeItem[] = Array.isArray(props.items) ? props.items : [];

  const items =
    props.source === "manual"
      ? manual
          .filter((it) => it.slug)
          .map((it) => {
            const t = all.find((x) => x.slug === it.slug);
            return {
              key: it.id,
              slug: it.slug!,
              name: it.label || t?.name || it.slug!,
              image: it.image || t?.cover_url || "",
              overlay: Number(it.overlay ?? props.overlay ?? 0.15),
            };
          })
      : all.slice(0, Number(props.limit ?? 12)).map((t) => ({
          key: t.id,
          slug: t.slug,
          name: t.name,
          image: t.cover_url || "",
          overlay: Number(props.overlay ?? 0.15),
        }));

  if (!items.length) return null;

  const ratio = RATIO[props.ratio ?? "portrait"] ?? RATIO.portrait;
  const cta = props.ctaLabel || "Ver todos";

  return (
    <SceneShell props={props}>
      {(props.eyebrow || props.title) && (
        <div className="mb-10">
          {props.eyebrow && <p className="font-nm text-[10px] uppercase tracking-[0.3em] opacity-60">{props.eyebrow}</p>}
          {props.title && <h2 className="mt-3 font-serif italic text-4xl md:text-6xl leading-[1.05]">{props.title}</h2>}
        </div>
      )}
      <div className={cn("grid gap-3 md:gap-5", COLS[props.columns ?? "3"] ?? COLS["3"])}>
        {items.map((it, i) => (
          <motion.div
            key={it.key}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, delay: (i % 4) * 0.06 }}
          >
            <Link to="/tipo/$slug" params={{ slug: it.slug }} className="group block">
              <div className={cn("relative overflow-hidden bg-cream", ratio)}>
                {it.image && (
                  <Media url={it.image} alt={it.name} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
                )}
                <div className="absolute inset-0 bg-ink" style={{ opacity: it.overlay }} />
                {props.labelInside && (
                  <div className="absolute inset-x-0 bottom-0 p-4 md:p-5">
                    <h3 className="font-serif italic text-2xl md:text-3xl text-ivory">{it.name}</h3>
                    <span className="mt-2 inline-block font-nm text-[10px] uppercase tracking-[0.3em] text-ivory border-b border-ivory/60 pb-1">
                      {cta}
                    </span>
                  </div>
                )}
              </div>
              {!props.labelInside && (
                <div className="mt-4">
                  <h3 className="font-serif italic text-xl md:text-2xl">{it.name}</h3>
                  <span className="mt-2 inline-block font-nm text-[10px] uppercase tracking-[0.3em] opacity-70 border-b border-current pb-1">
                    {cta}
                  </span>
                </div>
              )}
            </Link>
          </motion.div>
        ))}
      </div>
    </SceneShell>
  );
}
