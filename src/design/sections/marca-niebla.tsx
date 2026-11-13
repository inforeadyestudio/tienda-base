import { useEffect, useRef, useState } from "react";
import type { DesignSectionDef, SceneContext } from "./types";
import { Iso, MARCA_BASE_DEFAULTS, MARCA_BASE_FIELDS, PARES, Pastilla, Shell, asList, cx, type Tone, formatCOP, lines, pickProducts, productHref, productImages, productPrice, sectionProducts, sinCampana, useInView, useReducedMotion } from "./marca/shared";
import { MatchBox, matchDefaults, matchFields, matchList } from "./marca-fosforos";
import { DEMO_FLIP, DEMO_NIEBLA } from "./marca/demo";

/** Foto detrás de un vidrio esmerilado: el cursor (o el dedo) aclara la zona y se vuelve a empañar. */
export function FogPhoto({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const el = wrap.current, im = img.current, canvas = cv.current;
    if (!el || !im || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let canFilter = false;
    try { canFilter = typeof ctx.filter === "string"; } catch { canFilter = false; }
    const blur = document.createElement("canvas"), sharp = document.createElement("canvas"), mask = document.createElement("canvas"), tmp = document.createElement("canvas");
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    let W = 0, H = 0, ready = false, raf = 0, last = 0;
    let prev: [number, number] | null = null;
    const queue: Array<[number, number]> = [];

    const build = () => {
      if (!im.complete || !im.naturalWidth) return;
      const r = el.getBoundingClientRect();
      const nw = Math.round(r.width * dpr), nh = Math.round(r.height * dpr);
      if (!nw || !nh || (nw === W && nh === H && ready)) return;
      W = nw; H = nh;
      for (const c of [canvas, blur, sharp, mask, tmp]) { c.width = W; c.height = H; }
      const s = Math.max(W / im.naturalWidth, H / im.naturalHeight), sw = W / s, sh = H / s;
      sharp.getContext("2d")!.drawImage(im, (im.naturalWidth - sw) / 2, (im.naturalHeight - sh) * 0.4, sw, sh, 0, 0, W, H);
      const bg = blur.getContext("2d")!, rad = Math.round(Math.min(W, H) * 0.045);
      if (canFilter) { bg.filter = `blur(${rad}px) saturate(.82)`; bg.drawImage(sharp, -rad * 2, -rad * 2, W + rad * 4, H + rad * 4); bg.filter = "none"; }
      else {
        const a = document.createElement("canvas"), b = document.createElement("canvas");
        a.width = Math.max(8, W >> 2); a.height = Math.max(8, H >> 2); b.width = Math.max(4, W >> 4); b.height = Math.max(4, H >> 4);
        const ag = a.getContext("2d")!, bgg = b.getContext("2d")!;
        ag.drawImage(sharp, 0, 0, a.width, a.height); bgg.drawImage(a, 0, 0, b.width, b.height);
        ag.clearRect(0, 0, a.width, a.height); ag.drawImage(b, 0, 0, a.width, a.height); bg.drawImage(a, 0, 0, W, H);
      }
      // velo lechoso del vidrio esmerilado (tono del papel Tu Marca)
      const veil = getComputedStyle(el).getPropertyValue("--marca-fog-veil").trim();
      if (veil) { bg.fillStyle = veil; bg.fillRect(0, 0, W, H); }
      ready = true; setLive(true); draw();
    };
    const draw = () => {
      ctx.clearRect(0, 0, W, H); ctx.drawImage(blur, 0, 0);
      const t = tmp.getContext("2d")!;
      t.globalCompositeOperation = "source-over"; t.clearRect(0, 0, W, H); t.drawImage(sharp, 0, 0);
      t.globalCompositeOperation = "destination-in"; t.drawImage(mask, 0, 0); t.globalCompositeOperation = "source-over";
      ctx.drawImage(tmp, 0, 0);
    };
    const stamp = (x: number, y: number, R: number) => {
      const g = mask.getContext("2d")!, gr = g.createRadialGradient(x, y, 0, x, y, R);
      gr.addColorStop(0, "rgba(0,0,0,1)"); gr.addColorStop(0.5, "rgba(0,0,0,.85)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr; g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fill();
    };
    const loop = () => {
      raf = 0;
      if (!ready) return;
      const g = mask.getContext("2d")!, R = Math.min(W, H) * 0.26;
      g.globalCompositeOperation = "destination-out"; g.fillStyle = "rgba(0,0,0,.05)"; g.fillRect(0, 0, W, H); g.globalCompositeOperation = "source-over";
      while (queue.length) {
        const p = queue.shift()!;
        if (prev) {
          const dx = p[0] - prev[0], dy = p[1] - prev[1], n = Math.max(1, Math.ceil(Math.hypot(dx, dy) / (R * 0.25)));
          for (let i = 1; i <= n; i++) stamp(prev[0] + (dx * i) / n, prev[1] + (dy * i) / n, R);
        } else stamp(p[0], p[1], R);
        prev = p;
      }
      draw();
      if (Date.now() - last < 1700) raf = requestAnimationFrame(loop);
      else { g.clearRect(0, 0, W, H); draw(); prev = null; }
    };
    const at = (e: PointerEvent) => {
      if (!ready) return;
      const r = canvas.getBoundingClientRect();
      queue.push([(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr]);
      last = Date.now();
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const leave = () => { prev = null; };
    el.addEventListener("pointermove", at);
    el.addEventListener("pointerdown", at);
    el.addEventListener("pointerleave", leave);
    if (im.complete && im.naturalWidth) build(); else im.addEventListener("load", build);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => { ready = false; W = 0; build(); }) : null;
    ro?.observe(el);
    return () => { el.removeEventListener("pointermove", at); el.removeEventListener("pointerdown", at); el.removeEventListener("pointerleave", leave); im.removeEventListener("load", build); ro?.disconnect(); if (raf) cancelAnimationFrame(raf); };
  }, [src]);

  return (
    <div ref={wrap} className={cx("marca-fog aspect-[2/3]", live && "is-live", className)}>
      <img ref={img} src={src} alt={alt} loading="lazy" />
      <canvas ref={cv} aria-hidden="true" />
    </div>
  );
}

function Flip({ fotos, pie, nota }: { fotos: string[]; pie?: string; nota?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const inView = useInView(ref);
  const [i, setI] = useState(0);
  useEffect(() => {
    if (reduce || !inView || fotos.length < 2) return;
    const t = window.setInterval(() => { if (!document.hidden) setI((v) => (v + 1) % fotos.length); }, 460);
    return () => window.clearInterval(t);
  }, [reduce, inView, fotos.length]);
  if (!fotos.length) return null;
  return (
    <div ref={ref}>
      <figure className="relative m-0 aspect-[3/2] w-full overflow-hidden bg-marca-piedra">
        {fotos.map((src, j) => <img key={j} src={src} alt={j === 0 ? pie || "Campaña Tu Marca" : ""} aria-hidden={j ? true : undefined} loading="lazy" className={`absolute inset-0 h-full w-full object-cover ${j === i ? "opacity-100" : "opacity-0"}`} />)}
      </figure>
      {pie || nota ? <div className="mt-2.5 flex justify-between gap-3"><span className="marca-mono marca-mono-soft">{pie}</span><span className="marca-mono marca-mono-soft">{nota}</span></div> : null}
    </div>
  );
}

/* ---------------- franja collage ---------------- */
// En computador cada pieza va suelta en un lienzo largo (x, y y ancho en unidades del ancho del lienzo): diagramación
// desequilibrada y aireada, con mucho espacio entre piezas para que la franja se recorra bajando.
// En celular las piezas bajan en una retícula de 6 columnas con desfases y aire entre ellas.
const H = 200; // alto del lienzo en unidades del ancho
type Slot = { x: number; y: number; w: number; m: string };
const SLOT: Record<string, Slot> = {
  texto: { x: 6, y: 4, w: 36, m: "col-span-6" },
  niebla1: { x: 46, y: 0, w: 30, m: "col-start-2 col-span-5" },
  foto1: { x: 80, y: 32, w: 20, m: "col-span-4" },
  producto1: { x: 10, y: 58, w: 28, m: "col-start-3 col-span-4" },
  niebla2: { x: 56, y: 76, w: 22, m: "col-span-4" },
  fosforos: { x: 24, y: 124, w: 52, m: "col-span-6 -mx-5" },
  flip: { x: 60, y: 162, w: 36, m: "col-start-2 col-span-5" },
  producto2: { x: 10, y: 172, w: 22, m: "col-span-4 col-start-3" },
  sello: { x: 84, y: 95, w: 13, m: "col-span-2 col-start-5 mt-20" },
};
function Piece({ at, className, children }: { at: keyof typeof SLOT; className?: string; children: React.ReactNode }) {
  const s = SLOT[at];
  return (
    <div className={cx("min-w-0 md:absolute md:left-[var(--x)] md:top-[var(--y)] md:w-[var(--w)]", s.m, className)}
      style={{ ["--x" as any]: `${s.x}%`, ["--y" as any]: `${(s.y / H) * 100}%`, ["--w" as any]: `${s.w}%` }}>
      {children}
    </div>
  );
}

type Card = { key: string; img: string; hover: string; name: string; price: string; href: string };
const cardOf = (p: SceneContext["products"][number]): Card => {
  const imgs = productImages(p);
  const price = productPrice(p);
  return { key: p.id, img: imgs[0] ?? "", hover: imgs[1] ?? "", name: p.name, price: price ? formatCOP(price) : "", href: productHref(p) };
};

/** Producto del inventario: la foto de fondo blanco se funde con el fondo (o con la pastilla de color) y parece PNG. */
function ProductPiece({ card, tone }: { card?: Card; tone?: Tone }) {
  if (!card) return null;
  // sobre una pastilla la foto ocupa el círculo; sin pastilla, todo el cuadro
  const box = tone ? "absolute inset-[17%] h-[66%] w-[66%]" : "absolute inset-0 h-full w-full";
  const imgs = (
    <>
      {card.img ? <img src={card.img} alt={card.name} loading="lazy" className={`${box} object-cover mix-blend-multiply transition-opacity duration-150 marca-steps ${card.hover ? "group-hover:opacity-0" : ""}`} /> : null}
      {card.hover ? <img src={card.hover} alt="" aria-hidden="true" loading="lazy" className={`${box} object-cover opacity-0 mix-blend-multiply transition-opacity duration-150 marca-steps group-hover:opacity-100`} /> : null}
    </>
  );
  return (
    <a key={card.key} href={card.href} className="marca-fade group block text-inherit no-underline">
      {tone ? <Pastilla tone={tone} inset="8%">{imgs}</Pastilla> : <span className="relative block aspect-square overflow-hidden bg-[var(--marca-bg,var(--marca-paper))]">{imgs}</span>}
      <span className="mt-3 grid justify-items-center gap-1 text-center">
        <span className="marca-tr min-w-0 text-[12.5px]">{card.name}</span>
        <span className="marca-mono whitespace-nowrap text-[11px] tracking-[.06em]">{card.price}</span>
      </span>
    </a>
  );
}

function Niebla({ props, ctx }: { props: Record<string, any>; ctx: SceneContext }) {
  const niebla = asList(props.fotos);
  const fotos = asList(props.fotosNormales);
  const flip = asList(props.flipbook);
  const title = lines(props.titulo);
  const [picked, setPicked] = useState<number | null>(null);
  // productos sueltos (del inventario); al encender un fósforo se cambian por los de esa forma
  const base = sectionProducts(props.productos, ctx, 2).map(cardOf);
  const lit = picked ? pickProducts(props[`m${picked}Productos`], ctx) : [];
  const cards = lit.length ? lit.map(cardOf) : base;
  const litTitle = picked ? props[`m${picked}Titulo`] || props[`m${picked}Label`] : "";
  const showMatches = props.fosforos !== false && matchList(props).length > 0;
  const color = props.colores !== false; // pastillas con los otros pares de color de la marca
  const LIMA = PARES.lima, BURDEOS = PARES.burdeos, CACAO = PARES.cacao;

  return (
    <Shell props={props} label={title.join(" ") || "Franja Tu Marca"} contained className="pb-16 pt-[110px] md:pb-24 md:pt-[150px]">
      <div className="grid grid-cols-6 items-start gap-x-4 gap-y-24 md:relative md:block md:aspect-[100/200]">
        {title.length || props.isotipo !== false ? (
          <Piece at="texto" className="grid justify-items-start gap-5">
            {props.isotipo !== false ? <Iso className={cx("w-[72px] md:w-[88px]", color ? "text-[var(--marca-acento)]" : "text-marca-cacao")} /> : null}
            {title.length ? <h2 className="marca-t text-[24px] leading-[1.12] md:text-[clamp(24px,2.6vw,36px)]">{title.map((l, i) => <span key={i} className="block">{l}</span>)}</h2> : null}
            {sinCampana(props.nota) ? <span className="marca-mono marca-mono-soft">{sinCampana(props.nota)}</span> : null}
          </Piece>
        ) : null}
        {niebla[0] ? <Piece at="niebla1"><FogPhoto src={niebla[0]} alt={props.alt1 || "Foto de campaña Tu Marca"} /></Piece> : null}
        {fotos[0] ? <Piece at="foto1"><figure className="m-0 aspect-[3/4] overflow-hidden bg-marca-piedra"><img src={fotos[0]} alt="Foto de campaña Tu Marca" loading="lazy" className="h-full w-full object-cover" /></figure></Piece> : null}
        <Piece at="producto1"><ProductPiece key={cards[0]?.key} card={cards[0]} tone={color ? LIMA : undefined} /></Piece>
        {showMatches ? (
          <Piece at="fosforos">
            <MatchBox props={props} onPick={setPicked} crop />
            <div className="mt-5 flex min-h-[1.6em] flex-wrap items-baseline justify-between gap-3 pl-[6.6%] pr-[22%]" aria-live="polite">
              <span className="marca-mono marca-mono-soft">{litTitle ? `${litTitle} · ${lit.length} ${lit.length === 1 ? "referencia" : "referencias"}` : props.vacio}</span>
              {picked && props.ctaLabel ? <a className="marca-bk" href={props[`m${picked}Href`] || props.ctaHref || "/tienda"}>{props.ctaLabel}</a> : null}
            </div>
          </Piece>
        ) : null}
        {niebla[1] ? <Piece at="niebla2"><FogPhoto src={niebla[1]} alt={props.alt2 || "Foto de campaña Tu Marca"} /></Piece> : null}
        {color ? (
          <Piece at="sello">
            <Pastilla tone={CACAO}>
              <Iso className="absolute left-1/2 top-1/2 w-[46%] -translate-x-1/2 -translate-y-1/2 text-marca-cacao" />
            </Pastilla>
          </Piece>
        ) : null}
        {flip.length ? <Piece at="flip"><Flip fotos={flip} pie={sinCampana(props.pieFlip)} nota={props.notaFlip} /></Piece> : fotos[1] ? <Piece at="flip"><figure className="m-0 aspect-[3/2] overflow-hidden bg-marca-piedra"><img src={fotos[1]} alt="Foto de campaña Tu Marca" loading="lazy" className="h-full w-full object-cover" /></figure></Piece> : null}
        <Piece at="producto2"><ProductPiece key={cards[1]?.key} card={cards[1]} tone={color ? BURDEOS : undefined} /></Piece>
      </div>
    </Shell>
  );
}

export const marcaNieblaSection: DesignSectionDef = {
  label: "Tu Marca · Franja collage (niebla, fotos, productos y fósforos)",
  group: "Editorial",
  description: "Franja diagramada en desorden: isotipo y frase, fotos con niebla que el cursor aclara, fotos normales, flipbook, productos del inventario sobre pastillas de color de la marca y la caja de fósforos para encender (al encender uno cambian los productos).",
  fields: [
    { key: "titulo", label: "Frase (una línea por renglón)", type: "textarea" },
    { key: "isotipo", label: "Mostrar isotipo animado", type: "boolean" },
    { key: "nota", label: "Nota bajo la frase (opcional)", type: "text" },
    { key: "fotos", label: "Fotos con niebla (2, verticales)", type: "medialist" },
    { key: "fotosNormales", label: "Fotos normales (1 vertical; la 2.ª se usa si no hay flipbook)", type: "medialist" },
    { key: "flipbook", label: "Flipbook · fotos seguidas de una misma toma", type: "medialist" },
    { key: "pieFlip", label: "Flipbook · Pie", type: "text" },
    { key: "notaFlip", label: "Flipbook · Nota derecha", type: "text" },
    { key: "productos", label: "Productos sueltos (2; vacío = los de la página)", type: "products", max: 2 },
    { key: "colores", label: "Pastillas de color de la marca (lima + rosa, burdeos + azul, cacao + marfil)", type: "boolean" },
    { key: "fosforos", label: "Mostrar caja de fósforos", type: "boolean" },
    { key: "vacio", label: "Fósforos · Texto antes de encender", type: "text" },
    { key: "ctaLabel", label: "Fósforos · Botón «ver todas»", type: "text" },
    { key: "ctaHref", label: "Fósforos · Enlace general", type: "text" },
    ...matchFields,
    ...MARCA_BASE_FIELDS,
  ],
  defaults: {
    ...MARCA_BASE_DEFAULTS,
    titulo: "Made to look.\nMade to be looked at.",
    isotipo: true,
    nota: "Colección de ejemplo",
    fotos: [DEMO_NIEBLA[0], DEMO_NIEBLA[1]],
    fotosNormales: [DEMO_NIEBLA[2], DEMO_NIEBLA[3]],
    flipbook: DEMO_FLIP,
    pieFlip: "Colección de ejemplo",
    notaFlip: "Nº 777",
    productos: [],
    colores: true,
    fosforos: true,
    vacio: "Enciende un fósforo",
    ctaLabel: "Ver todas",
    ctaHref: "/tienda",
    ...matchDefaults(),
  },
  Component: Niebla,
};
