import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Image as ImageIcon, Star, Trash2, Upload, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { optimizeImageFile, uploadOptions } from "@/lib/media";

type Props = { productId: string };
type ReviewRow = {
  id: string;
  author_name: string;
  city: string | null;
  rating: number;
  body: string | null;
  approved: boolean;
  verified: boolean;
  photo_urls: string[];
  video_url: string | null;
  created_at: string;
};
type MediaRow = {
  id: string;
  kind: string;
  media_url: string;
  author_name: string | null;
  city: string | null;
  caption: string | null;
  approved: boolean;
};

export function ProductReviewsEditor({ productId }: Props) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [author, setAuthor] = useState("");
  const [city, setCity] = useState("");
  const [body, setBody] = useState("");
  const [rating, setRating] = useState(5);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const queryKey = ["admin-product-reviews", productId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      const [reviewsResult, mediaResult] = await Promise.all([
        supabase
          .from("product_reviews")
          .select("id, author_name, city, rating, body, approved, verified, photo_urls, video_url, created_at")
          .eq("product_id", productId)
          .order("created_at", { ascending: false }),
        supabase
          .from("community_media")
          .select("id, kind, media_url, author_name, city, caption, approved")
          .eq("product_id", productId)
          .order("position"),
      ]);
      if (reviewsResult.error) throw reviewsResult.error;
      if (mediaResult.error) throw mediaResult.error;
      return { reviews: (reviewsResult.data ?? []) as ReviewRow[], media: (mediaResult.data ?? []) as MediaRow[] };
    },
  });

  async function uploadPublicFile(file: File, prefix = "admin") {
    const prepared = file.type.startsWith("image/") ? await optimizeImageFile(file) : file;
    const ext = prepared.name.split(".").pop() || (prepared.type.startsWith("video/") ? "mp4" : "webp");
    const path = `reviews/${productId}/${prefix}-${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("product-media").upload(path, prepared, uploadOptions(prepared));
    if (error) throw error;
    return supabase.storage.from("product-media").getPublicUrl(path).data.publicUrl;
  }

  async function addReview() {
    if (!author.trim() || (!body.trim() && files.length === 0)) {
      toast.error("Agrega la autora y una reseña, foto o video");
      return;
    }
    setSaving(true);
    try {
      const { error: reviewError } = await supabase.from("product_reviews").insert({
        product_id: productId,
        author_name: author.trim(),
        city: city.trim() || null,
        rating,
        body: body.trim() || null,
        approved: true,
        verified: false,
      });
      if (reviewError) throw reviewError;
      const urls = await Promise.all(files.map((file) => uploadPublicFile(file)));
      if (urls.length) {
        const { error: mediaError } = await supabase.from("community_media").insert(
          urls.map((url, position) => ({
            product_id: productId,
            kind: files[position]?.type.startsWith("video/") ? "video" : "photo",
            media_url: url,
            author_name: author.trim(),
            city: city.trim() || null,
            caption: body.trim() || null,
            position: (data?.media.length ?? 0) + position,
            approved: true,
          })),
        );
        if (mediaError) throw mediaError;
      }
      setAuthor(""); setCity(""); setBody(""); setRating(5); setFiles([]);
      if (inputRef.current) inputRef.current.value = "";
      await qc.invalidateQueries({ queryKey });
      await qc.invalidateQueries({ queryKey: ["product-reviews-strip", productId] });
      await qc.invalidateQueries({ queryKey: ["community-media-strip", productId] });
      toast.success("Reseña publicada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo publicar la reseña");
    } finally {
      setSaving(false);
    }
  }

  async function toggleReview(review: ReviewRow) {
    setSaving(true);
    try {
      const { error } = await supabase.from("product_reviews").update({ approved: !review.approved }).eq("id", review.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey });
      await qc.invalidateQueries({ queryKey: ["product-reviews-strip", productId] });
      await qc.invalidateQueries({ queryKey: ["product-review-uploads-strip", productId] });
      await qc.invalidateQueries({ queryKey: ["community-media-strip", productId] });
      toast.success(review.approved ? "Reseña oculta" : "Reseña publicada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo actualizar la reseña");
    } finally {
      setSaving(false);
    }
  }

  async function removeReview(review: ReviewRow) {
    if (!confirm("¿Eliminar esta reseña?")) return;
    const { error } = await supabase.from("product_reviews").delete().eq("id", review.id);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey });
    await qc.invalidateQueries({ queryKey: ["product-reviews-strip", productId] });
    toast.success("Reseña eliminada");
  }

  async function toggleMedia(media: MediaRow) {
    const { error } = await supabase.from("community_media").update({ approved: !media.approved }).eq("id", media.id);
    if (error) return toast.error(error.message);
    await qc.invalidateQueries({ queryKey });
    await qc.invalidateQueries({ queryKey: ["community-media-strip", productId] });
  }

  async function removeMedia(media: MediaRow) {
    if (!confirm("¿Eliminar este contenido?")) return;
    const { error } = await supabase.from("community_media").delete().eq("id", media.id);
    if (error) return toast.error(error.message);
    const path = media.media_url.split("/product-media/").pop();
    if (path) await supabase.storage.from("product-media").remove([path]);
    await qc.invalidateQueries({ queryKey });
    await qc.invalidateQueries({ queryKey: ["community-media-strip", productId] });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-ink/10 bg-background p-5">
        <h3 className="font-medium text-ink">Nueva reseña</h3>
        <p className="mt-1 text-xs text-ink/50">Publica texto, fotos o videos que ya estén autorizados.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Nombre de la autora" className="rounded-lg border border-ink/15 bg-background px-3 py-2 text-sm" />
          <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ciudad" className="rounded-lg border border-ink/15 bg-background px-3 py-2 text-sm" />
        </div>
        <div className="mt-3 flex gap-1" aria-label={`${rating} estrellas`}>
          {[1, 2, 3, 4, 5].map((value) => (
            <Button key={value} type="button" size="icon" variant="ghost" aria-label={`${value} estrellas`} onClick={() => setRating(value)}>
              <Star className={value <= rating ? "fill-ink text-ink" : "text-ink/20"} />
            </Button>
          ))}
        </div>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Escribe la reseña o descripción del contenido" className="mt-3 w-full rounded-lg border border-ink/15 bg-background px-3 py-2 text-sm" />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input ref={inputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
          <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}><Upload /> Subir fotos o videos</Button>
          {files.length > 0 && <span className="text-xs text-ink/55">{files.length} archivo(s)</span>}
          <Button type="button" onClick={() => void addReview()} disabled={saving}>{saving ? "Publicando…" : "Publicar reseña"}</Button>
        </div>
      </section>

      <section>
        <h3 className="font-medium text-ink">Reseñas</h3>
        {isLoading && <p className="mt-3 text-sm text-ink/50">Cargando…</p>}
        {!isLoading && !data?.reviews.length && <p className="mt-3 rounded-lg border border-dashed border-ink/15 p-6 text-center text-sm text-ink/50">Este producto aún no tiene reseñas.</p>}
        <div className="mt-3 space-y-2">
          {data?.reviews.map((review) => (
            <article key={review.id} className="flex flex-col gap-3 rounded-lg border border-ink/10 bg-background p-4 md:flex-row md:items-start md:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{review.author_name}</span>
                  {review.city && <span className="text-xs text-ink/50">{review.city}</span>}
                  {review.verified && <span className="text-xs text-moss">Compra verificada</span>}
                </div>
                <div className="mt-1 flex gap-0.5">{[1,2,3,4,5].map((n) => <Star key={n} className={`size-3 ${n <= review.rating ? "fill-ink text-ink" : "text-ink/20"}`} />)}</div>
                {review.body && <p className="mt-2 max-w-2xl text-sm text-ink/70">{review.body}</p>}
                {(review.photo_urls.length > 0 || review.video_url) && <p className="mt-2 text-xs text-ink/50">Contenido de clienta: {review.photo_urls.length} foto(s){review.video_url ? " y 1 video" : ""}</p>}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button type="button" size="sm" variant={review.approved ? "outline" : "default"} disabled={saving} onClick={() => void toggleReview(review)}>{review.approved ? "Ocultar" : "Publicar"}</Button>
                <Button type="button" size="icon" variant="ghost" aria-label="Eliminar reseña" onClick={() => void removeReview(review)}><Trash2 /></Button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {Boolean(data?.media.length) && (
        <section>
          <h3 className="font-medium text-ink">Fotos y videos publicados</h3>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
            {data?.media.map((media) => (
              <article key={media.id} className="overflow-hidden rounded-lg border border-ink/10 bg-background">
                <div className="relative aspect-[3/4] bg-muted">
                  {media.kind === "video" ? <video src={media.media_url} muted playsInline className="size-full object-cover" /> : <img src={media.media_url} alt={media.caption ?? "Contenido de clienta"} className="size-full object-cover" />}
                  <span className="absolute left-2 top-2 rounded-full bg-background/90 p-1">{media.kind === "video" ? <Video className="size-3.5" /> : <ImageIcon className="size-3.5" />}</span>
                </div>
                <div className="flex items-center justify-between gap-2 p-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => void toggleMedia(media)}>{media.approved ? "Ocultar" : "Publicar"}</Button>
                  <Button type="button" size="icon" variant="ghost" aria-label="Eliminar contenido" onClick={() => void removeMedia(media)}><Trash2 /></Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
