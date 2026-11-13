// Piezas compartidas por las secciones Tu Marca (design-marca-*).
// Solo presentación: los datos llegan por props y ctx; los precios se formatean con la lógica.
import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { formatCOP } from "@/logic";
import type { FieldDef, SceneContext } from "../types";

export { formatCOP };

type SceneProduct = SceneContext["products"][number];

export function cx(...a: Array<string | false | null | undefined>) {
  return a.filter(Boolean).join(" ");
}

/* ---------------- campos base ---------------- */
export const MARCA_BASE_FIELDS: FieldDef[] = [
  {
    key: "fondo",
    label: "Fondo de la sección",
    type: "select",
    options: [
      { value: "papel", label: "Blanco papel" },
      { value: "marfil", label: "Marfil" },
      { value: "pagina", label: "Igual a la página" },
      { value: "lima", label: "Lima (par lima + rosa)" },
      { value: "rosa", label: "Rosa (par lima + rosa)" },
      { value: "burdeos", label: "Burdeos con texto azul (mejor sin fotos de producto)" },
      { value: "azul", label: "Azul con texto burdeos" },
    ],
  },
  { key: "hideOnMobile", label: "Ocultar en móvil", type: "boolean" },
];
export const MARCA_BASE_DEFAULTS = { fondo: "papel", hideOnMobile: false };

const BG: Record<string, string> = { pagina: "", papel: "bg-marca-paper", marfil: "bg-marca-marfil", lima: "bg-marca-lima", rosa: "bg-marca-rosa", burdeos: "bg-marca-burdeos", azul: "bg-marca-azul" };
// color de fondo de la sección como variable: las fotos de producto (fondo blanco) se funden sobre él y parecen PNG
const BG_VAR: Record<string, string> = {
  pagina: "var(--marca-paper)", papel: "var(--marca-paper)", marfil: "var(--marca-marfil)",
  lima: "var(--marca-lima)", rosa: "var(--marca-rosa)", burdeos: "var(--marca-burdeos)", azul: "var(--marca-azul)",
};
// los pares oscuros cambian la tinta de toda la sección (texto, líneas e isotipo) por el color de su pareja
const INK: Record<string, Record<string, string>> = {
  burdeos: { "--marca-acento": "var(--marca-azul)", "--marca-cacao": "var(--marca-azul)", "--marca-suave": "rgb(194 229 237 / 0.72)", "--marca-line": "rgb(194 229 237 / 0.2)", "--marca-line-strong": "rgb(194 229 237 / 0.45)" },
  azul: { "--marca-cacao": "var(--marca-burdeos)", "--marca-suave": "rgb(96 24 31 / 0.72)", "--marca-line": "rgb(96 24 31 / 0.16)", "--marca-line-strong": "rgb(96 24 31 / 0.36)" },
};

export function Shell({ props, children, className, id, label, style, contained }: { props: Record<string, any>; children: ReactNode; className?: string; id?: string; label?: string; style?: CSSProperties; contained?: boolean }) {
  return (
    <section id={id} aria-label={label} style={{ ["--marca-bg" as any]: BG_VAR[props.fondo] ?? "var(--marca-paper)", ...(INK[props.fondo] ?? {}), ...style }} className={cx("marca relative", BG[props.fondo] ?? "", props.hideOnMobile && "hidden md:block", className)}>
      {contained ? <div className="mx-auto max-w-[1240px] px-5">{children}</div> : children}
    </section>
  );
}

/* ---------------- pastillas de color (guía de marca: cuadro + círculo) ---------------- */
export type Tone = readonly [string, string];
export const PARES = {
  lima: ["var(--marca-lima)", "var(--marca-rosa)"],
  rosa: ["var(--marca-rosa)", "var(--marca-lima)"],
  burdeos: ["var(--marca-burdeos)", "var(--marca-azul)"],
  azul: ["var(--marca-azul)", "var(--marca-burdeos)"],
  marfil: ["var(--marca-marfil)", "var(--marca-cacao)"],
  cacao: ["var(--marca-cacao)", "var(--marca-marfil)"],
} as const satisfies Record<string, Tone>;
/** Pastilla de color de la marca: un cuadro con un círculo adentro, como en la guía (lima + rosa, marfil + cacao, burdeos + azul). */
export function Pastilla({ tone, className, children, inset = "12%" }: { tone: Tone; className?: string; children?: ReactNode; inset?: string }) {
  return (
    <span className={cx("relative block aspect-square overflow-hidden", className)} style={{ background: tone[0] }}>
      <span aria-hidden="true" className="absolute rounded-full" style={{ inset, background: tone[1] }} />
      {children}
    </span>
  );
}
/** Las tres parejas de la marca en miniatura (para cabeceras y detalles). */
export function TresPastillas({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={cx("inline-flex gap-1.5", className)}>
      <Pastilla tone={PARES.lima} className="size-[18px]" inset="18%" />
      <Pastilla tone={PARES.marfil} className="size-[18px]" inset="18%" />
      <Pastilla tone={PARES.burdeos} className="size-[18px]" inset="18%" />
    </span>
  );
}

