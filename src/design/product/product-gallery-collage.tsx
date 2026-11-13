import { useState } from "react";
import { AutoVideo } from "@/components/media/auto-video";
import type { JourneyMedia } from "@/lib/journey";
import { cn } from "@/lib/utils";

/**
 * Galería editorial tipo collage (solo desktop):
 * portada a ancho completo → dos columnas → una grande → dos columnas…
 * Las piezas horizontales siempre ocupan el ancho completo y se muestran tal cual.
 */
export function ProductGalleryCollage({ media, productName }: { media: JourneyMedia[]; productName: string }) {
  // Piezas detectadas como horizontales (ancho > alto) tras cargar.
  const [wide, setWide] = useState<Record<number, boolean>>({});

  /** Patrón base: 0 → grande, 1-2 → pareja, 3 → grande, 4-5 → pareja… */
  const patternFull = (i: number) => i === 0 || (i - 1) % 3 === 2;

  const spans = media.map((_, i) => patternFull(i) || !!wide[i]);
  // Una pieza a media columna sin compañera pasa a ancho completo.
  for (let i = 0; i < spans.length; i++) {
    if (spans[i]) continue;
    const prevHalf = i > 0 && !spans[i - 1];
    const nextHalf = i + 1 < spans.length && !spans[i + 1];
    if (!prevHalf && !nextHalf) spans[i] = true;
  }

  const mark = (i: number, w: number, h: number) => {
    if (!w || !h) return;
    const isWide = w > h;
    setWide((prev) => (prev[i] === isWide ? prev : { ...prev, [i]: isWide }));
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      {media.map((m, i) => (
        <figure
          key={`${m.url}-${i}`}
          className={cn("overflow-hidden bg-[#f5efe4]", spans[i] ? "col-span-2" : "col-span-1")}
        >
          {m.type === "video" ? (
            <AutoVideo
              src={m.url}
              priority={i === 1}
              onLoadedMetadata={(e) => mark(i, e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
              className={spans[i] ? "w-full h-auto" : "h-full w-full object-cover"}
            />
          ) : (
            <img
              src={m.url}
              alt={m.alt ?? `${productName} ${i + 1}`}
              loading={i === 0 ? "eager" : "lazy"}
              onLoad={(e) => mark(i, e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
              className={spans[i] ? "w-full h-auto object-contain" : "h-full w-full object-cover"}
            />
          )}
        </figure>
      ))}
    </div>
  );
}
