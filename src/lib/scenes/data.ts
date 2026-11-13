import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { captureVideoPoster, optimizeImageFile, uploadOptions } from "@/lib/media";
import type { Scene } from "./types";

const PRODUCT_SELECT =
  "id, slug, name, description, hero_image_url, status, available_national, available_international, created_at, product_images(url, position), product_variants(price_cop, color, color_hex)";

/** Colección + piezas para la página pública y el preview del admin. */
export function collectionWithProductsQuery(slug: string, publishedOnly = true) {
  return queryOptions({
    queryKey: ["collection-scene-ctx", slug, publishedOnly],
    queryFn: async () => {
      let q = supabase
        .from("collections")
        .select(`id, slug, title, subtitle, cover_url, status, collection_products(position, products(${PRODUCT_SELECT}))`)
        .eq("slug", slug);
      if (publishedOnly) q = q.eq("status", "published");
      const { data, error } = await q.maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const products = (data.collection_products ?? [])
        .slice()
        .sort((a: any, b: any) => a.position - b.position)
        .map((cp: any) => cp.products)
        .filter((p: any) => p && (!publishedOnly || (p.status === "published" && (p.available_national || p.available_international))));
      return { collection: data, products };
    },
  });
}

/** Experiencia publicada (snapshot) para el storefront. */
export function publishedExperienceQuery(collectionId: string | undefined) {
  return queryOptions({
    queryKey: ["collection-experience-published", collectionId],
    enabled: !!collectionId,
    queryFn: async () => {
      if (!collectionId) return null;
      const { data, error } = await supabase
        .from("collection_experiences")
        .select("id, status, published_at, published_snapshot, theme")
        .eq("collection_id", collectionId)
        .maybeSingle();
      if (error) throw error;
      if (!data?.published_at) return null;
      const snap = (data.published_snapshot ?? {}) as { scenes?: Scene[]; theme?: Record<string, any> };
      return { theme: snap.theme ?? data.theme as Record<string, any>, scenes: (snap.scenes ?? []) as Scene[] };
    },
  });
}

/** Experiencia en borrador del admin (crea la fila si no existe). */
export function draftExperienceQuery(collectionId: string | undefined) {
  return queryOptions({
    queryKey: ["collection-experience-draft", collectionId],
    enabled: !!collectionId,
    queryFn: async () => {
      if (!collectionId) return null;
      let { data, error } = await supabase
        .from("collection_experiences")
        .select("id, status, published_at, theme, preview_token")
        .eq("collection_id", collectionId)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        const created = await supabase
          .from("collection_experiences")
          .insert({ collection_id: collectionId })
          .select("id, status, published_at, theme, preview_token")
          .single();
        if (created.error) throw created.error;
        data = created.data;
      }
      const scenes = await supabase
        .from("collection_scenes")
        .select("id, type, source, position, visible, props, layers")
        .eq("experience_id", data.id)
        .order("position");
      if (scenes.error) throw scenes.error;
      return {
        experience: data,
        scenes: (scenes.data ?? []).map((s: any) => ({
          ...s,
          props: (s.props ?? {}) as Record<string, any>,
          layers: Array.isArray(s.layers) ? s.layers : [],
        })) as Scene[],
      };
    },
  });
}

export async function publishExperience(experienceId: string, scenes: Scene[], theme: Record<string, any> = {}) {
  const { error } = await supabase
    .from("collection_experiences")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      published_snapshot: { scenes, theme } as any,
    })
    .eq("id", experienceId);
  if (error) throw error;
}

export async function unpublishExperience(experienceId: string) {
  const { error } = await supabase
    .from("collection_experiences")
    .update({ status: "draft", published_at: null, published_snapshot: null })
    .eq("id", experienceId);
  if (error) throw error;
}

export async function uploadSceneMedia(file: File, imageOptions?: { maxDim?: number; quality?: number }) {
  const isVideo = file.type.startsWith("video/");
  const optimized = file.type.startsWith("image/") ? await optimizeImageFile(file, imageOptions) : file;
  const path = `collections/${crypto.randomUUID()}-${optimized.name.replace(/[^a-zA-Z0-9.\-_]/g, "_")}`;
  const { error } = await supabase.storage.from("product-media").upload(path, optimized, uploadOptions(optimized));
  if (error) throw error;
  const url = supabase.storage.from("product-media").getPublicUrl(path).data.publicUrl;

  // Los videos suben además un póster (primer fotograma) para pintar algo al instante.
  if (isVideo) {
    try {
      const poster = await captureVideoPoster(file);
      if (poster) {
        const posterPath = path.replace(/(\.[a-z0-9]+)$/i, ".poster.webp");
        await supabase.storage
          .from("product-media")
          .upload(posterPath === path ? `${path}.poster.webp` : posterPath, poster, uploadOptions(poster));
      }
    } catch {
      /* el póster es opcional */
    }
  }
  return url;
}

