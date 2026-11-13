import { BrandLoaderView } from "@/design/storefront/brand-loader-view";

/** Loader de marca: una sola pantalla de carga, diseñada en src/design. */
export function BrandLoader({ label, className, full = false }: { label?: string; className?: string; full?: boolean }) {
  return <BrandLoaderView label={label} className={className} full={full} />;
}

export function PageLoader() {
  return <BrandLoaderView />;
}
