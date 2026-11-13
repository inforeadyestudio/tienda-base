import type { QueryClient } from "@tanstack/react-query";
import { catalogQuery } from "@/lib/tienda/catalog";
import { collectionWithProductsQuery, publishedExperienceQuery } from "@/lib/scenes/data";

/**
 * Warm public reads independently; optional editorial content never blocks entry.
 */
export function preloadShop(qc: QueryClient) {
  void qc.prefetchQuery(catalogQuery());
  void qc.ensureQueryData(collectionWithProductsQuery("page-tienda"))
    .then((page) => {
      if (page?.collection?.id) return qc.prefetchQuery(publishedExperienceQuery(page.collection.id));
    }).catch(() => undefined);
}
