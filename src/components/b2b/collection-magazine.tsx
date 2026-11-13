import { useEffect, useState, type ComponentType } from "react";
import { Link } from "@tanstack/react-router";
import { optimizedImageUrl } from "@/lib/media";
import type { CollectionPageProduct } from "./collection-flipbook";

type Props = { title: string; subtitle?: string | null; cover: string | null; products: CollectionPageProduct[] };

export function CollectionMagazine(props: Props) {
  const [Flipbook, setFlipbook] = useState<ComponentType<Props> | null>(null);
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    import("./collection-flipbook").then(({ CollectionFlipbook }) => setFlipbook(() => CollectionFlipbook));
    return () => media.removeEventListener("change", update);
  }, []);

  if (reduced) return (
    <section aria-label={`Revista ${props.title}`} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
      {props.products.map((product) => product.photos.map((photo, i) => (
        <Link key={`${product.id}-${i}`} to="/b2b/producto/$slug" params={{ slug: product.slug }} className="block bg-cream border border-ink/10">
          <img src={optimizedImageUrl(photo, 900)} alt={product.name} loading="lazy" className="w-full aspect-[3/4] object-cover" />
          <span className="block p-4 font-nm">{product.name} ↗</span>
        </Link>
      )))}
    </section>
  );
  return Flipbook ? <Flipbook {...props} /> : <div className="min-h-[380px] sm:min-h-[530px] flex items-center justify-center text-sm text-ink/50">Abriendo revista…</div>;
}