import { createFileRoute } from "@tanstack/react-router";
import { OrderDetail } from "../pedido.$id";

export const Route = createFileRoute("/_authenticated/admin/b2b/pedido/$id")({
  head: () => ({ meta: [
    { title: "Pedido B2B | Tu Marca" },
    { name: "description", content: "Detalle de pedido mayorista de Tu Marca." },
    { property: "og:title", content: "Pedido B2B | Tu Marca" },
    { property: "og:description", content: "Detalle de pedido mayorista de Tu Marca." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: OrderDetail,
});
