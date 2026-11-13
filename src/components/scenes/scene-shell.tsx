import { motion } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { AutoVideo } from "@/components/media/auto-video";
import { usePageBackground } from "./page-background-context";
import { optimizedImageUrl } from "@/lib/media";

const BG: Record<string, string> = {
  ivory: "bg-ivory text-ink",
  cream: "bg-cream text-ink",
  ink: "bg-ink text-ivory",
  moss: "bg-moss text-ivory",
  transparent: "bg-transparent",
};

const SPACE: Record<string, string> = {
  none: "py-0",
  sm: "py-8",
  md: "py-20",
  lg: "py-32 md:py-44",
};

const ANIM: Record<string, any> = {
  none: {},
  fade: { initial: { opacity: 0 }, whileInView: { opacity: 1 }, transition: { duration: 0.8 } },
  reveal: {
    initial: { opacity: 0, y: 64 },
    whileInView: { opacity: 1, y: 0 },
    transition: { duration: 1, ease: [0.16, 1, 0.3, 1] },
  },
  rise: {
    initial: { opacity: 0, y: 48 },
    whileInView: { opacity: 1, y: 0 },
    transition: { duration: 0.9, ease: [0.16, 1, 0.3, 1] },
  },
};

export function SceneShell({
  props,
  children,
  className,
}: {
  props: Record<string, any>;
  children: ReactNode;
  className?: string;
}) {
  const anim = ANIM[props.anim ?? "fade"] ?? ANIM.fade;
  const pageBg = usePageBackground();
  return (
    <section
      className={cn(
        (props.bg ?? "ivory") === "ivory" && pageBg !== "ivory" ? BG.transparent : (BG[props.bg ?? "ivory"] ?? BG.ivory),
        SPACE[props.space ?? "md"] ?? SPACE.md,
        props.hideOnMobile ? "hidden md:block" : "",
        "relative overflow-hidden",
      )}
    >
      <motion.div
        {...anim}
        viewport={{ once: true, amount: 0.15 }}
        className={cn(props.width === "full" ? "w-full" : "max-w-7xl mx-auto px-6", className)}
      >
        {children}
      </motion.div>
    </section>
  );
}

export function isVideo(url?: string | null) {
  return !!url && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

export function Media({
  url,
  alt,
  className,
  style,
  width,
  poster,
  priority,
}: {
  url?: string | null;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  /** ancho de entrega: pide al CDN una versión redimensionada y más liviana */
  width?: number;
  poster?: string;
  priority?: boolean;
}) {
  if (!url) return <div className={cn("bg-ink/5", className)} style={style} />;
  if (isVideo(url)) {
    return <AutoVideo src={url} className={className} style={style} poster={poster} priority={priority} />;
  }
  const src = width ? (optimizedImageUrl(url, width) ?? url) : url;
  return <img src={src} alt={alt ?? ""} className={className} style={style} loading="lazy" decoding="async" />;
}
