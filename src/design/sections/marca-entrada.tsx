import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import type { DesignSectionDef, SceneContext } from "./types";
import { viewsByColor, type Views } from "./marca/views";
import { EditorHint, MARCA_BASE_DEFAULTS, MARCA_BASE_FIELDS, Shell, pickProducts, productHref, productImages, productPrice, formatCOP, useInView, useReducedMotion } from "./marca/shared";

/**
 * Banner de entrada: los productos del inventario pasan de derecha a izquierda y giran con sus tres fotos.
 * Entran de lado (lateral), pasan a tres cuartos, llegan de frente al centro y salen en espejo
 * (tres cuartos y lateral reflejadas). El cambio de vista es cuadro a cuadro, como stop-motion.
 */
type Item = { key: string; views: Views; name: string; href: string; price: number | null };

function buildItems(props: Record<string, any>, ctx: SceneContext): Item[] {
  const chosen = pickProducts(props.productos, ctx);
  const products = chosen.length ? chosen : ctx.products.slice(0, 16);
  return products.flatMap((p) => {
    const colors = viewsByColor(productImages(p));
    const list = props.colores === "todos" ? colors : colors.slice(0, 1);
    return list.map((views, i) => ({ key: `${p.id}-${i}`, views, name: p.name, href: productHref(p), price: productPrice(p) }));
  });
}

/* ---------- recorrido: posición respecto al centro → vista, tamaño y foco ---------- */
// d = posición de la gafa respecto al centro (en puestos): + a la derecha (entra), − a la izquierda (sale)
function viewAt(d: number): { v: keyof Views; mirror: boolean } {
  const a = Math.abs(d);
  const v: keyof Views = a < 0.5 ? "f" : a < 1.5 ? "t" : "l";
  return { v, mirror: d < 0 && v !== "f" };
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function lookAt(d: number, blur: boolean) {
  const a = Math.min(3.2, Math.abs(d));
  const scale = a <= 1 ? lerp(1, 0.7, a) : a <= 2 ? lerp(0.7, 0.54, a - 1) : lerp(0.54, 0.46, Math.min(1, a - 2));
  const opacity = a <= 1 ? lerp(1, 0.9, a) : a <= 2 ? lerp(0.9, 0.6, a - 1) : Math.max(0, lerp(0.6, 0, a - 2));
  return { scale, opacity, blur: blur ? Math.max(0, a - 0.45) * 3.4 : 0 };
}
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t: number) => 1 - Math.pow(1 - t, 3); // encaje magnético: arranca de una y frena suave
const mod = (n: number, m: number) => ((n % m) + m) % m;

// la foto de estudio se funde con el papel: modo multiplicar sobre el fondo heredado y bordes que se desvanecen
const FADE = "radial-gradient(ellipse 66% 60% at 50% 52%, #000 54%, transparent 100%)";
const PHOTO = { WebkitMaskImage: FADE, maskImage: FADE, filter: "brightness(1.05) contrast(1.04)" } as const;
const WINDOW = 4; // puestos dibujados a cada lado del centro

