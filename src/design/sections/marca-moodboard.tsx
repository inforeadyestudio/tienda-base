import type { DesignSectionDef, SceneContext } from "./types";
import { EditorHint, Iso, MARCA_BASE_DEFAULTS, MARCA_BASE_FIELDS, PARES, Pastilla, Shell, asList, cx, formatCOP, pickProducts, productHref, productImages, productPrice, type Tone } from "./marca/shared";
import { viewOf } from "./marca/views";
import { FogPhoto } from "./marca-niebla";

/** Moodboard de colección: el nombre de la colección con el isotipo, fotos sueltas (dos detrás de un vidrio que el cursor
 *  aclara), dos productos sobre pastillas de color con su círculo claro y un sello con el isotipo.
 *  Va en una retícula con desfases: nada se monta sobre nada, en computador ni en celular. */
export type MoodPhoto = { src: string; alt: string };
export type MoodProduct = { key: string; img: string; name: string; price: string; href: string };

// dónde va cada pieza: celular (6 columnas) y computador (12 columnas, tres filas con desfases)
const AT = {
  titulo: "col-span-6 md:col-start-1 md:col-span-4 md:row-start-1 md:pt-16",
  foto1: "col-start-2 col-span-5 md:col-start-6 md:col-span-3 md:row-start-1",
  foto2: "col-span-3 md:col-start-10 md:col-span-3 md:row-start-1 md:mt-28",
  producto1: "col-start-4 col-span-3 mt-10 md:col-start-2 md:col-span-3 md:row-start-2 md:mt-24",
  foto3: "col-span-6 md:col-start-6 md:col-span-4 md:row-start-2 md:mt-40",
  producto2: "col-span-3 md:col-start-11 md:col-span-2 md:row-start-2 md:mt-14",
  foto4: "col-start-4 col-span-3 mt-10 md:col-start-3 md:col-span-2 md:row-start-3 md:mt-24",
  sello: "col-start-2 col-span-2 md:col-start-10 md:col-span-2 md:row-start-3 md:mt-36",
} as const;

function ProductOnTone({ p, tone }: { p?: MoodProduct; tone: Tone }) {
  if (!p) return null;
  return (
    <a href={p.href} className="group block text-inherit no-underline">
      {/* la gafa queda entera dentro del círculo claro para que no se pierda sobre el color */}
      <Pastilla tone={tone} inset="8%">
        {p.img ? <img src={p.img} alt={p.name} loading="lazy" className="absolute inset-[17%] h-[66%] w-[66%] object-cover mix-blend-multiply transition-transform duration-300 marca-steps group-hover:-translate-y-1" /> : null}
      </Pastilla>
      <span className="mt-3 grid justify-items-center gap-1 text-center">
        <span className="marca-tr min-w-0 text-[12.5px]">{p.name}</span>
        {p.price ? <span className="marca-mono text-[11px] tracking-[.06em]">{p.price}</span> : null}
      </span>
    </a>
  );
}

function Photo({ ph, className }: { ph: MoodPhoto; className: string }) {
  return (
    <figure className={cx("m-0 overflow-hidden bg-marca-piedra", className)}>
      <img src={ph.src} alt={ph.alt} loading="lazy" className="h-full w-full object-cover" />
    </figure>
  );
}

