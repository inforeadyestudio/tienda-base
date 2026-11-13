import { useEffect, useRef, useState } from "react";
import type { DesignSectionDef } from "./types";
import { Iso, MARCA_BASE_DEFAULTS, MARCA_BASE_FIELDS, Shell, asList, cx, useFinePointer, useInView, useReducedMotion } from "./marca/shared";
import { DEMO_HERO } from "./marca/demo";

/** Portada de campaña: tres impresiones rectas que pasan solas y se barajan al tocar + tarjeta de papel parafinado. */
const POS: Array<[number, number, number]> = [[-170, 40, -7], [170, 46, 6], [0, 0, -1.2]];

function HeroCampana({ props }: { props: Record<string, any> }) {
  const fotos = asList(props.fotos);
  const pool = fotos.length ? fotos : DEMO_HERO;
  const reduce = useReducedMotion();
  const fine = useFinePointer();
  // tres impresiones visibles; cada una guarda el índice de la foto que muestra
  const [slots, setSlots] = useState<number[]>(() => [2, 1, 0].map((i) => i % pool.length));
  const [order, setOrder] = useState<number[]>([0, 1, 2]); // order[pos] = slot
  const [leaving, setLeaving] = useState<number | null>(null);
  const [narrow, setNarrow] = useState(false);
  const next = useRef(3);
  const stage = useRef<HTMLDivElement>(null);
  const [par, setPar] = useState<[number, number]>([0, 0]);

  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 560);
    on();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  // paralaje a 12 cuadros por segundo
  useEffect(() => {
    if (!fine || reduce) return;
    let mx = 0, my = 0, last = "";
    const el = stage.current?.parentElement;
    if (!el) return;
    const move = (e: PointerEvent) => {
      const r = stage.current!.getBoundingClientRect();
      mx = (e.clientX - (r.left + r.width / 2)) / r.width;
      my = (e.clientY - (r.top + r.height / 2)) / r.height;
    };
    const leave = () => { mx = 0; my = 0; };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerleave", leave);
    const t = window.setInterval(() => {
      const q = [Math.round(mx * 6) / 6, Math.round(my * 6) / 6] as [number, number];
      const k = q.join();
      if (k !== last) { last = k; setPar(q); }
    }, 83);
    return () => { el.removeEventListener("pointermove", move); el.removeEventListener("pointerleave", leave); window.clearInterval(t); };
  }, [fine, reduce]);

  const shuffle = () => {
    if (leaving !== null || pool.length < 2) return;
    const top = order[order.length - 1];
    const swap = () => {
      setOrder((o) => [o[o.length - 1], ...o.slice(0, -1)]);
      setSlots((s) => { const c = [...s]; c[top] = next.current % pool.length; next.current++; return c; });
    };
    if (reduce) { swap(); return; }
    setLeaving(top);
    window.setTimeout(swap, 320);
    window.setTimeout(() => setLeaving(null), 640);
  };

  // pasan solas mientras se ven; si la persona toca, la siguiente espera un intervalo completo
  const inView = useInView(stage, "0px", 0.25);
  const touched = useRef(0);
  const shuffleRef = useRef(shuffle);
  shuffleRef.current = shuffle;
  useEffect(() => {
    if (reduce || props.autoplay === false || !inView || pool.length < 2) return;
    const ms = Math.max(2, Number(props.intervalo) || 3.6) * 1000;
    const t = window.setInterval(() => {
      if (!document.hidden && Date.now() - touched.current > ms - 50) shuffleRef.current();
    }, ms);
    return () => window.clearInterval(t);
  }, [reduce, props.autoplay, props.intervalo, inView, pool.length]);
  const tap = () => { touched.current = Date.now(); shuffle(); };

  return (
    <Shell props={props} label={props.titulo} className="overflow-x-clip pt-8 text-center">
      <div className="relative grid justify-items-center">
        <div
          ref={stage}
          role="button"
          tabIndex={0}
          aria-label="Fotos de la campaña. Toca para pasar."
          onClick={tap}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tap(); } }}
          className="relative h-[min(118vw,470px)] w-[min(94vw,760px)] cursor-pointer md:h-[min(124vw,536px)]"
        >
          {order.map((slot, pos) => {
            const [x, y, r] = POS[pos];
            const k = (pos + 1) * 7;
            return (
              <figure
                key={slot}
                className={cx("marca-lift absolute left-1/2 top-0 m-0 w-[min(54vw,290px)]", leaving === slot && "marca-leave")}
                style={{
                  ["--x" as any]: `${narrow ? x * 0.42 : x}px`, ["--y" as any]: `${y}px`, ["--r" as any]: `${r}deg`,
                  transform: "translate(var(--x), var(--y)) rotate(var(--r))", marginLeft: "calc(min(54vw,290px) / -2)",
                  translate: `${(par[0] * k).toFixed(1)}px ${(par[1] * k).toFixed(1)}px`, zIndex: pos,
                }}
              >
                <div className="bg-marca-paper p-[9px]">
                  <img src={pool[slots[slot] % pool.length]} alt={pos === 2 ? props.titulo || "Campaña Tu Marca" : ""} className="block aspect-[2/3] w-full bg-marca-piedra object-cover" draggable={false} loading={pos === 2 ? "eager" : "lazy"} />
                </div>
              </figure>
            );
          })}
        </div>
        <div className="marca-vellum marca-lift marca-nudge relative z-10 -mt-[104px] grid w-[min(94%,500px)] justify-items-center gap-3 px-[18px] pb-5 pt-[22px] md:-mt-[116px] md:px-[30px] md:pb-6 md:pt-[26px]">
          {props.mostrarIsotipo !== false ? <Iso className="w-[46px] text-marca-cacao" /> : null}
          {props.etiqueta ? <span className="marca-mono marca-mono-soft">{props.etiqueta}</span> : null}
          <h1 className="marca-t text-[clamp(38px,6.2vw,62px)] leading-[.95] [text-wrap:balance]">{props.titulo}</h1>
          <div className="flex flex-wrap justify-center gap-x-[26px]">
            {props.cta1Label && props.cta1Href ? <a className="marca-bk" href={props.cta1Href}>{props.cta1Label}</a> : null}
            {props.cta2Label && props.cta2Href ? <a className="marca-bk" href={props.cta2Href}>{props.cta2Label}</a> : null}
          </div>
        </div>
      </div>
    </Shell>
  );
}

