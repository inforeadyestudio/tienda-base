import type { DesignSectionDef, FieldDef } from "./types";
import { MARCA_BASE_DEFAULTS, MARCA_BASE_FIELDS, Shell } from "./marca/shared";

/** Franja de servicio: cuatro datos cortos entre líneas finas. */
function Servicio({ props }: { props: Record<string, any> }) {
  const items = [1, 2, 3, 4].map((n) => ({ label: props[`s${n}Label`], text: props[`s${n}Texto`] })).filter((i) => i.label || i.text);
  if (!items.length) return null;
  return (
    <Shell props={props} label="Servicio" contained className="pt-24 md:pt-[120px]">
      <div className="grid grid-cols-2 border-y border-marca-line-strong md:grid-cols-4">
        {items.map((it, i) => (
          <div key={i} className={`min-w-0 px-[18px] pb-[22px] pt-5 text-center ${i % 2 ? "border-l border-marca-line" : ""} ${i >= 2 ? "border-t border-marca-line md:border-t-0" : ""} ${i === 2 ? "md:border-l" : ""}`}>
            <span className="marca-mono marca-mono-soft">{it.label}</span>
            <p className="m-0 mt-1.5 text-[14px] leading-[1.45]">{it.text}</p>
          </div>
        ))}
      </div>
    </Shell>
  );
}

const fields: FieldDef[] = [1, 2, 3, 4].flatMap((n): FieldDef[] => [
  { key: `s${n}Label`, label: `Dato ${n} · Etiqueta`, type: "text" },
  { key: `s${n}Texto`, label: `Dato ${n} · Texto`, type: "text" },
]);

export const marcaServicioSection: DesignSectionDef = {
  label: "Tu Marca · Franja de servicio",
  group: "Universal",
  description: "Cuatro datos cortos (envíos, garantía, cambios, atención) entre líneas finas.",
  fields: [...fields, ...MARCA_BASE_FIELDS],
  defaults: {
    ...MARCA_BASE_DEFAULTS,
    s1Label: "Envíos", s1Texto: "A toda Colombia",
    s2Label: "Garantía", s2Texto: "6 meses",
    s3Label: "Cambios", s3Texto: "5 días hábiles",
    s4Label: "Atención", s4Texto: "Lunes a sábado",
  },
  Component: Servicio,
};
