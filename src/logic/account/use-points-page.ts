// Lógica (Claude NO modifica este archivo). El diseño recibe el resultado como `vm`.
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-hooks";
import { myPointsQuery, NEXT_TIER_POINTS } from "@/lib/loyalty";



export function usePointsPage() {
  const { user } = useSession();
  const { data: points = 0 } = useQuery(myPointsQuery(user?.id));
  const missing = Math.max(0, NEXT_TIER_POINTS - points);
  const progress = Math.min(100, Math.round((points / NEXT_TIER_POINTS) * 100));
  return { user, points, missing, progress };
}

export type PointsPageVM = ReturnType<typeof usePointsPage>;
