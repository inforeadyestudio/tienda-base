import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export type BoardItem = {
  key: string;
  title: string;
  subtitle?: string | null;
  cover: string | null;
  to: "/coleccion/$slug" | "/tipo/$slug";
  slug: string;
  /** "oval" recorta la portada en óvalo; "rect" la deja rectangular. */
  shape?: "oval" | "rect";
};

const CELL_W = 340;
const CELL_H = 460;
const GAP = 48;
const COLS = 4;

const mod = (n: number, m: number) => ((n % m) + m) % m;

export function InfiniteBoard({ items }: { items: BoardItem[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const offset = useRef({ x: 0, y: 0 });
  const velocity = useRef({ x: 0, y: 0 });
  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0, t: 0 });
  const moved = useRef(0);
  const [, force] = useState(0);
  const [size, setSize] = useState({ w: 1200, h: 800 });
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const tick = useCallback(() => {
    const v = velocity.current;
    if (Math.abs(v.x) < 0.05 && Math.abs(v.y) < 0.05) {
      v.x = 0;
      v.y = 0;
      return;
    }
    offset.current.x += v.x;
    offset.current.y += v.y;
    v.x *= 0.94;
    v.y *= 0.94;
    force((n) => n + 1);
    requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el || reduced) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      offset.current.x -= e.deltaX;
      offset.current.y -= e.deltaY;
      force((n) => n + 1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [reduced]);

  if (reduced) {
    return (
      <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-6 pb-24 pt-8 md:grid-cols-3">
        {items.map((item) => (
          <BoardCard key={item.key} item={item} />
        ))}
      </div>
    );
  }

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    moved.current = 0;
    velocity.current = { x: 0, y: 0 };
    last.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;
    const dt = Math.max(1, performance.now() - last.current.t);
    offset.current.x += dx;
    offset.current.y += dy;
    velocity.current = { x: (dx / dt) * 14, y: (dy / dt) * 14 };
    moved.current += Math.abs(dx) + Math.abs(dy);
    last.current = { x: e.clientX, y: e.clientY, t: performance.now() };
    force((n) => n + 1);
  };
  const endDrag = () => {
    if (!dragging.current) return;
    dragging.current = false;
    requestAnimationFrame(tick);
  };

  const stepX = CELL_W + GAP;
  const stepY = CELL_H + GAP;
  const startCol = Math.floor(-offset.current.x / stepX) - 1;
  const endCol = startCol + Math.ceil(size.w / stepX) + 2;
  const startRow = Math.floor(-offset.current.y / stepY) - 1;
  const endRow = startRow + Math.ceil(size.h / stepY) + 2;

  const cells: Array<{ col: number; row: number; item: BoardItem; index: number }> = [];
  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      const index = mod(row * COLS + col * 3, items.length);
      cells.push({ col, row, item: items[index], index });
    }
  }

  return (
    <div
      ref={wrapRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={endDrag}
      onClickCapture={(e) => {
        if (moved.current > 8) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      className="relative h-[calc(100svh-96px)] w-full cursor-grab touch-none overflow-hidden active:cursor-grabbing"
    >
      {cells.map(({ col, row, item, index }) => {
        const stagger = mod(col, 2) === 0 ? 0 : stepY / 2;
        const x = col * stepX + offset.current.x;
        const y = row * stepY + stagger + offset.current.y;
        return (
          <div
            key={`${col}:${row}`}
            className="absolute left-0 top-0 will-change-transform"
            style={{ transform: `translate3d(${x}px, ${y}px, 0)`, width: CELL_W }}
          >
            <BoardCard item={item} index={index} />
          </div>
        );
      })}
    </div>
  );
}

function BoardCard({ item, index }: { item: BoardItem; index?: number }) {
  const oval = (item.shape ?? "oval") === "oval";
  return (
    <Link to={item.to} params={{ slug: item.slug }} className="group block" draggable={false}>
      {typeof index === "number" && (
        <span className="mb-2 block text-[10px] tracking-[0.3em] text-moss/50">
          {String(index + 1).padStart(2, "0")}
        </span>
      )}
      <div className={`relative aspect-[3/4] overflow-hidden bg-cream ${oval ? "rounded-[50%]" : ""}`}>
        {item.cover ? (
          <img
            src={item.cover}
            alt={item.title}
            loading="lazy"
            draggable={false}
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center px-6 text-center font-serif text-2xl italic text-moss/50">
            {item.title}
          </div>
        )}
        {/* El nombre va sobre la foto, en su parte baja. En óvalo se sube un poco
            para que el recorte no se coma las esquinas y se apoya en una pastilla
            oscura: así se lee igual sobre fotos claras. */}
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 flex justify-center px-5",
            oval ? "bottom-[17%]" : "bottom-3",
          )}
        >
          <span
            className={cn(
              "rounded-full bg-ink/75 px-4 py-1.5 text-center font-nm text-[10px] uppercase leading-snug tracking-[0.2em] text-ivory backdrop-blur-sm",
              oval ? "max-w-[62%]" : "max-w-[88%]",
            )}
          >
            {item.title}
          </span>
        </div>
      </div>
    </Link>
  );
}
