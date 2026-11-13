import { createFileRoute } from "@tanstack/react-router";
import { usePointsPage } from "@/logic/account/use-points-page";
import { PointsView } from "@/design/account/points-view";
export const Route = createFileRoute("/_authenticated/cuenta/puntos")({
  head: () => ({
    meta: [
      { title: "Tu Marca Circle · Puntos" },
      { name: "description", content: "Tus puntos Tu Marca Circle y los beneficios que puedes desbloquear." },
    ],
  }),
  component: PointsPage,
});

function PointsPage() {
  const vm = usePointsPage();
  return <PointsView vm={vm} />;
}