/* ---------------- utilidades ---------------- */
export function asList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}
export function lines(v: unknown): string[] {
  return typeof v === "string" ? v.split("\n").map((s) => s.trim()).filter(Boolean) : [];
}
/** Quita los nombres técnicos «Campaña 0X ·» que quedaron guardados en el panel. */
export function sinCampana(t: unknown): string {
  if (typeof t !== "string") return "";
  const v = t.trim();
  return v.replace(/^campaña\s*0?\d+\s*·\s*/i, "");
}
/** Renglones de la frase de marca, tal como los escribió el equipo. */
export function taglineRows(rows: string[]): string[] {
  return rows;
}
export function isVideo(url?: string) {
  return !!url && /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);
}

export function useReducedMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduce;
}

export function useFinePointer() {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    setFine(window.matchMedia("(hover:hover) and (pointer:fine)").matches);
  }, []);
  return fine;
}

export function useInView<T extends Element>(ref: React.RefObject<T | null>, rootMargin = "0px", threshold = 0) {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setInView(true); return; }
    const io = new IntersectionObserver((en) => setInView(en[en.length - 1].isIntersecting), { rootMargin, threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin, threshold]);
  return inView;
}

/** Imagen o video (según la extensión). El video va mudo, en bucle y sin controles. */
export function Media({ src, alt = "", className, poster, eager }: { src?: string; alt?: string; className?: string; poster?: string; eager?: boolean }) {
  if (!src) return null;
  if (isVideo(src)) {
    return <video className={className} src={src} poster={poster || undefined} muted loop playsInline autoPlay preload="metadata" aria-label={alt || undefined} />;
  }
  return <img className={className} src={src} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" draggable={false} />;
}

/* ---------------- productos (vienen de ctx.products) ---------------- */
export function pickProducts(ids: unknown, ctx: SceneContext): SceneProduct[] {
  const list = asList(ids);
  return list.map((id) => ctx.products.find((p) => p.id === id)).filter((p): p is SceneProduct => Boolean(p));
}
/**
 * Productos de una sección, siempre del inventario: los elegidos en el panel y, si no hay,
 * los productos de la página (ctx.products). Nunca nombres, fotos ni precios inventados.
 */
export function sectionProducts(ids: unknown, ctx: SceneContext, max = 12): SceneProduct[] {
  const chosen = pickProducts(ids, ctx);
  return chosen.length ? chosen : ctx.products.slice(0, max);
}

/** Aviso que solo se ve en el editor del panel cuando a la sección le faltan productos. */
export function EditorHint({ ctx, children }: { ctx: SceneContext; children: ReactNode }) {
  if (!ctx.previewDevice) return null;
  return <p className="marca-mono marca-mono-soft m-0 border border-dashed border-marca-line-strong px-4 py-6 text-center">{children}</p>;
}

export function productImages(p: SceneProduct): string[] {
  const extra = [...(p.product_images ?? [])].sort((a, b) => a.position - b.position).map((i) => i.url);
  const all = [p.hero_image_url, ...extra].filter((u): u is string => !!u);
  return all.filter((u, i) => all.indexOf(u) === i);
}
export function productPrice(p: SceneProduct): number | null {
  const prices = (p.product_variants ?? []).map((v) => v.price_cop).filter((n) => n > 0);
  return prices.length ? Math.min(...prices) : null;
}
export function productColors(p: SceneProduct): Array<{ name: string; hex: string }> {
  const seen = new Set<string>();
  const out: Array<{ name: string; hex: string }> = [];
  for (const v of p.product_variants ?? []) {
    if (!v.color_hex || seen.has(v.color_hex)) continue;
    seen.add(v.color_hex);
    out.push({ name: v.color ?? "", hex: v.color_hex });
  }
  return out;
}
export function productHref(p: SceneProduct) {
  return `/producto/${p.slug}`;
}

/* ---------------- isotipo animado (de ejemplo: un aro y un punto) ---------------- */
export const ISO_VIEWBOX = "0 0 200 200";
export const ISO_SWIRL = "M 100 14 A 86 86 0 1 1 99.9 14 Z M 100 40 A 60 60 0 1 0 100.1 40 Z";
export const ISO_PUPIL = "M 100 76 A 24 24 0 1 1 99.9 76 Z";

type Eye = { el: HTMLElement; pupil: SVGGElement | null; turb: SVGElement | null; alive: boolean; sx: number; sy: number; next: number };
const eyes = new Set<Eye>();
let ticker: number | null = null;
let blinker: number | null = null;
let px = 0, py = 0, lastMove = 0, frame = 0;

