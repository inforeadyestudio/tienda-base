/** Utilidades de optimización de medios: compresión al subir y URLs cacheadas. */

const MAX_DIM = 1920;
const QUALITY = 0.78;

export function isVideoUrl(url?: string | null) {
  return !!url && /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

/** Reduce y convierte imágenes a WebP antes de subirlas. Devuelve el original si no aplica. */
export async function optimizeImageFile(file: File, options: { maxDim?: number; quality?: number } = {}): Promise<File> {
  if (typeof window === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;
  if (/svg|gif/.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, (options.maxDim ?? MAX_DIM) / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close?.();
    const toBlob = (type: string) =>
      new Promise<Blob | null>((res) => canvas.toBlob(res, type, options.quality ?? QUALITY));
    // Safari no codifica WebP y devuelve PNG (más pesado): en ese caso usamos JPEG comprimido.
    let blob = await toBlob("image/webp");
    if (!blob || blob.type !== "image/webp") blob = await toBlob("image/jpeg");
    if (!blob) return file;
    // Solo conservamos el original si ya cabe en el tamaño y pesa menos que la versión comprimida.
    if (scale === 1 && blob.size >= file.size) return file;
    const ext = blob.type === "image/webp" ? "webp" : "jpg";
    const name = file.name.replace(/\.[^.]+$/, "") + "." + ext;
    return new File([blob], name, { type: blob.type });
  } catch {
    return file;
  }
}

/**
 * Comprime un video antes de subirlo: lo re-codifica en el navegador a máx. 1080p
 * (MP4/H.264 si el navegador lo soporta, si no WebM/VP9) a ~4 Mbps, sin audio
 * (los videos de producto se reproducen mudos). Si el archivo ya es un MP4 ligero
 * o la compresión no ahorra peso, devuelve el original.
 */
export async function optimizeVideoFile(
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<File> {
  if (typeof window === "undefined" || !file.type.startsWith("video/")) return file;
  if (typeof MediaRecorder === "undefined") return file;
  const sizeMb = file.size / (1024 * 1024);
  // Un MP4 ya liviano no necesita re-codificación.
  if (sizeMb <= 12 && /mp4/.test(file.type)) return file;
  const mime = ["video/mp4;codecs=avc1.42E01E", "video/webm;codecs=vp9", "video/webm"]
    .find((m) => MediaRecorder.isTypeSupported(m));
  if (!mime) return file;
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error("video"));
      setTimeout(() => reject(new Error("timeout")), 20000);
    });
    const srcW = video.videoWidth || 1280;
    const srcH = video.videoHeight || 720;
    const scale = Math.min(1, 1080 / Math.max(srcW, srcH));
    // Dimensiones pares: requeridas por H.264.
    const w = Math.max(2, Math.round((srcW * scale) / 2) * 2);
    const h = Math.max(2, Math.round((srcH * scale) / 2) * 2);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });
    let raf = 0;
    const draw = () => {
      ctx.drawImage(video, 0, 0, w, h);
      onProgress?.(video.duration ? video.currentTime / video.duration : 0);
      if (!video.ended) raf = requestAnimationFrame(draw);
    };
    recorder.start(500);
    await video.play();
    draw();
    await new Promise<void>((resolve) => {
      video.onended = () => resolve();
      setTimeout(resolve, (video.duration || 60) * 1000 + 15000);
    });
    cancelAnimationFrame(raf);
    recorder.stop();
    await stopped;
    const blob = new Blob(chunks, { type: mime.split(";")[0] });
    if (!blob.size || blob.size >= file.size) return file;
    const ext = blob.type.includes("mp4") ? "mp4" : "webm";
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + "." + ext, { type: blob.type });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Opciones de subida a storage con cache agresivo (1 año) para servir desde CDN. */
export const uploadOptions = (file: File) => ({
  contentType: file.type,
  cacheControl: "31536000",
  upsert: false,
});

/** Ruta/URL del póster (primer fotograma) que acompaña a cada video subido. */
export function posterUrlFor(url?: string | null) {
  if (!url || !isVideoUrl(url)) return undefined;
  return url.replace(/(\.[a-z0-9]+)(\?|$)/i, ".poster.webp$2");
}

/** Extrae el primer fotograma de un video como WebP ligero para usarlo de póster. */
export async function captureVideoPoster(file: File): Promise<File | null> {
  if (typeof window === "undefined" || !file.type.startsWith("video/")) return null;
  const objectUrl = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.src = objectUrl;
    await new Promise<void>((resolve, reject) => {
      const done = () => resolve();
      video.onloadeddata = done;
      video.onseeked = done;
      video.onerror = () => reject(new Error("video"));
      setTimeout(() => reject(new Error("timeout")), 15000);
    });
    try {
      video.currentTime = Math.min(0.1, (video.duration || 1) / 10);
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        setTimeout(resolve, 2000);
      });
    } catch {
      /* algunos navegadores no permiten seek: usamos el fotograma actual */
    }
    const scale = Math.min(1, 1280 / Math.max(video.videoWidth || 1, 1));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round((video.videoWidth || 1280) * scale));
    canvas.height = Math.max(1, Math.round((video.videoHeight || 720) * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.72));
    if (!blob) return null;
    return new File([blob], "poster.webp", { type: "image/webp" });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}


/**
 * URL liviana para mostrar una foto: el CDN de Shopify redimensiona y entrega WebP
 * con `width`. Otras URLs se devuelven sin cambios.
 */
export function optimizedImageUrl(url: string | null | undefined, width = 900): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    if (u.hostname === "cdn.shopify.com") {
      u.searchParams.set("width", String(width));
      return u.toString();
    }
    // Storage público: usa el endpoint de transformación (redimensiona y comprime).
    if (u.hostname.endsWith(".supabase.co") && u.pathname.includes("/storage/v1/object/public/")
      && /\.(jpe?g|png|webp)$/i.test(u.pathname)) {
      u.pathname = u.pathname.replace("/storage/v1/object/public/", "/storage/v1/render/image/public/");
      u.searchParams.set("width", String(width));
      u.searchParams.set("quality", "70");
      u.searchParams.set("resize", "contain");
      return u.toString();
    }
  } catch {
    /* URL relativa */
  }
  return url;
}
