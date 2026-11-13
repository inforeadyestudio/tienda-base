import { useEffect, useMemo, useRef, useState } from "react";
import type { DesignSectionDef, SceneContext } from "./types";
import { MARCA_BASE_DEFAULTS, MARCA_BASE_FIELDS, Shell, asList, formatCOP, lines, pickProducts, productImages, productPrice, taglineRows } from "./marca/shared";
import { DEMO_INDICE_FINAL } from "./marca/demo";

/** Índice: los nombres pasan detrás, la foto del centro alterna producto / campaña y al final se abre a pantalla completa. */
// contain: foto suelta con fondo (se encaja); blend: foto de producto 3:4 con fondo blanco (llena el marco y el blanco se funde)
type Item = { name: string; code: string; a: string; b: string; aContain: boolean; bContain: boolean; aBlend?: boolean; bBlend?: boolean; note: string };

// «LU132 · Aviador» → «Aviador»; si el nombre es solo la referencia, se deja tal cual.
// TODO(logica): si el producto trajera su forma o modelo (ej. «Aviador»), el índice la usaría sin escribirla en el panel.
function wordFromName(name: string) {
  const rest = name.replace(/^\s*LU\s?-?\d+[A-Z]?\s*[·\-–—:|/]*\s*/i, "").trim();
  return rest || name;
}

// productos del inventario (elegidos o, si no hay lista manual, los de la página); la foto alterna la del
// producto con la foto de campaña del mismo orden (o con su segunda foto si no hay campaña)
function buildItems(props: Record<string, any>, ctx: SceneContext): Item[] {
  const names = lines(props.nombres);
  const prod = asList(props.fotosProducto);
  const camp = asList(props.fotosCampana);
  const chosen = pickProducts(props.productos, ctx);
  // lista manual (palabras + fotos sueltas) solo si no hay productos elegidos y sí hay fotos sueltas
  const products = chosen.length ? chosen : prod.length ? [] : ctx.products.slice(0, 12);
  if (products.length) {
    return products.map((p, i) => {
      const imgs = productImages(p);
      const price = productPrice(p);
      const b = camp[i] || imgs[1] || imgs[0] || "";
      // palabra de atrás: la del panel (ej. «Aviador») o el nombre del producto sin la referencia
      const word = (names[i] ?? "").split("|")[0].trim() || wordFromName(p.name);
      return { name: word, code: "", a: imgs[0] ?? "", b, aContain: false, bContain: false, aBlend: true, bBlend: !camp[i], note: price ? formatCOP(price) : "" };
    });
  }
  return names.map((row, i) => {
    const [name, code = ""] = row.split("|").map((s) => s.trim());
    const a = prod[i] ?? camp[i] ?? "";
    const b = camp[i] ?? prod[i] ?? "";
    return { name, code, a, b, aContain: !!prod[i], bContain: !camp[i], note: code };
  });
}

const TRAVEL: Record<string, string> = { corto: "260vh", medio: "330vh", largo: "420vh" };

