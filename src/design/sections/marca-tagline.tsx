import type { DesignSectionDef } from "./types";
import { Iso, MARCA_BASE_DEFAULTS, MARCA_BASE_FIELDS, Shell, lines, taglineRows } from "./marca/shared";

/** Tagline de la marca en IBM Plex Mono: la frase de marca va en dos renglones, centrada por defecto. */
function Tagline({ props }: { props: Record<string, any> }) {
  const rows = taglineRows(lines(props.frase));
  if (!rows.length) return null;
  const size = props.tamano === "grande" ? "text-[clamp(22px,3.2vw,40px)]" : "text-[clamp(17px,2vw,24px)]";
  const align = props.alineacion === "izquierda" ? "items-start text-left" : "items-center text-center";
  return (
    <Shell props={props} label={rows.join(" ")} contained className="pt-24 md:pt-[120px]">
      <div className={`flex flex-col gap-6 ${align}`}>
        {props.isotipo ? <Iso className="w-[34px] text-[var(--marca-acento)]" /> : null}
        <p className={`m-0 font-marca-mono uppercase leading-[1.3] tracking-[.02em] text-[var(--marca-acento)] ${size}`}>
          {rows.map((r, i) => <span key={i} className="block md:whitespace-nowrap">{r}</span>)}
        </p>
        {props.ctaLabel && props.ctaHref ? <a className="marca-bk" href={props.ctaHref}>{props.ctaLabel}</a> : null}
      </div>
    </Shell>
  );
}

export const marcaTaglineSection: DesignSectionDef = {
  label: "Tu Marca · Tagline",
  group: "Universal",
  description: "La frase de la marca en dos renglones, en IBM Plex Mono.",
  fields: [
    { key: "frase", label: "Frase (una línea por renglón)", type: "textarea" },
    { key: "tamano", label: "Tamaño", type: "select", options: [{ value: "normal", label: "Normal" }, { value: "grande", label: "Grande" }] },
    { key: "alineacion", label: "Alineación", type: "select", options: [{ value: "centro", label: "Centro" }, { value: "izquierda", label: "Izquierda" }] },
    { key: "isotipo", label: "Mostrar isotipo animado", type: "boolean" },
    { key: "ctaLabel", label: "Botón · Texto (opcional)", type: "text" },
    { key: "ctaHref", label: "Botón · Enlace", type: "text" },
    ...MARCA_BASE_FIELDS,
  ],
  defaults: { ...MARCA_BASE_DEFAULTS, frase: "Tu frase de marca\nva aquí.", tamano: "grande", alineacion: "centro", isotipo: true, ctaLabel: "", ctaHref: "/tienda" },
  Component: Tagline,
};