function startTicker() {
  if (ticker !== null || typeof window === "undefined") return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;
  const fine = window.matchMedia?.("(hover:hover) and (pointer:fine)").matches;
  px = window.innerWidth / 2; py = window.innerHeight / 2;
  window.addEventListener("pointermove", onMove, { passive: true });
  ticker = window.setInterval(() => {
    if (document.hidden) return;
    frame++;
    const now = Date.now(), idle = !fine || now - lastMove > 3500, t = now / 1000;
    let i = 0;
    eyes.forEach((e) => {
      i++;
      // el trazo hierve: el ojo «vivo» (header) cambia de forma cada dos cuadros, los demás cada tres
      if (e.turb && frame % (e.alive ? 2 : 3) === 0) e.turb.setAttribute("seed", String(1 + ((frame / (e.alive ? 2 : 3)) % 4) * 7 + i));
      if (!e.pupil) return;
      const r = e.el.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > window.innerHeight) return;
      let dx: number, dy: number;
      if (idle && e.alive) {
        // vivo: la pupila salta de un punto a otro, como mirando alrededor
        if (now > e.next) { e.sx = Math.random() * 2 - 1; e.sy = Math.random() * 1.4 - 0.7; e.next = now + 900 + Math.random() * 1800; }
        dx = e.sx; dy = e.sy;
      } else if (idle) { dx = Math.sin(t * 0.6 + i * 1.7) * 0.8; dy = Math.cos(t * 0.45 + i) * 0.55; }
      else {
        const cx0 = r.left + r.width * 0.47, cy0 = r.top + r.height * 0.44;
        dx = px - cx0; dy = py - cy0;
        const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / (r.width * 4 + 120));
        dx = (dx / d) * k; dy = (dy / d) * k;
      }
      const k = e.alive ? 1.15 : 1;
      e.pupil.setAttribute("transform", `translate(${Math.round(dx * 9 * k)} ${Math.round(dy * 8 * k)})`);
    });
  }, 83);
  const blink = () => {
    blinker = window.setTimeout(() => {
      eyes.forEach((e) => {
        if (Math.random() < 0.7) { e.el.classList.add("is-blink"); window.setTimeout(() => e.el.classList.remove("is-blink"), 140); }
      });
      blink();
    }, 2600 + Math.random() * 3400);
  };
  blink();
}
function onMove(e: PointerEvent) { px = e.clientX; py = e.clientY; lastMove = Date.now(); }
function stopTicker() {
  if (ticker !== null) window.clearInterval(ticker);
  if (blinker !== null) window.clearTimeout(blinker);
  window.removeEventListener("pointermove", onMove);
  ticker = null; blinker = null;
}

/** Isotipo de Tu Marca: el trazo hierve, la pupila sigue el cursor y parpadea. `alive`: más movimiento (el del header). */
export function Iso({ className, spin = true, label, alive = false }: { className?: string; spin?: boolean; label?: string; alive?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const fid = "marca-boil-" + useId().replace(/[^a-zA-Z0-9]/g, "");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const eye: Eye = { el, pupil: el.querySelector(".marca-iso-pu"), turb: el.querySelector("feTurbulence"), alive, sx: 0, sy: 0, next: 0 };
    eyes.add(eye);
    startTicker();
    let io: IntersectionObserver | null = null;
    if (spin && typeof IntersectionObserver !== "undefined" && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      io = new IntersectionObserver((en) => {
        if (en[0].isIntersecting) { el.classList.remove("is-spin"); void el.offsetWidth; el.classList.add("is-spin"); io?.disconnect(); }
      }, { threshold: 0.6 });
      io.observe(el);
    }
    return () => { eyes.delete(eye); io?.disconnect(); if (!eyes.size) stopTicker(); };
  }, [spin, alive]);
  return (
    <span ref={ref} className={cx("marca-iso inline-block", alive && "is-alive", className)} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <svg viewBox={ISO_VIEWBOX} fill="currentColor" focusable="false">
        <defs>
          <filter id={fid} x="-15%" y="-15%" width="130%" height="130%">
            <feTurbulence type="fractalNoise" baseFrequency={alive ? "0.042" : "0.035"} numOctaves={2} seed={1} result="n" />
            <feDisplacementMap in="SourceGraphic" in2="n" scale={alive ? 7 : 5} xChannelSelector="R" yChannelSelector="G" />
          </filter>
        </defs>
        <g filter={`url(#${fid})`}>
          <g className="marca-iso-sw"><path d={ISO_SWIRL} /></g>
          <g className="marca-iso-pu"><path d={ISO_PUPIL} /></g>
        </g>
      </svg>
    </span>
  );
}

/** El isotipo como texto SVG (lo usa la etiqueta impresa de la caja de fósforos). */
export function isoSvgString() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ISO_VIEWBOX}" fill="currentColor"><path d="${ISO_SWIRL}"/><path d="${ISO_PUPIL}"/></svg>`;
}
