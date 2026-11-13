// Lógica (Claude NO modifica este archivo). El diseño recibe el resultado como `vm`.
import { usePortalModules } from "@/lib/portal-modules";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useProfile, useIsStaff } from "@/lib/auth-hooks";
import { ACCOUNT_HERO_KEY, DEFAULT_ACCOUNT_HERO, type AccountHero } from "@/lib/account-hero";
import { myPointsQuery, myWishlistCountQuery, NEXT_TIER_POINTS } from "@/lib/loyalty";
import { myMessagesQuery } from "@/lib/crm/messages";
import { tryOnResultsQuery } from "@/lib/tryon/results";



export function useAccountHome() {
  const { user } = useSession();
  const { data: modules } = usePortalModules();
  const { data: profile } = useProfile();
  const { data: isStaff } = useIsStaff();

  const { data: orders } = useQuery({
    queryKey: ["my-orders", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("id, number, status, total_cop, created_at")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(3);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const { data: heroSetting } = useQuery({
    queryKey: ["app-setting", ACCOUNT_HERO_KEY],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", ACCOUNT_HERO_KEY)
        .maybeSingle();
      if (error) throw error;
      return (data?.value ?? null) as AccountHero | null;
    },
  });
  const hero: AccountHero = { ...DEFAULT_ACCOUNT_HERO, ...(heroSetting ?? {}) };

  const { data: points = 0 } = useQuery(myPointsQuery(user?.id));
  const { data: wishlistCount = 0 } = useQuery(myWishlistCountQuery(user?.id));
  const { data: messages = [] } = useQuery(myMessagesQuery(user?.id));
  const { data: tryOnResults = [] } = useQuery(tryOnResultsQuery(user?.id));
  const unreadCount = messages.filter((m) => !m.read_at).length;
  const missing = Math.max(0, NEXT_TIER_POINTS - points);
  const progress = Math.min(100, Math.round((points / NEXT_TIER_POINTS) * 100));

  const firstName = profile?.full_name?.split(" ")[0] ?? (user?.email?.split("@")[0] ?? "");

  return { user, modules, profile, isStaff, orders, heroSetting, hero, points, wishlistCount, messages, tryOnResults, unreadCount, missing, progress, firstName };
}

export type AccountHomeVM = ReturnType<typeof useAccountHome>;
