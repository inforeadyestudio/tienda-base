import { readAppSetting } from "@/lib/public-settings";
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Puntos reales acumulados por la clienta (suma de sus movimientos). */
export const myPointsQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["loyalty", "points", userId ?? "anon"],
    enabled: Boolean(userId),
    queryFn: async () => {
      if (!userId) return 0;
      const { data, error } = await supabase
        .from("loyalty_transactions")
        .select("points")
        .eq("user_id", userId);
      if (error) throw error;
      return (data ?? []).reduce((sum, r) => sum + (r.points ?? 0), 0);
    },
  });

/** Número real de piezas guardadas en favoritos. */
export const myWishlistCountQuery = (userId: string | undefined) =>
  queryOptions({
    queryKey: ["wishlist", "count", userId ?? "anon"],
    enabled: Boolean(userId),
    queryFn: async () => {
      if (!userId) return 0;
      const { count, error } = await supabase
        .from("wishlists")
        .select("variant_id", { count: "exact", head: true })
        .eq("user_id", userId);
      if (error) throw error;
      return count ?? 0;
    },
  });

export const NEXT_TIER_POINTS = 600;

export type LoyaltyConfig = {
  enabled: boolean; allow_pos: boolean; allow_online: boolean;
  earn_pct: number; point_value_cop: number; max_redeem_pct: number; min_redeem_points: number; sale_no_points: boolean;
};

export const loyaltyConfigQuery = () =>
  queryOptions({
    queryKey: ["app-setting", "loyalty"],
    staleTime: 60_000,
    queryFn: async () => {
      const data = { value: await readAppSetting("loyalty").catch(() => null) };
      const v = (data?.value ?? {}) as Partial<LoyaltyConfig>;
      return {
        enabled: v.enabled ?? true, allow_pos: v.allow_pos ?? true, allow_online: v.allow_online ?? true,
        earn_pct: Number(v.earn_pct ?? 0),
        point_value_cop: Number(v.point_value_cop ?? 0), max_redeem_pct: Number(v.max_redeem_pct ?? 100),
        min_redeem_points: Number(v.min_redeem_points ?? 0),
        sale_no_points: v.sale_no_points ?? false,
      } as LoyaltyConfig;
    },
  });

/** Puntos que se pueden usar en una compra según las reglas; 0 si no alcanza el mínimo. */
export function redeemablePoints(cfg: LoyaltyConfig | undefined, balance: number, subtotalCop: number, channel: "pos" | "online") {
  if (!cfg || !cfg.enabled || cfg.point_value_cop <= 0) return 0;
  if (channel === "pos" ? !cfg.allow_pos : !cfg.allow_online) return 0;
  const max = Math.min(balance, Math.floor((subtotalCop * cfg.max_redeem_pct) / 100 / cfg.point_value_cop));
  return max >= cfg.min_redeem_points && max > 0 ? max : 0;
}

/** Valor en dólares (centavos hacia abajo) de un descuento por puntos en pesos; igual que points_discount_usd en la base. */
export function pointsDiscountUsd(discountCop: number, usdRate: number) {
  if (!(discountCop > 0) || !(usdRate > 0)) return 0;
  return Math.floor((discountCop * 100) / usdRate + 1e-9) / 100;
}
