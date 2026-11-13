import { useSiteNav } from "@/logic/storefront/use-site-nav";
import { SiteNavView } from "@/design/storefront/site-nav-view";
/** Dos productos destacados de la colección asociada al enlace del submenú. */

/** Submenú de escritorio: rectángulo editorial con enlaces a la izquierda y productos a la derecha. */

/** Enlace de menú configurable: acepta cualquier ruta definida en el admin. */

export function SiteNav({ hideAnnouncement = false }: { hideAnnouncement?: boolean } = {}) {
  const vm = useSiteNav({ hideAnnouncement });
  return <SiteNavView vm={vm} />;
}
