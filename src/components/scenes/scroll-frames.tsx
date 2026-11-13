import { forwardRef, useEffect, useImperativeHandle, useRef, type CSSProperties } from "react";
import frames from "@/assets/scroll-frames.json";

// Secuencias de fotogramas para los videos que avanzan con el scroll.
// Dibujar imágenes en un lienzo es estable en iPhone, Android y computador;
// buscar fotogramas dentro de un <video> congela o borra la imagen en Safari.

type FrameSet = { w: number; h: number; name: string; ids: string[] };
type Manifest = Record<string, { sets: Record<string, FrameSet> }>;
const MANIFEST = frames as Manifest;

// Para agregar una secuencia: sube sus fotogramas a public/scroll-frames/<id>/,
// registra su manifiesto en scroll-frames.json y reconoce aquí la URL de su video.
export type FrameSequenceKey = string;

export function frameSequenceFor(url?: string | null): FrameSequenceKey | null {
  if (!url) return null;
  return null;
}

const urlFor = (set: FrameSet, i: number) =>
  `/scroll-frames/${set.ids[i]}/${set.name}${String(i).padStart(3, "0")}.webp`;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export type ScrollFramesHandle = { draw: (progress: number) => void };

type Props = {
  sequence: FrameSequenceKey;
  desktopSet: string;
  mobileSet: string;
  /** Posición horizontal del recorte (0 izquierda, 1 derecha). */
  desktopPosX?: number;
  mobilePosX?: number;
  posY?: number;
  className?: string;
  style?: CSSProperties;
};

export const ScrollFrames = forwardRef<ScrollFramesHandle, Props>(function ScrollFrames(
  { sequence, desktopSet, mobileSet, desktopPosX = 0.5, mobilePosX = 0.5, posY = 0.5, className, style },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const s = useRef({
    set: null as FrameSet | null,
    images: [] as Array<HTMLImageElement | undefined>,
    progress: 0,
    drawn: -1,
    dirty: true,
    posX: 0.5,
    posY: 0.5,
  });

  const target = () => {
    const set = s.current.set;
    return set ? Math.round(clamp01(s.current.progress) * (set.ids.length - 1)) : 0;
  };

  const paint = () => {
    const st = s.current;
    const canvas = canvasRef.current;
    const set = st.set;
    if (!canvas || !set || canvas.width === 0) return;
    const n = set.ids.length;
    const t = target();
    let idx = -1;
    for (let d = 0; d < n && idx < 0; d++) {
      if (t - d >= 0 && st.images[t - d]) idx = t - d;
      else if (t + d < n && st.images[t + d]) idx = t + d;
    }
    if (idx < 0 || (idx === st.drawn && !st.dirty)) return;
    const img = st.images[idx]!;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const cw = canvas.width;
    const ch = canvas.height;
    const scale = Math.max(cw / set.w, ch / set.h);
    const dw = set.w * scale;
    const dh = set.h * scale;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (cw - dw) * st.posX, (ch - dh) * st.posY, dw, dh);
    st.drawn = idx;
    st.dirty = false;
  };

  useImperativeHandle(ref, () => ({
    draw(progress: number) {
      s.current.progress = progress;
      paint();
    },
  }), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const mq = window.matchMedia("(min-width: 768px)");
    let cancelled = false;
    let queue: number[] = [];
    let active = 0;
    let started = false;
    const MAX = 6;

    const pump = () => {
      const st = s.current;
      const set = st.set;
      while (!cancelled && set && active < MAX && queue.length) {
        const i = queue.shift()!;
        if (st.images[i]) continue;
        active++;
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          active--;
          if (cancelled || s.current.set !== set) return;
          st.images[i] = img;
          // Redibujar si este fotograma queda más cerca del que pide el scroll.
          const t = target();
          if (st.drawn < 0 || Math.abs(i - t) < Math.abs(st.drawn - t)) {
            st.dirty = true;
            paint();
          }
          pump();
        };
        img.onerror = () => {
          active--;
          pump();
        };
        img.src = urlFor(set, i);
      }
    };

    const buildQueue = (n: number) => {
      const order: number[] = [];
      const seen = new Set<number>();
      const add = (i: number) => {
        if (i >= 0 && i < n && !seen.has(i)) {
          seen.add(i);
          order.push(i);
        }
      };
      add(target());
      add(0);
      // Primero fotogramas repartidos y luego se rellenan los huecos.
      for (const step of [32, 16, 8, 4, 2, 1]) for (let i = 0; i < n; i += step) add(i);
      return order;
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        s.current.dirty = true;
        paint();
      }
    };

    const choose = () => {
      const key = mq.matches ? desktopSet : mobileSet;
      const set = MANIFEST[sequence]?.sets[key] ?? null;
      const st = s.current;
      st.posX = mq.matches ? desktopPosX : mobilePosX;
      st.posY = posY;
      if (st.set !== set) {
        st.set = set;
        st.images = [];
        st.drawn = -1;
      }
      // Los fotogramas ya cargados se saltan en pump().
      queue = set ? buildQueue(set.ids.length) : [];
      st.dirty = true;
      resize();
      paint();
      if (started) pump();
    };

    choose();
    // Empezar a descargar solo cuando la escena se acerca a la pantalla.
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !started) {
        started = true;
        pump();
      }
    }, { rootMargin: "150% 0px" });
    io.observe(canvas);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    mq.addEventListener("change", choose);
    return () => {
      cancelled = true;
      io.disconnect();
      ro.disconnect();
      mq.removeEventListener("change", choose);
    };
  }, [sequence, desktopSet, mobileSet, desktopPosX, mobilePosX, posY]);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} style={style} />;
});
