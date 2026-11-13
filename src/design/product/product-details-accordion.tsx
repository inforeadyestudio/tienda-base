import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

type Props = {
  description?: string | null;
  materials?: string | null;
  care?: string | null;
  className?: string;
};

const POLICY = {
  cambios:
    "Tienes 10 días calendario desde que recibes tu pedido para solicitar un cambio. La prenda debe estar sin uso, con etiquetas y en su empaque original. Puedes iniciar tu solicitud desde tu cuenta, en Cambios y devoluciones.",
  envios:
    "Durante el SALE, los envíos nacionales tienen un costo de $17.000 COP y los envíos internacionales US$30. Los envíos pueden tardar hasta 8 días hábiles.",
  garantia:
    "Todas nuestras piezas tienen garantía por defectos de fabricación. Si detectas algo, escríbenos con fotos y número de pedido y te acompañamos en la solución.",
};

export function ProductDetailsAccordion({ description, materials, care, className = "" }: Props) {
  const cuidados =
    care ||
    "Lavar a mano o en ciclo delicado con agua fría. No usar blanqueador. Secar a la sombra y planchar a temperatura baja.";

  return (
    <div className={className}>
      <Accordion type="single" collapsible className="w-full">
        {(description || materials) && (
          <AccordionItem value="descripcion">
            <AccordionTrigger className="font-nm text-[11px] uppercase tracking-[0.14em]">Descripción</AccordionTrigger>
            <AccordionContent className="font-serif text-[13px] leading-relaxed text-ink/75">
              {description}
              {materials && <span className="mt-3 block">{materials}</span>}
            </AccordionContent>
          </AccordionItem>
        )}
        <AccordionItem value="cambios">
          <AccordionTrigger className="font-nm text-[11px] uppercase tracking-[0.14em]">Políticas de cambios</AccordionTrigger>
          <AccordionContent className="font-serif text-[13px] leading-relaxed text-ink/75">
            <p>{POLICY.cambios}</p>
            <h3 className="mt-4 font-nm">Condiciones del SALE</h3>
            <ol className="mt-3 list-decimal space-y-3 pl-5">
              <li>Las prendas en descuento no tienen cambios ni devoluciones.</li>
              <li>En el SALE tendremos últimas unidades, samples y algunas prendas con leves imperfectos que no afectan la usabilidad ni el look general de la prenda.</li>
              <li>Los envíos nacionales tienen un costo de $17.000 COP y los envíos internacionales US$30.</li>
              <li>Los envíos pueden tardar hasta 8 días hábiles.</li>
            </ol>
            <p className="mt-3">Estas condiciones no limitan la garantía legal ni los derechos del consumidor que resulten aplicables.</p>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="envios">
          <AccordionTrigger className="font-nm text-[11px] uppercase tracking-[0.14em]">Envíos</AccordionTrigger>
          <AccordionContent className="font-serif text-[13px] leading-relaxed text-ink/75">{POLICY.envios}</AccordionContent>
        </AccordionItem>
        <AccordionItem value="cuidados">
          <AccordionTrigger className="font-nm text-[11px] uppercase tracking-[0.14em]">Cuidados</AccordionTrigger>
          <AccordionContent className="font-serif text-[13px] leading-relaxed text-ink/75">{cuidados}</AccordionContent>
        </AccordionItem>
        <AccordionItem value="garantia">
          <AccordionTrigger className="font-nm text-[11px] uppercase tracking-[0.14em]">Garantía</AccordionTrigger>
          <AccordionContent className="font-serif text-[13px] leading-relaxed text-ink/75">{POLICY.garantia}</AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
