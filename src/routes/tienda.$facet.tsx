import { createFileRoute } from "@tanstack/react-router";
import { ShopPage } from "@/components/tienda/shop-page";
import { BrandLoader } from "@/components/ui/page-loader";
import { preloadShop } from "@/lib/tienda/preload";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/tienda/$facet")({
  ssr: false,
  pendingComponent: () => <BrandLoader full />,
  loader: ({ context }) => preloadShop(context.queryClient),
  head: ({ params }) => {
    const label = (params.facet ?? "").replace(/-/g, " ");
    const name = `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
    return seoHead({
      title: `${name} | Tienda Tu Marca`,
      description: `${name} en Tu Marca, con envíos a toda Colombia.`,
      path: `/tienda/${params.facet}`,
    });
  },
  component: FacetShop,
});

function FacetShop() {
  const { facet } = Route.useParams();
  return <ShopPage facet={facet} />;
}