/** El moodboard (lo usan la sección del panel y la página de colección de la tienda). */
export function MoodboardBody({ title, kicker, note, photos, products, color = true }: {
  title: string; kicker?: string; note?: string; photos: MoodPhoto[]; products: MoodProduct[]; color?: boolean;
}) {
  const [f1, f2, f3, f4] = photos;
  return (
    <div className="grid grid-cols-6 items-start gap-x-4 gap-y-14 md:grid-cols-12 md:gap-x-6 md:gap-y-0">
      <div className={cx("grid justify-items-start gap-4", AT.titulo)}>
        <Iso className={cx("w-[56px] md:w-[68px]", color ? "text-[var(--marca-acento)]" : "text-marca-cacao")} />
        {kicker ? <span className="marca-mono marca-mono-soft">{kicker}</span> : null}
        {title ? <h2 className="marca-t text-[clamp(30px,4vw,56px)] leading-[.95]">{title}</h2> : null}
        {note ? <p className="m-0 max-w-[340px] text-[14px] leading-[1.55]">{note}</p> : null}
      </div>
      {/* las dos verticales van detrás de un vidrio: el cursor (o el dedo) las aclara */}
      {f1 ? <div className={AT.foto1}><FogPhoto src={f1.src} alt={f1.alt} /></div> : null}
      {f2 ? <div className={AT.foto2}><Photo ph={f2} className="aspect-square" /></div> : null}
      <div className={AT.producto1}><ProductOnTone p={products[0]} tone={color ? PARES.lima : PARES.marfil} /></div>
      {f3 ? <div className={AT.foto3}><Photo ph={f3} className="aspect-[3/2]" /></div> : null}
      <div className={AT.producto2}><ProductOnTone p={products[1]} tone={color ? PARES.burdeos : PARES.marfil} /></div>
      {f4 ? <div className={AT.foto4}><FogPhoto src={f4.src} alt={f4.alt} /></div> : null}
      {color ? (
        <div className={AT.sello}>
          <Pastilla tone={PARES.cacao}>
            <Iso className="absolute left-1/2 top-1/2 w-[46%] -translate-x-1/2 -translate-y-1/2 text-marca-cacao" />
          </Pastilla>
        </div>
      ) : null}
    </div>
  );
}

const cardOf = (p: SceneContext["products"][number]): MoodProduct => {
  const imgs = productImages(p);
  const price = productPrice(p);
  return { key: p.id, img: imgs[0] ?? "", name: p.name, price: price ? formatCOP(price) : "", href: productHref(p) };
};

function Moodboard({ props, ctx }: { props: Record<string, any>; ctx: SceneContext }) {
  const chosen = pickProducts(props.productos, ctx);
  const pool = chosen.length ? chosen : ctx.products;
  const fotos = asList(props.fotos);
  // sin fotos elegidas: las fotos de modelo/campaña de los productos (las que no son frente, 3/4 ni lateral)
  const auto = fotos.length ? [] : Array.from(new Set(pool.flatMap((p) => productImages(p).filter((u) => viewOf(u) === null)))).slice(0, 4);
  const title = props.titulo || ctx.collection?.title || "";
  const photos = (fotos.length ? fotos : auto).slice(0, 4).map((src) => ({ src, alt: `${title || "Colección"} · Tu Marca` }));
  const products = pool.slice(0, 2).map(cardOf);
  if (!photos.length && !products.length) return <Shell props={props} className="py-16"><EditorHint ctx={ctx}>Moodboard · elige fotos y productos en el panel</EditorHint></Shell>;
  return (
    <Shell props={props} label={title || "Colección"} contained className="pb-16 pt-[100px] md:pb-28 md:pt-[130px]">
      <MoodboardBody title={title} kicker={props.etiqueta || undefined} note={props.nota} photos={photos} products={products} color={props.colores !== false} />
    </Shell>
  );
}

export const marcaMoodboardSection: DesignSectionDef = {
  label: "Tu Marca · Moodboard de colección",
  group: "Editorial",
  description: "El nombre de la colección con el isotipo, fotos sueltas (dos detrás de un vidrio que el cursor aclara), dos productos sobre pastillas de color y un sello. Sin fotos elegidas usa las fotos de modelo de los productos.",
  fields: [
    { key: "titulo", label: "Título (vacío = nombre de la colección)", type: "text" },
    { key: "etiqueta", label: "Antetítulo (opcional)", type: "text" },
    { key: "nota", label: "Texto corto (opcional)", type: "textarea" },
    { key: "fotos", label: "Fotos de la colección (hasta 4: la 1.ª y la 4.ª van con vidrio; vacío = fotos de modelo de los productos)", type: "medialist" },
    { key: "productos", label: "Productos (2; vacío = los de la página)", type: "products", max: 2 },
    { key: "colores", label: "Pastillas de color de la marca", type: "boolean" },
    ...MARCA_BASE_FIELDS,
  ],
  defaults: { ...MARCA_BASE_DEFAULTS, titulo: "", etiqueta: "", nota: "", fotos: [], productos: [], colores: true },
  Component: Moodboard,
};
