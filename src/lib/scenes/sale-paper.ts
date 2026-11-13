import type { ImageBounds } from "./alpha-bounds";

export const SALE_STRIP_COUNT = 6;

/**
 * Área de la tira donde se imprime la foto, en porcentajes de la propia tira.
 * Debe coincidir con .sale-paper-print-area de styles.css.
 */
export const STRIP_FRAME = { top: 10, left: 4, width: 92, height: 85, gapBottom: 0.03 };

export const SALE_PHOTO_SIZE_MIN = 60;
export const SALE_PHOTO_SIZE_MAX = 100;
export const SALE_PHOTO_SIZE_DEFAULT = 92;

export function salePhotoSize(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return SALE_PHOTO_SIZE_DEFAULT;
  return Math.min(SALE_PHOTO_SIZE_MAX, Math.max(SALE_PHOTO_SIZE_MIN, n));
}

export function saleProductIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((id): id is string => typeof id === "string" && id.length > 0))).slice(0, SALE_STRIP_COUNT);
}

export function saleStripImage(override: unknown, product?: { cutout_url?: string | null; hero_image_url?: string | null; product_images?: Array<{ url: string; position: number }> | null }): string | undefined {
  if (typeof override === "string" && override.trim()) return override;
  return product?.cutout_url || product?.hero_image_url || product?.product_images?.slice().sort((a, b) => a.position - b.position)[0]?.url || undefined;
}

export type StripImageBox = { left: number; top: number; width: number; height: number };

/**
 * Coloca la foto dentro del área de impresión de la tira aprovechando solo la silueta
 * recortada (bounds), no el lienzo completo. Devuelve porcentajes del área de impresión
 * para un <img> con object-fit: fill, que conserva la proporción natural de la foto.
 *
 * null = sin recorte medido: la foto se ajusta con object-fit: contain como antes.
 */
export function stripImageBox(piece: { w: number; h: number }, bounds: ImageBounds, size: number): StripImageBox | null {
  const frameW = (piece.w * STRIP_FRAME.width) / 100;
  const frameH = (piece.h * STRIP_FRAME.height) / 100;
  const aspect = frameW / frameH;
  const silW = bounds.w * bounds.iw;
  const silH = bounds.h * bounds.ih;
  if (!(aspect > 0) || !(silW > 0) || !(silH > 0)) return null;

  // factor: píxeles de la fuente -> unidades donde el alto del área vale 1
  const k = Math.min(aspect / silW, 1 / silH) * (size / 100);
  const elW = bounds.iw * k;
  const elH = bounds.ih * k;

  const left = ((aspect - silW * k) / 2 - bounds.x * elW) / aspect;
  const top = 1 - STRIP_FRAME.gapBottom - (bounds.y + bounds.h) * elH;

  return { left: left * 100, top: top * 100, width: (elW / aspect) * 100, height: elH * 100 };
}
