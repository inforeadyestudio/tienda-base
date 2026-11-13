// Piezas de la página de producto Tu Marca. Solo presentación: los datos llegan de la página (vm de useProductPage).
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from "react";
import { viewOf, viewsByColor, type Views } from "@/design/sections/marca/views";
import { cx, useReducedMotion } from "@/design/sections/marca/shared";
import { Glasses3D } from "./glasses3d/Glasses3D";
import type { GlassesLook, GlassesViewer } from "./glasses3d/marca-glasses-3d";

type Media = { url: string; alt?: string | null; type?: string };

/* ---------------- visor 360°: la gafa gira ahí mismo, suave ---------------- */
// Cinco cuadros con las tres fotos: lateral y 3/4 tal cual (miran a la izquierda), frente, y 3/4 y lateral en espejo.
// Se gira arrastrando la foto (mouse o dedo), con scroll horizontal del trackpad o con el slider de abajo.
// El giro es suave: la posición avanza despacio hacia donde se lleva y las fotos se funden entre sí; al soltar se
// acomoda en la vista más cercana. La gafa mira hacia donde se arrastra. No se mueve sola.
//
// Si la referencia tiene modelo 3D (glasses3d/manifest.ts), el 3D ocupa ese mismo espacio con el mismo fondo:
// mientras carga se ve la foto 3/4 del color y el 3D aparece encima con un fundido. Arrastrar gira la gafa, el slider
// gira el 3D (azimut de -90 a 90) y sigue a la gafa cuando se arrastra. Sin WebGL o si falla, quedan las fotos.
const FRAMES: Array<{ v: keyof Views; m: boolean }> = [
  { v: "l", m: false }, { v: "t", m: false }, { v: "f", m: false }, { v: "t", m: true }, { v: "l", m: true },
];
const LABELS = ["Lateral izquierdo", "Tres cuartos izquierdo", "Frente", "Tres cuartos derecho", "Lateral derecho"];
const MID = 2;
const LAST = FRAMES.length - 1;
const EASE = 0.075; // qué tan rápido alcanza la posición (más bajo = más suave)

// 3D: el slider va de un lateral al otro (azimut -90 … 90) con polar 80 y distancia 0.46.
// AZ_DIR alinea el sentido del 3D con el de las fotos (la foto que se ve en cada punto del slider mira igual que el 3D).
const AZ_DIR = -1; // con azimut positivo la gafa mira a la izquierda, como las fotos de la izquierda del slider
const POLAR = 80;
const DIST = 0.46;
const AZ_ENTRY = 40; // vista de entrada del visor (3/4)
const azOf = (p: number) => AZ_DIR * (-90 + (p / LAST) * 180);
const pOf = (az: number) => Math.max(0, Math.min(LAST, ((AZ_DIR * az + 90) / 180) * LAST));
const START_3D = Math.round(pOf(AZ_ENTRY)); // la foto 3/4 que se ve mientras carga el 3D

export type Model3D = { model: string; look: GlassesLook };

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    const g = (c.getContext("webgl2") || c.getContext("webgl")) as WebGLRenderingContext | null;
    g?.getExtension("WEBGL_lose_context")?.loseContext();
    return !!g;
  } catch {
    return false;
  }
}

const toHex = (css: string) => {
  const m = css.match(/\d+(\.\d+)?/g);
  if (!m || m.length < 3) return null;
  return "#" + m.slice(0, 3).map((n) => Math.round(Number(n)).toString(16).padStart(2, "0")).join("");
};

