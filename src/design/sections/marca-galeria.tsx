import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DesignSectionDef, SceneContext } from "./types";
import { MARCA_BASE_DEFAULTS, MARCA_BASE_FIELDS, Shell, asList, formatCOP, pickProducts, productHref, productImages, productPrice, useInView, useReducedMotion } from "./marca/shared";

/** Galería de modelos: carrusel infinito; solo la foto del centro muestra la ficha y el precio. */
type Slide = { src: string; alt: string; lines: string[]; tag: string; href: string };

function parseFichas(text: unknown): Array<{ lines: string[]; tag: string }> {
  if (typeof text !== "string") return [];
  return text.split(/\n\s*\n/).map((block) => {
    const rows = block.split("\n").map((s) => s.trim()).filter(Boolean);
    const tagRow = rows.find((r) => /^\[.*\]$/.test(r));
    return { lines: rows.filter((r) => r !== tagRow), tag: tagRow ?? "" };
  }).filter((b) => b.lines.length || b.tag);
}

function buildSlides(props: Record<string, any>, ctx: SceneContext): Slide[] {
  const fotos = asList(props.fotos);
  // fotos de modelo (medios del panel) + productos del inventario en el mismo orden; sin nada elegido, los de la página
  const chosen = pickProducts(props.productos, ctx);
  const products = chosen.length || fotos.length ? chosen : ctx.products.slice(0, 12);
  const fichas = parseFichas(props.fichas);
  const n = Math.max(fotos.length, products.length);
  const out: Slide[] = [];
  for (let i = 0; i < n; i++) {
    const p = products[i];
    const imgs = p ? productImages(p) : [];
    const src = fotos[i] ?? imgs[1] ?? imgs[0];
    if (!src) continue;
    if (p) {
      const price = productPrice(p);
      out.push({ src, alt: p.name, lines: [props.coleccion, p.name, price ? formatCOP(price) : ""].filter(Boolean), tag: "", href: productHref(p) });
    } else {
      const f = fichas[i] ?? { lines: [], tag: "" };
      out.push({ src, alt: f.lines[1] || f.lines[0] || "Tu Marca", lines: f.lines, tag: f.tag, href: props.ctaHref || "" });
    }
  }
  return out;
}

