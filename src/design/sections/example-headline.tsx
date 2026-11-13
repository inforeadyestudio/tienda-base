import type { DesignSectionDef } from "./types";

/** Ejemplo de sección hecha desde la capa de diseño: título + texto + botón. */
function HeadlineSection({ props }: { props: Record<string, any> }) {
  return (
    <section className="design-fade-up mx-auto max-w-4xl px-6 py-20 text-center">
      {props.kicker ? <p className="mb-3 text-xs uppercase tracking-[0.2em] text-muted-foreground">{props.kicker}</p> : null}
      <h2 className="font-serif text-4xl italic text-foreground md:text-6xl">{props.title}</h2>
      {props.body ? <p className="mx-auto mt-5 max-w-xl whitespace-pre-line text-muted-foreground">{props.body}</p> : null}
      {props.ctaLabel && props.ctaHref ? (
        <a href={props.ctaHref} className="mt-8 inline-block rounded-full bg-primary px-6 py-3 text-sm text-primary-foreground">{props.ctaLabel}</a>
      ) : null}
    </section>
  );
}

export const headlineSection: DesignSectionDef = {
  label: "Titular Tu Marca",
  group: "Universal",
  description: "Titular grande con texto y botón opcional.",
  fields: [
    { key: "kicker", label: "Antetítulo", type: "text" },
    { key: "title", label: "Título", type: "text" },
    { key: "body", label: "Texto", type: "textarea" },
    { key: "ctaLabel", label: "Texto del botón", type: "text" },
    { key: "ctaHref", label: "Enlace del botón", type: "text" },
  ],
  defaults: { kicker: "Tu Marca", title: "Mira distinto", body: "", ctaLabel: "Ver tienda", ctaHref: "/tienda" },
  Component: HeadlineSection,
};
