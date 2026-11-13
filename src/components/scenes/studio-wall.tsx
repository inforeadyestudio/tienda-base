import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import notebookWall from "@/assets/vintage-notebook-wall-subtle.jpg";
import { Media } from "./scene-shell";
import { selectedProductsQuery, type CarouselProduct } from "./product-carousel";
import { formatCOP } from "@/lib/format";
import type { Layer, SceneContext } from "@/lib/scenes/types";
import { cn } from "@/lib/utils";

export const WALL_BG = notebookWall;

export type WallSlot = {
  id: string;
  kind: "image" | "video" | "product" | "empty";
  url?: string;
  productId?: string;
  href?: string;
  fit?: "cover" | "contain";
};

/** Espacios editables medidos sobre el cuaderno vintage (porcentajes del fondo). */
export const WALL_LAYOUT: Array<{ id: string; label: string; x: number; y: number; w: number; h: number; frame: "acrylic" | "sleeve" | "paper" }> = [
  { id: "s1", label: "Izquierda superior", x: 7.7, y: 19.3, w: 18, h: 24.2, frame: "paper" },
  { id: "s2", label: "Izquierda inferior", x: 7.7, y: 49.9, w: 16.6, h: 29.2, frame: "paper" },
  { id: "s3", label: "Centro superior", x: 28.9, y: 13.7, w: 18.4, h: 24.1, frame: "paper" },
  { id: "s4", label: "Centro inferior grande", x: 28.3, y: 48.4, w: 17.1, h: 36, frame: "paper" },
  { id: "s5", label: "Derecha principal", x: 53.6, y: 15.4, w: 19.2, h: 46.1, frame: "paper" },
  { id: "s6", label: "Derecha inferior", x: 53.6, y: 68.9, w: 19.5, h: 15.4, frame: "paper" },
  { id: "s7", label: "Derecha superior doble", x: 76.3, y: 18.6, w: 19.6, h: 27.8, frame: "paper" },
];

/** Ficha de texto tipo "OPENING / A study on…" */
const CARD = { x: 75.3, y: 51.1, w: 20.5, h: 24 };

export function newWallSlots(): WallSlot[] {
  return WALL_LAYOUT.map((s) => ({ id: s.id, kind: "empty" as const, fit: "cover" as const }));
}

const FRAME: Record<string, string> = {
  acrylic: "shadow-[0_2px_12px_color-mix(in_oklab,var(--ink)_16%,transparent)]",
  paper: "shadow-[0_2px_12px_color-mix(in_oklab,var(--ink)_16%,transparent)]",
  sleeve: "shadow-[0_2px_12px_color-mix(in_oklab,var(--ink)_16%,transparent)]",
};

function Slot({
  slot,
  frame,
  product,
}: {
  slot: WallSlot;
  frame: string;
  product?: CarouselProduct;
}) {
  if (slot.kind === "empty" || (slot.kind !== "product" && !slot.url) || (slot.kind === "product" && !product)) {
    return null;
  }

  const url =
    slot.kind === "product"
      ? product?.hero_image_url ?? product?.product_images?.[0]?.url ?? ""
      : slot.url;

  const price =
    slot.kind === "product"
      ? Math.min(...((product?.product_variants ?? []).map((v) => v.price_cop).filter(Boolean) as number[]))
      : NaN;

  const inner = (
    <div className={cn("relative w-full h-full overflow-hidden group", FRAME[frame] ?? FRAME.paper)}>
      <div className="relative w-full h-full overflow-hidden">
        <Media url={url} alt={product?.name} className={cn("w-full h-full", slot.fit === "contain" ? "object-contain" : "object-cover")} />
        {slot.kind === "product" && product && (
          <span className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-ink/70 to-transparent text-ivory opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="block font-nm text-[10px] uppercase tracking-[0.16em] truncate">{product.name}</span>
            {Number.isFinite(price) && <span className="block text-[11px] opacity-85">{formatCOP(price)}</span>}
          </span>
        )}
      </div>
    </div>
  );

  if (slot.kind === "product" && product) {
    return (
      <Link to="/producto/$slug" params={{ slug: product.slug }} className="block w-full h-full">
        {inner}
      </Link>
    );
  }
  if (slot.href) {
    return slot.href.startsWith("http") ? (
      <a href={slot.href} target="_blank" rel="noreferrer" className="block w-full h-full">{inner}</a>
    ) : (
      <Link to={slot.href as any} className="block w-full h-full">{inner}</Link>
    );
  }
  return inner;
}

