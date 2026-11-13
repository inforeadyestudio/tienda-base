import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Heart, ArrowRight } from "lucide-react";
import { Media } from "./scene-shell";
import type { Layer, SceneContext } from "@/lib/scenes/types";
import { cn } from "@/lib/utils";

import camiseta from "@/assets/funcionalidades/camiseta.jpg";
import pantalon from "@/assets/funcionalidades/pantalon.jpg";
import shortImg from "@/assets/funcionalidades/short.jpg";
import blusa from "@/assets/funcionalidades/blusa.jpg";
import topImg from "@/assets/funcionalidades/top.jpg";
import lentes from "@/assets/funcionalidades/lentes.jpg";
import chaqueta from "@/assets/funcionalidades/chaqueta.jpg";
import short2 from "@/assets/funcionalidades/short2.jpg";
import lentes2 from "@/assets/funcionalidades/lentes2.jpg";
import top2 from "@/assets/funcionalidades/top2.jpg";
import model from "@/assets/funcionalidades/model.jpg";

type P = { props: Record<string, any>; layers: Layer[]; ctx: SceneContext };

export const FEATURES_DEFAULTS = {
  title: "Tu closet, tu universo",
  subtitle: "Guarda lo que amas. Combínalo. Pruébalo antes de vestirlo.",
  leftTitle: "Crea tu closet",
  leftBody: "Guarda tus prendas, tus favoritos y todo lo que ya es tuyo.",
  chips: "Todo, Superiores, Inferiores, Vestidos, Accesorios",
  leftCta: "Crear mi closet",
  leftHref: "/cuenta/closet",
  rightTitle: "Prueba nuevos looks",
  rightBody: "Combina las prendas de tu closet y descubre cómo se ven juntas.",
  rightCta: "Probar un look",
  rightHref: "/cuenta/try-on",
  note: "Same pieces\nnew possibilities",
  footerText: "¿Ya tienes cuenta?",
  footerCta: "Inicia sesión",
  footerHref: "/auth",
  modelImage: model,
  i1: camiseta, i1n: "Camiseta", i1c: "Negro",
  i2: pantalon, i2n: "Pantalón", i2c: "Verde oliva",
  i3: shortImg, i3n: "Short", i3c: "Blanco",
  i4: blusa, i4n: "Blusa", i4c: "Verde salvia",
  i5: topImg, i5n: "Top", i5c: "Café",
  i6: lentes, i6n: "Lentes", i6c: "Negro",
  l1: chaqueta, l1n: "Chaqueta", l1c: "Negro",
  l2: short2, l2n: "Short", l2c: "Blanco",
  l3: lentes2, l3n: "Lentes", l3c: "Negro",
  l4: top2, l4n: "Top", l4c: "Café",
  hideOnMobile: false,
};

function Piece({ url, name, color, liked }: { url?: string; name?: string; color?: string; liked?: boolean }) {
  const [fav, setFav] = useState(!!liked);
  if (!url && !name) return null;
  return (
    <div className="rounded-2xl bg-cream/70 overflow-hidden">
      <div className="aspect-[4/5] w-full">
        <Media url={url} alt={name} className="w-full h-full object-contain" />
      </div>
      <div className="flex items-end justify-between gap-2 px-3 pb-3">
        <div className="min-w-0">
          <p className="font-nm text-[12px] text-ink truncate">{name}</p>
          <p className="font-nm text-[11px] text-ink/50 truncate">{color}</p>
        </div>
        <button
          type="button"
          aria-label="Favorito"
          onClick={() => setFav((v) => !v)}
          className="shrink-0 text-ink/60 hover:text-ink transition-colors"
        >
          <Heart className="w-4 h-4" fill={fav ? "currentColor" : "none"} />
        </button>
      </div>
    </div>
  );
}

function Cta({ label, href, dark }: { label: string; href: string; dark?: boolean }) {
  return (
    <Link
      to={href as any}
      className={cn(
        "group inline-flex items-center justify-center gap-4 w-full rounded-full px-8 py-4 font-nm text-[12px] uppercase tracking-[0.25em] transition-colors",
        dark ? "bg-ink text-ivory hover:bg-ink/85" : "border border-ink/40 text-ink hover:bg-ink hover:text-ivory",
      )}
    >
      {label}
      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
    </Link>
  );
}

