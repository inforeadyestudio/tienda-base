// Registro de secciones de diseño. Cada entrada aparece automáticamente
// en el editor de páginas y colecciones del panel.
// La clave es el "tipo" que se guarda: nunca renombrar una clave ya publicada.
import { createElement, useMemo } from "react";
import type { DesignSectionDef } from "./types";
import { headlineSection } from "./example-headline";
import { marcaHeroSection } from "./marca-hero";
import { marcaIndiceSection } from "./marca-indice";
import { marcaColeccionSection } from "./marca-coleccion";
import { marcaCapituloSection } from "./marca-capitulo";
import { marcaGaleriaSection } from "./marca-galeria";
import { marcaFosforosSection } from "./marca-fosforos";
import { marcaTiraSection } from "./marca-tira";
import { marcaNieblaSection } from "./marca-niebla";
import { marcaMoodboardSection } from "./marca-moodboard";
import { marcaServicioSection } from "./marca-servicio";
import { marcaTaglineSection } from "./marca-tagline";
import { marcaEntradaSection } from "./marca-entrada";
import { marcaBannerSection } from "./marca-banner";
import { fixAssetProps } from "./marca/assets";

type SectionProps = Parameters<DesignSectionDef["Component"]>[0];

/** Corrige las URL de las fotos de ejemplo guardadas en la página (ver marca/assets.ts) antes de pintar la sección. */
function withLocalAssets(def: DesignSectionDef): DesignSectionDef {
  const Inner = def.Component;
  function Section(p: SectionProps) {
    const props = useMemo(() => fixAssetProps(p.props), [p.props]);
    return createElement(Inner, { ...p, props });
  }
  Section.displayName = `Tu Marca(${def.label})`;
  return { ...def, Component: Section };
}

export const DESIGN_SECTIONS: Record<string, DesignSectionDef> = {
  "design-headline": headlineSection,
  // Tu Marca · home de ejemplo
  "design-marca-hero": withLocalAssets(marcaHeroSection),
  "design-marca-indice": withLocalAssets(marcaIndiceSection),
  "design-marca-coleccion": withLocalAssets(marcaColeccionSection),
  "design-marca-capitulo": withLocalAssets(marcaCapituloSection),
  "design-marca-galeria": withLocalAssets(marcaGaleriaSection),
  "design-marca-fosforos": withLocalAssets(marcaFosforosSection),
  "design-marca-tira": withLocalAssets(marcaTiraSection),
  "design-marca-niebla": withLocalAssets(marcaNieblaSection),
  "design-marca-moodboard": withLocalAssets(marcaMoodboardSection),
  "design-marca-servicio": withLocalAssets(marcaServicioSection),
  "design-marca-tagline": withLocalAssets(marcaTaglineSection),
  "design-marca-entrada": withLocalAssets(marcaEntradaSection),
  "design-marca-banner": withLocalAssets(marcaBannerSection),
};
