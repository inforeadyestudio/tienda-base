import { useProductReviews } from "@/logic/storefront/use-product-reviews";
import { ProductReviewsView } from "@/design/product/product-reviews-view";
export function ProductReviewsStrip({ productId, className = "" }: { productId: string; className?: string }) {
  const vm = useProductReviews({ productId, className });
  return <ProductReviewsView vm={vm} />;
}
