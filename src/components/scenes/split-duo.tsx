import { Link } from "@tanstack/react-router";
import { Media } from "./scene-shell";
import type { Layer, SceneContext } from "@/lib/scenes/types";
import { cn } from "@/lib/utils";

type P = { props: Record<string, any>; layers: Layer[]; ctx: SceneContext };

const HEIGHTS: Record<string, string> = {
  short: "h-[52vh] md:h-[60vh]",
  tall: "h-[70vh] md:h-[80vh]",
  full: "h-[80vh] md:h-screen",
  square: "aspect-square md:aspect-auto md:h-[80vh]",
};

function Panel({
  media,
  title,
  eyebrow,
  href,
  height,
  overlay,
}: {
  media?: string;
  title?: string;
  eyebrow?: string;
  href?: string;
  height: string;
  overlay: number;
}) {
  const inner = (
    <div className={cn("relative w-full overflow-hidden bg-cream", height)}>
      <Media url={media} alt={title} className="w-full h-full object-cover" />
      {overlay > 0 && <div className="absolute inset-0 bg-ink" style={{ opacity: overlay }} />}
      {(title || eyebrow) && (
        <div className="absolute inset-x-0 bottom-0 p-6 md:p-10 text-ivory">
          {eyebrow && <p className="font-nm text-[10px] uppercase tracking-[0.3em] opacity-80">{eyebrow}</p>}
          {title && <h3 className="font-serif italic text-3xl md:text-5xl mt-2">{title}</h3>}
        </div>
      )}
    </div>
  );

  if (!href) return inner;
  if (href.startsWith("http") || href.startsWith("mailto:")) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className="block group">
        {inner}
      </a>
    );
  }
  return (
    <Link to={href as any} className="block group">
      {inner}
    </Link>
  );
}

/** Dos contenidos enfrentados en desktop, apilados en móvil. */
export function SplitDuoScene({ props }: P) {
  const height = HEIGHTS[props.height ?? "tall"] ?? HEIGHTS.tall;
  const gap = props.gap === "none" ? "gap-0" : props.gap === "sm" ? "gap-1" : "gap-6";
  const overlay = Number(props.overlay ?? 0);

  return (
    <section className={cn("w-full bg-ivory text-ink", props.hideOnMobile && "hidden md:block")}>
      <div
        className={cn(
          "grid grid-cols-1 md:grid-cols-2",
          gap,
          props.width === "contained" && "max-w-[1600px] mx-auto px-4 md:px-8 py-10",
        )}
      >
        <Panel
          media={props.mediaA}
          title={props.titleA}
          eyebrow={props.eyebrowA}
          href={props.linkA}
          height={height}
          overlay={overlay}
        />
        <Panel
          media={props.mediaB}
          title={props.titleB}
          eyebrow={props.eyebrowB}
          href={props.linkB}
          height={height}
          overlay={overlay}
        />
      </div>
    </section>
  );
}
