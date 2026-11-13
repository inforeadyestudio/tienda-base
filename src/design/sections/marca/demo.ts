// Datos y fotos de ejemplo de Tu Marca para los valores por defecto de las secciones.
// El equipo los reemplaza desde el panel; aquí solo viven como punto de partida.
import prod_ref102 from "@/design/assets/marca/prod-ref102.jpg";
import modelo_ref102 from "@/design/assets/marca/modelo-ref102.jpg";
import galeria_ref102 from "@/design/assets/marca/galeria-ref102.jpg";
import prod_ref106 from "@/design/assets/marca/prod-ref106.jpg";
import modelo_ref106 from "@/design/assets/marca/modelo-ref106.jpg";
import galeria_ref106 from "@/design/assets/marca/galeria-ref106.jpg";
import prod_ref110 from "@/design/assets/marca/prod-ref110.jpg";
import modelo_ref110 from "@/design/assets/marca/modelo-ref110.jpg";
import galeria_ref110 from "@/design/assets/marca/galeria-ref110.jpg";
import prod_ref111 from "@/design/assets/marca/prod-ref111.jpg";
import modelo_ref111 from "@/design/assets/marca/modelo-ref111.jpg";
import galeria_ref111 from "@/design/assets/marca/galeria-ref111.jpg";
import prod_ref121 from "@/design/assets/marca/prod-ref121.jpg";
import modelo_ref121 from "@/design/assets/marca/modelo-ref121.jpg";
import galeria_ref121 from "@/design/assets/marca/galeria-ref121.jpg";
import prod_ref103 from "@/design/assets/marca/prod-ref103.jpg";
import modelo_ref103 from "@/design/assets/marca/modelo-ref103.jpg";
import galeria_ref103 from "@/design/assets/marca/galeria-ref103.jpg";
import prod_ref132 from "@/design/assets/marca/prod-ref132.jpg";
import modelo_ref132 from "@/design/assets/marca/modelo-ref132.jpg";
import galeria_ref132 from "@/design/assets/marca/galeria-ref132.jpg";
import prod_ref119 from "@/design/assets/marca/prod-ref119.jpg";
import modelo_ref119 from "@/design/assets/marca/modelo-ref119.jpg";
import galeria_ref119 from "@/design/assets/marca/galeria-ref119.jpg";
import prod_ref101 from "@/design/assets/marca/prod-ref101.jpg";
import modelo_ref101 from "@/design/assets/marca/modelo-ref101.jpg";
import galeria_ref101 from "@/design/assets/marca/galeria-ref101.jpg";
import prod_ref105 from "@/design/assets/marca/prod-ref105.jpg";
import modelo_ref105 from "@/design/assets/marca/modelo-ref105.jpg";
import galeria_ref105 from "@/design/assets/marca/galeria-ref105.jpg";
import prod_ref131 from "@/design/assets/marca/prod-ref131.jpg";
import prod_ref131_b from "@/design/assets/marca/prod-ref131-b.jpg";
import prod_ref133 from "@/design/assets/marca/prod-ref133.jpg";
import modelo_ref133 from "@/design/assets/marca/modelo-ref133.jpg";
import galeria_ref133 from "@/design/assets/marca/galeria-ref133.jpg";
import hero_c1_40 from "@/design/assets/marca/hero-c1-40.jpg";
import hero_c1_67 from "@/design/assets/marca/hero-c1-67.jpg";
import hero_c1_37 from "@/design/assets/marca/hero-c1-37.jpg";
import hero_c1_78 from "@/design/assets/marca/hero-c1-78.jpg";
import hero_c1_02 from "@/design/assets/marca/hero-c1-02.jpg";
import hero_c1_68 from "@/design/assets/marca/hero-c1-68.jpg";
import ciudad_12 from "@/design/assets/marca/ciudad-12.jpg";
import ciudad_38 from "@/design/assets/marca/ciudad-38.jpg";
import ciudad_26 from "@/design/assets/marca/ciudad-26.jpg";
import ciudad_41 from "@/design/assets/marca/ciudad-41.jpg";
import ciudad_banco_poster from "@/design/assets/marca/ciudad-banco-poster.jpg";
import editorial_16 from "@/design/assets/marca/editorial-16.jpg";
import editorial_01 from "@/design/assets/marca/editorial-01.jpg";
import editorial_22 from "@/design/assets/marca/editorial-22.jpg";
import editorial_10 from "@/design/assets/marca/editorial-10.jpg";
import editorial_11 from "@/design/assets/marca/editorial-11.jpg";
import editorial_02 from "@/design/assets/marca/editorial-02.jpg";
import editorial_21 from "@/design/assets/marca/editorial-21.jpg";
import editorial_13 from "@/design/assets/marca/editorial-13.jpg";
import niebla_c1_79 from "@/design/assets/marca/niebla-c1-79.jpg";
import niebla_c1_73 from "@/design/assets/marca/niebla-c1-73.jpg";
import niebla_c1_46 from "@/design/assets/marca/niebla-c1-46.jpg";
import niebla_c1_83 from "@/design/assets/marca/niebla-c1-83.jpg";
import flip_c1_26 from "@/design/assets/marca/flip-c1-26.jpg";
import flip_c1_27 from "@/design/assets/marca/flip-c1-27.jpg";
import flip_c1_28 from "@/design/assets/marca/flip-c1-28.jpg";
import indice_c1_11 from "@/design/assets/marca/indice-c1-11.jpg";
import ciudad_banco_mp4 from "@/design/assets/marca/ciudad-banco.mp4";

