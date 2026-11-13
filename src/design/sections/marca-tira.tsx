import { useEffect, useRef, useState } from "react";
import type { DesignSectionDef } from "./types";
import { MARCA_BASE_DEFAULTS, MARCA_BASE_FIELDS, Shell, asList, useReducedMotion } from "./marca/shared";
import { DEMO_EDITORIAL } from "./marca/demo";

/** Una foto de la tira: mientras carga ocupa un espacio claro vertical (sin franjas oscuras) y aparece al estar lista. */
function TiraFoto({ src, alt }: { src: string; alt: string }) {
  const [ok, setOk] = useState(false);
  return (
    <span className={`block h-[clamp(330px,38vw,520px)] overflow-hidden bg-marca-piedra/40 transition-transform duration-200 marca-steps group-hover:-translate-y-1 ${ok ? "" : "aspect-[2/3]"}`}>
      <img src={src} alt={alt} loading="lazy" draggable={false} onLoad={() => setOk(true)} ref={(el) => { if (el?.complete && el.naturalWidth) setOk(true); }}
        className={`pointer-events-none block h-full w-auto max-w-none transition-opacity duration-300 ${ok ? "opacity-100" : "opacity-0"}`} />
    </span>
  );
}

/** Tira de campaña: fotos a la misma altura que se arrastran de lado (y encajan solas en el centro), con barra de progreso. */
function Tira({ props }: { props: Record<string, any> }) {
  const fotos = asList(props.fotos);
  const reduce = useReducedMotion();
  const strip = useRef<HTMLDivElement>(null);
  const [prog, setProg] = useState({ w: 20, x: 0 });
  const bar = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const s = strip.current, b = bar.current;
    if (!s || !b) return;
    const on = () => {
      const max = s.scrollWidth - s.clientWidth;
      const w = Math.max(12, Math.min(100, (s.clientWidth / s.scrollWidth) * 100));
      const f = max > 0 ? s.scrollLeft / max : 0;
      setProg({ w, x: f * (b.clientWidth * (1 - w / 100)) });
    };
    let down = false, sx = 0, sl = 0;
    const pd = (e: PointerEvent) => { if (e.pointerType !== "mouse") return; down = true; sx = e.clientX; sl = s.scrollLeft; setDragging(true); };
    const pm = (e: PointerEvent) => { if (down) s.scrollLeft = sl - (e.clientX - sx); };
    const pu = () => { if (down) { down = false; setDragging(false); } };
    s.addEventListener("scroll", on, { passive: true });
    s.addEventListener("pointerdown", pd);
    window.addEventListener("pointermove", pm);
    window.addEventListener("pointerup", pu);
    window.addEventListener("resize", on);
    on();
    const t = window.setTimeout(on, 600);
    return () => { s.removeEventListener("scroll", on); s.removeEventListener("pointerdown", pd); window.removeEventListener("pointermove", pm); window.removeEventListener("pointerup", pu); window.removeEventListener("resize", on); window.clearTimeout(t); };
  }, [fotos.length]);

  if (!fotos.length) return null;
  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <Shell props={props} label={props.titulo} className="overflow-x-clip pt-24 md:pt-[110px]">
      {props.titulo || props.etiqueta ? (
        <header className="mb-10 grid justify-items-center gap-3.5 px-5 text-center">
          {props.etiqueta ? <span className="marca-mono marca-mono-soft">{props.etiqueta}</span> : null}
          {props.titulo ? <h2 className="marca-t text-[clamp(28px,4vw,44px)]">{props.titulo}</h2> : null}
          {props.ctaLabel && props.ctaHref ? <a className="marca-bk" href={props.ctaHref}>{props.ctaLabel}</a> : null}
        </header>
      ) : null}
      <div
        ref={strip}
        tabIndex={0}
        aria-label={`${props.titulo || "Fotos"}, desliza para ver más`}
        onKeyDown={(e) => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); strip.current?.scrollBy({ left: e.key === "ArrowRight" ? 320 : -320, behavior: reduce ? "auto" : "smooth" }); } }}
        className={`flex gap-4 overflow-x-auto px-5 pb-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${dragging ? "cursor-grabbing" : "cursor-grab snap-x snap-mandatory"}`}
      >
        {fotos.map((src, i) => (
          <figure key={i} className="group m-0 flex-none snap-center">
            <TiraFoto src={src} alt={`${props.titulo || "Campaña"} · ${i + 1}`} />
            {props.numeros !== false ? <figcaption className="marca-mono marca-mono-soft mt-2.5">{pad(i + 1)}</figcaption> : null}
          </figure>
        ))}
      </div>
      <div ref={bar} aria-hidden="true" className="relative mx-5 mt-[22px] h-px bg-marca-line">
        <i className="absolute left-0 top-0 h-px bg-marca-cacao transition-transform duration-150 marca-steps" style={{ width: `${prog.w}%`, transform: `translateX(${prog.x.toFixed(0)}px)` }} />
      </div>
    </Shell>
  );
}

export const marcaTiraSection: DesignSectionDef = {
  label: "Tu Marca · Tira de campaña",
  group: "Editorial",
  description: "Fotos de una campaña a la misma altura, en una tira que se arrastra o se desliza de lado y encaja sola en una foto, con barra de progreso.",
  fields: [
    { key: "etiqueta", label: "Antetítulo", type: "text" },
    { key: "titulo", label: "Título", type: "text" },
    { key: "ctaLabel", label: "Botón · Texto (opcional)", type: "text" },
    { key: "ctaHref", label: "Botón · Enlace", type: "text" },
    { key: "fotos", label: "Fotos (una campaña por tira)", type: "medialist" },
    { key: "numeros", label: "Mostrar números bajo las fotos", type: "boolean" },
    ...MARCA_BASE_FIELDS,
  ],
  defaults: { ...MARCA_BASE_DEFAULTS, etiqueta: "Colaboración", titulo: "Marca invitada × Tu Marca", ctaLabel: "", ctaHref: "/tienda", fotos: DEMO_EDITORIAL, numeros: true },
  Component: Tira,
};
