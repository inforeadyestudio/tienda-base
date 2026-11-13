import { BRAND } from "@/config/brand";

/** Dominio público de la tienda: los enlaces que se comparten nunca usan el preview. */
export const SITE_ORIGIN = BRAND.siteOrigin;

/** Construye una URL pública absoluta a partir de una ruta interna. */
export function publicUrl(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
}
