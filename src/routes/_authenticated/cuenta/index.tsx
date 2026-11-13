import { createFileRoute, Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { ACCOUNT_HERO_KEY, DEFAULT_ACCOUNT_HERO, type AccountHero } from "@/lib/account-hero";
import { myPointsQuery, myWishlistCountQuery, NEXT_TIER_POINTS } from "@/lib/loyalty";
import { myMessagesQuery } from "@/lib/crm/messages";
import { closetQueryOptions } from "@/lib/closet/queries";
import { tryOnResultsQuery } from "@/lib/tryon/results";
import { useAccountHome } from "@/logic/account/use-account-home";
import { AccountHomeView } from "@/design/account/account-home-view";
export const Route = createFileRoute("/_authenticated/cuenta/")({
  head: () => ({
    meta: [
      { title: "Mi cuenta · Tu Marca" },
      { name: "description", content: "Tu espacio personal en Tu Marca: closet, pedidos, puntos e inspiraciones." },
      { property: "og:title", content: "Mi cuenta · Tu Marca" },
      { property: "og:description", content: "Tu espacio personal en Tu Marca: closet, pedidos, puntos e inspiraciones." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  // Precargamos todo lo que ve la clienta para que el perfil abra de una sola
  // vez, sin un loader de ruta seguido de spinners en cada tarjeta.
  loader: async ({ context }) => {
    const user = (context as { user?: { id: string } }).user;
    if (!user) return null;
    const qc = context.queryClient;
    await Promise.allSettled([
      qc.ensureQueryData({
        queryKey: ["profile", user.id],
        queryFn: async () => {
          const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
          if (error) throw error;
          return data;
        },
      }),
      qc.ensureQueryData({
        queryKey: ["my-orders", user.id],
        queryFn: async () => {
          const { data, error } = await supabase
            .from("orders")
            .select("id, number, status, total_cop, created_at")
            .eq("customer_id", user.id)
            .order("created_at", { ascending: false })
            .limit(3);
          if (error) throw error;
          return data ?? [];
        },
      }),
      qc.ensureQueryData({
        queryKey: ["is_staff", user.id],
        queryFn: async () => {
          const { data, error } = await supabase.rpc("is_staff", { _user_id: user.id });
          if (error) throw error;
          return Boolean(data);
        },
      }),
      qc.ensureQueryData({
        queryKey: ["app-setting", ACCOUNT_HERO_KEY],
        queryFn: async () => {
          const { data, error } = await supabase.from("app_settings").select("value").eq("key", ACCOUNT_HERO_KEY).maybeSingle();
          if (error) throw error;
          return (data?.value ?? null) as AccountHero | null;
        },
      }),
      qc.ensureQueryData(myPointsQuery(user.id)),
      qc.ensureQueryData(myWishlistCountQuery(user.id)),
      qc.ensureQueryData(myMessagesQuery(user.id)),
      qc.ensureQueryData(closetQueryOptions(user.id)),
      qc.ensureQueryData(tryOnResultsQuery(user.id)),
    ]);
    return null;
  },
  component: AccountHome,
});

function AccountHome() {
  const vm = useAccountHome();
  return <AccountHomeView vm={vm} />;
}
