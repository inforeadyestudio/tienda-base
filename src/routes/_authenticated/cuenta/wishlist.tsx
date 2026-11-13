import { createFileRoute, Link } from "@tanstack/react-router";
import { useWishlistPage } from "@/logic/account/use-wishlist-page";
import { WishlistView } from "@/design/account/wishlist-view";
export const Route = createFileRoute("/_authenticated/cuenta/wishlist")({
  head: () => ({
    meta: [
      { title: "Wishlist · Tu Marca" },
      { name: "description", content: "Las piezas de Tu Marca que guardaste para después." },
      { property: "og:title", content: "Wishlist · Tu Marca" },
      { property: "og:description", content: "Las piezas de Tu Marca que guardaste para después." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WishlistPage,
});

function WishlistPage() {
  const vm = useWishlistPage();
  return <WishlistView vm={vm} />;
}
