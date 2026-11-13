import { useRef } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { Media } from "./scene-shell";
import type { Layer, SceneContext } from "@/lib/scenes/types";
import { cn } from "@/lib/utils";

type P = { props: Record<string, any>; layers: Layer[]; ctx: SceneContext };

/**
 * Banner con scroll sticky: el medio hace zoom + blur y se desvanece
 * mientras el título sube, hasta revelar el contenido siguiente.
 */
export function BannerParallaxScene({ props }: P) {
  const ref = useRef<HTMLElement | null>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });

  const zoom = Number(props.zoom ?? 1.5);
  const maxBlur = Number(props.blur ?? 10);

  const scale = useTransform(scrollYProgress, [0, 1], [1, zoom]);
  const opacity = useTransform(scrollYProgress, [0, 0.8, 1], [1, 1, 0]);
  const blur = useTransform(scrollYProgress, [0, 1], [0, maxBlur]);
  const filter = useTransform(blur, (v) => `blur(${v}px)`);
  const textY = useTransform(scrollYProgress, [0, 0.5], ["0%", "-30%"]);
  const textOpacity = useTransform(scrollYProgress, [0, 0.4], [1, 0]);

  const travel = props.travel ?? "200vh";
  const titleFont =
    props.font === "serif" ? "font-serif italic" : props.font === "nm" ? "font-nm" : "font-sans";

  return (
    <section
      ref={ref as any}
      className={cn("relative w-full", props.hideOnMobile ? "hidden md:block" : "")}
      style={{ height: travel }}
    >
      <div className="sticky top-0 h-screen overflow-hidden bg-ink">
        <motion.div className="absolute inset-0 will-change-transform" style={{ scale, opacity, filter }}>
          <Media url={props.media} alt={props.title} poster={props.poster} priority className="w-full h-full object-cover" />
          {Number(props.overlay ?? 0.2) > 0 && (
            <div className="absolute inset-0 bg-ink" style={{ opacity: Number(props.overlay ?? 0.2) }} />
          )}
        </motion.div>

        <motion.div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center text-center px-8 text-ivory will-change-transform"
          style={{ y: textY, opacity: textOpacity }}
        >
          {props.eyebrow && (
            <p className="font-nm text-[10px] md:text-xs uppercase tracking-[0.4em] opacity-80 mb-4">
              {props.eyebrow}
            </p>
          )}
          {props.title && (
            <h1
              className={cn("m-0 uppercase leading-[0.85]", titleFont)}
              style={{ fontSize: "clamp(56px, 18vw, 260px)", textShadow: "0 4px 40px rgba(0,0,0,0.45)" }}
            >
              {props.title}
            </h1>
          )}
          {props.subtitle && (
            <p className="mt-6 max-w-xl text-sm md:text-base opacity-85">{props.subtitle}</p>
          )}
        </motion.div>
      </div>
    </section>
  );
}
