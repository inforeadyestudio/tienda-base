import { Link } from "@tanstack/react-router";
import { motion, useScroll, useTransform } from "motion/react";
import { useId, useRef, useState } from "react";
import { SceneShell, Media } from "./scene-shell";
import { formatCOP } from "@/lib/format";
import { LayerContent, canvasHeight, layerKey, layersCss, useAutoHeight } from "@/lib/scenes/layer-render";
import type { Layer, SceneContext } from "@/lib/scenes/types";
import { cn } from "@/lib/utils";

type P = { props: Record<string, any>; layers: Layer[]; ctx: SceneContext };

/* ---------------- Collage libre ---------------- */
export function CollageScene({ props, layers }: P) {
  const ref = useRef<HTMLDivElement>(null);
  const sceneId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const auto = props.height === "auto";
  const sig = (layers ?? []).map((l) => `${l.id}:${l.x},${l.y},${l.w},${l.size ?? 0},${l.url ?? ""}`).join("|");
  const { ref: stackRef, height } = useAutoHeight(true, `${sig}|${props.height}|${props.padBottom}`);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const drift = useTransform(scrollYProgress, [0, 1], [40, -40]);
  const sorted = [...(layers ?? [])].sort((a, b) => a.z - b.z);
  return (
    <section
      ref={ref}
      className={cn("relative w-full", props.hideOnMobile && "hidden md:block")}
      style={{ background: props.bgColor || undefined }}
    >
      <style dangerouslySetInnerHTML={{ __html: layersCss(sceneId, sorted, props.height ?? "auto") }} />
      {props.bgMedia && <Media url={props.bgMedia} className="absolute inset-0 w-full h-full object-cover" />}
      <div
        ref={stackRef}
        className="relative w-full"
        style={{ height: canvasHeight(props, height), containerType: auto ? "inline-size" : undefined }}
      >
        {sorted.map((l, i) => (
          <motion.div
            key={l.id}
            className={layerKey(sceneId, l.id)}
            style={{
              position: "absolute",
              zIndex: l.z,
              opacity: l.opacity,
              y: props.parallax === false || auto ? 0 : i % 2 === 0 ? drift : undefined,
            }}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: l.opacity, y: 0 }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{ duration: 0.9, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
          >
            <LayerContent layer={l} />
          </motion.div>
        ))}
      </div>
    </section>
  );
}

/* ---------------- Hotspots comprables ---------------- */
export function HotspotsScene({ props, layers, ctx }: P) {
  const [open, setOpen] = useState<string | null>(null);
  const spots = layers ?? [];
  return (
    <SceneShell props={{ ...props, width: "full" }}>
      <div className="relative w-full max-w-6xl mx-auto">
        <Media url={props.media} alt={props.title} className="w-full h-auto object-cover" />
        {spots.map((s) => {
          const product = ctx.products.find((p) => p.slug === (s.text ?? "").trim());
          return (
            <div key={s.id} className="absolute" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
              <button
                onClick={() => setOpen(open === s.id ? null : s.id)}
                className="w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ivory/90 border border-ink/20 flex items-center justify-center text-ink text-xs shadow-sm"
                aria-label={product?.name ?? "Ver pieza"}
              >
                +
              </button>
              {open === s.id && product && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute left-4 top-4 w-52 bg-ivory text-ink p-3 shadow-lg z-10"
                >
                  <div className="aspect-[3/4] bg-cream overflow-hidden mb-2">
                    {product.hero_image_url && <img src={product.hero_image_url} alt={product.name} className="w-full h-full object-cover" />}
                  </div>
                  <p className="font-serif italic text-lg leading-tight">{product.name}</p>
                  <p className="text-xs opacity-70">{formatCOP(product.product_variants?.[0]?.price_cop ?? 0)}</p>
                  <Link
                    to="/producto/$slug"
                    params={{ slug: product.slug }}
                    className="mt-2 inline-block font-nm text-[10px] uppercase tracking-[0.25em] border-b border-ink pb-0.5"
                  >
                    Ver pieza
                  </Link>
                </motion.div>
              )}
            </div>
          );
        })}
      </div>
      {props.caption && <p className="mt-6 text-center font-nm text-[10px] uppercase tracking-[0.3em] opacity-60">{props.caption}</p>}
    </SceneShell>
  );
}

/* ---------------- Signature: Back to Selva ---------------- */
export function SelvaCollageScene({ props, layers, ctx }: P) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const slow = useTransform(scrollYProgress, [0, 1], [80, -80]);
  const fast = useTransform(scrollYProgress, [0, 1], [160, -160]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [1.1, 1, 1.08]);
  const sorted = [...(layers ?? [])].sort((a, b) => a.z - b.z);
  return (
    <section ref={ref} className="relative w-full overflow-hidden bg-ink text-ivory">
      <motion.div style={{ scale }} className="absolute inset-0">
        <Media url={props.bgMedia || ctx.collection.cover_url} className="w-full h-full object-cover opacity-40" />
      </motion.div>
      <div className="relative h-[130vh]">
        {sorted.map((l, i) => (
          <motion.div
            key={l.id}
            style={{
              position: "absolute",
              left: `${l.x}%`,
              top: `${l.y}%`,
              width: `${l.w}%`,
              zIndex: l.z,
              opacity: l.opacity,
              rotate: `${l.rotate}deg`,
              y: i % 2 === 0 ? slow : fast,
            }}
          >
            {l.kind === "text" ? (
              <span className="font-serif italic leading-none block" style={{ fontSize: "clamp(2rem, 6vw, 7rem)" }}>
                {l.text}
              </span>
            ) : (
              <Media url={l.url} className="w-full h-auto object-contain drop-shadow-2xl" />
            )}
          </motion.div>
        ))}
        <div className="absolute inset-x-0 bottom-16 text-center px-6">
          <h2 className="font-serif italic text-5xl md:text-8xl leading-none">{props.title || ctx.collection.title}</h2>
          {props.body && <p className="mt-6 max-w-lg mx-auto text-ivory/70 text-sm">{props.body}</p>}
        </div>
      </div>
    </section>
  );
}
