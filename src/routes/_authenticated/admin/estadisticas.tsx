import { createFileRoute, redirect } from "@tanstack/react-router";

// Las estadísticas de ventas ahora viven en Pedidos → Análisis.
export const Route = createFileRoute("/_authenticated/admin/estadisticas")({
  beforeLoad: () => {
    if (typeof window !== "undefined") window.sessionStorage.setItem("pedidos.tab", JSON.stringify("analisis"));
    throw redirect({ to: "/admin/pedidos" });
  },
});
