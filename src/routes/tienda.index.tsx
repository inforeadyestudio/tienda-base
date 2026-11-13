import { createFileRoute } from "@tanstack/react-router";
import { ShopPage } from "@/components/tienda/shop-page";
import { BrandLoader } from "@/components/ui/page-loader";
import { preloadShop } from "@/lib/tienda/preload";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/tienda/")({
  ssr: false,
  pendingComponent: () => <BrandLoader full />,
  loader: ({ context }) => preloadShop(context.queryClient),
  head: () =>
    seoHead({
      title: "Tienda | Tu Marca",
      description:
        "Toda la colección de Tu Marca, con envíos a toda Colombia.",
      path: "/tienda",
    }),
  component: () => <ShopPage />,
});