function Galeria({ props, ctx }: { props: Record<string, any>; ctx: SceneContext }) {
  const slides = useMemo(() => buildSlides(props, ctx), [props, ctx]);
  const N = slides.length;
  const reduce = useReducedMotion();
  const view = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const inView = useInView(view, "0px", 0.4);
  const [k, setK] = useState(N); // índice dentro de las tres copias
  const kRef = useRef(N);
  const moving = useRef(false);
  const hover = useRef(false);
  const drag = useRef<{ x: number; dx: number; id: number; t: EventTarget | null } | null>(null);

  const metrics = () => {
    const c = track.current?.children[0] as HTMLElement | undefined;
    const w = c?.getBoundingClientRect().width ?? 0;
    const g = track.current ? parseFloat(getComputedStyle(track.current).columnGap) || 0 : 0;
    return { w, g, vw: view.current?.getBoundingClientRect().width ?? 0 };
  };
  const place = useCallback((kk: number, instant: boolean, dx = 0) => {
    const t = track.current;
    if (!t) return;
    const m = metrics();
    if (instant) t.style.transition = "none";
    t.style.transform = `translate3d(${(m.vw / 2 - (kk * (m.w + m.g) + m.w / 2) + dx).toFixed(1)}px,0,0)`;
    if (instant) { void t.offsetWidth; t.style.transition = ""; }
  }, []);
  const go = useCallback((n: number) => {
    if (!N || (moving.current && !reduce)) return;
    const norm = (v: number) => ((v % N) + N) % N + N;
    if (reduce) { kRef.current = norm(n); setK(kRef.current); place(kRef.current, true); return; }
    kRef.current = n; setK(n); moving.current = true; place(n, false);
    window.setTimeout(() => {
      moving.current = false;
      if (kRef.current < N || kRef.current >= 2 * N) { kRef.current = norm(kRef.current); setK(kRef.current); place(kRef.current, true); }
    }, 830);
  }, [N, reduce, place]);

  useEffect(() => { kRef.current = N; setK(N); place(N, true); }, [N, place]);
  useEffect(() => {
    const on = () => place(kRef.current, true);
    window.addEventListener("resize", on);
    window.addEventListener("load", on);
    return () => { window.removeEventListener("resize", on); window.removeEventListener("load", on); };
  }, [place]);
  useEffect(() => {
    if (reduce || props.autoplay === false || !inView) return;
    const ms = Math.max(2, Number(props.intervalo) || 4.2) * 1000;
    const t = window.setInterval(() => {
      if (!hover.current && !drag.current && !document.hidden && document.activeElement !== view.current) go(kRef.current + 1);
    }, ms);
    return () => window.clearInterval(t);
  }, [reduce, props.autoplay, props.intervalo, inView, go]);
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      d.dx = e.clientX - d.x;
      if (Math.abs(d.dx) > 6) place(kRef.current, true, d.dx);
    };
    const up = (e: PointerEvent) => {
      const d = drag.current;
      if (!d || e.pointerId !== d.id) return;
      drag.current = null;
      if (e.type === "pointercancel") { place(kRef.current, false); return; }
      const m = metrics();
      if (Math.abs(d.dx) > 40) { const steps = Math.max(1, Math.round(Math.abs(d.dx) / (m.w + m.g))); go(kRef.current + (d.dx < 0 ? steps : -steps)); return; }
      if (Math.abs(d.dx) > 6) { place(kRef.current, false); return; }
      const card = (d.t as HTMLElement | null)?.closest?.("[data-k]");
      if (card) { const kk = Number(card.getAttribute("data-k")); if (kk !== kRef.current) go(kk); }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", up); };
  }, [go, place]);

  // scroll horizontal del trackpad (o shift + rueda): la tira sigue al dedo y al soltar se acomoda en la foto más cercana
  useEffect(() => {
    const el = view.current;
    if (!el || !N) return;
    let acc = 0, settle = 0;
    const onWheel = (e: WheelEvent) => {
      const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
      if (!dx || (!e.shiftKey && Math.abs(e.deltaX) < Math.abs(e.deltaY))) return;
      e.preventDefault(); // también evita que el trackpad navegue hacia atrás
      if (moving.current || drag.current) return;
      const m = metrics();
      const step = m.w + m.g;
      if (!step) return;
      acc -= dx;
      // imán: en la cola suave del gesto la foto más cercana ya se va acercando al centro
      if (Math.abs(dx) < 4) acc *= 0.8;
      let kk = kRef.current;
      while (acc <= -step) { acc += step; kk++; }
      while (acc >= step) { acc -= step; kk--; }
      if (kk < N || kk >= 2 * N) kk = (((kk % N) + N) % N) + N; // las tres copias hacen el salto invisible
      if (kk !== kRef.current) { kRef.current = kk; setK(kk); }
      place(kk, true, acc);
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        // siempre encaja una foto en el centro, rápido: arranca de una y frena suave
        const n = Math.abs(acc) > step * 0.3 ? (acc < 0 ? 1 : -1) : 0;
        acc = 0;
        let to = kRef.current + n;
        const t = track.current;
        if (!t) return;
        moving.current = true;
        t.style.transition = "transform 0.42s cubic-bezier(0.2, 0.8, 0.2, 1)";
        if (to !== kRef.current) { kRef.current = to; setK(to); }
        place(to, false);
        window.setTimeout(() => {
          t.style.transition = "";
          moving.current = false;
          if (to < N || to >= 2 * N) { to = (((to % N) + N) % N) + N; kRef.current = to; setK(to); place(to, true); }
        }, 440);
      }, 90);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => { el.removeEventListener("wheel", onWheel); window.clearTimeout(settle); };
  }, [N, go, place]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!N) return null;
  const cur = slides[k % N];
  const pad = (n: number) => String(n).padStart(2, "0");
  const copies = [0, 1, 2].flatMap((c) => slides.map((s, i) => ({ s, kk: c * N + i })));

  return (
    <Shell props={props} label={props.titulo || "Galería"} className="overflow-x-clip pt-24 md:pt-[120px] [--gw:68vw] md:[--gw:min(42vw,440px,calc((100svh-300px)/1.4))]">
      <div className="mb-7 grid grid-cols-[1fr_auto_1fr] items-center gap-4 px-5 md:mb-12">
        <span className="marca-mono marca-mono-soft">({pad((k % N) + 1)})</span>
        <span className="marca-mono marca-mono-soft">{props.arriba}</span>
        <span className="marca-mono marca-mono-soft text-right">{props.derecha}</span>
      </div>
      <div
        ref={view}
        tabIndex={0}
        aria-roledescription="carrusel"
        aria-label={props.titulo || "Galería de modelos"}
        className="relative touch-pan-y select-none overflow-hidden"
        onPointerDown={(e) => { if (moving.current || (e.pointerType === "mouse" && e.button !== 0)) return; drag.current = { x: e.clientX, dx: 0, id: e.pointerId, t: e.target }; }}
        onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); go(kRef.current + 1); } else if (e.key === "ArrowLeft") { e.preventDefault(); go(kRef.current - 1); } }}
        onMouseEnter={() => { hover.current = true; }}
        onMouseLeave={() => { hover.current = false; }}
      >
        <div ref={track} className="flex w-max gap-[clamp(16px,3.4vw,44px)] transition-transform duration-[800ms] ease-[cubic-bezier(.7,0,.2,1)] will-change-transform">
          {copies.map(({ s, kk }) => (
            <figure key={kk} data-k={kk} className={`m-0 aspect-[5/7] w-[var(--gw)] flex-none overflow-hidden bg-marca-piedra ${kk === k ? "cursor-grab" : "cursor-pointer"}`}>
              <img src={s.src} alt={kk === k ? s.alt : ""} loading="lazy" draggable={false} className="pointer-events-none block h-full w-full object-cover" />
            </figure>
          ))}
        </div>
      </div>
      <div className="relative mx-auto mt-[22px] min-h-[8.6em] w-[var(--gw)]" aria-live="polite">
        <p key={k % N} className="m-0 font-marca-mono text-[11px] uppercase leading-[1.32] tracking-[.04em] [font-feature-settings:'zero'_1] md:text-[12px]">
          {cur.lines.map((l, i) => <span key={i} className="marca-fade block" style={{ animationDelay: `${i * 45}ms` }}>{l}</span>)}
        </p>
        {cur.tag ? <span className="absolute right-0 top-[2.64em] font-marca-mono text-[11px] uppercase leading-[1.32] tracking-[.04em] md:text-[12px]">{cur.tag}</span> : null}
        {cur.href && props.ctaLabel ? <a className="marca-bk absolute bottom-0 right-0 p-0" href={cur.href}>{props.ctaLabel}</a> : null}
      </div>
    </Shell>
  );
}

