export type SceneSource = "library" | "editorial" | "signature";

export type LayerBox = {
  /** porcentajes relativos al lienzo */
  x: number;
  y: number;
  w: number;
  rotate: number;
  /** tamaño tipográfico en vw (solo texto) */
  size?: number;
  hidden?: boolean;
};

export type Layer = {
  id: string;
  kind: "image" | "video" | "text";
  url?: string;
  text?: string;
  /** enlace opcional: convierte la capa en botón */
  href?: string;
  /** ajuste de la imagen/video */
  fit?: "contain" | "cover";
  /** relación de aspecto forzada, ej. "3/4" (vacío = natural) */
  ratio?: string;
  /** tipografía (solo texto) */
  tag?: "h1" | "h2" | "h3" | "p";
  font?: "serif" | "sans" | "nm";
  weight?: number;
  italic?: boolean;
  color?: string;
  align?: "left" | "center" | "right";
  lineHeight?: number;
  tracking?: number;
  /** posición en desktop */
  x: number;
  y: number;
  w: number;
  rotate: number;
  size?: number;
  /** ocultar en desktop */
  hidden?: boolean;
  /** override para móvil (si falta, hereda desktop) */
  mobile?: Partial<LayerBox>;
  z: number;
  opacity: number;
};

export type Scene = {
  id: string;
  type: string;
  source: SceneSource;
  position: number;
  visible: boolean;
  props: Record<string, any>;
  layers: Layer[];
};

export type SceneProduct = {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  hero_image_url: string | null;
  product_images?: Array<{ url: string; position: number }> | null;
  product_variants?: Array<{ price_cop: number; color: string | null; color_hex: string | null }> | null;
};

export type SceneContext = {
  collection: { id: string; slug: string; title: string; subtitle: string | null; cover_url: string | null };
  products: SceneProduct[];
  /** Live editor scenes, including unsaved catalog-order changes. */
  catalogScenes?: Scene[];
  /** Editor-only display mode; absent on public storefront pages. */
  previewDevice?: "desktop" | "mobile";
};

export type FieldDef =
  | { key: string; label: string; type: "text" | "textarea" | "media" | "color"; placeholder?: string }
  | { key: string; label: string; type: "number"; min?: number; max?: number; step?: number }
  | { key: string; label: string; type: "boolean" }
  | { key: string; label: string; type: "select"; options: Array<{ value: string; label: string }> }
  | { key: string; label: string; type: "medialist" }
  | { key: string; label: string; type: "layers" }
  | { key: string; label: string; type: "cards" }
  | { key: string; label: string; type: "banners" }
  | { key: string; label: string; type: "slots" }
  | { key: string; label: string; type: "garmentTypes" }
  | { key: string; label: string; type: "products"; max?: number }
  | { key: string; label: string; type: "collection" }
  | { key: string; label: string; type: "collections" }
  | { key: string; label: string; type: "product" }
  | { key: string; label: string; type: "store" };

export type SceneDef = {
  label: string;
  group: "Universal" | "Editorial" | "Signature";
  description: string;
  /** solo visible para esta colección (slug) cuando aplica */
  onlyFor?: string[];
  fields: FieldDef[];
  defaults: Record<string, any>;
  Component: (p: { props: Record<string, any>; layers: Layer[]; ctx: SceneContext }) => any;
};

export const BASE_FIELDS: FieldDef[] = [
  {
    key: "bg",
    label: "Fondo",
    type: "select",
    options: [
      { value: "ivory", label: "Ivory" },
      { value: "cream", label: "Cream" },
      { value: "ink", label: "Tinta" },
      { value: "moss", label: "Moss" },
      { value: "transparent", label: "Transparente" },
    ],
  },
  {
    key: "space",
    label: "Aire",
    type: "select",
    options: [
      { value: "none", label: "Sin aire" },
      { value: "sm", label: "Compacto" },
      { value: "md", label: "Medio" },
      { value: "lg", label: "Amplio" },
    ],
  },
  {
    key: "width",
    label: "Ancho",
    type: "select",
    options: [
      { value: "contained", label: "Contenido" },
      { value: "full", label: "Pantalla completa" },
    ],
  },
  {
    key: "anim",
    label: "Animación de entrada",
    type: "select",
    options: [
      { value: "none", label: "Ninguna" },
      { value: "fade", label: "Fade" },
      { value: "reveal", label: "Reveal" },
      { value: "rise", label: "Rise" },
    ],
  },
  {
    key: "hideOnMobile",
    label: "Ocultar en móvil",
    type: "boolean",
  },
];

export const BASE_DEFAULTS = {
  bg: "ivory",
  space: "md",
  width: "contained",
  anim: "fade",
  hideOnMobile: false,
};

export function newLayer(kind: Layer["kind"], z: number): Layer {
  return {
    id: Math.random().toString(36).slice(2),
    kind,
    url: "",
    text: kind === "text" ? "Texto" : "",
    href: "",
    fit: "contain",
    tag: kind === "text" ? "p" : undefined,
    font: "serif",
    weight: 400,
    italic: true,
    color: "",
    align: "left",
    lineHeight: 1,
    tracking: 0,
    size: 4,
    x: 20,
    y: 20,
    w: 30,
    rotate: 0,
    z,
    opacity: 1,
  };
}
