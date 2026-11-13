import { productReviewsQuery, communityMediaQuery } from "@/lib/community-queries";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { X, Play, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Review = {
  id: string;
  author_name: string;
  city: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  size_purchased: string | null;
  fit_feedback: string | null;
  verified: boolean;
  created_at: string;
};

type Media = {
  id: string;
  kind: string;
  media_url: string;
  poster_url: string | null;
  author_name: string | null;
  city: string | null;
  caption: string | null;
};

const FIT_LABEL: Record<string, string> = {
  small: "Talla pequeña",
  true: "Talla real",
  large: "Talla amplia",
};

function Stars({ value, className = "" }: { value: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-[2px] ${className}`} aria-label={`${value} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`size-3 ${i <= Math.round(value) ? "fill-ink text-ink" : "text-ink/25"}`}
          strokeWidth={1}
        />
      ))}
    </span>
  );
}

export function CommunityProof({ productId }: { productId: string }) {
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);

  const { data: allReviews = [] } = useQuery(productReviewsQuery(productId));
  const reviews = useMemo(() => (allReviews as Review[]).slice(0, 12), [allReviews]);
  const { data: media = [] } = useQuery(communityMediaQuery(productId)) as { data: Media[] };

  const summary = useMemo(() => {
    if (!reviews.length) return null;
    const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
    const fits = reviews.filter((r) => r.fit_feedback);
    const trueFit = fits.filter((r) => r.fit_feedback === "true").length;
    return {
      avg,
      count: reviews.length,
      fitPct: fits.length ? Math.round((trueFit / fits.length) * 100) : null,
    };
  }, [reviews]);

  if (!reviews.length && !media.length) return null;

  const active = galleryIndex !== null ? media[galleryIndex] : null;

  return (
    <section className="border-t border-ink/10">
      <div className="mx-auto max-w-[1500px] px-6 py-20 md:px-10">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-ink/40">Prueba social</p>
            <h2 className="font-nm mt-3 text-3xl md:text-5xl">Lo que dice nuestra comunidad</h2>
          </div>
          {summary ? (
            <div className="flex items-center gap-6">
              <div>
                <p className="font-nm text-3xl leading-none">{summary.avg.toFixed(1)}</p>
                <Stars value={summary.avg} className="mt-2" />
              </div>
              <div className="text-[11px] uppercase tracking-[0.14em] text-ink/45">
                <p>{summary.count} reseñas verificadas</p>
                {summary.fitPct !== null ? <p className="mt-1">{summary.fitPct}% dice que la talla es real</p> : null}
              </div>
            </div>
          ) : null}
        </div>

        {media.length ? (
          <div className="mt-12 grid grid-cols-2 gap-2 md:grid-cols-5">
            {media.slice(0, 5).map((m, i) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setGalleryIndex(i)}
                className="group relative aspect-[3/4] overflow-hidden bg-ink/5"
                aria-label={`Ver contenido de ${m.author_name ?? "la comunidad"}`}
              >
                <img
                  src={m.kind === "video" ? (m.poster_url ?? m.media_url) : m.media_url}
                  alt={m.caption ?? "Foto de la comunidad"}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
                {m.kind === "video" ? (
                  <span className="absolute inset-0 flex items-center justify-center">
                    <Play className="size-6 text-ivory drop-shadow" />
                  </span>
                ) : null}
                <span className="absolute bottom-2 left-2 text-[10px] uppercase tracking-[0.14em] text-ivory drop-shadow">
                  {m.author_name}
                </span>
              </button>
            ))}
          </div>
        ) : null}

        {media.length > 5 ? (
          <button
            type="button"
            onClick={() => setGalleryIndex(0)}
            className="mt-6 border-b border-ink pb-1 text-[11px] uppercase tracking-[0.18em]"
          >
            Ver la galería completa ({media.length})
          </button>
        ) : null}

        {reviews.length ? (
          <div className="mt-16 grid gap-px bg-ink/10 md:grid-cols-3">
            {reviews.slice(0, 6).map((r) => (
              <article key={r.id} className="bg-background p-6">
                <Stars value={r.rating} />
                {r.title ? <h3 className="font-nm mt-3 text-lg leading-tight">{r.title}</h3> : null}
                {r.body ? <p className="mt-2 text-sm leading-relaxed text-ink/55">{r.body}</p> : null}
                <p className="mt-5 text-[10px] uppercase tracking-[0.16em] text-ink/40">
                  {r.author_name}
                  {r.city ? ` · ${r.city}` : ""}
                  {r.verified ? " · Compra verificada" : ""}
                </p>
                {r.size_purchased || r.fit_feedback ? (
                  <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-ink/40">
                    {r.size_purchased ? `Talla ${r.size_purchased}` : ""}
                    {r.fit_feedback ? ` · ${FIT_LABEL[r.fit_feedback] ?? ""}` : ""}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        ) : null}
      </div>

      <AnimatePresence>
        {active ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] bg-ink/95 p-4 md:p-10"
            role="dialog"
            aria-label="Galería de la comunidad"
          >
            <button
              type="button"
              onClick={() => setGalleryIndex(null)}
              className="absolute right-5 top-5 z-10 text-ivory"
              aria-label="Cerrar galería"
            >
              <X className="size-5" />
            </button>

            <div className="mx-auto flex h-full max-w-[1200px] flex-col gap-4">
              <div className="relative flex-1 overflow-hidden">
                {active.kind === "video" ? (
                  <video
                    key={active.id}
                    src={active.media_url}
                    poster={active.poster_url ?? undefined}
                    controls
                    autoPlay
                    playsInline
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <img
                    key={active.id}
                    src={active.media_url}
                    alt={active.caption ?? "Foto de la comunidad"}
                    className="h-full w-full object-contain"
                  />
                )}
              </div>
              <div className="text-ivory">
                <p className="text-[11px] uppercase tracking-[0.16em] text-ivory/60">
                  {active.author_name}
                  {active.city ? ` · ${active.city}` : ""}
                </p>
                {active.caption ? <p className="mt-1 text-sm">{active.caption}</p> : null}
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {media.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setGalleryIndex(i)}
                    className={`h-20 w-16 shrink-0 overflow-hidden ${i === galleryIndex ? "opacity-100 ring-1 ring-ivory" : "opacity-50"}`}
                    aria-label={`Ver medio ${i + 1}`}
                  >
                    <img
                      src={m.kind === "video" ? (m.poster_url ?? m.media_url) : m.media_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </section>
  );
}
