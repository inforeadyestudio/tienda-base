// Fotos y video de ejemplo de las secciones Tu Marca (src/design/assets/marca/).
//
// Al agregar una sección, el panel guarda en la página sus valores por defecto, incluidas
// las URL de estas fotos. Si se agregó desde el servidor de desarrollo,
// la URL guardada es «/src/design/assets/marca/foto.jpg», que no existe en la tienda publicada;
// si se agregó desde otra publicación, es «/assets/foto-HASH.jpg» con un HASH que puede cambiar.
// Aquí se cambia cualquiera de las dos por la URL real de esta publicación, buscando por nombre.
// Las fotos subidas desde el panel (otras URL) no se tocan.
const FILES = import.meta.glob("../../assets/marca/*", { eager: true, query: "?url", import: "default" }) as Record<string, string>;

const BY_NAME = new Map<string, string>();
for (const [path, url] of Object.entries(FILES)) BY_NAME.set(path.slice(path.lastIndexOf("/") + 1), url);

const DEV = /\/src\/design\/assets\/marca\/([^/?#]+)/;
const BUILT = /^(?:https?:\/\/[^/]+)?\/assets\/(.+)-[\w-]{8}\.([a-z0-9]+)(?:[?#].*)?$/i;

export function fixAssetUrl(url: string): string {
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return url;
  const dev = DEV.exec(url);
  if (dev) {
    let name = dev[1];
    try { name = decodeURIComponent(name); } catch { /* nombre tal cual */ }
    return BY_NAME.get(name) ?? url;
  }
  const built = BUILT.exec(url);
  if (built) return BY_NAME.get(`${built[1]}.${built[2]}`) ?? url;
  return url;
}

function fixValue(v: unknown): unknown {
  if (typeof v === "string") return fixAssetUrl(v);
  if (Array.isArray(v)) {
    let changed = false;
    const out = v.map((x) => { const y = fixValue(x); if (y !== x) changed = true; return y; });
    return changed ? out : v;
  }
  if (v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype) {
    return fixAssetProps(v as Record<string, unknown>);
  }
  return v;
}

/** Devuelve los mismos props si no hay nada que corregir (no rompe memos ni efectos). */
export function fixAssetProps<T extends Record<string, any>>(props: T): T {
  if (!props || typeof props !== "object") return props;
  let out: Record<string, unknown> | null = null;
  for (const k of Object.keys(props)) {
    const v = props[k];
    const f = fixValue(v);
    if (f !== v) { out ??= { ...props }; out[k] = f; }
  }
  return (out ?? props) as T;
}
