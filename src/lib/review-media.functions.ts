import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

/** Only sign media referenced by approved reviews of a publicly visible product. */
export const approvedReviewMedia = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ productId: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const publicClient = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      } },
    });
    const { data: product, error: productError } = await publicClient.from("products")
      .select("id").eq("id", data.productId).eq("status", "published").maybeSingle();
    if (productError) throw new Error("No se pudieron cargar las reseñas.");
    if (!product) return [];
    const { data: reviews, error } = await publicClient.from("product_reviews")
      .select("id,photo_urls,video_url").eq("product_id", data.productId).eq("approved", true)
      .order("created_at", { ascending: false }).limit(50);
    if (error) throw new Error("No se pudieron cargar las reseñas.");
    const uploads = (reviews ?? []).flatMap((review) => [
      ...review.photo_urls.map((path) => ({ reviewId: review.id, path, kind: "photo" })),
      ...(review.video_url ? [{ reviewId: review.id, path: review.video_url, kind: "video" }] : []),
    ]).filter(({ path }) => path.length <= 1024 && !path.startsWith("/") && !path.includes(":") && !path.split("/").includes(".."));
    if (!uploads.length) return [];
    // Authorization comes from the approved rows above, never caller-supplied storage paths.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error: signError } = await supabaseAdmin.storage.from("review-media")
      .createSignedUrls(uploads.map(({ path }) => path), 900);
    if (signError) throw new Error("No se pudieron cargar las fotos de reseñas.");
    return uploads.flatMap((upload, index) => {
      const url = signed?.[index]?.signedUrl;
      return url ? [{ reviewId: upload.reviewId, kind: upload.kind, url }] : [];
    });
  });