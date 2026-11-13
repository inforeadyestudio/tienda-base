import { useRef, type ReactNode } from "react";
import { motion, useScroll, useTransform } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Bloques «Who we are» para Our World. Estructura del brand deck, estética del sitio:
 * títulos Brown Sugar, textos Neue Montreal, paleta ivory / tinta / moss.
 * Las listas se editan como texto: una línea por elemento, «Título | Descripción | Extra».
 */

type P = { props: Record<string, any> };

const BG: Record<string, string> = {
  ivory: "bg-ivory text-ink",
  cream: "bg-cream text-ink",
  ink: "bg-ink text-ivory",
  moss: "bg-moss text-ivory",
};
const EASE = [0.16, 1, 0.3, 1] as const;

export function lines(v: unknown): string[][] {
  return String(v ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => l.split("|").map((s) => s.trim()));
}
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter(Boolean) : []);

function Section({ props, children, className }: { props: Record<string, any>; children: ReactNode; className?: string }) {
  return (
    <section className={cn(BG[props.bg ?? "ivory"] ?? BG.ivory, "relative overflow-hidden py-20 md:py-32", props.hideOnMobile && "hidden md:block")}>
      <div className={cn("mx-auto max-w-7xl px-6 md:px-10", className)}>{children}</div>
    </section>
  );
}

function Rev({ children, d = 0, className }: { children: ReactNode; d?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 1, ease: EASE, delay: d * 0.12 }}
    >
      {children}
    </motion.div>
  );
}

function Eyebrow({ children }: { children: ReactNode }) {
  return <p className="font-nm text-[10px] uppercase tracking-[0.3em] opacity-60">{children}</p>;
}

function Title({ num, children }: { num?: string; children: ReactNode }) {
  return (
    <div>
      {num && <Rev><span className="font-nm text-[11px] tracking-[0.3em] opacity-50">{num}</span></Rev>}
      <Rev d={1}>
        <h2 className="mt-3 font-brown-sugar text-4xl leading-[0.95] md:text-7xl whitespace-pre-line">{children}</h2>
      </Rev>
    </div>
  );
}

function Img({ src, alt = "", className, parallax }: { src?: string; alt?: string; className?: string; parallax?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["-6%", "6%"]);
  if (!src) return <div className={cn("bg-current/5", className)} />;
  return (
    <div ref={ref} className={cn("group relative overflow-hidden", className)}>
      <motion.img
        src={src}
        alt={alt}
        loading="lazy"
        style={parallax ? { y, scale: 1.14 } : undefined}
        className="h-full w-full object-cover transition-transform duration-[1.4s] ease-out group-hover:scale-[1.04]"
      />
    </div>
  );
}

/* 1 · Portada */
export function WwHeroScene({ props }: P) {
  const ref = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "18%"]);
  const o = useTransform(scrollYProgress, [0, 0.7], [1, 0]);
  return (
    <section ref={ref} className="relative h-[100svh] min-h-[560px] overflow-hidden bg-ink text-ivory">
      {props.image && <motion.img src={props.image} alt="" style={{ y, scale: 1.1 }} className="absolute inset-0 h-full w-full object-cover" />}
      <div className="absolute inset-0 bg-gradient-to-b from-ink/30 via-ink/10 to-ink/70" />
      <motion.div style={{ opacity: o }} className="relative flex h-full flex-col items-center justify-center px-6">
        {props.logo ? (
          <motion.img
            src={props.logo}
            alt={props.title || "Tu Marca"}
            initial={{ opacity: 0, scale: 0.94 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.4, ease: EASE }}
            className="w-[min(70vw,560px)] brightness-0 invert"
          />
        ) : (
          <h1 className="font-brown-sugar text-6xl md:text-9xl">{props.title}</h1>
        )}
      </motion.div>
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-6 px-6 pb-10 md:flex-row md:items-end md:justify-between md:px-10">
        <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6, duration: 1, ease: EASE }} className="max-w-sm text-[15px] leading-snug whitespace-pre-line md:text-lg">
          {props.tagline}
        </motion.p>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 0.75 }} transition={{ delay: 0.9, duration: 1 }} className="font-nm text-[10px] uppercase tracking-[0.28em] leading-relaxed whitespace-pre-line md:text-right">
          {props.side}
        </motion.p>
      </div>
      <motion.span animate={{ y: [0, 8, 0] }} transition={{ duration: 2.2, repeat: Infinity }} className="absolute bottom-4 left-1/2 -translate-x-1/2 font-nm text-[9px] uppercase tracking-[0.3em] opacity-70">
        Scroll
      </motion.span>
    </section>
  );
}