function Entrada({ props, ctx }: { props: Record<string, any>; ctx: SceneContext }) {
  const items = useMemo(() => buildItems(props, ctx), [props, ctx]);
  const N = items.length;
  const reduce = useReducedMotion();
  const view = useRef<HTMLDivElement>(null);
  const nodes = useRef(new Map<number, HTMLElement>());
  const inView = useInView(view, "0px", 0.2);
  const continuous = props.movimiento === "continuo";
  const blur = props.desenfoque !== false;

  // posición del carrusel (número real: el índice que está en el centro) y animación hacia un destino
  const pos = useRef(0);
  const anim = useRef<{ from: number; to: number; t0: number; dur: number; out?: boolean } | null>(null);
  const idleSince = useRef(0);
  const [base, setBase] = useState(0); // índice entero alrededor del cual se dibujan los puestos
  const [k, setK] = useState(0); // gafa del centro (para la nota y el nombre)
  const [note, setNote] = useState(false);
  const noteRef = useRef(false);
  noteRef.current = note;
  const touch = useRef(false);
  // al pasar de la gafa al texto no se cierra: el cierre espera un instante y el texto lo cancela
  const closer = useRef(0);
  const closeSoon = () => { window.clearTimeout(closer.current); closer.current = window.setTimeout(() => setNote(false), 140); };
  const keepOpen = () => { window.clearTimeout(closer.current); setNote(true); };
  // arrastre con el mouse o el dedo (como un carrusel) y rueda horizontal del trackpad
  const drag = useRef<{ x0: number; y0: number; p0: number; lastX: number; lastT: number; v: number; axis: "x" | "y" | null } | null>(null);
  const dragged = useRef(false);
  const unit = useRef(1); // píxeles por puesto cerca del centro
  const wheelSnap = useRef(0);
  const wheelAt = useRef(0);
  const lastWheel = () => wheelAt.current;

  const paint = useCallback(() => {
    const p = pos.current;
    const first = nodes.current.values().next().value as HTMLElement | undefined;
    const ew = first?.offsetWidth || 0;
    const W = view.current?.clientWidth || ew * 2;
    // separación: la de tres cuartos queda cerca del centro y las laterales se apilan hacia los bordes
    const s1 = Math.max(0.29 * W, 0.95 * ew), s2 = Math.max(0.19 * W, 0.62 * ew), s3 = 0.5 * ew;
    unit.current = s1 || 1;
    const xAt = (d: number) => { const a = Math.abs(d); return Math.sign(d) * (a <= 1 ? a * s1 : a <= 2 ? s1 + (a - 1) * s2 : s1 + s2 + (a - 2) * s3); };
    nodes.current.forEach((el, i) => {
      const d = i - p;
      const { v, mirror } = viewAt(d);
      const lk = lookAt(d, blur);
      if (el.dataset.v !== v) el.dataset.v = v;
      const m = mirror ? "1" : "0";
      if (el.dataset.m !== m) el.dataset.m = m;
      el.style.transform = `translate3d(calc(-50% + ${xAt(d).toFixed(1)}px),0,0) scale(${lk.scale.toFixed(3)})`;
      el.style.opacity = lk.opacity.toFixed(3);
      el.style.filter = lk.blur > 0.2 ? `blur(${lk.blur.toFixed(1)}px)` : "none";
      el.style.zIndex = String(20 - Math.round(Math.abs(d) * 4));
    });
    const b = Math.floor(p);
    setBase((cur) => (cur === b ? cur : b));
  }, [blur]);

  const target = () => Math.round(anim.current?.to ?? pos.current);
  const go = useCallback((to: number, dur?: number, out = false) => {
    if (!N) return;
    const from = pos.current;
    const dist = Math.abs(to - from);
    if (dist < 0.001) { idleSince.current = performance.now(); setK(Math.round(to)); return; }
    if (reduce) { pos.current = to; idleSince.current = performance.now(); setK(Math.round(to)); paint(); return; }
    anim.current = { from, to, t0: performance.now(), dur: dur ?? 1050 + Math.min(4, Math.max(0, dist - 1)) * 260, out };
  }, [N, reduce, paint]);
  // al soltar (arrastre o scroll horizontal): sigue un poco con el impulso y SIEMPRE encaja una gafa en el centro, rápido
  const settle = useCallback((v = 0) => {
    const proj = pos.current + Math.max(-4, Math.min(4, v * 260));
    const to = Math.round(proj);
    go(to, 300 + Math.min(4, Math.abs(to - pos.current)) * 140, true);
  }, [go]);

  // rueda: solo el gesto horizontal (trackpad o shift + rueda); el scroll vertical sigue bajando la página
  useEffect(() => {
    const el = view.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (!dx) return;
      e.preventDefault();
      anim.current = null;
      wheelAt.current = performance.now();
      const step = (dx * (e.deltaMode === 1 ? 16 : 1)) / unit.current;
      pos.current += step;
      // imán: en la cola suave del gesto la gafa más cercana ya se va acercando al centro
      if (Math.abs(step) < 0.04) pos.current += (Math.round(pos.current) - pos.current) * 0.22;
      window.clearTimeout(wheelSnap.current);
      wheelSnap.current = window.setTimeout(() => settle(0), 90);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => { el.removeEventListener("wheel", onWheel); window.clearTimeout(wheelSnap.current); };
  }, [settle, N]);

  // bucle de animación: paso a paso (se detiene de frente en el centro) o continuo
  useEffect(() => {
    if (!N) return;
    paint();
    if (!inView) return;
    let raf = 0;
    let last = performance.now();
    idleSince.current = last;
    const stepMs = Math.max(1.5, Number(props.intervalo) || 2.6) * 1000;
    const speed = Math.max(0.05, Number(props.velocidad) || 0.35); // productos por segundo
    const tick = (now: number) => {
      const dt = Math.min(64, now - last);
      last = now;
      const held = drag.current?.axis === "x" || now - lastWheel() < 400;
      const paused = noteRef.current || document.hidden || held; // se detiene mientras se lee la gafa del centro o se arrastra
      const a = anim.current;
      if (a) {
        const t = Math.min(1, (now - a.t0) / a.dur);
        pos.current = lerp(a.from, a.to, a.out ? easeOut(t) : ease(t));
        if (t >= 1) { anim.current = null; idleSince.current = now; setK(Math.round(a.to)); }
      } else if (!reduce && N > 1 && !paused) {
        if (continuous) {
          pos.current += (dt / 1000) * speed;
          const r = Math.round(pos.current);
          setK((cur) => (cur === r ? cur : r));
        } else if (now - idleSince.current > stepMs) {
          anim.current = { from: pos.current, to: Math.round(pos.current) + 1, t0: now, dur: 1150 };
        }
      } else if (paused) {
        idleSince.current = now; // al soltar, la gafa se queda de frente un intervalo completo
      }
      paint();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [N, inView, reduce, continuous, props.intervalo, props.velocidad, paint]);

  useEffect(() => {
    const on = () => paint();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, [paint]);

  // en celular la nota se cierra al tocar fuera del banner
  useEffect(() => {
    if (!note) return;
    const off = (e: PointerEvent) => { if (view.current && !view.current.contains(e.target as Node)) setNote(false); };
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, [note]);

  if (!N) return <Shell props={props} className="py-16"><EditorHint ctx={ctx}>Banner de productos · elige productos en el panel o agrégalos a la página</EditorHint></Shell>;

  const cur = items[mod(k, N)];
  const tall = props.altura === "alta";
  const slots: number[] = [];
  for (let i = base - WINDOW; i <= base + WINDOW + 1; i++) slots.push(i);

  return (
    <Shell props={props} label={props.titulo || "Productos Tu Marca"} className={`overflow-hidden ${tall ? "py-14 md:py-20" : "py-10 md:py-14"}`}>
      <div
        ref={view}
        tabIndex={0}
        aria-roledescription="carrusel"
        aria-label={props.titulo || "Productos Tu Marca"}
        className={`marca-giro relative select-none [background:inherit] [touch-action:pan-y] cursor-grab active:cursor-grabbing ${tall ? "[--ew:66vw] md:[--ew:clamp(300px,31vw,540px)]" : "[--ew:58vw] md:[--ew:clamp(260px,26vw,460px)]"}`}
        style={{ height: "calc(var(--ew) * 2 / 3)" }}
        onPointerLeave={(e) => { if (e.pointerType === "mouse") setNote(false); }}
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          dragged.current = false;
          drag.current = { x0: e.clientX, y0: e.clientY, p0: pos.current, lastX: e.clientX, lastT: performance.now(), v: 0, axis: null };
        }}
        onPointerMove={(e) => {
          const g = drag.current;
          if (!g) return;
          const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
          if (!g.axis) {
            if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
              g.axis = "x"; g.p0 = pos.current; g.x0 = e.clientX; anim.current = null;
              try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* sin captura */ }
            } else if (Math.abs(dy) > 8) { drag.current = null; return; }
            else return;
          }
          const now = performance.now();
          const dt = Math.max(1, now - g.lastT);
          const v = -(e.clientX - g.lastX) / unit.current / dt; // puestos por milisegundo
          g.v = g.v * 0.7 + v * 0.3;
          g.lastX = e.clientX; g.lastT = now;
          pos.current = g.p0 - (e.clientX - g.x0) / unit.current;
          dragged.current = true;
        }}
        onDragStart={(e) => e.preventDefault()}
        onPointerUp={() => { const g = drag.current; drag.current = null; if (g?.axis === "x") settle(g.v); }}
        onPointerCancel={() => { const g = drag.current; drag.current = null; if (g?.axis === "x") settle(0); }}
        onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setNote(false); }}
        onKeyDown={(e) => {
          touch.current = false;
          if (e.key === "ArrowRight") { e.preventDefault(); go(target() + 1, 620, true); }
          else if (e.key === "ArrowLeft") { e.preventDefault(); go(target() - 1, 620, true); }
        }}
      >
        {slots.map((i) => {
          const it = items[mod(i, N)];
          const center = i === k;
          const imgs = (["l", "t", "f"] as const).map((v) => (
            <img key={v} src={it.views[v]} alt={center && v === "f" ? it.name : ""} draggable={false} loading={Math.abs(i - base) <= 2 ? "eager" : "lazy"}
              className={`marca-giro-v marca-giro-${v} pointer-events-none absolute inset-0 h-full w-full object-cover`} style={PHOTO} />
          ));
          const ref = (el: HTMLElement | null) => { if (el) nodes.current.set(i, el); else nodes.current.delete(i); };
          const cls = "marca-giro-item absolute left-1/2 top-0 block aspect-[3/2] w-[var(--ew)] cursor-pointer border-0 bg-transparent p-0 mix-blend-multiply will-change-transform";
          if (!center) {
            // las de los lados solo traen su gafa al centro
            return <button key={i} ref={ref} type="button" tabIndex={-1} aria-hidden onPointerEnter={() => setNote(false)} onClick={() => { if (!dragged.current) go(i); }} className={cls}>{imgs}</button>;
          }
          const label = [it.name || "Ver producto", it.price !== null ? formatCOP(it.price) : ""].filter(Boolean).join(" · ");
          return (
            <a key={i} ref={ref} href={it.href} aria-label={label} className={cls}
              onPointerEnter={(e) => { if (e.pointerType === "mouse") keepOpen(); }}
              onPointerLeave={(e) => { if (e.pointerType === "mouse") closeSoon(); }}
              onPointerDown={(e: RPointerEvent) => { touch.current = e.pointerType !== "mouse"; }}
              onFocus={() => { if (!touch.current) setNote(true); }}
              onClick={(e) => { if (dragged.current) e.preventDefault(); }}>
              {imgs}
            </a>
          );
        })}
      </div>

      {/* la gafa del centro: nombre, precio y [ Ver ] siempre a la vista; flechas a la misma altura para pasar */}
      <div className="mx-auto mt-5 flex w-full max-w-[880px] items-center justify-between gap-4 px-5 md:mt-7">
        <button type="button" className="marca-bk shrink-0" aria-label="Gafa anterior" onClick={() => go(target() - 1, 620, true)}>←</button>
        <div key={mod(k, N)} className="marca-fade grid min-w-0 justify-items-center gap-1 text-center" aria-live="polite">
          {cur.name ? <span className="marca-mono truncate text-[11px] text-marca-cacao">{cur.name}</span> : null}
          <span className="flex items-baseline gap-4">
            {cur.price !== null ? <span className="marca-mono text-[11px] text-marca-cacao">{formatCOP(cur.price)}</span> : null}
            <a className="marca-bk py-0 text-marca-cacao" href={cur.href}>Ver</a>
          </span>
        </div>
        <button type="button" className="marca-bk shrink-0" aria-label="Gafa siguiente" onClick={() => go(target() + 1, 620, true)}>→</button>
      </div>
    </Shell>
  );
}

