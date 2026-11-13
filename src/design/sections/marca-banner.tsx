import { useEffect, useRef, useState } from "react";
import type { DesignSectionDef } from "./types";
import { MARCA_BASE_DEFAULTS, MARCA_BASE_FIELDS, Shell, isVideo, useReducedMotion } from "./marca/shared";
import bannerFoto from "@/design/assets/marca/banner-c1-34.jpg";

/** Banner tradicional: una foto (o video) de campaña a todo el ancho, con texto y botón en papel parafinado. */
const HEIGHT: Record<string, string> = {
  pantalla: "h-[calc(100svh-56px)] min-h-[520px]",
  alto: "h-[78svh] min-h-[480px] md:h-[86svh]",
  medio: "h-[62svh] min-h-[420px] md:h-[66svh]",
};
const PLACE: Record<string, string> = {
  "abajo-izquierda": "bottom-3.5 left-3.5 right-3.5 md:bottom-8 md:left-8 md:right-auto",
  "abajo-centro": "bottom-3.5 left-3.5 right-3.5 md:bottom-10 md:left-1/2 md:right-auto md:-translate-x-1/2",
  centro: "left-3.5 right-3.5 top-1/2 -translate-y-1/2 md:left-1/2 md:right-auto md:-translate-x-1/2",
};

function Banner({ props }: { props: Record<string, any> }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(false);
  const media = useRef<HTMLDivElement>(null);
  useEffect(() => { const t = window.setTimeout(() => setShown(true), 60); return () => window.clearTimeout(t); }, []);

  const src: string = props.foto;
  const mobileSrc: string = props.fotoMovil;
  const pos = props.encuadre || "60% 40%";
  const posMobile = props.encuadreMovil || pos;
  const centered = props.posicionTexto !== "abajo-izquierda";
  const textOnPhoto = props.estiloTexto === "foto";
  const hasText = props.etiqueta || props.titulo || (props.ctaLabel && props.ctaHref);
  const zoom = reduce ? "" : `transition-transform duration-[1800ms] ease-[cubic-bezier(.2,.7,.2,1)] ${shown ? "scale-100" : "scale-[1.06]"}`;

  return (
    <Shell props={props} label={props.titulo || "Campaña Tu Marca"} className="overflow-hidden">
      <div ref={media} className={`marca-grain relative w-full overflow-hidden bg-marca-piedra ${HEIGHT[props.altura] ?? HEIGHT.alto}`}>
        {isVideo(src) ? (
          <video src={src} poster={props.poster || undefined} muted loop playsInline autoPlay={!reduce} preload="metadata" aria-label={props.titulo || undefined} className={`absolute inset-0 h-full w-full object-cover ${zoom}`} style={{ objectPosition: pos }} />
        ) : src ? (
          <picture>
            {mobileSrc ? <source media="(max-width: 767px)" srcSet={mobileSrc} /> : null}
            <img src={src} alt={props.alt || props.titulo || "Campaña Tu Marca"} loading="eager" fetchPriority="high" draggable={false}
              className={`absolute inset-0 h-full w-full object-cover object-[var(--pm)] md:object-[var(--pd)] ${zoom}`}
              style={{ ["--pd" as any]: pos, ["--pm" as any]: mobileSrc ? "50% 50%" : posMobile }} />
          </picture>
        ) : null}

        {hasText ? (
          textOnPhoto ? (
            <div className={`absolute z-[2] grid gap-3 ${centered ? "justify-items-center text-center" : "justify-items-start"} ${PLACE[props.posicionTexto] ?? PLACE["abajo-centro"]} ${shown || reduce ? "marca-fade" : "opacity-0"}`}>
              {props.etiqueta ? <span className="marca-mono text-marca-paper">{props.etiqueta}</span> : null}
              {props.titulo ? <h2 className="marca-t text-[clamp(34px,6vw,72px)] text-marca-paper [text-shadow:0_1px_18px_rgb(53_41_35/.25)]">{props.titulo}</h2> : null}
              {props.ctaLabel && props.ctaHref ? <a className="marca-bk text-marca-paper" href={props.ctaHref}>{props.ctaLabel}</a> : null}
            </div>
          ) : (
            <div className={`marca-vellum marca-nudge absolute z-[2] grid gap-3 px-[18px] pb-[18px] pt-5 md:w-[min(540px,calc(100%-64px))] md:px-7 md:pb-6 md:pt-[26px] ${centered ? "justify-items-center text-center" : "justify-items-start"} ${PLACE[props.posicionTexto] ?? PLACE["abajo-centro"]} ${shown || reduce ? "marca-fade" : "opacity-0"}`}>
              {props.etiqueta ? <span className="marca-mono marca-mono-soft">{props.etiqueta}</span> : null}
              {props.titulo ? <h2 className="marca-t text-[clamp(30px,4.4vw,52px)] leading-[.98]">{props.titulo}</h2> : null}
              {props.ctaLabel && props.ctaHref ? <a className="marca-bk" href={props.ctaHref}>{props.ctaLabel}</a> : null}
            </div>
          )
        ) : null}
      </div>
    </Shell>
  );
}

export const marcaBannerSection: DesignSectionDef = {
  label: "Tu Marca · Banner de campaña (ancho completo)",
  group: "Signature",
  description: "Banner tradicional: una foto o video de campaña a todo el ancho de la página, con antetítulo, título y botón.",
  fields: [
    { key: "foto", label: "Foto o video de campaña", type: "media" },
    { key: "fotoMovil", label: "Foto para celular (opcional, vertical)", type: "media" },
    { key: "poster", label: "Foto de espera (si es video)", type: "media" },
    { key: "encuadre", label: "Encuadre en computador (ej. 60% 40%)", type: "text" },
    { key: "encuadreMovil", label: "Encuadre en celular (ej. 62% 50%)", type: "text" },
    { key: "alt", label: "Descripción de la foto (accesibilidad)", type: "text" },
    { key: "etiqueta", label: "Antetítulo", type: "text" },
    { key: "titulo", label: "Título", type: "text" },
    { key: "ctaLabel", label: "Botón · Texto", type: "text" },
    { key: "ctaHref", label: "Botón · Enlace", type: "text" },
    { key: "posicionTexto", label: "Posición del texto", type: "select", options: [{ value: "abajo-izquierda", label: "Abajo a la izquierda" }, { value: "abajo-centro", label: "Abajo al centro" }, { value: "centro", label: "Centro" }] },
    { key: "estiloTexto", label: "Estilo del texto", type: "select", options: [{ value: "papel", label: "Tarjeta de papel parafinado" }, { value: "foto", label: "Directo sobre la foto" }] },
    { key: "altura", label: "Alto", type: "select", options: [{ value: "pantalla", label: "Pantalla completa" }, { value: "alto", label: "Alto" }, { value: "medio", label: "Medio" }] },
    ...MARCA_BASE_FIELDS,
  ],
  defaults: {
    ...MARCA_BASE_DEFAULTS,
    foto: bannerFoto,
    fotoMovil: "",
    poster: "",
    encuadre: "60% 40%",
    encuadreMovil: "56% 45%",
    alt: "Foto de campaña de ejemplo",
    etiqueta: "Colección de ejemplo",
    titulo: "Lucky number 777",
    ctaLabel: "Ver la colección",
    ctaHref: "/tienda",
    posicionTexto: "abajo-izquierda",
    estiloTexto: "papel",
    altura: "alto",
  },
  Component: Banner,
};