function Indice({ props, ctx }: { props: Record<string, any>; ctx: SceneContext }) {
  const items = useMemo(() => buildItems(props, ctx), [props, ctx]);
  const N = items.length;
  const sec = useRef<HTMLDivElement>(null);
  const stick = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLOListElement>(null);
  const frame = useRef<HTMLAnchorElement>(null);
  const full = useRef<HTMLDivElement>(null);
  const [state, setState] = useState({ i: 0, half: 0, open: false, expanding: false });

  useEffect(() => {
    const s = sec.current, l = list.current, st = stick.current, fr = frame.current, fu = full.current;
    if (!s || !l || !st || !fr || !fu || !N) return;
    let lh = 1, pending = false, prev = "";
    const measure = () => { lh = (l.firstElementChild as HTMLElement | null)?.offsetHeight || 1; };
    const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const update = () => {
      pending = false;
      const r = s.getBoundingClientRect(), R = s.offsetHeight - window.innerHeight;
      const P = R > 0 ? Math.min(1, Math.max(0, -r.top / R)) : 0;
      const LIST = 0.72, OPEN = 0.9;
      const pos = Math.min(N - 0.0001, (P / LIST) * N), i = Math.floor(pos), half = pos - i < 0.5 ? 0 : 1;
      l.style.transform = `translate3d(0, ${(-(N + pos) * lh).toFixed(1)}px, 0)`;
      const t = Math.min(1, Math.max(0, (P - LIST) / (OPEN - LIST)));
      if (t > 0) {
        const e = ease(t), W = st.clientWidth, H = st.clientHeight, fw = fr.offsetWidth, fh = fr.offsetHeight;
        const y = ((H - fh) / 2) * (1 - e), x = ((W - fw) / 2) * (1 - e);
        fu.style.visibility = "visible";
        fu.style.clipPath = `inset(${y.toFixed(1)}px ${x.toFixed(1)}px ${y.toFixed(1)}px ${x.toFixed(1)}px)`;
      } else fu.style.visibility = "hidden";
      const key = `${i}|${half}|${P >= OPEN}|${t > 0}`;
      if (key !== prev) { prev = key; setState({ i, half, open: P >= OPEN, expanding: t > 0 }); }
    };
    const req = () => { if (!pending) { pending = true; requestAnimationFrame(update); } };
    const onResize = () => { measure(); req(); };
    measure(); update();
    window.addEventListener("scroll", req, { passive: true });
    window.addEventListener("resize", onResize);
    document.fonts?.ready.then(onResize).catch(() => {});
    return () => { window.removeEventListener("scroll", req); window.removeEventListener("resize", onResize); };
  }, [N]);

  if (!N) return null;
  const it = items[state.i] ?? items[0];
  const pad = (n: number) => String(n).padStart(2, "0");
  const triple = [0, 1, 2].flatMap((k) => items.map((x, j) => ({ ...x, key: `${k}-${j}`, on: k === 1 && j === state.i })));
  const phrase = taglineRows(lines(props.frase));

  return (
    <Shell props={props} label={props.titulo || "Índice de referencias"} className="pt-10 md:pt-16">
      <div ref={sec} style={{ height: TRAVEL[props.recorrido] ?? TRAVEL.medio }} className="relative">
        <div ref={stick} className="sticky top-0 h-svh overflow-hidden [--fw:min(60vw,262px)] md:[--fw:clamp(212px,24vw,340px)]">
          {/* los nombres se difuminan arriba y abajo: entran y salen del fondo sin verse cortados */}
          <div className="pointer-events-none absolute inset-0 [-webkit-mask-image:linear-gradient(to_bottom,transparent_0,transparent_9%,#000_30%,#000_70%,transparent_91%,transparent_100%)] [mask-image:linear-gradient(to_bottom,transparent_0,transparent_9%,#000_30%,#000_70%,transparent_91%,transparent_100%)]">
          <ol ref={list} aria-hidden="true" className="absolute inset-x-0 top-1/2 m-0 list-none p-0 [--fs:clamp(30px,10.5vw,132px)] will-change-transform">
            {triple.map((x) => (
              <li key={x.key} className={`marca-t flex h-[var(--fs)] items-center justify-center whitespace-nowrap text-[length:var(--fs)] tracking-normal transition-colors duration-150 ${x.on ? "text-marca-cacao" : "text-marca-cacao/[.085]"}`}>
                <span className="relative">
                  {x.name}
                  {x.code ? <small className="marca-mono absolute left-full top-[.2em] ml-[.45em] text-[10px] leading-none">{x.code}</small> : null}
                </span>
              </li>
            ))}
          </ol>
          </div>
          <a ref={frame} href={props.ctaHref || "#"} aria-label={props.ctaLabel || it.name} className="marca-lift absolute left-1/2 top-1/2 z-[2] block h-[calc(var(--fw)*1.25)] w-[var(--fw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden bg-marca-piedra">
            <img src={it.a} alt={it.name} className={`absolute inset-0 h-full w-full ${it.aContain ? "object-contain px-[3%] mix-blend-multiply" : it.aBlend ? "object-cover mix-blend-multiply" : "object-cover"} ${state.half === 0 ? "opacity-100" : "opacity-0"}`} />
            <img src={it.b} alt="" aria-hidden="true" className={`absolute inset-0 h-full w-full ${it.bContain ? "object-contain px-[3%] mix-blend-multiply" : it.bBlend ? "object-cover mix-blend-multiply" : "object-cover"} ${state.half === 1 ? "opacity-100" : "opacity-0"}`} />
          </a>
          <div className={`absolute left-1/2 top-[calc(50%+var(--fw)*.625+12px)] z-[2] flex w-[var(--fw)] -translate-x-1/2 justify-between gap-2.5 ${state.expanding ? "invisible" : ""}`}>
            <span className="marca-mono marca-mono-soft">{it.note}</span>
            <span className="marca-mono marca-mono-soft">{pad(state.i + 1)} / {pad(N)}</span>
          </div>
          <div ref={full} aria-hidden="true" className="marca-grain invisible absolute inset-0 z-[3]" style={{ clipPath: "inset(50% 50% 50% 50%)" }}>
            {props.fotoFinal ? <img src={props.fotoFinal} alt="" className="block h-full w-full object-cover object-[50%_35%]" /> : null}
          </div>
          <div className={`marca-vellum marca-lift marca-nudge absolute bottom-[clamp(20px,5vh,48px)] left-1/2 z-[4] grid w-[min(580px,calc(100%-32px))] -translate-x-1/2 justify-items-center gap-5 px-6 pb-6 pt-[30px] text-center transition-opacity duration-300 marca-steps md:px-10 ${state.open ? "visible opacity-100" : "invisible opacity-0"}`}>
            {phrase.length ? (
              <p className="m-0 font-marca-mono text-[clamp(13px,3.9vw,24px)] uppercase leading-[1.35] tracking-[.02em] text-[var(--marca-acento)]">
                {phrase.map((l, i) => <span key={i} className="block whitespace-nowrap">{l}</span>)}
              </p>
            ) : null}
            {props.ctaLabel && props.ctaHref ? <a className="marca-bk" href={props.ctaHref}>{props.ctaLabel}</a> : null}
          </div>
        </div>
      </div>
    </Shell>
  );
}

