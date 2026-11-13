import { createFileRoute } from "@tanstack/react-router";
import { SiteNav } from "@/components/storefront/site-nav";
import { SiteFooter } from "@/components/storefront/site-footer";
import { seoHead } from "@/lib/seo";

export const Route = createFileRoute("/privacidad")({
  head: () =>
    seoHead({
      title: "Política de tratamiento de datos | Tu Marca",
      description: "Cómo Tu Marca recopila, usa y protege tus datos personales.",
      path: "/privacidad",
    }),
  component: PrivacidadPage,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="font-nm text-[12px] uppercase tracking-[0.22em] text-ink">{title}</h2>
      <div className="mt-3 space-y-3 text-[14px] leading-relaxed text-moss">{children}</div>
    </section>
  );
}

function PrivacidadPage() {
  return (
    <div className="min-h-screen bg-ivory">
      <SiteNav />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="font-nm text-[10px] uppercase tracking-[0.28em] text-moss/60">Legal</p>
        <h1 className="mt-3 font-serif text-4xl italic text-ink">Política de tratamiento de datos personales</h1>
        <p className="mt-4 text-[13px] text-moss/70">
          Última actualización: septiembre de 2026. Esta política se adopta conforme a la Ley 1581 de 2012, el Decreto 1074
          de 2015 y demás normas colombianas sobre protección de datos personales.
        </p>

        <Section title="1. Responsable">
          <p>
            Tu Marca, con operación en Cali, Valle del Cauca (Colombia), es responsable del tratamiento de los datos
            personales recolectados a través de este sitio, de la tienda física y de los canales de atención.
          </p>
        </Section>

        <Section title="2. Datos que recolectamos">
          <p>
            Nombre, documento de identidad, correo electrónico, teléfono, dirección de envío y facturación, historial de
            compras y preferencias, y datos técnicos de navegación (páginas vistas, ciudad aproximada, origen de la visita y
            dispositivo). Los datos de pago los procesan directamente las pasarelas autorizadas; no almacenamos números
            completos de tarjetas.
          </p>
        </Section>

        <Section title="3. Finalidades">
          <p>
            Procesar y despachar pedidos; gestionar cambios, devoluciones y garantías; administrar tu cuenta, favoritos,
            listas de regalo y puntos; prevenir fraude; cumplir obligaciones contables y legales; y, con tu autorización,
            enviarte comunicaciones comerciales sobre colecciones y novedades.
          </p>
        </Section>

        <Section title="4. Autorización">
          <p>
            Al crear una cuenta, comprar o suscribirte autorizas de forma previa, expresa e informada el tratamiento de tus
            datos para las finalidades descritas. Puedes retirar la autorización cuando lo desees, salvo que exista un deber
            legal o contractual de conservarlos.
          </p>
        </Section>

        <Section title="5. Datos sensibles y de menores">
          <p>
            No solicitamos datos sensibles. Cuando compartas fotografías o medidas corporales de manera voluntaria para
            asesoría de talla, su entrega es facultativa. El sitio no está dirigido a menores de edad; sus datos solo se
            tratan con autorización de sus representantes legales.
          </p>
        </Section>

        <Section title="6. Derechos del titular">
          <p>
            Puedes conocer, actualizar y rectificar tus datos; solicitar prueba de la autorización; ser informado sobre el
            uso dado a tus datos; presentar quejas ante la Superintendencia de Industria y Comercio; y revocar la
            autorización o solicitar la supresión cuando no exista un deber legal de conservarlos.
          </p>
        </Section>

        <Section title="7. Canal de atención">
          <p>
            Las consultas se atienden en un máximo de diez (10) días hábiles y los reclamos en quince (15) días hábiles,
            prorrogables según la ley. Escríbenos desde tu cuenta o a nuestro correo de contacto indicando tu nombre,
            documento y la solicitud concreta.
          </p>
        </Section>

        <Section title="8. Encargados y transferencias">
          <p>
            Para operar utilizamos proveedores de alojamiento, analítica, pagos, mensajería y transporte, que actúan como
            encargados bajo instrucciones nuestras y con deberes de confidencialidad. Algunos pueden estar ubicados fuera de
            Colombia; en ese caso exigimos niveles adecuados de protección.
          </p>
        </Section>

        <Section title="9. Seguridad y vigencia">
          <p>
            Aplicamos medidas técnicas y administrativas razonables para proteger la información. Los datos se conservan
            mientras exista la relación comercial y durante los plazos legales aplicables. Esta política puede actualizarse;
            los cambios se publican en esta misma página.
          </p>
        </Section>
      </main>
      <SiteFooter />
    </div>
  );
}
