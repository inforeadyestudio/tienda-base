import { Link } from "@tanstack/react-router";
import { Media } from "./scene-shell";
import type { Layer, SceneContext } from "@/lib/scenes/types";
import { cn } from "@/lib/utils";

export type CatalogBanner = {
  id: string;
  media?: string;
  eyebrow?: string;
  title?: string;
  href?: string;
  /** aparece después de esta cantidad de productos */
  after?: number;
  /** columnas que ocupa */
  span?: "1" | "2" | "3" | "full";
  /** filas que ocupa */
  rows?: "1" | "2";
  overlay?: number;
};

export function newCatalogBanner(): CatalogBanner {
  return {
    id: Math.random().toString(36).slice(2),
    media: "",
    title: "",
    eyebrow: "",
    href: "",
    after: 4,
    span: "2",
    rows: "1",
    overlay: 0,
  };
}

/** Intercala banners dentro de una lista de productos según `after`. */
export function interleaveBanners<T>(
  products: T[],
  banners: CatalogBanner[],
): Array<{ kind: "product"; p: T } | { kind: "banner"; b: CatalogBanner }> {
  const sorted = [...(banners ?? [])].filter((b) => !!b?.media).sort((a, b) => (a.after ?? 0) - (b.after ?? 0));
  const items: Array<{ kind: "product"; p: T } | { kind: "banner"; b: CatalogBanner }> = [];
  products.forEach((p, i) => {
    sorted.filter((b) => (b.after ?? 0) === i).forEach((b) => items.push({ kind: "banner", b }));
    items.push({ kind: "product", p });
  });
  sorted.filter((b) => (b.after ?? 0) >= products.length).forEach((b) => items.push({ kind: "banner", b }));
  return items;
}

/** Banner que se intercala dentro de la grilla del catálogo. */
export function CatalogBannerCell({ banner }: { banner: CatalogBanner; rowSpan?: boolean }) {
  const overlay = Number(banner.overlay ?? 0);
  const inner = (
    <div className="relative w-full h-full aspect-[4/5] md:aspect-auto md:min-h-[24vw] overflow-hidden bg-cream">
      <Media url={banner.media} alt={banner.title} width={1080} className="absolute inset-0 w-full h-full object-cover" />
      {overlay > 0 && <div className="absolute inset-0 bg-ink" style={{ opacity: overlay }} />}
      {(banner.title || banner.eyebrow) && (
        <div className="absolute inset-x-0 bottom-0 p-5 md:p-8 text-ivory">
          {banner.eyebrow && (
            <p className="font-nm text-[10px] uppercase tracking-[0.3em] opacity-85">{banner.eyebrow}</p>
          )}
          {banner.title && <h3 className="mt-2 font-serif italic text-2xl md:text-4xl">{banner.title}</h3>}
        </div>
      )}
    </div>
  );

  const cls = cn("col-span-2 row-span-2 block h-full");

  if (!banner.href) return <div className={cls}>{inner}</div>;
  if (/^(https?:|mailto:)/.test(banner.href))
    return (
      <a href={banner.href} target="_blank" rel="noreferrer" className={cls}>
        {inner}
      </a>
    );
  return (
    <Link to={banner.href as any} className={cls}>
      {inner}
    </Link>
  );
}

/** En el editor mostramos una vista compacta; en la tienda se intercalan en la grilla. */
export function CatalogBannersScene({ props }: { props: Record<string, any>; layers: Layer[]; ctx: SceneContext }) {
  const banners: CatalogBanner[] = props.banners ?? [];
  if (!banners.length) return null;
  return (
    <section className="px-6 md:px-10 py-8">
      <p className="font-nm text-[10px] uppercase tracking-[0.24em] opacity-45">
        Banners dentro de la lista de productos
      </p>
      <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-px bg-ink/10">
        {banners.map((b) => (
          <div key={b.id} className="relative aspect-[3/4] bg-cream">
            <Media url={b.media} alt={b.title} className="absolute inset-0 w-full h-full object-cover" />
            <span className="absolute top-2 left-2 bg-ink/80 text-ivory font-nm text-[9px] uppercase tracking-[0.18em] px-2 py-1">
              Tras {b.after ?? 0} productos
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