/* 2 · Who we are */
export function WwIntroScene({ props }: P) {
  return (
    <Section props={props} className="grid items-center gap-12 md:grid-cols-2 md:gap-20">
      <div className="order-2 md:order-1">
        <Rev><Eyebrow>{props.eyebrow}</Eyebrow></Rev>
        <Rev d={1}><p className="mt-6 font-brown-sugar text-3xl leading-[1.1] md:text-5xl">{props.lead}</p></Rev>
        <Rev d={2}><p className="mt-8 max-w-xl text-[15px] leading-relaxed opacity-80 whitespace-pre-line">{props.body}</p></Rev>
        {props.signature && <Rev d={3}><p className="mt-8 font-brown-sugar text-3xl text-moss">{props.signature}</p></Rev>}
      </div>
      <Rev d={1} className="order-1 md:order-2"><Img src={props.image} parallax className="aspect-[3/4] rounded-sm" /></Rev>
    </Section>
  );
}

/* 3 · DNA */
export function WwDnaScene({ props }: P) {
  const items = lines(props.items);
  const imgs = list(props.images);
  return (
    <Section props={props}>
      <Title num={props.num}>{props.title}</Title>
      <div className="mt-14 grid gap-12 md:grid-cols-2 md:gap-16">
        <ul className="divide-y divide-current/15 border-y border-current/15">
          {items.map(([t, d], i) => (
            <Rev key={i} d={i}>
              <li className="grid grid-cols-[3rem_1fr] gap-4 py-6">
                <span className="font-brown-sugar text-3xl opacity-50">{String.fromCharCode(65 + i)}</span>
                <span>
                  <span className="block font-brown-sugar text-2xl md:text-3xl">{t}</span>
                  {d && <span className="mt-2 block text-[14px] opacity-70">{d}</span>}
                </span>
              </li>
            </Rev>
          ))}
        </ul>
        <div className="grid grid-cols-2 gap-4">
          {imgs.slice(0, 2).map((s, i) => (
            <Rev key={s} d={i + 1} className={i === 1 ? "mt-12" : ""}><Img src={s} parallax className="aspect-[3/4]" /></Rev>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* 4 · In the details */
export function WwDetailsScene({ props }: P) {
  const imgs = list(props.images);
  const half = Math.ceil(imgs.length / 2);
  const rows = [imgs.slice(0, half), imgs.slice(half)];
  const dur = Number(props.speed ?? 60);
  return (
    <section className={cn(BG[props.bg ?? "cream"], "overflow-hidden py-20 md:py-32")}>
      <div className="mx-auto mb-12 flex max-w-7xl flex-col gap-6 px-6 md:flex-row md:items-end md:justify-between md:px-10">
        <Title num={props.num}>{props.title}</Title>
        <Rev d={2}><p className="max-w-sm text-[15px] leading-relaxed opacity-80">{props.body}</p></Rev>
      </div>
      <div className="space-y-4">
        {rows.map((row, r) =>
          row.length ? (
            <motion.div
              key={r}
              className="flex w-max gap-4 will-change-transform"
              animate={{ x: r === 0 ? ["0%", "-50%"] : ["-50%", "0%"] }}
              transition={{ duration: dur + r * 6, ease: "linear", repeat: Infinity }}
            >
              {[...row, ...row].map((s, i) => (
                <figure key={i} className="relative w-[46vw] shrink-0 md:w-[20vw]">
                  <Img src={s} className="aspect-[4/5]" />
                </figure>
              ))}
            </motion.div>
          ) : null,
        )}
      </div>
    </section>
  );
}

/* 5 · Inspiración y cita */
export function WwQuoteScene({ props }: P) {
  return (
    <Section props={props} className="grid items-center gap-12 md:grid-cols-2 md:gap-20">
      <Rev>
        <Img src={props.image} parallax className="aspect-[4/5]" />
        {props.caption && <p className="mt-3 font-nm text-[10px] uppercase tracking-[0.22em] opacity-60">{props.caption}</p>}
      </Rev>
      <div>
        <Rev><Eyebrow>{props.eyebrow}</Eyebrow></Rev>
        <Rev d={1}><blockquote className="mt-6 font-brown-sugar text-3xl leading-[1.1] md:text-5xl">“{props.quote}”</blockquote></Rev>
        <Rev d={2}><p className="mt-8 text-[15px] leading-relaxed opacity-80 whitespace-pre-line">{props.body}</p></Rev>
        {props.author && <Rev d={3}><p className="mt-4 font-nm text-[10px] uppercase tracking-[0.28em] opacity-60">— {props.author}</p></Rev>}
      </div>
    </Section>
  );
}

/* 6 · Collections as worlds */
export function WwWorldsScene({ props }: P) {
  const items = lines(props.items);
  const imgs = list(props.images);
  return (
    <Section props={props}>
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <Title num={props.num}>{props.title}</Title>
        <Rev d={2}><p className="max-w-sm text-[15px] leading-relaxed opacity-80">{props.body}</p></Rev>
      </div>
      <div className="mt-14 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
        {items.map(([name, sub, text], i) => (
          <Rev key={i} d={i % 3}>
            <Img src={imgs[i]} alt={name} className="aspect-[4/5]" />
            <h3 className="mt-5 font-brown-sugar text-3xl">{name}</h3>
            {sub && <p className="mt-1 font-nm text-[10px] uppercase tracking-[0.25em] opacity-60">{sub}</p>}
            {text && <p className="mt-3 text-[14px] leading-relaxed opacity-80">{text}</p>}
          </Rev>
        ))}
      </div>
      {props.wide && <Rev className="mt-16"><Img src={props.wide} parallax className="aspect-[16/9] md:aspect-[21/9]" /></Rev>}
    </Section>
  );
}

/* 7 · Atelier */
export function WwAtelierScene({ props }: P) {
  const imgs = list(props.images);
  return (
    <Section props={props}>
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <Title num={props.num}>{props.title}</Title>
        <Rev d={2}><p className="max-w-sm text-[15px] leading-relaxed opacity-80">{props.body}</p></Rev>
      </div>
      <div className="mt-14 grid grid-cols-2 gap-4 md:grid-cols-4 md:grid-rows-2">
        {imgs.slice(0, 5).map((s, i) => (
          <Rev key={s} d={i} className={i === 0 ? "col-span-2 row-span-2" : ""}>
            <Img src={s} className={i === 0 ? "aspect-square md:h-full" : "aspect-square"} parallax={i === 0} />
          </Rev>
        ))}
      </div>
      {props.closing && <Rev d={2}><p className="mt-14 max-w-2xl font-brown-sugar text-3xl leading-tight md:text-4xl">{props.closing}</p></Rev>}
    </Section>
  );
}

/* 8 · Sostenibilidad */
export function WwSustainScene({ props }: P) {
  const items = lines(props.items);
  const causes = lines(props.causes);
  const imgs = list(props.images);
  return (
    <Section props={props}>
      <div className="grid gap-12 md:grid-cols-2 md:gap-20">
        <div>
          <Title num={props.num}>{props.title}</Title>
          <Rev d={2}><p className="mt-6 max-w-md text-[15px] leading-relaxed opacity-80">{props.body}</p></Rev>
          <div className="mt-10 space-y-7">
            {items.map(([t, d], i) => (
              <Rev key={i} d={i}>
                <div className="grid grid-cols-[2.5rem_1fr] gap-4">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-current/30 font-nm text-[12px]">{i + 1}</span>
                  <div>
                    <h4 className="font-brown-sugar text-2xl">{t}</h4>
                    {d && <p className="mt-1 text-[14px] leading-relaxed opacity-75">{d}</p>}
                  </div>
                </div>
              </Rev>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 self-start md:mt-24">
          {imgs.slice(0, 2).map((s, i) => (
            <Rev key={s} d={i + 1} className={i === 1 ? "mt-16" : ""}><Img src={s} parallax className="aspect-[3/4]" /></Rev>
          ))}
        </div>
      </div>
      {causes.length > 0 && (
        <div className="mt-24 border-t border-current/15 pt-14">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <Rev><p className="max-w-md font-brown-sugar text-3xl md:text-5xl">{props.causeTitle}</p></Rev>
            <Rev d={1}><p className="max-w-md text-[15px] leading-relaxed opacity-80">{props.causeBody}</p></Rev>
          </div>
          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {causes.map(([col, t, d], i) => (
              <Rev key={i} d={i}>
                <div className="h-full border-t border-current/25 pt-6">
                  <p className="font-nm text-[10px] uppercase tracking-[0.25em] opacity-60">{col}</p>
                  <h4 className="mt-3 font-brown-sugar text-2xl">{t}</h4>
                  {d && <p className="mt-3 text-[14px] leading-relaxed opacity-75">{d}</p>}
                </div>
              </Rev>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

/* 9 · Comunidad */
export function WwPrideScene({ props }: P) {
  const imgs = list(props.images);
  return (
    <Section props={props}>
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <Title num={props.num}>{props.title}</Title>
        <Rev d={2}><p className="max-w-md font-brown-sugar text-2xl leading-snug md:text-3xl">{props.body}</p></Rev>
      </div>
      <div className="mt-14 columns-2 gap-3 md:columns-5 [&>*]:mb-3">
        {imgs.map((s, i) => (
          <Rev key={s} d={i % 5} className="break-inside-avoid">
            <div className="group overflow-hidden">
              <img src={s} alt="" loading="lazy" className="w-full transition-transform duration-[1.4s] ease-out group-hover:scale-[1.04]" />
            </div>
          </Rev>
        ))}
      </div>
    </Section>
  );
}

/* 10 · Tiendas */
export function WwStoresScene({ props }: P) {
  const stores = lines(props.stores);
  const imgs = list(props.images);
  const extra = list(props.extra);
  return (
    <Section props={props}>
      <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <Title num={props.num}>{props.title}</Title>
        <Rev d={2}><p className="max-w-sm text-[15px] leading-relaxed opacity-80">{props.body}</p></Rev>
      </div>
      <div className="mt-14 grid gap-14 md:grid-cols-2">
        {stores.map(([name, place, text, flag], i) => {
          const g = imgs.slice(i * 3, i * 3 + 3);
          return (
            <Rev key={i} d={i}>
              <div className="grid grid-cols-[1.4fr_1fr] gap-3">
                <Img src={g[0]} parallax className="aspect-[4/5]" />
                <div className="grid grid-rows-2 gap-3">
                  <Img src={g[1]} className="h-full" />
                  <Img src={g[2]} className="h-full" />
                </div>
              </div>
              <h3 className="mt-6 font-brown-sugar text-3xl">
                {name}
                {flag && <span className="ml-3 align-middle rounded-full border border-current/30 px-2 py-0.5 font-nm text-[9px] uppercase tracking-[0.2em]">{flag}</span>}
              </h3>
              {place && <p className="mt-1 font-nm text-[10px] uppercase tracking-[0.25em] opacity-60">{place}</p>}
              {text && <p className="mt-3 text-[14px] leading-relaxed opacity-80">{text}</p>}
            </Rev>
          );
        })}
      </div>
      {extra.length > 0 && (
        <div className="mt-8 grid grid-cols-2 gap-3">
          {extra.slice(0, 2).map((s, i) => (
            <Rev key={s} d={i}><Img src={s} className="aspect-[16/10]" /></Rev>
          ))}
        </div>
      )}
    </Section>
  );
}

/* 11 · Cierre */
export function WwClosingScene({ props }: P) {
  return (
    <section className={cn(BG[props.bg ?? "ink"], "py-24 text-center md:py-36")}>
      <div className="mx-auto flex max-w-3xl flex-col items-center px-6">
        <Rev><Eyebrow>{props.eyebrow}</Eyebrow></Rev>
        <Rev d={1}><p className="mt-6 font-brown-sugar text-6xl leading-[0.9] md:text-9xl whitespace-pre-line">{props.title}</p></Rev>
        <Rev d={2}><p className="mt-6 font-brown-sugar text-2xl opacity-80">{props.signature}</p></Rev>
        <Rev d={3}><p className="mt-8 font-nm text-[11px] tracking-[0.12em] leading-relaxed opacity-70 whitespace-pre-line">{props.contact}</p></Rev>
      </div>
    </section>
  );
}
