import type { Lang } from "@/lib/i18n";

/**
 * Texte de la barra de anuncios según idioma y país de visita.
 *
 * El envío gratis solo aplica en Colombia: quien visita desde otro país no
 * debe leer «Envíos gratis». Fuera de Colombia se ofrece el envío
 * internacional; en inglés el texto es «Shipping worldwide».
 *
 * Se mantiene sin dependencias para poder probarlo sin cargar el cliente de
 * la base de datos ni la interfaz.
 */

const FREE_SHIPPING = /gratis|free ship/i;

function norm(value: string) {
  return value.trim().toLocaleLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Colombia escrita con acentos, siglas o variantes formales. */
function inColombia(country: string) {
  const value = norm(country);
  return value === "colombia" || ["co", "col", "republica de colombia"].includes(value);
}

export function localizeAnnouncementItems(items: string[], lang: Lang, country: string): string[] {
  if (inColombia(country)) return items;
  const replacement = lang === "en" ? "Shipping worldwide" : "Envíos a todo el mundo";
  return items.map((item) => (FREE_SHIPPING.test(item) ? replacement : item));
}
