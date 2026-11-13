import { useEffect } from "react";
import { toast } from "sonner";

/** Archivo principal publicado, p. ej. /assets/index-Bt_Ls7dp.js. */
export const entryFromHtml = (html: string) => html.match(/\/assets\/index-[\w-]+\.js/)?.[0] ?? null;

/**
 * Avisa a quien tenga la página abierta desde antes de una publicación que hay
 * una versión nueva, para que recargue. No recarga sola: podría estar pagando.
 */
export function VersionWatcher() {
  useEffect(() => {
    const current = document.querySelector<HTMLScriptElement>('script[src*="/assets/index-"]')?.getAttribute("src");
    if (!current || import.meta.env.DEV) return;
    let shown = false;
    const check = async () => {
      if (shown || document.visibilityState !== "visible") return;
      try {
        const res = await fetch("/", { cache: "no-store", headers: { accept: "text/html" } });
        const latest = entryFromHtml(await res.text());
        if (latest && !current.endsWith(latest)) {
          shown = true;
          toast("Hay una versión nueva de la página", {
            description: "Actualiza para ver tallas y precios al día. Tu carrito se conserva.",
            duration: Infinity,
            action: { label: "Actualizar", onClick: () => window.location.reload() },
          });
        }
      } catch { /* sin conexión: se revisa luego */ }
    };
    const id = window.setInterval(check, 3 * 60_000);
    document.addEventListener("visibilitychange", check);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", check); };
  }, []);
  return null;
}
