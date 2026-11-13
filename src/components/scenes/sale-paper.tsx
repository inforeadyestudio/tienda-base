import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, useMotionValue, useSpring, useReducedMotion } from "motion/react";
import { Button } from "@/components/ui/button";
import { selectedProductsQuery } from "./product-carousel";
import { cachedImageBounds, imageBounds, type ImageBounds } from "@/lib/scenes/alpha-bounds";
import { salePhotoSize, saleProductIds, saleStripImage, stripImageBox } from "@/lib/scenes/sale-paper";
import type { SceneContext } from "@/lib/scenes/types";
import top from "@/assets/sale-paper/top.png";
import strip1 from "@/assets/sale-paper/strip-1.png";
import strip2 from "@/assets/sale-paper/strip-2.png";
import strip3 from "@/assets/sale-paper/strip-3.png";
import strip4 from "@/assets/sale-paper/strip-4.png";
import strip5 from "@/assets/sale-paper/strip-5.png";
import strip6 from "@/assets/sale-paper/strip-6.png";
import logo from "@/assets/footer-marca-logo.png";
const pieces = [
  { url: strip1, x: 162, y: 528, w: 119, h: 374, tilt: 0 },
  { url: strip2, x: 280, y: 530, w: 121, h: 370, tilt: 0 },
  { url: strip3, x: 399, y: 532, w: 100, h: 369, tilt: 0 },
  { url: strip4, x: 497, y: 533, w: 99, h: 368, tilt: 0 },
  { url: strip5, x: 593, y: 535, w: 114, h: 356, tilt: 0 },
  { url: strip6, x: 671, y: 565, w: 118, h: 370, tilt: -22 },
];
const PaperButton = motion.create(Button);

/** Rectángulo real de la silueta de una foto recortada; undefined mientras se mide. */
function useTrim(url?: string): ImageBounds | null | undefined {
  const [bounds, setBounds] = useState<ImageBounds | null | undefined>(() => (url ? cachedImageBounds(url) : undefined));
  useEffect(() => {
    if (!url) { setBounds(null); return; }
    const cached = cachedImageBounds(url);
    if (cached !== undefined) { setBounds(cached); return; }
    let alive = true;
    void imageBounds(url).then((result) => { if (alive) setBounds(result); });
    return () => { alive = false; };
  }, [url]);
  return bounds;
}

function HangingStrip({ index, image, name, size }: { index: number; image?: string; name?: string; size: number }) {
  const piece = pieces[index];
  const reduced = useReducedMotion();
  const target = useMotionValue(piece.tilt);
  const rotate = useSpring(target, { stiffness: 105, damping: 8, mass: 0.8 });
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { clearTimeout(timer.current); }, []);
  useEffect(() => { target.set(piece.tilt); }, [reduced, target, piece.tilt]);
  const pulse = () => {
    if (reduced) return;
    target.set(piece.tilt + 6);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => target.set(piece.tilt), 160);
  };
  const bounds = useTrim(image);
  const box = bounds ? stripImageBox(piece, bounds, size) : null;
  const photoStyle: CSSProperties | undefined = box ? { left: `${box.left}%`, top: `${box.top}%`, width: `${box.width}%`, height: `${box.height}%`, objectFit: "fill" } : undefined;
  return <PaperButton type="button" variant="ghost" className="sale-paper-strip"
    aria-label={`Balancear tira ${index + 1}${name ? ` · ${name}` : ""}`}
    style={{ left: `${piece.x / 10.24}%`, top: `${piece.y / 10.24}%`, width: `${piece.w / 10.24}%`, height: `${piece.h / 10.24}%`, rotate: reduced ? piece.tilt : rotate }}
    onPointerMove={(e) => {
      if (reduced || e.pointerType !== "mouse") return;
      const rect = e.currentTarget.getBoundingClientRect();
      target.set(piece.tilt + Math.max(-5, Math.min(5, ((e.clientX - rect.left) / rect.width - 0.5) * 10)));
    }} onPointerLeave={() => target.set(piece.tilt)} onBlur={() => target.set(piece.tilt)} onClick={pulse}>
    <img src={piece.url} alt="" className="sale-paper-texture" draggable={false} />
    <span className="sale-paper-number" aria-hidden="true">{index + 1})</span>
    <div className="sale-paper-print-area">
      {image && <img src={image} alt={name ?? `Imagen de la tira ${index + 1}`} className="sale-paper-product" style={photoStyle} draggable={false} />}
    </div>
  </PaperButton>;
}
export function SalePaperScene({ props }: { props: Record<string, any>; ctx: SceneContext }) {
  const ids = saleProductIds(props.saleProductIds);
  const { data: products } = useQuery(selectedProductsQuery(ids));
  const bg = typeof props.saleBg === "string" && /^#[0-9a-f]{6}$/i.test(props.saleBg) ? props.saleBg : undefined;
  const size = salePhotoSize(props.salePhotoSize);
  return <section className={`sale-paper-section${props.hideOnMobile ? " hidden md:flex" : ""}`} style={{ "--sale-paper-background": bg } as CSSProperties} aria-label="Sale Tu Marca">
    <div className="sale-paper-canvas">
      <div className="sale-paper-header">
        <img src={top} alt="" className="sale-paper-texture" draggable={false} />
        <div className="sale-paper-print">
          <h2 className="sale-paper-title">{String(props.saleTitle ?? "Take what\nyou need").split("\n").map((line, i) => <span key={i}>{line}</span>)}</h2>
          <img src={props.saleLogo || logo} alt="Tu Marca" className="sale-paper-logo" />
          <p className="sale-paper-sale">{props.saleLabel ?? "Sale"}</p>
          <p className="sale-paper-dates">{props.saleDates ?? "20 — 24 OCTUBRE"}</p>
        </div>
      </div>
      {pieces.map((_, index) => {
        const product = products?.find((p) => p.id === ids[index]);
        return <HangingStrip key={index} index={index} size={size} image={saleStripImage(props[`saleImage${index + 1}`], product)} name={product?.name} />;
      })}
    </div>
  </section>;
}
