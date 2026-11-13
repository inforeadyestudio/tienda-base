import { redirect, createFileRoute } from "@tanstack/react-router";
import { ReturnsPanel } from "@/components/admin/returns-panel";

export const Route = createFileRoute("/_authenticated/admin/tienda/cambios")({
  beforeLoad: () => { throw redirect({ to: "/admin/cambios" }); },
  head: () => ({ meta: [
    { title: "Cambios online · Tu Marca" },
    { name: "description", content: "Gestión de cambios y devoluciones de pedidos online Tu Marca." },
    { property: "og:title", content: "Cambios online · Tu Marca" },
    { property: "og:description", content: "Gestión de cambios y devoluciones de pedidos online Tu Marca." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: () => <ReturnsPanel scope={{ kind: "ecom" }} title="Cambios y devoluciones" subtitle="Tienda Online" />,
});