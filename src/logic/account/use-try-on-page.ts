// Lógica (Claude NO modifica este archivo). El diseño recibe el resultado como `vm`.
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/lib/auth-hooks";
import { tryOnSettingsQuery } from "@/lib/tryon/settings";
import { tryOnResultsQuery } from "@/lib/tryon/results";



export function useTryOnPage() {
  const { user } = useSession();
  const { data: settings } = useQuery(tryOnSettingsQuery());

  const { data: results } = useQuery(tryOnResultsQuery(user?.id));

  return { user, settings, results };
}

export type TryOnPageVM = ReturnType<typeof useTryOnPage>;