export type DemoRef = { code: string; name: string; shape: string; price: number; detail: string; type: string; measures: string; product: string; model: string; gallery: string | null };

export const DEMO_REFS: DemoRef[] = [
  { code: "LU102", name: "Ovalada", shape: "ovalada", price: 300000, detail: "Titanio · Negro", type: "Sol", measures: "55 · 19 · 155 mm", product: prod_ref102, model: modelo_ref102, gallery: galeria_ref102 },
  { code: "LU106", name: "Rectangular", shape: "rectangular", price: 180000, detail: "Acetato · Ámbar", type: "Sol", measures: "49 · 24 · 145 mm", product: prod_ref106, model: modelo_ref106, gallery: galeria_ref106 },
  { code: "LU110", name: "Ovalada", shape: "ovalada", price: 180000, detail: "TR-90 · Miel", type: "Sol", measures: "54 · 20 · 141 mm", product: prod_ref110, model: modelo_ref110, gallery: galeria_ref110 },
  { code: "LU111", name: "Ovalada translúcida", shape: "ovalada", price: 180000, detail: "TR-90 · Gris", type: "Sol", measures: "52 · 20 · 148 mm", product: prod_ref111, model: modelo_ref111, gallery: galeria_ref111 },
  { code: "LU121", name: "Semi al aire", shape: "rectangular", price: 180000, detail: "Acetato · Ámbar", type: "Óptico", measures: "53 · 18 · 142 mm", product: prod_ref121, model: modelo_ref121, gallery: galeria_ref121 },
  { code: "LU103", name: "Rectangular", shape: "rectangular", price: 270000, detail: "Titanio · Plateado", type: "Óptico", measures: "55 · 18 · 150 mm", product: prod_ref103, model: modelo_ref103, gallery: galeria_ref103 },
  { code: "LU132", name: "Aviador", shape: "aviador", price: 180000, detail: "Acetato · Ámbar", type: "Sol", measures: "59 · 13 · 145 mm", product: prod_ref132, model: modelo_ref132, gallery: galeria_ref132 },
  { code: "LU119", name: "Ovalada gruesa", shape: "ovalada", price: 180000, detail: "TR-90 · Verde", type: "Sol", measures: "53 · 20 · 145 mm", product: prod_ref119, model: modelo_ref119, gallery: galeria_ref119 },
  { code: "LU101", name: "Hexagonal", shape: "hexagonal", price: 300000, detail: "Titanio · Dorado", type: "Sol", measures: "54 · 20 · 144 mm", product: prod_ref101, model: modelo_ref101, gallery: galeria_ref101 },
  { code: "LU105", name: "Ovalada doble puente", shape: "ovalada", price: 150000, detail: "Metal · Negro", type: "Óptico", measures: "51 · 21 · 143 mm", product: prod_ref105, model: modelo_ref105, gallery: galeria_ref105 },
  { code: "LU131", name: "Redonda", shape: "redonda", price: 180000, detail: "Acetato · Negro", type: "Sol", measures: "48 · 26 · 145 mm", product: prod_ref131, model: prod_ref131_b, gallery: null },
  { code: "LU133", name: "Aviador amplia", shape: "aviador", price: 180000, detail: "Acetato · Ámbar", type: "Sol", measures: "53 · 21 · 142 mm", product: prod_ref133, model: modelo_ref133, gallery: galeria_ref133 },
];

export const DEMO_HERO: string[] = [hero_c1_40, hero_c1_67, hero_c1_37, hero_c1_78, hero_c1_02, hero_c1_68];
export const DEMO_CIUDAD = { video: ciudad_banco_mp4, poster: ciudad_banco_poster, foto1: ciudad_12, foto1b: ciudad_38, foto2: ciudad_26, foto2b: ciudad_41 };
export const DEMO_EDITORIAL: string[] = [editorial_16, editorial_01, editorial_22, editorial_10, editorial_11, editorial_02, editorial_21, editorial_13];
export const DEMO_NIEBLA: string[] = [niebla_c1_79, niebla_c1_73, niebla_c1_46, niebla_c1_83];
export const DEMO_FLIP: string[] = [flip_c1_26, flip_c1_27, flip_c1_28];
export const DEMO_INDICE_FINAL = indice_c1_11;
