// Diseño (editable desde Claude). Datos y acciones llegan en `vm`; no calcules precios ni stock aquí.
import { Star, X, ChevronLeft, ChevronRight } from "lucide-react";
import { type ProductReviewsVM } from "@/logic/storefront/use-product-reviews";
function isVideo(url: string, kind?: string) {
  return kind === "video" || /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

function Stars({ value, size = "size-4" }: { value: number; size?: string }) {
  return (
    <span className="inline-flex items-center gap-[2px]" aria-label={`${value} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={`${size} ${i <= Math.round(value) ? "fill-ink text-ink" : "text-ink/25"}`} strokeWidth={1} />
      ))}
    </span>
  );
}

export function ProductReviewsView({ vm }: { vm: ProductReviewsVM }) {
  const { className, open, setOpen, index, setIndex, reviews, shown, allMedia, current, step, hasContent } = vm;
  if (!hasContent) return null;
  return (
    <div className={className}>
      <button
        onClick={() => {
          setIndex(0);
          setOpen(true);
        }}
        className="flex w-full items-center justify-between gap-3 border-y border-ink/15 px-1 py-4 text-left"
      >
        <span className="flex items-center gap-2">
          <Stars value={shown} />
          <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ink/70">
            Reseñas · {shown} de 5
          </span>
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink/50">Ver</span>
      </button>

      {open && (
        <div className="fixed inset-0 z-[120] flex flex-col bg-ink/95 backdrop-blur">
          <div className="flex items-center justify-between px-5 pt-5">
            <div className="flex items-center gap-2 text-ivory">
              <span className="inline-flex items-center gap-[2px]">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star
                    key={i}
                    className={`size-4 ${i <= Math.round(shown) ? "fill-ivory text-ivory" : "text-ivory/30"}`}
                    strokeWidth={1}
                  />
                ))}
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-ivory/80">{shown} de 5</span>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Cerrar" className="grid size-10 place-items-center text-ivory">
              <X className="size-5" />
            </button>
          </div>

          <div className="flex flex-1 items-center justify-center px-4 pb-6">
            {current ? (
              <div className="relative w-full max-w-md">
                <div className="aspect-[3/4] w-full overflow-hidden rounded-2xl bg-ink">
                  {isVideo(current.media_url, current.kind) ? (
                    <video
                      key={current.id}
                      src={current.media_url}
                      poster={current.poster_url ?? undefined}
                      controls
                      autoPlay
                      playsInline
                      className="size-full object-cover"
                    />
                  ) : (
                    <img src={current.media_url} alt={current.caption ?? "Clienta con el producto"} className="size-full object-cover" />
                  )}
                </div>
                <div className="mt-3 text-center text-ivory/75">
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em]">
                    {[current.author_name, current.city].filter(Boolean).join(" · ") || "Comunidad Tu Marca"}
                  </p>
                  {current.caption && <p className="mt-1 font-serif text-[13px] text-ivory/70">{current.caption}</p>}
                </div>
                {allMedia.length > 1 && (
                  <>
                    <button
                      onClick={() => step(-1)}
                      aria-label="Anterior"
                      className="absolute left-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-ink/60 text-ivory"
                    >
                      <ChevronLeft className="size-5" />
                    </button>
                    <button
                      onClick={() => step(1)}
                      aria-label="Siguiente"
                      className="absolute right-2 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-full bg-ink/60 text-ivory"
                    >
                      <ChevronRight className="size-5" />
                    </button>
                    <div className="mt-4 flex justify-center gap-1.5">
                      {allMedia.map((m, i) => (
                        <span key={m.id} className={`h-1 rounded-full transition-all ${i === index ? "w-5 bg-ivory" : "w-1 bg-ivory/40"}`} />
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className="max-w-xs text-center font-serif text-[14px] text-ivory/70">
                Aún no hay fotos ni videos de clientas con esta pieza.
              </p>
            )}
          </div>

          {reviews.length > 0 && (
            <div className="max-h-[28svh] overflow-y-auto border-t border-ivory/15 px-5 py-4">
              {reviews.slice(0, 6).map((r: any) => (
                <div key={r.id} className="border-b border-ivory/10 py-3 last:border-0">
                  <div className="flex items-center gap-2 text-ivory/80">
                    <span className="inline-flex items-center gap-[2px]">
                      {[1, 2, 3, 4, 5].map((i) => (
                        <Star key={i} className={`size-3 ${i <= (r.rating ?? 0) ? "fill-ivory text-ivory" : "text-ivory/25"}`} strokeWidth={1} />
                      ))}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em]">
                      {[r.author_name, r.city].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  {r.body && <p className="mt-1 font-serif text-[13px] text-ivory/70">{r.body}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
