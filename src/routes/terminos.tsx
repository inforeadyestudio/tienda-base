import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteNav } from "@/components/storefront/site-nav";
import { SiteFooter } from "@/components/storefront/site-footer";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/terminos")({
  head: () =>
    seoHead({
      title: "Términos y condiciones | Tu Marca",
      description: "Términos y condiciones de compra en la tienda online de Tu Marca.",
      path: "/terminos",
    }),
  component: TerminosPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-nm text-[12px] uppercase tracking-[0.22em] text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-moss">{children}</div>
    </section>
  );
}

function TerminosPage() {
  return (
    <div className="min-h-screen bg-ivory">
      <SiteNav />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="font-nm text-[10px] uppercase tracking-[0.28em] text-moss/60">Legal</p>
        <h1 className="mt-3 font-serif text-4xl italic text-ink">Términos y condiciones</h1>
        <p className="mt-4 text-[13px] text-moss/70">
          Última actualización: 20 de octubre de 2026. Estos términos rigen el uso de la tienda y se interpretan conforme a la
          legislación colombiana, en especial la Ley 1480 de 2011 (Estatuto del Consumidor) y la Ley 527 de 1999 sobre
          comercio electrónico.
        </p>

        <Section title="1. Identificación">
          <p>
            Tu Marca es una marca de moda con operación en Colombia. Los pedidos realizados en este sitio se atienden
            desde nuestra bodega en Cali, Valle del Cauca. Para cualquier solicitud puedes escribirnos por los canales
            publicados en la página de contacto.
          </p>
        </Section>

        <Section title="2. Aceptación">
          <p>
            Al navegar, crear una cuenta o realizar una compra aceptas estos términos, la Política de tratamiento de datos
            personales y la Política de cambios y devoluciones. Si no estás de acuerdo, por favor abstente de usar el sitio.
          </p>
        </Section>

        <Section title="3. Productos y precios">
          <p>
            Las prendas se elaboran en tiradas limitadas, por lo que la disponibilidad puede cambiar en cualquier momento.
            Los precios se expresan en pesos colombianos (COP) e incluyen los impuestos aplicables cuando corresponda. Las
            fotografías son referenciales: pueden existir variaciones mínimas de color según la pantalla.
          </p>
          <p>
            Si por un error evidente se publica un precio incorrecto, podremos anular el pedido informándote y reintegrando
            el valor pagado.
          </p>
        </Section>

        <Section title="4. Pedidos y pagos">
          <p>
            El pedido se confirma cuando el pago es aprobado por la pasarela o el medio elegido (tarjeta, PSE, transferencia,
            datáfono o efectivo en punto físico). Recibirás la confirmación al correo registrado.
          </p>
          <p>
            Nos reservamos el derecho de rechazar pedidos con indicios de fraude, datos incompletos o incumplimiento de estos
            términos.
          </p>
        </Section>

        <Section title="5. Envíos">
          <p>
            Los tiempos y tarifas dependen del destino y del peso del pedido; se calculan y se muestran antes de pagar. Los
            envíos internacionales pueden generar aranceles o impuestos de importación a cargo de quien recibe.
          </p>
        </Section>

        <Section title="Condiciones del SALE">
          <ol className="list-decimal space-y-3 pl-5">
            <li>Las prendas en descuento no tienen cambios ni devoluciones.</li>
            <li>En el SALE tendremos últimas unidades, samples y algunas prendas con leves imperfectos que no afectan la usabilidad ni el look general de la prenda.</li>
            <li>Los envíos nacionales tienen un costo de $17.000 COP y los envíos internacionales US$30.</li>
            <li>Los envíos pueden tardar hasta 8 días hábiles.</li>
          </ol>
          <p>Estas condiciones no limitan la garantía legal ni los derechos del consumidor que resulten aplicables.</p>
        </Section>

        <Section title="6. Derecho de retracto y reversión del pago">
          <p>
            Conforme al artículo 47 de la Ley 1480 de 2011, tienes cinco (5) días hábiles desde la entrega para ejercer el
            derecho de retracto en compras hechas por medios electrónicos. La prenda debe devolverse en las mismas
            condiciones en que la recibiste. También aplica la reversión del pago prevista en el artículo 51 cuando se
            cumplan sus supuestos.
          </p>
          <p>
            El detalle del procedimiento está en la{" "}
            <Link to="/cambios-y-devoluciones" className="underline hover:text-ink">
              Política de cambios y devoluciones
            </Link>
            .
          </p>
        </Section>

        <Section title="7. Garantía">
          <p>
            Toda prenda cuenta con garantía legal por defectos de fabricación conforme a la Ley 1480 de 2011. No cubre el
            desgaste normal, el daño por uso indebido ni el incumplimiento de las instrucciones de cuidado de la etiqueta.
          </p>
        </Section>

        <Section title="8. Cuenta de usuario">
          <p>
            Eres responsable de la veracidad de tus datos y de la custodia de tu contraseña. Podemos suspender cuentas que
            usen el sitio de forma fraudulenta o que afecten su funcionamiento.
          </p>
        </Section>

        <Section title="9. Propiedad intelectual">
          <p>
            Los textos, fotografías, videos, diseños y marcas de este sitio son propiedad de Tu Marca y no pueden
            reproducirse sin autorización escrita.
          </p>
        </Section>

        <Section title="10. Ley aplicable y controversias">
          <p>
            Estos términos se rigen por la ley colombiana. Cualquier controversia se intentará resolver de manera directa y,
            de no lograrse, se someterá a los jueces competentes de Colombia. También puedes acudir a la Superintendencia de
            Industria y Comercio.
          </p>
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}
