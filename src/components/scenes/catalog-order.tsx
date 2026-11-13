/**
 * Escena de configuración: define el orden y la paginación de la retícula
 * de productos del catálogo (/tienda). No dibuja nada en la tienda pública;
 * la página lee sus props.
 */
export type CatalogOrderProps = {
  mode?: "auto" | "collections" | "manual";
  collectionSlugs?: string[];
  productIds?: string[];
  pageSize?: number;
  restLabel?: string;
};

export function CatalogOrderScene({ props }: { props: Record<string, any> }) {
  const mode = (props?.mode ?? "auto") as string;
  const modeLabel =
    mode === "collections"
      ? "Colecciones, una encima de la otra"
      : mode === "manual"
        ? "Orden manual de productos"
        : "Orden automático (el que elija la clienta)";
  return (
    <div className="px-6 md:px-10 py-6">
      <div className="border border-dashed border-ink/20 bg-cream/40 px-5 py-4 text-[12px] text-ink/60">
        <span className="font-nm uppercase tracking-[0.18em] text-[10px] text-ink/45">
          Orden del catálogo
        </span>
        <p className="mt-1">
          {modeLabel} · {props?.pageSize ?? 20} productos por página.
        </p>
      </div>
    </div>
  );
}
