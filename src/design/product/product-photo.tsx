import { useEffect, useRef, useState, type ImgHTMLAttributes } from "react";
import { optimizedImageUrl } from "@/lib/media";

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & { src: string };

/** Responsive catalog thumbnails; original remains available if the CDN cannot transform it. */
export function ProductPhoto({ src, sizes = "(max-width: 767px) calc((100vw - 56px) / 2), calc((100vw - 104px) / 3)", onError, ...props }: Props) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [nearViewport, setNearViewport] = useState(false);
  const eager = props.loading === "eager";
  // Native lazy loading can fetch several screens at once on slow connections.
  // Limit offscreen downloads so the visible photos get bandwidth first.
  useEffect(() => {
    if (eager || nearViewport) return;
    const image = imageRef.current;
    if (!image) return;
    if (typeof IntersectionObserver === "undefined") {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setNearViewport(true);
        observer.disconnect();
      }
    }, { rootMargin: "400px" });
    observer.observe(image);
    return () => observer.disconnect();
  }, [eager, nearViewport]);
  const load = eager || nearViewport;
  const optimized = optimizedImageUrl(src, 800) ?? src;
  const resize = optimized !== src && failedSource !== src;
  return (
    <img
      {...props}
      ref={imageRef}
      src={load ? (resize ? optimized : src) : undefined}
      srcSet={load && resize ? [240, 320, 360, 480, 640, 800, 1000, 1280].map((width) => `${optimizedImageUrl(src, width)} ${width}w`).join(", ") : undefined}
      sizes={resize ? sizes : undefined}
      loading={load ? "eager" : "lazy"}
      decoding="async"
      onError={(event) => {
        if (resize) setFailedSource(src);
        else onError?.(event);
      }}
    />
  );
}