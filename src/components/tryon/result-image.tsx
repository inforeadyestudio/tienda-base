import { useState } from "react";

export function TryOnResultImage({ src, alt, className, fallbackSrc }: { src: string; alt: string; className: string; fallbackSrc?: string }) {
  return <ResultImage key={src} src={src} alt={alt} className={className} fallbackSrc={fallbackSrc} />;
}

function ResultImage({ src, alt, className, fallbackSrc }: { src: string; alt: string; className: string; fallbackSrc?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed || !src) return fallbackSrc
    ? <img src={fallbackSrc} alt="Inspiración para nuevos looks" loading="lazy" className={className} />
    : <div className={`${className} flex items-center justify-center bg-cream p-3 text-center text-xs text-moss`}>Imagen no disponible</div>;
  return <img src={src} alt={alt} loading="lazy" className={className} onError={() => setFailed(true)} />;
}