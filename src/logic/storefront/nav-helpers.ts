export function collectionSlugFromHref(href?: string | null): string | null {
  const m = href?.match(/^\/coleccion\/([^/?#]+)/);
  return m && m[1] !== "todo" ? decodeURIComponent(m[1]) : null;
}
