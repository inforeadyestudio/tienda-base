// Qué modelo 3D y qué material corresponden al producto y al color elegidos en la página de producto.
// Todo sale del vm de useProductPage (nombre, tipo, variante elegida y fotos del color); manifest.ts solo dice
// qué material del 3D lleva cada código de color (C1, C2…).
import type { GlassesLook } from "./glasses3d/marca-glasses-3d";
import { glasses3dFor } from "./glasses3d/manifest";

/** Referencia de la gafa (LU106…) a partir del nombre o del slug del producto. */
// TODO(logica): un campo «referencia» en el producto; hoy se lee del nombre o del slug («LU106 · Montura», lu106-montura).
export function referenceOf(name?: string | null, slug?: string | null): string | null {
  const m = /\bLU[\s-]?(\d{3})(?!\d)/i.exec(`${name ?? ""} ${slug ?? ""}`);
  return m ? `LU${m[1]}` : null;
}

const norm = (s?: string | null) => (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

// Respaldo mientras el vm no traiga el código de color: tipo de producto + nombre del color.
// TODO(logica): que cada variante traiga su código de color (C1…C5) en un campo propio; hoy se lee del SKU de la
//   variante elegida y, si no está ahí, de esta tabla.
const BY_TYPE_COLOR: Record<string, Record<string, string>> = {
  LU106: {
    "montura|ambar": "C1",
    "montura|negro": "C2",
    "sol|ambar": "C3",
    "sol|cafe": "C4",
    "sol|gris": "C5",
  },
};

export type ColorCodeSource = "sku" | "tipo-color";

/** Código de color del inventario (C1…) del color elegido, y de dónde salió. */
export function colorCodeOf(input: {
  reference: string;
  sku?: string | null;
  productType?: string | null;
  color?: string | null;
}): { code: string; via: ColorCodeSource } | null {
  // 1) SKU de la variante elegida: LU106-C4, LU106C4, LU106-C4-…
  const s = /(?:^|[^A-Z])C(\d{1,2})(?!\d)/i.exec(input.sku ?? "");
  if (s) return { code: `C${Number(s[1])}`, via: "sku" };
  // 2) tipo de producto + nombre del color
  const type = norm(input.productType).includes("sol") ? "sol" : "montura";
  const code = BY_TYPE_COLOR[input.reference]?.[`${type}|${norm(input.color)}`];
  return code ? { code, via: "tipo-color" } : null;
}

/** Modelo y material 3D para el producto y color elegidos, o null si esa referencia (o ese color) no tiene 3D. */
export function model3dFor(input: {
  name?: string | null;
  slug?: string | null;
  productType?: string | null;
  color?: string | null;
  sku?: string | null;
}): { model: string; look: GlassesLook; reference: string; code: string; via: ColorCodeSource } | null {
  const reference = referenceOf(input.name, input.slug);
  if (!reference) return null;
  const c = colorCodeOf({ reference, sku: input.sku, productType: input.productType, color: input.color });
  const g = c ? glasses3dFor(reference, c.code) : null;
  if (c && g) return { ...g, reference, code: c.code, via: c.via };
  // el SKU traía un código que el 3D no conoce: probar con tipo + color
  if (c?.via === "sku") {
    const t = colorCodeOf({ reference, productType: input.productType, color: input.color });
    const g2 = t ? glasses3dFor(reference, t.code) : null;
    if (t && g2) return { ...g2, reference, code: t.code, via: t.via };
  }
  return null;
}