export const marcaHeroSection: DesignSectionDef = {
  label: "Tu Marca · Portada de campaña",
  group: "Signature",
  description: "Tres fotos impresas que pasan solas y se barajan al tocar, con tarjeta de papel parafinado, isotipo animado y dos botones.",
  fields: [
    { key: "fotos", label: "Fotos de la campaña (se van rotando)", type: "medialist" },
    { key: "etiqueta", label: "Antetítulo", type: "text" },
    { key: "titulo", label: "Título", type: "text" },
    { key: "cta1Label", label: "Botón 1 · Texto", type: "text" },
    { key: "cta1Href", label: "Botón 1 · Enlace", type: "text" },
    { key: "cta2Label", label: "Botón 2 · Texto", type: "text" },
    { key: "cta2Href", label: "Botón 2 · Enlace", type: "text" },
    { key: "autoplay", label: "Pasar solas", type: "boolean" },
    { key: "intervalo", label: "Segundos entre fotos", type: "number", min: 2, max: 12, step: 0.5 },
    { key: "mostrarIsotipo", label: "Mostrar isotipo animado", type: "boolean" },
    ...MARCA_BASE_FIELDS,
  ],
  defaults: {
    ...MARCA_BASE_DEFAULTS,
    fotos: DEMO_HERO,
    etiqueta: "Drop 001 · Lucky number 777",
    titulo: "Colección de ejemplo",
    cta1Label: "Ver tienda",
    cta1Href: "/tienda",
    cta2Label: "Ópticas",
    cta2Href: "/tienda",
    autoplay: true,
    intervalo: 3.6,
    mostrarIsotipo: true,
  },
  Component: HeroCampana,
};
