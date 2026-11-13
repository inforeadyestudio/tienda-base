import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Reseñas aprobadas de una prenda: una sola consulta compartida por la ficha. */
export const productReviewsQuery = (productId: string) =>
  queryOptions({
    queryKey: ["product-reviews", productId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_reviews")
        .select("id, author_name, city, rating, title, body, size_purchased, fit_feedback, verified, created_at, photo_urls, video_url")
        .eq("product_id", productId)
        .eq("approved", true)
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

/** Fotos y videos de comunidad aprobados de una prenda. */
export const communityMediaQuery = (productId: string) =>
  queryOptions({
    queryKey: ["community-media", productId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("community_media")
        .select("id, kind, media_url, poster_url, author_name, city, caption")
        .eq("product_id", productId)
        .eq("approved", true)
        .order("position", { ascending: true })
        .limit(24);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
