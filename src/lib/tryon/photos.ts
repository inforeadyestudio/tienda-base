import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { optimizeImageFile, uploadOptions } from "@/lib/media";

export const PHOTO_VIEWS = ["front", "back", "side"] as const;
export type PhotoView = (typeof PHOTO_VIEWS)[number];

export const VIEW_LABELS: Record<PhotoView, string> = {
  front: "De frente",
  back: "De espalda",
  side: "De lado",
};

export type TryOnPhoto = {
  id: string;
  view: PhotoView;
  path: string;
  isDefault: boolean;
  url: string;
  createdAt: string;
};

/** Fotos de la clienta para el probador, con URL firmada lista para mostrar. */
export function useTryOnPhotos(userId?: string) {
  return useQuery({
    queryKey: ["tryon-photos", userId ?? "anon"],
    enabled: !!userId,
    queryFn: async (): Promise<TryOnPhoto[]> => {
      const { data, error } = await supabase
        .from("tryon_photos")
        .select("id, view, path, is_default, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;

      const rows = data ?? [];
      const paths = rows.map((r) => r.path);
      const signed = new Map<string, string>();
      if (paths.length) {
        const { data: urls } = await supabase.storage.from("tryon").createSignedUrls(paths, 60 * 60);
        for (const row of urls ?? []) if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl);
      }

      return rows.map((r) => ({
        id: r.id,
        view: (PHOTO_VIEWS as readonly string[]).includes(r.view) ? (r.view as PhotoView) : "front",
        path: r.path,
        isDefault: r.is_default,
        url: signed.get(r.path) ?? "",
        createdAt: r.created_at,
      }));
    },
  });
}

/** Sube una foto de la clienta al bucket privado y la registra. */
export async function uploadTryOnPhoto(userId: string, file: File, view: PhotoView, makeDefault: boolean) {
  const optimized = await optimizeImageFile(file);
  const ext = optimized.name.split(".").pop() || "webp";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("tryon").upload(path, optimized, uploadOptions(optimized));
  if (error) throw new Error("No pudimos guardar la foto.");

  if (makeDefault) await supabase.from("tryon_photos").update({ is_default: false }).eq("user_id", userId);
  const { error: insertError } = await supabase
    .from("tryon_photos")
    .insert({ user_id: userId, view, path, is_default: makeDefault });
  if (insertError) throw insertError;
}

export async function setDefaultTryOnPhoto(userId: string, id: string) {
  await supabase.from("tryon_photos").update({ is_default: false }).eq("user_id", userId);
  const { error } = await supabase.from("tryon_photos").update({ is_default: true }).eq("id", id);
  if (error) throw error;
}

export async function deleteTryOnPhoto(photo: TryOnPhoto) {
  await supabase.storage.from("tryon").remove([photo.path]);
  const { error } = await supabase.from("tryon_photos").delete().eq("id", photo.id);
  if (error) throw error;
}

/** Convierte un archivo a data URI reducido para clientas sin cuenta. */
export async function fileToDataUrl(file: File, maxDim = 1280): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No pudimos leer la foto.");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL("image/jpeg", 0.85);
}
