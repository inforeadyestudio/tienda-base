import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Star, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { loyaltyConfigQuery } from "@/lib/loyalty";

type Props = { orderId: string; orderNumber: string | number; userId: string; onClose: () => void };

export function OrderReviewModal({ orderId, orderNumber, userId, onClose }: Props) {
  const qc = useQueryClient();
  const { data: cfg } = useQuery({
    ...loyaltyConfigQuery(),
    select: (c) => c,
  });
  const { data: raw } = useQuery({
    queryKey: ["app-setting", "loyalty-raw"],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", "loyalty").maybeSingle();
      return (data?.value ?? {}) as { review_photo_points?: number; review_video_points?: number };
    },
  });
  const photoPts = Number(raw?.review_photo_points ?? 5000);
  const videoPts = Number(raw?.review_video_points ?? 25000);

  const { data: items } = useQuery({
    queryKey: ["order-review-items", orderId],
    queryFn: async () => {
      const { data } = await supabase
        .from("order_items")
        .select("variant_id, product_variants(product_id, products(id, name))")
        .eq("order_id", orderId);
      const { data: done } = await supabase.from("product_reviews").select("product_id").eq("order_id", orderId);
      const reviewed = new Set((done ?? []).map((r) => r.product_id));
      const map = new Map<string, { id: string; name: string; reviewed: boolean }>();
      for (const it of (data ?? []) as any[]) {
        const p = it.product_variants?.products;
        if (p && !map.has(p.id)) map.set(p.id, { id: p.id, name: p.name, reviewed: reviewed.has(p.id) });
      }
      return [...map.values()];
    },
  });

  const [productId, setProductId] = useState<string>("");
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  const pending = (items ?? []).filter((i) => !i.reviewed);
  const selected = productId || pending[0]?.id || "";
  const earn = cfg?.enabled === false ? 0 : video ? videoPts : photos.length ? photoPts : 0;

  const upload = async (f: File) => {
    const path = `${userId}/${orderId}/${crypto.randomUUID()}-${f.name.replace(/[^\w.]/g, "_")}`;
    const { error } = await supabase.storage.from("review-media").upload(path, f);
    if (error) throw error;
    return path;
  };

  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const photoPaths = await Promise.all(photos.map(upload));
      const videoPath = video ? await upload(video) : null;
      const { data, error } = await supabase.rpc("submit_order_review" as any, {
        _order_id: orderId, _product_id: selected, _rating: rating, _body: body,
        _photo_urls: photoPaths, _video_url: videoPath,
      });
      if (error) throw error;
      const pts = (data as any)?.points ?? 0;
      toast.success(pts ? `¡Gracias! Sumaste ${pts.toLocaleString("es-CO")} puntos Tu Marca` : "¡Gracias por tu reseña!");
      qc.invalidateQueries({ queryKey: ["loyalty"] });
      qc.invalidateQueries({ queryKey: ["order-review-items", orderId] });
      onClose();
    } catch (e: any) {
      toast.error(e?.message?.includes("already") ? "Ya dejaste reseña de esta prenda" : "No pudimos enviar la reseña");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md space-y-4 rounded-2xl bg-ivory p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-nm text-lg">Reseña · Pedido {orderNumber}</h3>
          <button onClick={onClose} aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </div>
        <p className="rounded-xl bg-moss/10 p-3 text-xs text-moss">
          Sube una foto de lo que te llegó y suma <strong>{photoPts.toLocaleString("es-CO")} puntos</strong>, o un video y suma{" "}
          <strong>{videoPts.toLocaleString("es-CO")} puntos</strong>.
        </p>
        {items && pending.length === 0 ? (
          <p className="text-sm text-moss/70">Ya reseñaste todas las prendas de este pedido.</p>
        ) : (
          <>
            <label className="block text-xs">
              Prenda
              <select value={selected} onChange={(e) => setProductId(e.target.value)} className="mt-1 w-full rounded-lg border border-ink/10 bg-white p-2 text-sm">
                {pending.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} onClick={() => setRating(n)} aria-label={`${n} estrellas`}>
                  <Star className={`h-6 w-6 ${n <= rating ? "fill-moss text-moss" : "text-ink/20"}`} />
                </button>
              ))}
            </div>
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="Cuéntanos cómo te quedó…"
              className="w-full rounded-lg border border-ink/10 bg-white p-2 text-sm" />
            <label className="block text-xs">
              Fotos
              <input type="file" accept="image/*" multiple onChange={(e) => setPhotos([...(e.target.files ?? [])].slice(0, 5))} className="mt-1 block w-full text-xs" />
            </label>
            <label className="block text-xs">
              Video
              <input type="file" accept="video/*" onChange={(e) => setVideo(e.target.files?.[0] ?? null)} className="mt-1 block w-full text-xs" />
            </label>
            <button disabled={busy || !selected} onClick={submit}
              className="w-full rounded-full bg-ink py-3 text-xs uppercase tracking-[0.2em] text-ivory disabled:opacity-50">
              {busy ? "Enviando…" : earn ? `Enviar y sumar ${earn.toLocaleString("es-CO")} pts` : "Enviar reseña"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
