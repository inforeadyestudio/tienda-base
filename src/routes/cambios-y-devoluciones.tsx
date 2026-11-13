import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteNav } from "@/components/storefront/site-nav";
import { SiteFooter } from "@/components/storefront/site-footer";
import { fetchGuideSettings, DEFAULT_GUIDE } from "@/lib/returns-guide";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/cambios-y-devoluciones")({
  head: () =>
    seoHead({
      title: "Cambios y devoluciones | Tu Marca",
      description: "Cómo solicitar un cambio o la devolución de tu dinero en Tu Marca: plazos legales, condiciones y pasos.",
      path: "/cambios-y-devoluciones",
    }),
  component: CambiosPolicyPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-nm text-[12px] uppercase tracking-[0.22em] text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-moss">{children}</div>
    </section>
  );
}

function CambiosPolicyPage() {
  const { data: guide } = useQuery({
    queryKey: ["returns-guide-settings"],
    queryFn: fetchGuideSettings,
    staleTime: 300_000,
  });
  const s = guide ?? DEFAULT_GUIDE;

  return (
    <div className="min-h-screen bg-ivory">
      <SiteNav />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="font-nm text-[10px] uppercase tracking-[0.28em] text-moss/60">Legal</p>
        <h1 className="mt-3 font-serif text-4xl italic text-ink">Política de cambios y devoluciones</h1>
        <p className="mt-4 text-[13px] text-moss/70">
          Esta política complementa nuestros{" "}
          <Link to="/terminos" className="underline hover:text-ink">
            términos y condiciones
          </Link>{" "}
          y respeta los derechos de la Ley 1480 de 2011.
        </p>

        <Section title="Derecho de retracto">
          <p>
            En compras hechas por internet tienes cinco (5) días hábiles contados desde la entrega para retractarte. Te
            devolvemos el valor pagado dentro de los treinta (30) días calendario siguientes a que recibamos la prenda en
            buen estado. El costo del transporte de regreso corre por cuenta de quien compra.
          </p>
        </Section>

        <Section title="Cambios de talla o producto">
          <p>
            Puedes solicitar el cambio desde tu cuenta, en la sección Cambios y devoluciones. Si eliges otra talla de la
            misma referencia, el sistema te muestra lo disponible y reserva la prenda mientras revisamos y aprobamos la
            solicitud.
          </p>
        </Section>

        <Section title="Cómo te devolvemos">
          <p>
            Elijas Puntos Tu Marca o devolución de dinero, el proceso es el mismo: primero recibimos la prenda en nuestro
            almacén y la revisamos. Si está sin uso, con sus etiquetas y en las condiciones que nos indicaste, aprobamos la
            solicitud y en ese momento se genera tu devolución.
          </p>
          <p>
            <span className="text-ink">Devolución en Puntos Tu Marca:</span> se suman a tu cuenta de inmediato, en el momento
            de la aprobación.
          </p>
          <p>
            <span className="text-ink">Devolución de dinero:</span> normalmente tarda entre 10 y 15 días hábiles, según tu
            banco o la tarjeta con la que pagaste.
          </p>
        </Section>


        <Section title="Condiciones de la prenda">
          <ul className="list-disc space-y-1 pl-5">
            {s.rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Section>

        <Section title="Garantía por defectos">
          <p>
            Si la prenda presenta un defecto de fabricación aplica la garantía legal: reparación, cambio o devolución del
            dinero, según corresponda. No cubre desgaste por uso normal ni daños por lavado o secado distintos a los
            indicados en la etiqueta.
          </p>
        </Section>

        <Section title="Productos sin cambio">
          <p>
            Por higiene, no se aceptan cambios ni devoluciones de ropa interior, vestidos de baño ni accesorios de uso
            personal, salvo defecto de fabricación. Tampoco aplica en piezas hechas a la medida o personalizadas.
          </p>
        </Section>

        <Section title="Dirección para envíos de devolución">
          <p>
            {s.warehouse_name}
            <br />
            {s.warehouse_address}
            <br />
            {s.warehouse_city}
            {s.warehouse_phone ? (
              <>
                <br />
                Tel. {s.warehouse_phone}
              </>
            ) : null}
          </p>
          <p>
            Al aprobar tu solicitud puedes imprimir la guía desde tu cuenta con tus datos, los nuestros y las reglas del
            envío.
          </p>
        </Section>

        <Section title="Cómo solicitarlo">
          <p>
            Ingresa a{" "}
            <Link to="/cuenta/cambios" className="underline hover:text-ink">
              Cambios y devoluciones
            </Link>{" "}
            en tu cuenta y completa el formulario paso a paso. Te avisamos por correo cada vez que la solicitud cambie de
            estado.
          </p>
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}
