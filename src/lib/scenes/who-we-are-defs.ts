import {
  WwHeroScene, WwIntroScene, WwDnaScene, WwDetailsScene, WwQuoteScene, WwWorldsScene,
  WwAtelierScene, WwSustainScene, WwPrideScene, WwStoresScene, WwClosingScene,
} from "@/components/scenes/who-we-are";
import type { FieldDef, SceneDef } from "./types";

const bg: FieldDef = {
  key: "bg", label: "Fondo", type: "select",
  options: [
    { value: "ivory", label: "Ivory" }, { value: "cream", label: "Cream" },
    { value: "ink", label: "Tinta" }, { value: "moss", label: "Moss" },
  ],
};
const hide: FieldDef = { key: "hideOnMobile", label: "Ocultar en móvil", type: "boolean" };
const num: FieldDef = { key: "num", label: "Número (01, 02…)", type: "text" };
const title: FieldDef = { key: "title", label: "Título", type: "textarea" };
const body: FieldDef = { key: "body", label: "Texto", type: "textarea" };
const images: FieldDef = { key: "images", label: "Fotos", type: "medialist" };
const onlyFor = ["our-world"];

const def = (label: string, description: string, fields: FieldDef[], Component: SceneDef["Component"], defaults: Record<string, any> = {}): SceneDef => ({
  label: `Our World · ${label}`, group: "Signature", description, onlyFor, fields: [...fields, bg, hide], defaults: { bg: "ivory", ...defaults }, Component,
});

export const WW_SCENES: Record<string, SceneDef> = {
  "ww-hero": def("Portada", "Foto a pantalla completa con logo y frase.", [
    { key: "image", label: "Foto de fondo", type: "media" },
    { key: "logo", label: "Logo", type: "media" },
    { key: "title", label: "Título (si no hay logo)", type: "text" },
    { key: "tagline", label: "Frase", type: "textarea" },
    { key: "side", label: "Dato lateral", type: "textarea" },
  ], WwHeroScene, { bg: "ink" }),
  "ww-intro": def("Quiénes somos", "Texto destacado, cuerpo, firma y foto.", [
    { key: "eyebrow", label: "Etiqueta", type: "text" },
    { key: "lead", label: "Texto destacado", type: "textarea" }, body,
    { key: "signature", label: "Firma", type: "text" },
    { key: "image", label: "Foto", type: "media" },
  ], WwIntroScene),
  "ww-dna": def("ADN (lista A–D)", "Lista de principios con par de fotos.", [
    num, title, { key: "items", label: "Elementos (una línea: Título | Descripción)", type: "textarea" }, images,
  ], WwDnaScene, { bg: "ink" }),
  "ww-details": def("Detalles (cinta)", "Dos cintas de fotos en movimiento con pie.", [
    num, title, body, images,
    { key: "captions", label: "Pies de foto (uno por línea, en el orden de las fotos)", type: "textarea" },
    { key: "speed", label: "Duración (s)", type: "number", min: 20, max: 140, step: 2 },
  ], WwDetailsScene, { bg: "cream", speed: 70 }),
  "ww-quote": def("Cita e inspiración", "Foto con pie y cita.", [
    { key: "image", label: "Foto", type: "media" }, { key: "caption", label: "Pie de foto", type: "text" },
    { key: "eyebrow", label: "Etiqueta", type: "text" }, { key: "quote", label: "Cita", type: "textarea" },
    body, { key: "author", label: "Autor", type: "text" },
  ], WwQuoteScene),
  "ww-worlds": def("Colecciones como mundos", "Tarjetas de colección y foto panorámica.", [
    num, title, body, { key: "items", label: "Colecciones (Nombre | Subtítulo | Texto)", type: "textarea" },
    { key: "images", label: "Fotos (en el mismo orden)", type: "medialist" },
    { key: "wide", label: "Foto panorámica", type: "media" },
  ], WwWorldsScene, { bg: "moss" }),
  "ww-atelier": def("Taller", "Collage de 5 fotos y frase de cierre.", [
    num, title, body, images, { key: "closing", label: "Frase de cierre", type: "textarea" },
  ], WwAtelierScene),
  "ww-sustain": def("Sostenibilidad y causas", "Compromisos numerados, fotos y causas.", [
    num, title, body, { key: "items", label: "Compromisos (Título | Texto)", type: "textarea" }, images,
    { key: "causeTitle", label: "Causas · Título", type: "text" },
    { key: "causeBody", label: "Causas · Texto", type: "textarea" },
    { key: "causes", label: "Causas (Colección | Título | Texto)", type: "textarea" },
  ], WwSustainScene, { bg: "ink" }),
  "ww-pride": def("Comunidad", "Mosaico de fotos de clientas.", [num, title, body, images], WwPrideScene),
  "ww-stores": def("Tiendas", "Tarjetas de tienda con 3 fotos cada una.", [
    num, title, body,
    { key: "stores", label: "Tiendas (Nombre | Lugar | Texto | Etiqueta)", type: "textarea" },
    { key: "images", label: "Fotos (3 por tienda, en orden)", type: "medialist" },
    { key: "extra", label: "Fotos finales (2)", type: "medialist" },
  ], WwStoresScene, { bg: "moss" }),
  "ww-closing": def("Cierre", "Nombre grande, firma y contacto.", [
    { key: "eyebrow", label: "Etiqueta", type: "text" }, title,
    { key: "signature", label: "Firma", type: "text" }, { key: "contact", label: "Contacto", type: "textarea" },
  ], WwClosingScene, { bg: "ink" }),
};
