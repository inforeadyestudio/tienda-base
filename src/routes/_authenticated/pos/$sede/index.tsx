import { createFileRoute, useParams } from "@tanstack/react-router";
import { PosTerminal } from "@/components/pos/pos-terminal";
import { SEDES } from "./route";

export const Route = createFileRoute("/_authenticated/pos/$sede/")({
  head: ({ params }) => ({ meta: [
    { title: `Caja ${params.sede} · POS Tu Marca` },
    { name: "description", content: "Caja de tienda Tu Marca: venta de prendas y lectura de códigos." },
    { property: "og:title", content: `Caja ${params.sede} · Tu Marca` },
    { property: "og:description", content: "Caja de tienda y ventas POS de Tu Marca." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: PosSedeTerminal,
});

function PosSedeTerminal() {
  const { sede } = useParams({ from: "/_authenticated/pos/$sede/" });
  const info = SEDES[sede as keyof typeof SEDES];
  return <PosTerminal defaultCode={info.code} title={`Caja ${info.label.replace("Tienda ", "")}`} />;
}