export const marcaEntradaSection: DesignSectionDef = {
  label: "Tu Marca · Banner de entrada (productos)",
  group: "Signature",
  description: "Los productos del inventario pasan y giran con sus fotos de lado, tres cuartos y frente: entran de lado, llegan de frente al centro y salen en espejo. Debajo, el nombre y el precio de la del centro con flechas para pasar.",
  fields: [
    { key: "titulo", label: "Nombre del banner (accesibilidad)", type: "text" },
    { key: "productos", label: "Productos (vacío = los de la página; usan sus fotos frente, 3/4 y lateral)", type: "products", max: 16 },
    { key: "colores", label: "Colores", type: "select", options: [{ value: "uno", label: "Un color por referencia" }, { value: "todos", label: "Todos los colores" }] },
    { key: "movimiento", label: "Movimiento", type: "select", options: [{ value: "paso", label: "Paso a paso (se detiene de frente)" }, { value: "continuo", label: "Continuo" }] },
    { key: "intervalo", label: "Paso a paso · segundos de frente", type: "number", min: 1.5, max: 10, step: 0.5 },
    { key: "velocidad", label: "Continuo · productos por segundo", type: "number", min: 0.1, max: 1.5, step: 0.05 },
    { key: "desenfoque", label: "Desenfocar las de los lados", type: "boolean" },
    { key: "altura", label: "Tamaño", type: "select", options: [{ value: "media", label: "Medio" }, { value: "alta", label: "Grande" }] },
    ...MARCA_BASE_FIELDS,
  ],
  defaults: {
    ...MARCA_BASE_DEFAULTS,
    titulo: "Productos Tu Marca",
    productos: [],
    colores: "uno",
    movimiento: "paso",
    intervalo: 2.6,
    velocidad: 0.35,
    desenfoque: true,
    mostrarNombre: false,
    altura: "alta",
  },
  Component: Entrada,
};
