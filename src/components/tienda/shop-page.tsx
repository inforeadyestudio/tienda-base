import { useShopPage } from "@/logic/shop/use-shop-page";
import { ShopPageView } from "@/design/shop/shop-page-view";
export function ShopPage({ facet }: { facet?: string }) {
  const vm = useShopPage(facet);
  return <ShopPageView vm={vm} />;
}
