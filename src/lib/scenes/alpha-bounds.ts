/**
 * Recorte útil de una imagen con transparencia.
 *
 * Las fotos de la Hoja Sale se suben como recortes con fondo transparente: el lienzo
 * es cuadrado/vertical (2:3) pero la silueta de la modelo ocupa solo ~40% del ancho.
 * Mostrar el lienzo completo hace que la modelo se vea pequeña dentro de la tira, así
 * que medimos el rectángulo real de la silueta y lo usamos para escalar la foto.
 */
export type ImageBounds = {
  /** fractions 0..1 of the canvas */
  x: number;
  y: number;
  w: number;
  h: number;
  /** natural size of the image, needed to keep proportions */
  iw: number;
  ih: number;
};

const MAX_SIDE = 128;
const ALPHA_MIN = 8;

const done = new Map<string, ImageBounds | null>();
const pending = new Map<string, Promise<ImageBounds | null>>();

async function measure(url: string): Promise<ImageBounds | null> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.decoding = "async";
  const loaded = await new Promise<boolean>((resolve) => {
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
  if (!loaded) return null;
  const iw = img.naturalWidth;
  const ih = img.naturalHeight;
  if (!iw || !ih) return null;

  const scale = Math.min(1, MAX_SIDE / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));
  try {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const { data } = ctx.getImageData(0, 0, w, h);

    let minX = w;
    let minY = h;
    let maxX = -1;
    let maxY = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (data[(y * w + x) * 4 + 3] <= ALPHA_MIN) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (maxX < minX || maxY < minY) return null;

    const x0 = minX / w;
    const y0 = minY / h;
    const x1 = (maxX + 1) / w;
    const y1 = (maxY + 1) / h;
    // Sin márgenes que recortar: no hay nada que ganar reescalando.
    if (x0 < 0.01 && y0 < 0.01 && x1 > 0.99 && y1 > 0.99) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, iw, ih };
  } catch {
    // Lienzo contaminado (falta CORS) o canvas indisponible: se mantiene el ajuste actual.
    return null;
  }
}

/** Mide una imagen una sola vez y guarda el resultado por URL. */
export function imageBounds(url: string): Promise<ImageBounds | null> {
  if (done.has(url)) return Promise.resolve(done.get(url) ?? null);
  if (pending.has(url)) return pending.get(url)!;
  const job = (/^https?:/i.test(url) ? measure(url) : Promise.resolve(null)).then((result) => {
    done.set(url, result);
    pending.delete(url);
    return result;
  });
  pending.set(url, job);
  return job;
}

/** Resultado ya calculado, si existe. */
export function cachedImageBounds(url: string): ImageBounds | null | undefined {
  return done.get(url);
}
