import { useEffect, useMemo, useRef, useState } from "react";
import type { DesignSectionDef, FieldDef, SceneContext } from "./types";
import { MARCA_BASE_DEFAULTS, MARCA_BASE_FIELDS, Shell, formatCOP, isoSvgString, pickProducts, productHref, productImages, productPrice, useReducedMotion } from "./marca/shared";
import { mountMatch } from "./marca/match-engine";

/** Choose your match: caja de fósforos realista. Cada fósforo es una forma; al encenderlo aparecen sus productos. */
const COUNT = 5;
type Mini = { key: string; img: string; name: string; price: string; href: string; contain: boolean };

function minisFor(props: Record<string, any>, ctx: SceneContext, n: number): Mini[] {
  // solo productos del inventario elegidos en el panel para esa forma
  return pickProducts(props[`m${n}Productos`], ctx).slice(0, 3).map((p) => {
    const price = productPrice(p);
    return { key: p.id, img: productImages(p)[0] ?? "", name: p.name, price: price ? formatCOP(price) : "", href: productHref(p), contain: true };
  });
}

/** Fósforos activos (con nombre) con su color de cabeza. */
export function matchList(props: Record<string, any>) {
  return Array.from({ length: COUNT }, (_, i) => i + 1)
    .filter((n) => props[`m${n}Label`])
    .map((n) => ({ n, key: `m${n}`, label: String(props[`m${n}Label`]).toUpperCase(), color: /^#[0-9a-f]{6}$/i.test(props[`m${n}Color`] || "") ? props[`m${n}Color`] : MATCH_DEFAULTS[n - 1][1] }));
}

/** Caja de fósforos (motor procedural). Avisa qué fósforo se encendió con su número (1–5). */
export function MatchBox({ props, onPick, className, crop = false }: { props: Record<string, any>; onPick: (n: number) => void; className?: string; crop?: boolean }) {
  const root = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const pickRef = useRef(onPick);
  pickRef.current = onPick;
  const matches = useMemo(() => matchList(props), [props]);
  const sig = matches.map((m) => `${m.label}${m.color}`).join("|");
  useEffect(() => {
    const el = root.current;
    if (!el || !matches.length) return;
    const api = mountMatch(el, {
      shapes: matches.map((m) => ({ key: m.key, label: m.label, color: m.color })),
      isoSvg: isoSvgString(),
      onPick: (key: string) => pickRef.current(Number(key.slice(1))),
    });
    return () => { try { api.destroy(); } catch { /* el motor ya se desmontó */ } };
    // se vuelve a montar solo si cambian nombres o colores de los fósforos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, reduce]);
  // crop: la caja ocupa solo su alto en la diagramación (el espacio de arriba es para el fósforo encendido)
  return <div className={`marca-match min-w-0 ${crop ? "is-crop" : ""} ${className ?? ""}`}><div ref={root} /></div>;
}

function Fosforos({ props, ctx }: { props: Record<string, any>; ctx: SceneContext }) {
  const [picked, setPicked] = useState<number | null>(null);

  const minis = picked ? minisFor(props, ctx, picked) : [];
  const title = picked ? props[`m${picked}Titulo`] || props[`m${picked}Label`] : props.vacio;
  const count = picked ? pickProducts(props[`m${picked}Productos`], ctx).length : 0;

  return (
    <Shell props={props} label={props.titulo} contained className="pt-24 md:pt-[110px]">
      {props.titulo ? <header className="mb-10 text-center"><h2 className="marca-t text-[clamp(28px,4vw,44px)]">{props.titulo}</h2></header> : null}
      <div className="grid grid-cols-1 items-center gap-10 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-14">
        <MatchBox props={props} onPick={setPicked} className="-mx-5 md:mx-0" />
        <div aria-live="polite">
          <div className="mb-[22px] flex flex-wrap items-baseline justify-between gap-3 border-b border-marca-line-strong pb-3">
            <h3 className="marca-t text-[26px]">{title}</h3>
            {picked ? <span className="marca-mono marca-mono-soft">{count} {count === 1 ? "referencia" : "referencias"}</span> : null}
          </div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {(picked && minis.length ? minis : [0, 1, 2].map((i) => ({ key: String(i) } as Mini))).map((m, i) => (
              <div key={m.key} className={`min-w-0 ${i === 2 ? "hidden md:block" : ""} ${picked ? "marca-fade" : ""}`} style={{ animationDelay: `${i * 50}ms` }}>
                {picked && minis.length ? (
                  <a href={m.href} className="block text-inherit no-underline">
                    <span className="relative block aspect-square overflow-hidden bg-[var(--marca-bg,var(--marca-paper))]">
                      {m.img ? <img src={m.img} alt={m.name} loading="lazy" className="absolute inset-0 h-full w-full object-cover mix-blend-multiply" /> : null}
                    </span>
                    <span className="marca-tr mb-1 mt-2.5 block text-[12.5px]">{m.name}</span>
                    <span className="marca-mono block">{m.price}</span>
                  </a>
                ) : (
                  <span className="block aspect-square bg-marca-piedra bg-[repeating-linear-gradient(-45deg,transparent_0_7px,var(--marca-line)_7px_8px)]" />
                )}
              </div>
            ))}
          </div>
          {picked && (props[`m${picked}Href`] || props.ctaHref) && props.ctaLabel ? (
            <a className="marca-bk mt-[22px]" href={props[`m${picked}Href`] || props.ctaHref}>{props.ctaLabel}</a>
          ) : null}
        </div>
      </div>
    </Shell>
  );
}

// Valores iniciales de los campos «color» de cada fósforo (el equipo los cambia en el panel).
export const MATCH_DEFAULTS = [
  ["Ovalada", "#cdcb5e", "Ovaladas", "ovalada"],
  ["Rectangular", "#60181f", "Rectangulares", "rectangular"],
  ["Aviador", "#c2e5ed", "Aviadoras", "aviador"],
  ["Redonda", "#352923", "Redondas", "redonda"],
  ["Hexagonal", "#f2c7d2", "Hexagonales", "hexagonal"],
];

export const matchFields: FieldDef[] = Array.from({ length: COUNT }, (_, i) => i + 1).flatMap((n): FieldDef[] => [
  { key: `m${n}Label`, label: `Fósforo ${n} · Nombre (vacío = no aparece)`, type: "text" },
  { key: `m${n}Color`, label: `Fósforo ${n} · Color de la cabeza`, type: "color" },
  { key: `m${n}Titulo`, label: `Fósforo ${n} · Título del resultado`, type: "text" },
  { key: `m${n}Productos`, label: `Fósforo ${n} · Productos`, type: "products", max: 6 },
  { key: `m${n}Href`, label: `Fósforo ${n} · Enlace «ver todas»`, type: "text" },
]);

export function matchDefaults() {
  return Object.fromEntries(MATCH_DEFAULTS.flatMap(([label, color, titulo, forma], i) => [
    [`m${i + 1}Label`, label], [`m${i + 1}Color`, color], [`m${i + 1}Titulo`, titulo], [`m${i + 1}Productos`, []], [`m${i + 1}Href`, "/tienda"], [`m${i + 1}Forma`, forma],
  ]));
}

export const marcaFosforosSection: DesignSectionDef = {
  label: "Tu Marca · Choose your match",
  group: "Signature",
  description: "Caja de fósforos realista: cada fósforo es una forma de gafa; se raspa, se enciende y muestra sus productos.",
  fields: [
    { key: "titulo", label: "Título", type: "text" },
    { key: "vacio", label: "Texto antes de encender", type: "text" },
    { key: "ctaLabel", label: "Botón «ver todas» · Texto", type: "text" },
    { key: "ctaHref", label: "Botón «ver todas» · Enlace general", type: "text" },
    ...matchFields,
    ...MARCA_BASE_FIELDS,
  ],
  defaults: {
    ...MARCA_BASE_DEFAULTS,
    titulo: "Choose your match",
    vacio: "Enciende uno",
    ctaLabel: "Ver todas",
    ctaHref: "/tienda",
    ...matchDefaults(),
  },
  Component: Fosforos,
};
