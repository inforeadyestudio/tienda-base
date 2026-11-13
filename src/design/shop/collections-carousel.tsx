import {
  AnimatePresence,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useSpring,
  useTransform,
  useVelocity,
  wrap,
  type MotionValue,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";

const PLANE_WIDTH = 320;
const PLANE_GAP = -80;

const SCRAMBLE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Efecto scramble ligero (sin dependencias externas). */
function ScrambleText({ children }: { children: string }) {
  const [text, setText] = useState(children);
  useEffect(() => {
    let frame = 0;
    const id = window.setInterval(() => {
      frame += 1;
      const revealed = Math.floor(frame / 2);
      setText(
        children
          .split("")
          .map((ch, i) =>
            i < revealed || ch === " "
              ? ch
              : SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)],
          )
          .join(""),
      );
      if (revealed >= children.length) window.clearInterval(id);
    }, 30);
    return () => window.clearInterval(id);
  }, [children]);
  return <>{text}</>;
}

export type CarouselCollection = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  cover_url: string | null;
};

function Plane({
  index,
  total,
  item,
  scrollX,
  scrollVelocity,
  isHovered,
  onHoverStart,
  onHoverEnd,
}: {
  index: number;
  total: number;
  item: CarouselCollection;
  scrollX: MotionValue<number>;
  scrollVelocity: MotionValue<number>;
  isHovered: boolean;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}) {
  const hoverOffset = useSpring(0, { stiffness: 400, damping: 25 });
  const planeWidth = PLANE_WIDTH + PLANE_GAP;
  const totalWidth = planeWidth * total;
  const startPosition = index * planeWidth;

  const waveOffset = useSpring(0, { stiffness: 300, damping: 20, mass: 0.3 });

  useMotionValueEvent(scrollVelocity, "change", (velocity) => {
    const pos = startPosition + scrollX.get();
    const centered = wrap(-totalWidth / 2, totalWidth / 2, pos);
    const normalizedPos = centered / (totalWidth / 2);
    const wavePhase = Math.sin(normalizedPos * Math.PI * 2);
    waveOffset.set((velocity / 50) * wavePhase * 5);
  });

  useEffect(() => {
    hoverOffset.set(isHovered ? -30 : 0);
  }, [isHovered, hoverOffset]);

  const transform = useTransform(() => {
    const pos = startPosition + scrollX.get();
    const centered = wrap(-totalWidth / 2, totalWidth / 2, pos);
    const yOffset = centered * -0.35 + waveOffset.get() + hoverOffset.get();
    const zOffset = centered * -1.2;
    return `translate3d(${centered}px, ${yOffset}px, ${zOffset}px) rotateY(-50deg)`;
  });

  return (
    <motion.div
      className="cc-plane"
      style={{ transform, filter: isHovered ? "brightness(1.1)" : "brightness(0.85)" }}
      onHoverStart={onHoverStart}
      onHoverEnd={onHoverEnd}
    >
      <Link
        to="/coleccion/$slug"
        params={{ slug: item.slug }}
        className="cc-plane-image-container"
        aria-label={item.title}
      >
        {item.cover_url ? (
          <img src={item.cover_url} alt={item.title} loading="lazy" className="cc-plane-image" draggable={false} />
        ) : (
          <div className="cc-plane-fallback">{item.title}</div>
        )}
      </Link>

      <p className="cc-plane-index">{String(index + 1).padStart(2, "0")}</p>

      <AnimatePresence>
        {isHovered && (
          <motion.div
            className="cc-label-container"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <motion.div
              className="cc-label-line"
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              exit={{ scaleX: 0 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
            />
            <div className="cc-label-text">
              <ScrambleText>{item.title.toUpperCase()}</ScrambleText>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function CollectionsCarousel({ items }: { items: CarouselCollection[] }) {
  const rawScrollX = useMotionValue(0);
  const scrollX = useSpring(rawScrollX, { stiffness: 100, damping: 30, mass: 0.5 });
  const scrollVelocity = useVelocity(scrollX);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const planes = items.length >= 10 ? items : Array.from({ length: Math.max(items.length * 3, 12) }, (_, i) => items[i % items.length]);
  const total = planes.length;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const raw = e.deltaX !== 0 ? e.deltaX : e.deltaY;
      const delta = raw * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
      rawScrollX.set(rawScrollX.get() - delta);
    };
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [rawScrollX]);

  return (
    <motion.section
      ref={containerRef}
      className="cc-container"
      drag="x"
      dragMomentum={false}
      dragConstraints={{ left: 0, right: 0 }}
      onDrag={(_, info) => rawScrollX.set(rawScrollX.get() + info.delta.x * 2.5)}
    >
      <header className="cc-header">
        <h1 className="cc-title">Colecciones</h1>
        <p className="cc-title cc-title-collection">
          Tu Marca<span className="cc-title-count">({items.length})</span>
        </p>
      </header>

      <p className="cc-hint">scroll o arrastra para navegar</p>

      <div className="cc-viewport">
        <div className="cc-planes-container">
          {planes.map((item, i) => (
            <Plane
              key={`${item.id}-${i}`}
              index={i}
              total={total}
              item={item}
              scrollX={scrollX}
              scrollVelocity={scrollVelocity}
              isHovered={hoveredIndex === i}
              onHoverStart={() => setHoveredIndex(i)}
              onHoverEnd={() => setHoveredIndex(null)}
            />
          ))}
        </div>
      </div>
      <Stylesheet />
    </motion.section>
  );
}

function Stylesheet() {
  return (
    <style>{`
      .cc-container {
        position: relative;
        width: 100%;
        height: 82vh;
        min-height: 560px;
        overflow: hidden;
        background: #f9f4e6;
        touch-action: none;
        cursor: grab;
      }
      .cc-container:active { cursor: grabbing; }
      .cc-header {
        position: absolute;
        z-index: 50;
        top: 4vh;
        left: 3vw;
        pointer-events: none;
      }
      .cc-title {
        color: #0b0b0b;
        font-size: clamp(32px, 5vw, 64px);
        line-height: 0.9;
        font-weight: 400;
        letter-spacing: -0.02em;
        margin: 0;
        margin-left: 4vw;
      }
      .cc-title-collection { margin-left: 0; }
      .cc-title-count {
        font-size: 12px;
        font-weight: 600;
        letter-spacing: normal;
        font-variant-numeric: tabular-nums;
        margin-left: 6px;
        position: relative;
        top: 0.65em;
        vertical-align: top;
        line-height: 0;
      }
      .cc-hint {
        position: absolute;
        z-index: 50;
        bottom: 3vh;
        right: 3vw;
        font-size: 10px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: rgba(11,11,11,0.6);
      }
      .cc-viewport {
        position: relative;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        perspective: 2000px;
        perspective-origin: 10% 10%;
      }
      .cc-planes-container {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        transform-style: preserve-3d;
        transform: translateY(80px);
      }
      .cc-plane {
        width: ${PLANE_WIDTH}px;
        height: 420px;
        position: absolute;
        transform-style: preserve-3d;
        box-shadow: 0 25px 50px -12px rgba(0,0,0,0.18);
        transition: filter 0.2s ease;
      }
      .cc-plane-image-container { position: absolute; inset: 0; overflow: hidden; display: block; }
      .cc-plane-image { width: 100%; height: 100%; object-fit: cover; }
      .cc-plane-fallback {
        width: 100%; height: 100%;
        display: flex; align-items: center; justify-content: center;
        background: #17181a; color: rgba(249,244,230,0.6);
        font-style: italic; font-size: 22px; padding: 16px; text-align: center;
      }
      .cc-plane-index {
        position: absolute; top: -24px; left: 0; margin: 0;
        color: rgba(11,11,11,0.6);
        font-size: 10px; letter-spacing: 0.14em;
      }
      .cc-label-container {
        position: absolute; display: flex; align-items: center;
        pointer-events: none; left: 100%; top: 50%; margin-left: 12px;
      }
      .cc-label-line { width: 120px; height: 1px; background-color: #0b0b0b; transform-origin: left; }
      .cc-label-text {
        padding: 4px 8px; white-space: nowrap; text-transform: uppercase;
        color: #0b0b0b; font-size: 10px; letter-spacing: 0.14em;
      }
      @media (max-width: 768px) {
        .cc-plane { width: 220px; height: 300px; }
      }
    `}</style>
  );
}
