import { useEffect, useRef } from "react";
import { posterUrlFor } from "@/lib/media";

type Props = React.VideoHTMLAttributes<HTMLVideoElement> & { src?: string | null; priority?: boolean };

/** Video que solo carga y reproduce cuando entra en viewport; se pausa al salir. */
export function AutoVideo({ src, className, style, poster, priority = false, ...rest }: Props) {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !src) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (!el.currentSrc) el.load();
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { rootMargin: priority ? "600px 100%" : "600px 0px", threshold: 0.01 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [priority, src]);

  const isQuickTime = Boolean(src && /\.mov(\?|$)/i.test(src));

  return (
    <video
      ref={ref}
      className={className}
      style={style}
      poster={poster ?? posterUrlFor(src)}

      muted
      loop
      playsInline
      preload={priority ? "auto" : "metadata"}
      autoPlay={priority}
      disablePictureInPicture
      {...rest}
    >
      {/* Declarar el tipo evita que respuestas parciales del CDN tratadas como octet-stream se rechacen. */}
      {src && <source src={src} type="video/mp4" />}
      {src && isQuickTime && <source src={src} type="video/quicktime" />}
    </video>
  );
}
