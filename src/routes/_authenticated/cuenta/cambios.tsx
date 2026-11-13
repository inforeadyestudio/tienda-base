import { createFileRoute } from "@tanstack/react-router";
import { useReturnsPage } from "@/logic/account/use-returns-page";
import { ReturnsView } from "@/design/account/returns-view";
export const Route = createFileRoute("/_authenticated/cuenta/cambios")({
  head: () => ({
    meta: [
      { title: "Cambios y devoluciones · Tu Marca" },
      { name: "description", content: "Solicita el cambio o la devolución de tus compras y sigue el estado de cada solicitud." },
      { property: "og:title", content: "Cambios y devoluciones · Tu Marca" },
      { property: "og:description", content: "Solicita el cambio o la devolución de tus compras en pocos pasos." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CambiosPage,
});

function CambiosPage() {
  const vm = useReturnsPage();
  return <ReturnsView vm={vm} />;
}