export function GiroViewer({ media, name, model3d }: { media: Media[]; name: string; model3d?: Model3D | null }) {
  const urls = media.filter((m) => m.type !== "video").map((m) => m.url);
  const key = urls.join("|");
  const views = useMemo(() => viewsByColor(urls)[0], [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const reduce = useReducedMotion();
  const start = model3d ? START_3D : MID;
  const stage = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLSpanElement>(null);
  const imgs = useRef<Array<HTMLImageElement | null>>([]);
  const pos = useRef(start); // lo que se ve
  const target = useRef(start); // hacia donde va
  const raf = useRef(0);
  const [value, setValue] = useState(start);
  const drag = useRef<{ x: number; y: number; t: number; axis: "" | "x" | "y" } | null>(null);

  // ---- 3D ----
  const [near, setNear] = useState(false); // el bloque ya entró en pantalla
  const [gl, setGl] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  const [live, setLive] = useState(false); // el 3D ya está listo y encima de las fotos
  const [folded, setFolded] = useState(false);
  const [bg, setBg] = useState<string | null>(null);
  const viewer = useRef<GlassesViewer | null>(null);
  const liveRef = useRef(false);
  liveRef.current = live;
  const cam = useRef({ pol: POLAR, dist: DIST });
  const steering = useRef(false);
  const model = model3d?.model ?? null;
  const mount3d = !!model3d && near && gl === true && !failed && !!bg;

  const paint = () => {
    const p = pos.current;
    imgs.current.forEach((im, i) => { if (im) im.style.opacity = String(Math.max(0, 1 - Math.abs(p - i))); });
    if (knob.current) knob.current.style.left = `${(p / LAST) * 100}%`;
  };
  const last = useRef(0);
  const loop = (now: number) => {
    raf.current = 0;
    // suavizado por tiempo (no por cuadro), para que gire igual de rápido en un equipo lento
    const dt = last.current ? Math.min(80, now - last.current) : 16.7;
    last.current = now;
    const f = dt / 16.7;
    const d = target.current - pos.current;
    pos.current = reduce || Math.abs(d) < 0.003 ? target.current : pos.current + d * (1 - Math.pow(1 - EASE, f));
    let moving = pos.current !== target.current;
    const v = liveRef.current ? viewer.current : null;
    if (v) {
      // el 3D sigue al slider: azimut suave y la cámara vuelve a polar 80 / distancia 0.46
      const c = cam.current;
      const k = reduce ? 1 : 1 - Math.pow(1 - 0.12, f);
      c.pol = Math.abs(POLAR - c.pol) < 0.05 ? POLAR : c.pol + (POLAR - c.pol) * k;
      c.dist = Math.abs(DIST - c.dist) < 0.0005 ? DIST : c.dist + (DIST - c.dist) * k;
      moving = moving || c.pol !== POLAR || c.dist !== DIST;
      steering.current = true;
      v.setView(azOf(pos.current), c.pol, c.dist, true);
      steering.current = false;
    }
    paint();
    if (moving) raf.current = requestAnimationFrame(loop);
    else last.current = 0;
  };
  const aim = (t: number, snap = false) => {
    const v = Math.max(0, Math.min(LAST, snap ? Math.round(t) : t));
    target.current = v;
    setValue(Math.round(v));
    if (!raf.current) raf.current = requestAnimationFrame(loop);
  };
  const halt = () => { cancelAnimationFrame(raf.current); raf.current = 0; last.current = 0; target.current = pos.current; };

  // al cambiar de color: con el 3D encima la vista se queda (solo cambia el material); si no, vuelve a la de entrada
  useEffect(() => {
    if (!liveRef.current) { pos.current = start; target.current = start; setValue(start); }
    paint();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  // 3D: se monta solo cuando el bloque entra en pantalla y si el dispositivo tiene WebGL
  useEffect(() => {
    if (!model) return;
    if (gl === null) setGl(hasWebGL());
    const el = stage.current;
    if (!el) return;
    const hex = toHex(getComputedStyle(el).backgroundColor);
    setBg(hex ?? "#e2dccf");
    if (typeof IntersectionObserver === "undefined") { setNear(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setNear(true); io.disconnect(); } }, { rootMargin: "200px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [model]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setFailed(false); setFolded(false); }, [model]);
  useEffect(() => {
    if (mount3d) return;
    if (viewer.current) viewer.current.onViewChange = undefined;
    viewer.current = null;
    setLive(false);
  }, [mount3d]);

  const onReady = (v: GlassesViewer) => {
    viewer.current = v;
    // arranca en la misma vista que la foto: si nadie la movió, la 3/4 de entrada del visor
    if (Math.round(pos.current * 100) !== START_3D * 100) v.setView(azOf(pos.current), POLAR, DIST, true);
    const now = v.getView();
    pos.current = target.current = pOf(now.azimuth);
    cam.current = { pol: now.polar, dist: now.distance };
    // el slider sigue a la gafa cuando se arrastra
    v.onViewChange = (view) => {
      if (steering.current || raf.current) return;
      pos.current = target.current = pOf(view.azimuth);
      cam.current = { pol: view.polar, dist: view.distance };
      paint();
      setValue(Math.round(pos.current));
    };
    paint();
    setValue(Math.round(pos.current));
    setLive(true);
  };

  // scroll horizontal del trackpad sobre la foto (o sobre el 3D)
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    let settle = 0;
    const onWheel = (e: WheelEvent) => {
      const dx = e.deltaX || (e.shiftKey ? e.deltaY : 0);
      if (!dx || (!e.shiftKey && Math.abs(e.deltaX) < Math.abs(e.deltaY))) return;
      e.preventDefault(); // también evita que el trackpad navegue hacia atrás
      aim(target.current + dx / 160);
      window.clearTimeout(settle);
      if (!liveRef.current) settle = window.setTimeout(() => aim(target.current, true), 180);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => { el.removeEventListener("wheel", onWheel); window.clearTimeout(settle); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // arrastrar la foto: media pantalla de foto ≈ dos vistas. Con el 3D encima, el arrastre lo toma el visor.
  const unit = () => Math.max(70, Math.min(180, (stage.current?.clientWidth ?? 600) / 4.5));
  const onDown = (e: RPointerEvent) => {
    if (liveRef.current) { halt(); return; }
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, t: target.current, axis: e.pointerType === "mouse" ? "x" : "" };
    if (e.pointerType === "mouse") e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (!d.axis) {
      if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
      d.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      if (d.axis === "x") e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (d.axis === "x") aim(d.t + dx / unit());
  };
  const onUp = () => { if (drag.current?.axis === "x") aim(target.current, true); drag.current = null; };

  // slider: tocar o arrastrar sobre la línea (con el 3D no se acomoda a una vista: el giro es continuo)
  const fromTrack = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (r) aim(((clientX - r.left) / r.width) * LAST);
  };
  const release = () => { if (!liveRef.current) aim(target.current, true); };

  if (!views) return null;
  const show3d = !!model3d && gl !== false && !failed;

  return (
    <div>
      <div ref={stage} data-3d={model3d ? (live ? "listo" : failed ? "fallo" : "cargando") : undefined}
        className="relative isolate aspect-[5/4] cursor-grab touch-pan-y select-none overflow-hidden bg-[var(--marca-bg,var(--marca-paper))] active:cursor-grabbing md:aspect-auto md:h-[clamp(420px,calc(100svh-230px),860px)]"
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {/* en celular la gafa se acerca un poco para que llene el cuadro */}
        <div className="pointer-events-none absolute inset-0 scale-[1.12] bg-[var(--marca-bg,var(--marca-paper))] md:scale-[1.04]" aria-hidden={live || undefined}>
          {FRAMES.map((fr, i) => (
            <img key={i} ref={(el) => { imgs.current[i] = el; }} src={views[fr.v]} alt={i === start && !live ? name : ""} aria-hidden={i === start && !live ? undefined : true} draggable={false}
              className="absolute inset-0 h-full w-full select-none object-cover mix-blend-multiply"
              style={{ opacity: i === start ? 1 : 0, transform: fr.m ? "scaleX(-1)" : undefined }} />
          ))}
        </div>
        {mount3d && model3d && bg ? (
          // en celular la foto va acercada (1.12): el 3D se acerca un poco para que la gafa quede del mismo tamaño al fundirse
          <div className="absolute inset-0 z-[1] scale-[1.06] md:scale-100">
            <Glasses3D model={model3d.model} look={model3d.look} background={bg} folded={folded} onReady={onReady} onError={() => setFailed(true)} />
          </div>
        ) : null}
      </div>

      {/* slider centrado: se toca o se arrastra; también con las flechas del teclado.
          Con el 3D, a la derecha (debajo en celular) va el botón de las varillas. */}
      <div className="relative mt-4 flex flex-col items-center md:block">
        <div ref={track} role="slider" tabIndex={0} aria-label="Girar la gafa" aria-valuemin={0} aria-valuemax={LAST} aria-valuenow={value} aria-valuetext={LABELS[value]}
          className="relative mx-auto h-7 w-[min(320px,72%)] cursor-pointer touch-none outline-none [&:focus-visible]:outline [&:focus-visible]:outline-1 [&:focus-visible]:outline-offset-4 [&:focus-visible]:outline-marca-cacao"
          onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); fromTrack(e.clientX); }}
          onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) fromTrack(e.clientX); }}
          onPointerUp={release}
          onPointerCancel={release}
          onKeyDown={(e) => {
            const cur = Math.round(target.current);
            const n = e.key === "ArrowLeft" || e.key === "ArrowDown" ? cur - 1 : e.key === "ArrowRight" || e.key === "ArrowUp" ? cur + 1 : e.key === "Home" ? 0 : e.key === "End" ? LAST : null;
            if (n === null) return;
            e.preventDefault(); aim(n, true);
          }}>
          <span className="absolute inset-x-0 top-1/2 h-px bg-marca-line-strong" />
          <span ref={knob} className="absolute top-1/2 size-[11px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-marca-cacao" style={{ left: `${(start / LAST) * 100}%` }} />
        </div>

        {/* 3D: cerrar o abrir las varillas (aparece cuando el 3D está listo; el espacio queda reservado para no saltar) */}
        {show3d ? (
          <div className={cx("mt-1 flex justify-center transition-opacity duration-300 md:absolute md:inset-y-0 md:right-0 md:mt-0 md:items-center", live ? "opacity-100" : "pointer-events-none opacity-0")} aria-hidden={!live || undefined}>
            <button type="button" className="marca-bk" tabIndex={live ? 0 : -1} onClick={() => setFolded((f) => !f)}>
              {folded ? "Abrir varillas" : "Cerrar varillas"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Debajo del visor: fotos de modelo y de campaña del color, y videos (todo lo que no son las tres vistas). */
export function CampaignMedia({ media, name, className }: { media: Media[]; name: string; className?: string }) {
  const urls = media.filter((m) => m.type !== "video").map((m) => m.url);
  const views = viewsByColor(urls)[0];
  const used = new Set(views ? [views.f, views.t, views.l] : []);
  const extras = media.filter((m) => !used.has(m.url));
  // TODO(logica): fotos de campaña por producto en el inventario (hoy solo llegan las del color o sin color de product_images)
  if (!extras.length) return null;
  return (
    <div className={cx("grid grid-cols-2 items-start gap-x-3 gap-y-3 md:gap-x-6 md:gap-y-6", className)}>
      {extras.map((m, i) => {
        const k = i % 3;
        const product = m.type !== "video" && (viewOf(m.url) !== null || /frente|cuartos|lateral/i.test(m.url));
        return (
          <figure key={m.url}
            className={cx("m-0 overflow-hidden", k === 0 ? "col-span-2 aspect-square md:aspect-[6/5]" : "aspect-[3/4]", k === 2 && "md:mt-24",
              product ? "bg-[var(--marca-bg,var(--marca-paper))]" : "bg-marca-piedra")}>
            {m.type === "video"
              ? <video src={m.url} muted loop playsInline autoPlay preload="metadata" className="h-full w-full object-cover" />
              : <img src={m.url} alt={m.alt || name} loading="lazy" className={cx("h-full w-full object-cover", product && "mix-blend-multiply")} />}
          </figure>
        );
      })}
    </div>
  );
}

/* ---------------- color ---------------- */
export function ColorSwatches({ colors, color, onPick }: { colors: Array<{ color: string; hex: string | null }>; color: string; onPick: (c: string) => void }) {
  if (colors.length < 2) return null;
  return (
    <div>
      <p className="marca-mono m-0"><span className="marca-mono-soft">Color · </span>{color}</p>
      <div className="mt-3 flex flex-wrap gap-2.5" role="radiogroup" aria-label="Color">
        {colors.map((c) => {
          const on = c.color === color;
          return (
            <button key={c.color} type="button" role="radio" aria-checked={on} aria-label={c.color} title={c.color} onClick={() => onPick(c.color)}
              className={cx("relative size-7 rounded-full p-0 transition-[box-shadow] duration-150 marca-steps", on ? "shadow-[0_0_0_1px_var(--marca-paper),0_0_0_2px_var(--marca-cacao)]" : "shadow-[inset_0_0_0_1px_var(--marca-line-strong)] hover:shadow-[0_0_0_1px_var(--marca-paper),0_0_0_2px_var(--marca-line-strong)]")}
              style={{ background: c.hex ?? "var(--marca-piedra)" }} />
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- opciones entre corchetes (versión, talla) ---------------- */
export function BracketOptions<T extends string>({ label, options, onPick }: { label: string; options: Array<{ value: T; label: string; on: boolean; disabled?: boolean }>; onPick: (v: T) => void }) {
  return (
    <div>
      <p className="marca-mono marca-mono-soft m-0">{label}</p>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" role="radio" aria-checked={o.on} disabled={o.disabled} onClick={() => onPick(o.value)}
            className={cx("marca-bk hover:text-marca-cacao", o.on ? "" : "text-marca-suave", o.disabled && "cursor-not-allowed line-through opacity-40")} aria-pressed={o.on}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------- detalles plegables ---------------- */
export function Details({ items }: { items: Array<{ title: string; body: ReactNode; open?: boolean }> }) {
  const list = items.filter((i) => i.body);
  if (!list.length) return null;
  return (
    <div className="border-t border-marca-line-strong">
      {list.map((it) => (
        <details key={it.title} open={it.open} className="marca-details group border-b border-marca-line-strong">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3.5">
            <span className="marca-mono">{it.title}</span>
            <span className="marca-mono marca-mono-soft group-open:hidden">+</span>
            <span className="marca-mono marca-mono-soft hidden group-open:inline">−</span>
          </summary>
          <div className="pb-5 text-[14px] leading-[1.6] text-marca-cacao [&_p]:m-0 [&_p+p]:mt-3">{it.body}</div>
        </details>
      ))}
    </div>
  );
}

/* ---------------- relacionados ---------------- */
type Related = { id: string; slug?: string; name: string; hero_image_url?: string | null; product_variants?: Array<{ price_cop: number; price_usd?: number | null; color?: string | null; color_hex?: string | null }> | null };
export function RelatedRow({ title, products, money }: { title: string; products: Related[]; money?: (cop: number, usd?: number | null) => string }) {
  const list = products.filter((p) => p.slug).slice(0, 4);
  if (!list.length) return null;
  return (
    <section className="mt-24 md:mt-32" aria-label={title}>
      <header className="mb-8 flex items-baseline justify-between gap-4 border-b border-marca-line-strong pb-3">
        <h2 className="marca-t text-[clamp(22px,2.6vw,32px)]">{title}</h2>
        <a className="marca-bk" href="/tienda">Ver toda la tienda</a>
      </header>
      <div className="grid grid-cols-2 gap-x-3.5 gap-y-10 md:grid-cols-4 md:gap-x-[22px]">
        {list.map((p) => (
          <a key={p.id} href={`/producto/${p.slug}`} className="group block text-inherit no-underline">
            <span className="relative block aspect-[4/5] overflow-hidden bg-[var(--marca-bg,var(--marca-paper))] transition-transform duration-200 marca-steps group-hover:-translate-y-[3px]">
              {p.hero_image_url ? <img src={p.hero_image_url} alt={p.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover mix-blend-multiply" /> : null}
            </span>
            {/* texto centrado: nombre, precio y colores */}
            <span className="mt-4 grid justify-items-center gap-1 text-center">
              <span className="marca-tr min-w-0 text-[12.5px] md:text-[14px]">{p.name}</span>
              {money && p.product_variants?.length ? (() => {
                // la variante de menor precio, tal como llega de la lógica
                const v = [...p.product_variants].filter((x) => x.price_cop > 0).sort((a, b) => a.price_cop - b.price_cop)[0];
                return v ? <span className="marca-mono whitespace-nowrap text-[11px] tracking-[.06em]">{money(v.price_cop, v.price_usd ?? null)}</span> : null;
              })() : null}
              {(() => {
                const seen = new Set<string>();
                const cols = (p.product_variants ?? []).filter((v) => v.color_hex && !seen.has(v.color_hex) && seen.add(v.color_hex));
                return cols.length > 1 ? (
                  <span className="mt-1.5 flex flex-wrap justify-center gap-[7px]" aria-label="Colores">
                    {cols.map((v) => <span key={v.color_hex!} title={v.color ?? ""} className="size-3 rounded-full shadow-[inset_0_0_0_1px_var(--marca-line-strong)]" style={{ background: v.color_hex! }} />)}
                  </span>
                ) : null;
              })()}
            </span>
          </a>
        ))}
      </div>
    </section>
  );
}