export const marcaGaleriaSection: DesignSectionDef = {
  label: "Tu Marca · Galería de modelos",
  group: "Editorial",
  description: "Carrusel infinito de fotos de modelo; solo la del centro muestra la ficha del producto y el precio. Avanza solo, se arrastra y se mueve con el scroll horizontal.",
  fields: [
    { key: "titulo", label: "Nombre de la galería (accesibilidad)", type: "text" },
    { key: "arriba", label: "Texto arriba al centro", type: "text" },
    { key: "derecha", label: "Texto arriba a la derecha", type: "text" },
    { key: "fotos", label: "Fotos de modelo (en orden; vacío = foto del producto)", type: "medialist" },
    { key: "productos", label: "Productos (mismo orden que las fotos; ponen nombre, precio y enlace)", type: "products", max: 16 },
    { key: "coleccion", label: "Primera línea de la ficha (con productos)", type: "text" },
    { key: "fichas", label: "Fichas manuales (solo fotos sin producto) · una por foto, separadas por una línea en blanco; [SOL] va a la derecha", type: "textarea" },
    { key: "ctaLabel", label: "Botón de la ficha · Texto", type: "text" },
    { key: "ctaHref", label: "Botón de la ficha · Enlace (fichas manuales)", type: "text" },
    { key: "autoplay", label: "Avanzar solo", type: "boolean" },
    { key: "intervalo", label: "Segundos entre fotos", type: "number", min: 2, max: 12, step: 0.5 },
    ...MARCA_BASE_FIELDS,
  ],
  defaults: {
    ...MARCA_BASE_DEFAULTS,
    titulo: "Galería de ejemplo",
    arriba: "@tumarca",
    derecha: "(2026)",
    fotos: [],
    productos: [],
    coleccion: "Colección de ejemplo",
    fichas: "",
    ctaLabel: "Ver",
    ctaHref: "/tienda",
    autoplay: true,
    intervalo: 4.2,
  },
  Component: Galeria,
};
