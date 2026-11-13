import { useMemo, useState } from "react";
import type { DesignSectionDef, SceneContext } from "./types";
import { EditorHint, MARCA_BASE_DEFAULTS, MARCA_BASE_FIELDS, Shell, formatCOP, pickProducts, productColors, productHref, productImages, productPrice, useReducedMotion } from "./marca/shared";

/** Colección en retícula: productos del inventario sobre el fondo de la página (la foto blanca se funde: parece PNG), segunda foto al pasar el cursor, filtros por pestaña. */
type Card = { key: string; name: string; tag: string; img: string; hover: string; price: string; colors: Array<{ name: string; hex: string }>; href: string };

function cardsFrom(ids: unknown, ctx: SceneContext): Card[] {
  return pickProducts(ids, ctx).map((p) => {
    const imgs = productImages(p);
    const price = productPrice(p);
    return { key: p.id, name: p.name, tag: "", img: imgs[0] ?? "", hover: imgs[1] ?? "", price: price ? formatCOP(price) : "", colors: productColors(p), href: productHref(p) };
  });
}

function Coleccion({ props, ctx }: { props: Record<string, any>; ctx: SceneContext }) {
  const reduce = useReducedMotion();
  const tabs = useMemo(() => {
    const all = cardsFrom(props.productos, ctx);
    const base = all.length ? all : cardsFrom(ctx.products.map((p) => p.id), ctx);
    const t1 = cardsFrom(props.tab1Productos, ctx), t2 = cardsFrom(props.tab2Productos, ctx);
    const out = [{ id: "all", label: props.todosLabel || "Todo", cards: base }];
    if (props.tab1Label && t1.length) out.push({ id: "t1", label: props.tab1Label, cards: t1 });
    if (props.tab2Label && t2.length) out.push({ id: "t2", label: props.tab2Label, cards: t2 });
    return out;
  }, [props, ctx]);
  const [tab, setTab] = useState("all");
  const [more, setMore] = useState(false);
  const [round, setRound] = useState(0);
  const current = tabs.find((t) => t.id === tab) ?? tabs[0];
  const limit = Math.max(4, Number(props.limite) || 8);
  const cards = more ? current.cards : current.cards.slice(0, limit);

  const pick = (id: string) => { setTab(id); setRound((r) => r + 1); };
  if (!current.cards.length) return <Shell props={props} contained className="py-16"><EditorHint ctx={ctx}>Colección · elige productos en el panel o agrégalos a la página</EditorHint></Shell>;

  return (
    <Shell props={props} label={props.titulo} contained className="pt-24 md:pt-[110px]">
      <header className="mb-10 grid justify-items-center gap-3.5 text-center">
        {props.etiqueta ? <span className="marca-mono marca-mono-soft">{props.etiqueta}</span> : null}
        {props.titulo ? <h2 className="marca-t text-[clamp(28px,4vw,44px)]">{props.titulo}</h2> : null}
        {tabs.length > 1 ? (
          <div role="group" aria-label="Filtrar" className="flex flex-wrap justify-center gap-5">
            {tabs.map((t) => <button key={t.id} type="button" className="marca-bk" aria-pressed={t.id === current.id} onClick={() => pick(t.id)}>{t.label}</button>)}
          </div>
        ) : null}
      </header>
      {/* filas centradas: si la última fila tiene menos gafas, quedan al centro */}
      <div className="flex flex-wrap justify-center gap-x-3.5 gap-y-10 md:gap-x-[22px] md:gap-y-[52px]">
        {cards.map((c, i) => (
          <article key={`${round}-${c.key}`} className={`group relative min-w-0 w-[calc((100%-14px)/2)] md:w-[calc((100%-44px)/3)] lg:w-[calc((100%-66px)/4)] ${reduce ? "" : "marca-fade"}`} style={{ animationDelay: `${i * 35}ms` }}>
            <a href={c.href} className="block text-inherit no-underline">
              <span className="relative block aspect-[4/5] overflow-hidden bg-[var(--marca-bg,var(--marca-paper))] transition-transform duration-200 marca-steps group-hover:-translate-y-[3px]">
                {c.img ? <img src={c.img} alt={c.name} loading="lazy" className={`absolute inset-0 h-full w-full object-cover mix-blend-multiply transition-opacity duration-150 marca-steps ${c.hover ? "group-hover:opacity-0" : ""}`} /> : null}
                {c.hover ? <img src={c.hover} alt="" aria-hidden="true" loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-0 mix-blend-multiply transition-opacity duration-150 marca-steps group-hover:opacity-100" /> : null}
                {c.tag ? <span className="marca-mono absolute left-2.5 top-2.5 z-[2] text-[9.5px]">{c.tag}</span> : null}
              </span>
              {/* texto centrado: nombre, precio y colores */}
              <span className="mt-4 grid justify-items-center gap-1 text-center">
                <span className="marca-tr min-w-0 text-[12.5px] md:text-[14px]">{c.name}</span>
                <span className="marca-mono whitespace-nowrap text-[11px] tracking-[.06em]">{c.price}</span>
                {c.colors.length ? (
                  <span className="mt-1.5 flex flex-wrap justify-center gap-[7px]" aria-label="Colores">
                    {c.colors.map((col) => <span key={col.hex} title={col.name} className="size-3 rounded-full shadow-[inset_0_0_0_1px_var(--marca-line-strong)]" style={{ background: col.hex }} />)}
                  </span>
                ) : null}
              </span>
            </a>
          </article>
        ))}
      </div>
      {current.cards.length > limit || props.ctaHref ? (
        <div className="mt-[50px] text-center">
          {current.cards.length > limit ? (
            <button type="button" className="marca-btn" onClick={() => setMore((m) => !m)}>{more ? props.menosLabel || "Ver menos" : props.masLabel || "Ver más"}</button>
          ) : props.ctaLabel && props.ctaHref ? (
            <a className="marca-btn" href={props.ctaHref}>{props.ctaLabel}</a>
          ) : null}
        </div>
      ) : null}
    </Shell>
  );
}

export const marcaColeccionSection: DesignSectionDef = {
  label: "Tu Marca · Colección en retícula",
  group: "Universal",
  description: "Retícula de productos del inventario sobre el fondo de la página (las fotos se funden y parecen PNG): segunda foto al pasar el cursor, colores, precio y pestañas.",
  fields: [
    { key: "etiqueta", label: "Antetítulo", type: "text" },
    { key: "titulo", label: "Título", type: "text" },
    { key: "productos", label: "Productos (vacío = los de la página)", type: "products", max: 24 },
    { key: "todosLabel", label: "Pestaña «todo» · Texto", type: "text" },
    { key: "tab1Label", label: "Pestaña 1 · Texto", type: "text" },
    { key: "tab1Productos", label: "Pestaña 1 · Productos", type: "products", max: 24 },
    { key: "tab2Label", label: "Pestaña 2 · Texto", type: "text" },
    { key: "tab2Productos", label: "Pestaña 2 · Productos", type: "products", max: 24 },
    { key: "limite", label: "Fichas visibles antes de «ver más»", type: "number", min: 4, max: 24, step: 1 },
    { key: "masLabel", label: "Botón «ver más» · Texto", type: "text" },
    { key: "menosLabel", label: "Botón «ver menos» · Texto", type: "text" },
    { key: "ctaLabel", label: "Botón final · Texto (si no hay «ver más»)", type: "text" },
    { key: "ctaHref", label: "Botón final · Enlace", type: "text" },
    ...MARCA_BASE_FIELDS,
  ],
  defaults: {
    ...MARCA_BASE_DEFAULTS,
    etiqueta: "Colección",
    titulo: "Colección de ejemplo",
    productos: [],
    todosLabel: "Todo",
    tab1Label: "Categoría 1",
    tab1Productos: [],
    tab2Label: "Ópticas",
    tab2Productos: [],
    limite: 8,
    masLabel: "Ver más",
    menosLabel: "Ver menos",
    ctaLabel: "Ver toda la tienda",
    ctaHref: "/tienda",
  },
  Component: Coleccion,
};
