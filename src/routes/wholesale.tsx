import { createFileRoute, Link } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { MarqueeBar, useAnnouncements } from "@/lib/announcements";
import { SiteNav } from "@/components/storefront/site-nav";
import { SiteFooter } from "@/components/storefront/site-footer";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/wholesale")({
  head: () =>
    seoHead({
      title: "Wholesale | Tu Marca para tu tienda",
      description:
        "Lleva Tu Marca a tu tienda con condiciones mayoristas. Solicita acceso al portal B2B.",
      path: "/wholesale",
    }),
  component: WholesalePage,
});

const BUSINESS = [
  { v: "boutique", l: "Boutique" },
  { v: "concept_store", l: "Concept store" },
  { v: "distribuidor", l: "Distribuidor" },
  { v: "otro", l: "Otro" },
] as const;

const schema = z.object({
  full_name: z.string().trim().min(1, "Escribe tu nombre").max(120),
  company: z.string().trim().min(1, "Escribe la empresa o tienda").max(160),
  city: z.string().trim().min(1, "Escribe la ciudad").max(120),
  country: z.string().trim().min(1, "Escribe el país").max(80),
  website: z.string().trim().max(255).optional(),
  email: z.string().trim().email("Correo inválido").max(255),
  whatsapp: z.string().trim().min(5, "WhatsApp inválido").max(40),
  business_type: z.enum(["boutique", "concept_store", "distribuidor", "otro"]),
  sells_other_brands: z.boolean().nullable(),
  volume: z.string().trim().max(120).optional(),
  message: z.string().trim().max(2000).optional(),
});

const PERKS = [
  { t: "Colecciones disponibles", d: "Te mostramos qué colecciones están abiertas para venta mayorista esta temporada, con todas sus familias y referencias." },
  { t: "Precios mayoristas", d: "Lista de precios por referencia según tu volumen de compra, con condiciones de pago y descuentos por pedido." },
  { t: "Pedido mínimo (MOQ)", d: "Unidades mínimas por colección y por referencia para activar tu cuenta, pensadas también para tiendas que empiezan." },
  { t: "Inventario en tiempo real", d: "Unidades reales por talla y color, actualizadas al momento, para que no ofrezcas algo que ya no tenemos." },
  { t: "Line sheets y documentos", d: "Fichas de producto, composición, guía de tallas, imágenes y condiciones comerciales listas para descargar." },
  { t: "Próximos drops", d: "Fechas de lanzamientos y ventanas de preventa, para que reserves tu cupo antes de que se agote." },
];

