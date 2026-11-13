import { useCallback, useEffect, useRef, useState } from "react";
import { AutoVideo } from "@/components/media/auto-video";
import type { Layer } from "./types";

export const LAYER_FONTS: Record<string, string> = {
  serif: "'Instrument Serif', ui-serif, Georgia, serif",
  sans: "'Inter', ui-sans-serif, system-ui, sans-serif",
  nm: "'Neue Montreal', 'PP Neue Montreal', 'Inter', ui-sans-serif, sans-serif",
};

export function layerKey(sceneId: string, layerId: string) {
  return `cl-${sceneId}-${layerId}`.replace(/[^a-zA-Z0-9_-]/g, "");
}

const PAD: Record<string, number> = { none: 0, sm: 32, md: 80, lg: 160 };

export function padBottom(props: Record<string, any>) {
  return PAD[props.padBottom ?? "md"] ?? PAD.md;
}

/** CSS con reglas desktop + override móvil para cada capa.
 *  En modo automático la posición vertical usa `cqw` (unidad basada en el ancho
 *  del lienzo) para que el alto se pueda medir sin dependencia circular. */
export function layersCss(sceneId: string, layers: Layer[], heightMode = "auto") {
  const baseVh = heightMode === "short" ? 70 : heightMode === "tall" ? 140 : 100;
  const vy = (y: number) => (heightMode === "auto" ? `${y}cqw` : `${(y * baseVh) / 100}vh`);
  const desktop: string[] = [];
  const mobile: string[] = [];
  for (const l of layers) {
    const k = layerKey(sceneId, l.id);
    desktop.push(
      `.${k}{left:${l.x}%;top:${vy(l.y)};width:${l.w}%;transform:rotate(${l.rotate}deg);${
        l.kind === "text" ? `font-size:${l.size ?? 4}vw;` : ""
      }${l.hidden ? "display:none;" : ""}}`,
    );
    const m = l.mobile;
    if (m && Object.keys(m).length) {
      const parts: string[] = [];
      if (m.x != null) parts.push(`left:${m.x}%`);
      if (m.y != null) parts.push(`top:${vy(m.y)}`);
      if (m.w != null) parts.push(`width:${m.w}%`);
      if (m.rotate != null) parts.push(`transform:rotate(${m.rotate}deg)`);
      if (m.size != null && l.kind === "text") parts.push(`font-size:${m.size}vw`);
      if (m.hidden != null) parts.push(`display:${m.hidden ? "none" : "block"}`);
      if (parts.length) mobile.push(`.${k}{${parts.join(";")}}`);
    }
  }
  return `${desktop.join("")}@media (max-width:767px){${mobile.join("")}}`;
}

export function textStyle(l: Layer): React.CSSProperties {
  return {
    fontFamily: LAYER_FONTS[l.font ?? "serif"] ?? LAYER_FONTS.serif,
    fontStyle: l.italic ? "italic" : "normal",
    fontWeight: l.weight ?? 400,
    color: l.color || undefined,
    textAlign: l.align ?? "left",
    lineHeight: l.lineHeight ?? 1,
    letterSpacing: l.tracking ? `${l.tracking}em` : undefined,
    margin: 0,
  };
}

export function LayerContent({ layer, interactive = true }: { layer: Layer; interactive?: boolean }) {
  const inner = <LayerBody layer={layer} />;
  if (layer.href && interactive) {
    return (
      <a href={layer.href} className="block w-full" style={{ textDecoration: "none", color: "inherit" }}>
        {inner}
      </a>
    );
  }
  return inner;
}

function LayerBody({ layer: l }: { layer: Layer }) {
  if (l.kind === "text") {
    const Tag = (l.tag ?? "p") as any;
    return <Tag style={{ ...textStyle(l), fontSize: "inherit" }}>{l.text || "Texto"}</Tag>;
  }
  const fit = l.fit === "cover" ? "cover" : "contain";
  const style: React.CSSProperties = l.ratio
    ? { width: "100%", aspectRatio: l.ratio, objectFit: fit, display: "block" }
    : { width: "100%", height: "auto", objectFit: fit, display: "block" };
  if (!l.url) {
    return (
      <div
        className="border border-dashed border-current/30 bg-current/5 flex items-center justify-center text-[10px] uppercase tracking-widest opacity-50"
        style={{ width: "100%", aspectRatio: l.ratio || "3/4" }}
      >
        {l.kind === "video" ? "Video" : "Imagen"}
      </div>
    );
  }
  if (l.kind === "video" || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(l.url)) {
    return <AutoVideo src={l.url} style={style} />;
  }
  return <img src={l.url} alt={l.text || ""} style={style} loading="lazy" decoding="async" />;
}

/** Mide el límite visual real de las capas, incluyendo rotación y multimedia. */
export function useAutoHeight(enabled: boolean, signature = "") {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const parentRect = el.getBoundingClientRect();
    let max = 0;
    for (const child of Array.from(el.children)) {
      const c = child as HTMLElement;
      if (c.dataset.ignoreAuto) continue;
      const rect = c.getBoundingClientRect();
      const b = rect.bottom - parentRect.top;
      if (b > max) max = b;
    }
    setHeight(Math.ceil(max));
  }, []);

  useEffect(() => {
    if (!enabled) {
      setHeight(null);
      return;
    }
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    for (const c of Array.from(el.children)) ro.observe(c as Element);
    window.addEventListener("resize", measure);
    const media = Array.from(el.querySelectorAll("img,video"));
    for (const m of media) {
      m.addEventListener("load", measure);
      m.addEventListener("loadedmetadata", measure);
    }
    const t = setTimeout(measure, 400);
    const t2 = setTimeout(measure, 1200);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      for (const m of media) {
        m.removeEventListener("load", measure);
        m.removeEventListener("loadedmetadata", measure);
      }
      clearTimeout(t);
      clearTimeout(t2);
    };
  }, [enabled, measure, signature]);

  return { ref, height, measure };
}

export function canvasHeight(props: Record<string, any>, auto: number | null) {
  if (props.height === "auto") return auto != null ? `${auto + padBottom(props)}px` : "60vh";
  const minimum = props.height === "tall" ? "140vh" : props.height === "short" ? "70vh" : "100vh";
  return auto != null ? `max(${minimum}, ${auto + padBottom(props)}px)` : minimum;
}
