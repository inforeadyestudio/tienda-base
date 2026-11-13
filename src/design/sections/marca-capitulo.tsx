import { useEffect, useRef, useState } from "react";
import type { DesignSectionDef } from "./types";
import { MARCA_BASE_DEFAULTS, MARCA_BASE_FIELDS, Shell, isVideo, sinCampana, useFinePointer, useReducedMotion } from "./marca/shared";
import { DEMO_CIUDAD } from "./marca/demo";

/** Capítulo de campaña: video o foto a sangre con tarjeta parafinada + dos fotos escalonadas que cambian a su toma hermana. */
function Swap({ a, b, caption, note, offset, fine }: { a?: string; b?: string; caption?: string; note?: string; offset?: boolean; fine: boolean }) {
  const [alt, setAlt] = useState(false);
  if (!a) return null;
  return (
    <figure className={`m-0 min-w-0 ${offset ? "md:mt-[90px]" : ""}`}>
      <span
        className="group relative block aspect-[3/2] overflow-hidden bg-marca-piedra"
        onClick={() => { if (!fine && b) setAlt((v) => !v); }}
      >
        <img src={a} alt={caption || ""} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
        {b ? <img src={b} alt="" aria-hidden="true" loading="lazy" className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 marca-steps group-hover:opacity-100 ${alt ? "opacity-100" : "opacity-0"}`} /> : null}
      </span>
      {caption || note ? (
        <figcaption className="mt-2.5 flex justify-between gap-3">
          <span className="marca-mono marca-mono-soft">{caption}</span>
          <span className="marca-mono marca-mono-soft">{note}</span>
        </figcaption>
      ) : null}
    </figure>
  );
}

function Capitulo({ props }: { props: Record<string, any> }) {
  const reduce = useReducedMotion();
  const fine = useFinePointer();
  const vid = useRef<HTMLVideoElement>(null);
  const [paused, setPaused] = useState(false);
  const userPaused = useRef(false);
  const video = isVideo(props.media);

  useEffect(() => {
    const v = vid.current;
    if (!v) return;
    if (reduce) { v.pause(); userPaused.current = true; setPaused(true); return; }
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      if (userPaused.current) return;
      if (e.isIntersecting) v.play().catch(() => {}); else v.pause();
    }, { threshold: 0.15 });
    io.observe(v);
    return () => io.disconnect();
  }, [reduce, props.media]);

  const toggle = () => {
    const v = vid.current;
    if (!v) return;
    if (v.paused) { userPaused.current = false; v.play().catch(() => {}); setPaused(false); }
    else { userPaused.current = true; v.pause(); setPaused(true); }
  };

  return (
    <Shell props={props} label={props.titulo} className="overflow-x-clip pt-24 md:pt-[120px]">
      <div className="marca-grain relative aspect-[4/5] overflow-hidden bg-marca-piedra md:aspect-auto md:h-[min(84vh,760px)] md:min-h-[480px]">
        {video ? (
          <video ref={vid} src={props.media} poster={props.poster || undefined} muted loop playsInline autoPlay={!reduce} preload="metadata" aria-label={props.titulo || undefined} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: props.encuadre || "62% 55%" }} />
        ) : props.media ? (
          <img src={props.media} alt={props.titulo || ""} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: props.encuadre || "62% 55%" }} />
        ) : null}
        <div className="marca-vellum marca-nudge absolute bottom-3.5 left-3.5 right-3.5 z-[2] grid justify-items-start gap-3 px-[18px] pb-[18px] pt-5 md:bottom-7 md:left-5 md:right-auto md:w-[min(430px,calc(100%-40px))] md:px-[26px] md:pb-[22px] md:pt-6">
          {sinCampana(props.etiqueta) ? <span className="marca-mono marca-mono-soft">{sinCampana(props.etiqueta)}</span> : null}
          {props.titulo ? <h2 className="marca-t text-[clamp(28px,3.8vw,42px)]">{props.titulo}</h2> : null}
          {props.ctaLabel && props.ctaHref ? <a className="marca-bk" href={props.ctaHref}>{props.ctaLabel}</a> : null}
        </div>
        {video ? (
          <button type="button" onClick={toggle} aria-pressed={paused} className="marca-vellum marca-mono absolute right-3.5 top-3.5 z-[2] border border-marca-cacao/25 px-[11px] py-[9px] text-[10px] md:bottom-7 md:right-5 md:top-auto">
            {paused ? "Play" : "Pausa"}
          </button>
        ) : null}
      </div>
      {props.foto1 || props.foto2 ? (
        <div className="mx-auto mt-[22px] grid max-w-[1240px] grid-cols-1 items-start gap-[34px] px-5 md:grid-cols-2 md:gap-[22px]">
          <Swap a={props.foto1} b={props.foto1b} caption={props.pie1} note={props.nota1} fine={fine} />
          <Swap a={props.foto2} b={props.foto2b} caption={props.pie2} note={props.nota2} offset fine={fine} />
        </div>
      ) : null}
    </Shell>
  );
}

export const marcaCapituloSection: DesignSectionDef = {
  label: "Tu Marca · Capítulo con video",
  group: "Editorial",
  description: "Video (o foto) a pantalla completa con tarjeta de papel parafinado y botón; debajo, dos fotos escalonadas que cambian a su toma hermana al pasar el cursor.",
  fields: [
    { key: "media", label: "Video o foto principal", type: "media" },
    { key: "poster", label: "Foto de espera del video", type: "media" },
    { key: "encuadre", label: "Encuadre (ej. 62% 55%)", type: "text" },
    { key: "etiqueta", label: "Antetítulo", type: "text" },
    { key: "titulo", label: "Título", type: "text" },
    { key: "ctaLabel", label: "Botón · Texto", type: "text" },
    { key: "ctaHref", label: "Botón · Enlace", type: "text" },
    { key: "foto1", label: "Foto 1", type: "media" },
    { key: "foto1b", label: "Foto 1 · Toma al pasar el cursor", type: "media" },
    { key: "pie1", label: "Foto 1 · Pie", type: "text" },
    { key: "nota1", label: "Foto 1 · Nota derecha", type: "text" },
    { key: "foto2", label: "Foto 2", type: "media" },
    { key: "foto2b", label: "Foto 2 · Toma al pasar el cursor", type: "media" },
    { key: "pie2", label: "Foto 2 · Pie", type: "text" },
    { key: "nota2", label: "Foto 2 · Nota derecha", type: "text" },
    ...MARCA_BASE_FIELDS,
  ],
  defaults: {
    ...MARCA_BASE_DEFAULTS,
    media: DEMO_CIUDAD.video,
    poster: DEMO_CIUDAD.poster,
    encuadre: "62% 55%",
    etiqueta: "Capítulo",
    titulo: "Meet us in the sun",
    ctaLabel: "Ver tienda",
    ctaHref: "/tienda",
    foto1: DEMO_CIUDAD.foto1,
    foto1b: DEMO_CIUDAD.foto1b,
    pie1: "Capítulo · 01",
    nota1: "48.85° N",
    foto2: DEMO_CIUDAD.foto2,
    foto2b: DEMO_CIUDAD.foto2b,
    pie2: "Capítulo · 02",
    nota2: "2.35° E",
  },
  Component: Capitulo,
};
