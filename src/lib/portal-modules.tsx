import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const PORTAL_MODULES_KEY = "customer_portal_modules";
export type PortalModules = { closet: boolean };
export const DEFAULT_PORTAL_MODULES: PortalModules = { closet: false };

export function usePortalModules() {
  return useQuery({
    queryKey: ["app-setting", PORTAL_MODULES_KEY],
    queryFn: async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", PORTAL_MODULES_KEY).maybeSingle();
      return { ...DEFAULT_PORTAL_MODULES, ...((data?.value ?? {}) as Partial<PortalModules>) };
    },
    staleTime: 60_000,
  });
}

export function WishlistGiftTabs({ active }: { active: "wishlist" | "regalos" }) {
  const cls = (on: boolean) =>
    "rounded-full px-4 py-2 text-[11px] uppercase tracking-[0.16em] border transition " +
    (on ? "bg-ink text-ivory border-ink" : "border-ink/15 text-moss hover:bg-cream/60");
  return (
    <div className="mb-6 flex gap-2">
      <Link to="/cuenta/wishlist" className={cls(active === "wishlist")}>Favoritos</Link>
      <Link to="/cuenta/regalos" className={cls(active === "regalos")}>Lista de regalos</Link>
    </div>
  );
}