function TextCard({ props, className }: { props: Record<string, any>; className?: string }) {
  const font = props.cardFont === "serif" ? "font-serif" : props.cardFont === "sans" ? "font-sans" : "font-nm";
  if (!props.cardTitle && !props.cardEyebrow && !props.cardBody) return null;
  return (
    <div className={cn("p-[9%] text-ink overflow-hidden", font, className)}>
      {props.cardEyebrow && (
        <p className="text-[clamp(7px,0.55vw,11px)] uppercase tracking-[0.18em] leading-[1.5] whitespace-pre-line">{props.cardEyebrow}</p>
      )}
      {props.cardTitle && (
        <h3 className="mt-[12%] text-[clamp(7px,0.6vw,12px)] uppercase tracking-[0.14em] leading-[1.5]">{props.cardTitle}</h3>
      )}
      {props.cardBody && (
        <p className="mt-[10%] text-[clamp(6px,0.45vw,10px)] leading-[1.7] opacity-70 whitespace-pre-line">{props.cardBody}</p>
      )}
    </div>
  );
}

/** Cuaderno editorial vintage con imágenes y productos seleccionables. */
export function StudioWallScene({ props }: { props: Record<string, any>; layers: Layer[]; ctx: SceneContext }) {
  const slots: WallSlot[] = useMemo(() => {
    const stored: WallSlot[] = Array.isArray(props.slots) ? props.slots : [];
    return WALL_LAYOUT.map((l) => stored.find((s) => s.id === l.id) ?? { id: l.id, kind: "empty" as const });
  }, [props.slots]);

  const productIds = slots.filter((s) => s.kind === "product" && s.productId).map((s) => s.productId!) as string[];
  const { data: products } = useQuery(selectedProductsQuery(productIds));
  const byId = new Map((products ?? []).map((p) => [p.id, p]));

  const bg = props.background || WALL_BG;
  const overlay = Number(props.overlay ?? 0);
  // Las piezas solo aparecen cuando el cuaderno ya cargó, para que todo salga junto.
  const [bgReady, setBgReady] = useState(false);

  return (
    <section className={cn("relative w-full bg-shell", props.hideOnMobile && "hidden md:block")}>
      {/* Desktop: composición fija sobre el cuaderno abierto, fondo beige. */}
      <div className="relative hidden md:block w-full overflow-hidden bg-shell" style={{ aspectRatio: "16 / 9" }}>
        <img
          src={bg}
          alt=""
          loading="eager"
          fetchPriority="high"
          decoding="async"
          onLoad={() => setBgReady(true)}
          className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", bgReady ? "opacity-100" : "opacity-0")}
        />
        <div className={cn("absolute inset-0 transition-opacity duration-300", bgReady ? "opacity-100" : "opacity-0")}>
        {overlay > 0 && <div className="absolute inset-0 bg-ink" style={{ opacity: overlay }} />}
        {WALL_LAYOUT.map((l) => {
          const slot = slots.find((s) => s.id === l.id)!;
          return (
            <div
              key={l.id}
              className="absolute"
              style={{ left: `${l.x}%`, top: `${l.y}%`, width: `${l.w}%`, height: `${l.h}%` }}
            >
              <Slot slot={slot} frame={l.frame} product={slot.productId ? byId.get(slot.productId) : undefined} />
            </div>
          );
        })}
        <div className="absolute" style={{ left: `${CARD.x}%`, top: `${CARD.y}%`, width: `${CARD.w}%`, height: `${CARD.h}%` }}>
          <TextCard props={props} className="w-full h-full" />
        </div>
        </div>
      </div>

      {/* Móvil: misma pared, piezas apiladas sobre cuaderno con fondo beige */}
      <div
        className="md:hidden relative w-full px-6 py-10 space-y-6 bg-shell"
        style={{ backgroundImage: `url(${typeof bg === "string" && !/\.(mp4|webm|mov|m4v)(\?|$)/i.test(bg) ? bg : WALL_BG})`, backgroundSize: "cover", backgroundPosition: "center" }}
      >
        {WALL_LAYOUT.map((l) => {
          const slot = slots.find((s) => s.id === l.id)!;
          if (slot.kind === "empty") return null;
          const tall = l.h > 45;
          return (
            <div key={l.id} className={tall ? "aspect-[3/4]" : "aspect-[4/5]"}>
              <Slot slot={slot} frame={l.frame} product={slot.productId ? byId.get(slot.productId) : undefined} />
            </div>
          );
        })}
        <TextCard props={props} className="w-full" />
      </div>
    </section>
  );
}
