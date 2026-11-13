import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Tablas que se transmiten en vivo. Cualquier cambio en ellas refresca
 * automáticamente las vistas abiertas (admin, ecommerce, POS y B2B).
 */
const REALTIME_TABLES = [
  "products",
  "product_variants",
  "product_images",
  "product_videos",
  "product_looks",
  "product_look_items",
  "product_look_matches",
  "product_look_match_items",
  "collections",
  "collection_products",
  "collection_blocks",
  "inventory_levels",
  "inventory_movements",
  "locations",
  "transfers",
  "transfer_items",
  "orders",
  "order_items",
  "order_fulfillments",
  "reservations",
  "preventa_allocations",
  "preventa_rules",
  "promotions",
  "pos_offers",
  "returns",
  "store_requests",
  "invoices",
  "rcount_sync_log",
  "pos_sales",
  "b2b_shipments",
] as const;

/**
 * Suscribe la app a los cambios en tiempo real y refresca las consultas.
 * Se monta una sola vez en la raíz.
 */
export function useRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const scheduleRefresh = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        queryClient.invalidateQueries();
      }, 350);
    };

    const channel = supabase.channel("marca-realtime");

    for (const table of REALTIME_TABLES) {
      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table } as never,
        scheduleRefresh as never,
      );
    }

    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