function WholesalePage() {
  const ann = useAnnouncements();
  const wsBar = !!ann?.wholesale.enabled && ann.wholesale.items.length > 0;
  const formRef = useRef<HTMLDivElement>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [other, setOther] = useState<boolean | null>(null);
  const [open, setOpen] = useState<number | null>(0);
  const [type, setType] = useState<string>("boutique");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const g = (k: string) => String(fd.get(k) ?? "");
    const parsed = schema.safeParse({
      full_name: g("full_name"), company: g("company"), city: g("city"), country: g("country"),
      website: g("website") || undefined, email: g("email"), whatsapp: g("whatsapp"),
      business_type: type, sells_other_brands: other, volume: g("volume") || undefined, message: g("message") || undefined,
    });
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? "Revisa el formulario");
    setBusy(true);
    const { error } = await supabase.from("wholesale_applications" as any).insert({ ...parsed.data, email: parsed.data.email.toLowerCase() });
    setBusy(false);
    if (error) return toast.error("No pudimos enviar tu solicitud. Intenta de nuevo.");
    setSent(true);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const field = "w-full border-b border-ink/20 bg-transparent py-3 text-[15px] outline-none transition-colors placeholder:text-ink/35 focus:border-ink";
  const label = "font-nm text-[10px] uppercase tracking-[0.22em] text-moss/70";

  return (
    <div className="min-h-screen bg-ivory text-ink">
      <SiteNav hideAnnouncement={wsBar} />
      <MarqueeBar config={ann?.wholesale} label="Países donde vendemos al mayor" />
      <section className="mx-auto grid max-w-7xl gap-12 px-6 py-20 md:grid-cols-[1.2fr_1fr] md:px-10 md:py-32">
        <div>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="font-nm text-[10px] uppercase tracking-[0.3em] text-moss/70">
            Wholesale
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
            className="mt-5 font-brown-sugar text-5xl leading-[0.95] md:text-8xl"
          >
            Discover Tu Marca for your store.
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3, duration: 0.9 }} className="mt-8 max-w-lg text-[15px] leading-relaxed text-ink/75">
            Accede a nuestra colección, condiciones mayoristas y pedidos B2B. Solicita acceso para conocer disponibilidad, precios y próximos drops.
          </motion.p>
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="mt-10 rounded-full bg-ink px-8 py-4 font-nm text-[11px] uppercase tracking-[0.22em] text-ivory transition-opacity hover:opacity-85"
          >
            Solicitar acceso
          </motion.button>
          <p className="mt-6 text-[13px] text-ink/55">
            ¿Ya tienes acceso? <Link to="/auth" className="underline underline-offset-4 hover:text-ink">Ingresa al portal</Link>
          </p>
        </div>
        <ul className="divide-y divide-ink/10 border-y border-ink/10 md:mt-1 md:self-start">
          {PERKS.map((p, i) => {
            const isOpen = open === i;
            return (
              <motion.li
                key={p.t}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + i * 0.08, duration: 0.7 }}
              >
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls={`perk-${i}`}
                  onClick={() => setOpen(isOpen ? null : i)}
                  className="flex w-full items-center gap-5 py-4 text-left"
                >
                  <span className="font-nm text-[10px] tracking-[0.2em] text-moss/60">{String(i + 1).padStart(2, "0")}</span>
                  <span className={`flex-1 font-nm text-[15px] tracking-[0.01em] transition-colors ${isOpen ? "text-ink" : "text-ink/85 hover:text-ink"}`}>{p.t}</span>
                  <span className="relative h-3 w-3 shrink-0 text-moss/70" aria-hidden>
                    <span className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2 bg-current" />
                    <span className={`absolute left-1/2 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-current transition-all duration-300 ${isOpen ? "rotate-90 opacity-0" : "opacity-100"}`} />
                  </span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      id={`perk-${i}`}
                      key="body"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="pb-5 pl-9 pr-6 text-[13.5px] leading-relaxed text-ink/65">{p.d}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.li>
            );
          })}
        </ul>
      </section>

      <section className="bg-cream">
        <div ref={formRef} className="mx-auto max-w-3xl scroll-mt-20 px-6 py-20 md:py-28">
          {sent ? (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="py-16 text-center">
              <p className="font-nm text-[10px] uppercase tracking-[0.3em] text-moss/70">Solicitud enviada</p>
              <h2 className="mt-5 font-brown-sugar text-4xl md:text-6xl">Gracias</h2>
              <p className="mx-auto mt-6 max-w-md text-[15px] leading-relaxed text-ink/75">
                Recibimos tu solicitud. Nuestro equipo la revisará y te contactará para activar tu acceso.
              </p>
            </motion.div>
          ) : (
            <>
              <p className="font-nm text-[10px] uppercase tracking-[0.3em] text-moss/70">Aplicación</p>
              <h2 className="mt-4 font-brown-sugar text-4xl md:text-6xl">Solicitar acceso</h2>
              <form onSubmit={submit} className="mt-12 grid gap-x-8 gap-y-8 md:grid-cols-2">
                <label className="block"><span className={label}>Nombre</span><input name="full_name" required maxLength={120} className={field} /></label>
                <label className="block"><span className={label}>Empresa / tienda</span><input name="company" required maxLength={160} className={field} /></label>
                <label className="block"><span className={label}>Ciudad</span><input name="city" required maxLength={120} className={field} /></label>
                <label className="block"><span className={label}>País</span><input name="country" required maxLength={80} className={field} /></label>
                <label className="block"><span className={label}>Instagram o página web</span><input name="website" maxLength={255} placeholder="@tutienda" className={field} /></label>
                <label className="block"><span className={label}>Email</span><input name="email" type="email" required maxLength={255} className={field} /></label>
                <label className="block"><span className={label}>WhatsApp</span><input name="whatsapp" type="tel" required maxLength={40} placeholder="+57 300 000 0000" className={field} /></label>
                <label className="block"><span className={label}>Volumen aproximado de compra</span><input name="volume" maxLength={120} placeholder="Ej. 50–100 unidades por temporada" className={field} /></label>
                <div className="md:col-span-2">
                  <span className={label}>Tipo de negocio</span>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {BUSINESS.map((b) => (
                      <button type="button" key={b.v} onClick={() => setType(b.v)} className={`rounded-full border px-4 py-2 text-[13px] transition-colors ${type === b.v ? "border-ink bg-ink text-ivory" : "border-ink/20 hover:border-ink"}`}>
                        {b.l}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <span className={label}>¿Ya comercializa otras marcas?</span>
                  <div className="mt-3 flex gap-2">
                    {[{ v: true, l: "Sí" }, { v: false, l: "No" }].map((o) => (
                      <button type="button" key={o.l} onClick={() => setOther(o.v)} className={`rounded-full border px-5 py-2 text-[13px] transition-colors ${other === o.v ? "border-ink bg-ink text-ivory" : "border-ink/20 hover:border-ink"}`}>
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="block md:col-span-2"><span className={label}>Mensaje o interés particular</span><textarea name="message" rows={3} maxLength={2000} className={field} /></label>
                <div className="md:col-span-2">
                  <button disabled={busy} className="rounded-full bg-ink px-8 py-4 font-nm text-[11px] uppercase tracking-[0.22em] text-ivory transition-opacity hover:opacity-85 disabled:opacity-50">
                    {busy ? "Enviando…" : "Enviar solicitud"}
                  </button>
                </div>
              </form>
            </>
          )}
        </div>
      </section>
      <SiteFooter />
    </div>
  );
}