export const marcaIndiceSection: DesignSectionDef = {
  label: "Tu Marca · Índice de referencias",
  group: "Signature",
  description: "Los nombres de las referencias pasan detrás con el scroll; la foto alterna producto y campaña y al final se abre a pantalla completa con la frase.",
  fields: [
    { key: "productos", label: "Productos (vacío = los de la página; reemplazan la lista manual)", type: "products", max: 16 },
    { key: "nombres", label: "Palabras de atrás · una por línea, mismo orden que los productos (ej. Aviador); sin productos: Nombre | Código", type: "textarea" },
    { key: "fotosProducto", label: "Lista manual · fotos de producto (mismo orden)", type: "medialist" },
    { key: "fotosCampana", label: "Fotos de campaña o modelo (mismo orden que los productos)", type: "medialist" },
    { key: "fotoFinal", label: "Foto final a pantalla completa", type: "media" },
    { key: "frase", label: "Frase final (una línea por renglón)", type: "textarea" },
    { key: "ctaLabel", label: "Botón · Texto", type: "text" },
    { key: "ctaHref", label: "Botón · Enlace", type: "text" },
    { key: "recorrido", label: "Recorrido del scroll", type: "select", options: [{ value: "corto", label: "Corto" }, { value: "medio", label: "Medio" }, { value: "largo", label: "Largo" }] },
    ...MARCA_BASE_FIELDS,
  ],
  defaults: {
    ...MARCA_BASE_DEFAULTS,
    productos: [],
    nombres: "",
    fotosProducto: [],
    fotosCampana: [],
    fotoFinal: DEMO_INDICE_FINAL,
    frase: "Tu frase de marca\nva aquí.",
    ctaLabel: "Ver la colección",
    ctaHref: "/tienda",
    recorrido: "medio",
  },
  Component: Indice,
};
