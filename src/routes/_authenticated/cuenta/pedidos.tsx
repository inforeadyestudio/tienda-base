import { createFileRoute } from "@tanstack/react-router";
import { useOrdersPage } from "@/logic/account/use-orders-page";
import { OrdersView } from "@/design/account/orders-view";
export const Route = createFileRoute("/_authenticated/cuenta/pedidos")({
  head: () => ({
    meta: [
      { title: "Mis pedidos · Tu Marca" },
      { name: "description", content: "Consulta el estado y el historial de tus pedidos en Tu Marca." },
      { property: "og:title", content: "Mis pedidos · Tu Marca" },
      { property: "og:description", content: "Consulta el estado y el historial de tus pedidos en Tu Marca." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OrdersPage,
});

function OrdersPage() {
  const vm = useOrdersPage();
  return <OrdersView vm={vm} />;
}