/** Sección "Funcionalidades": closet personal + probador de looks. */
export function FeaturesClosetScene({ props }: P) {
  const p = { ...FEATURES_DEFAULTS, ...props };
  const [active, setActive] = useState(0);
  const chips = String(p.chips || "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const items = [
    { url: p.i1, name: p.i1n, color: p.i1c },
    { url: p.i2, name: p.i2n, color: p.i2c },
    { url: p.i3, name: p.i3n, color: p.i3c, liked: true },
    { url: p.i4, name: p.i4n, color: p.i4c },
    { url: p.i5, name: p.i5n, color: p.i5c },
    { url: p.i6, name: p.i6n, color: p.i6c },
  ];

  return (
    <section className={cn("w-full bg-shell py-16 md:py-24", p.hideOnMobile && "hidden md:block")}>
      <div className="mx-auto max-w-[1400px] px-5 md:px-10">
        <header className="text-center">
          <h2 className="font-brown-sugar text-4xl md:text-6xl uppercase tracking-[0.04em] text-ink">{p.title}</h2>
          {p.subtitle && <p className="mt-3 font-nm text-sm md:text-base text-ink/55">{p.subtitle}</p>}
        </header>

        <div className="mt-10 md:mt-14 grid gap-6 md:gap-10 md:grid-cols-2">
          {/* Crea tu closet */}
          <div className="rounded-[28px] bg-cream/40 p-5 md:p-8 flex flex-col">
            <h3 className="font-brown-sugar text-2xl md:text-3xl uppercase tracking-[0.04em] text-ink">{p.leftTitle}</h3>
            <p className="mt-2 font-nm text-sm text-ink/55">{p.leftBody}</p>

            {chips.length > 0 && (
              <div className="mt-6 flex flex-wrap gap-2">
                {chips.map((chip, i) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => setActive(i)}
                    className={cn(
                      "rounded-full px-4 py-2 font-nm text-[11px] uppercase tracking-[0.18em] transition-colors",
                      i === active ? "bg-ink text-ivory" : "bg-cream/80 text-ink/70 hover:text-ink",
                    )}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            )}

            <div className="mt-6 grid grid-cols-3 gap-3 md:gap-4">
              {items.map((it, i) => (
                <Piece key={i} {...it} />
              ))}
            </div>

            <div className="mt-8 md:mt-auto md:pt-10 px-0 md:px-14">
              <Cta label={p.leftCta} href={p.leftHref} />
            </div>
          </div>

          {/* Prueba nuevos looks */}
          <div className="rounded-[28px] bg-cream/40 p-5 md:p-8 flex flex-col">
            <h3 className="font-brown-sugar text-2xl md:text-3xl uppercase tracking-[0.04em] text-ink">{p.rightTitle}</h3>
            <p className="mt-2 font-nm text-sm text-ink/55">{p.rightBody}</p>

            <div className="mt-6 grid grid-cols-4 gap-3 md:gap-4 items-start">
              <div className="col-span-1 space-y-3 md:space-y-4">
                <Piece url={p.l1} name={p.l1n} color={p.l1c} />
                <Piece url={p.l2} name={p.l2n} color={p.l2c} />
              </div>
              <div className="col-span-2 rounded-2xl overflow-hidden bg-cream/70">
                <div className="aspect-[3/5] w-full">
                  <Media url={p.modelImage} alt={p.rightTitle} className="w-full h-full object-cover" />
                </div>
              </div>
              <div className="col-span-1 space-y-3 md:space-y-4">
                {p.note && (
                  <p className="hidden md:block font-serif italic text-[13px] leading-snug text-ink/60 whitespace-pre-line">
                    {p.note}
                  </p>
                )}
                <Piece url={p.l3} name={p.l3n} color={p.l3c} />
                <Piece url={p.l4} name={p.l4n} color={p.l4c} />
              </div>
            </div>

            <div className="mt-8 md:mt-auto md:pt-10 px-0 md:px-14">
              <Cta label={p.rightCta} href={p.rightHref} dark />
            </div>
          </div>
        </div>

        {(p.footerText || p.footerCta) && (
          <div className="mt-10 flex items-center justify-center gap-3">
            <span className="hidden md:block h-px w-24 bg-ink/15" />
            <p className="font-nm text-[11px] uppercase tracking-[0.25em] text-ink/50">
              {p.footerText}{" "}
              <Link to={p.footerHref as any} className="text-ink underline underline-offset-4">
                {p.footerCta}
              </Link>
            </p>
            <span className="hidden md:block h-px w-24 bg-ink/15" />
          </div>
        )}
      </div>
    </section>
  );
}
