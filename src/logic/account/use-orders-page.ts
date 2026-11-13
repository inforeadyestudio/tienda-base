// Lógica (Claude NO modifica este archivo). El diseño recibe el resultado como `vm`.
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth-hooks";
import { formatDate, formatCOP, formatUSD } from "@/lib/format";
import { useState } from "react";



export function useOrdersPage() {
  const { user } = useSession();
  const [review, setReview] = useState<{ id: string; number: string | number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: orders, isLoading } = useQuery({
    queryKey: ["my-orders-all", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("orders")
        .select("id, number, status, total_cop, subtotal_cop, shipping_cop, discount_cop, currency, total_usd:total_usd_exact, created_at, ship_to, contact_name, shipping_carrier, tracking_number, b2b_ship_eta, order_items(id, qty, unit_price_cop, product_name, variant_label, product_variants(size, color, products(hero_image_url, product_images(url, position))))")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });
  const selected = orders?.find((order) => order.id === selectedId);
  const selectedItems = selected?.order_items ?? [];
  const selectedShip = selected?.ship_to && typeof selected.ship_to === "object" && !Array.isArray(selected.ship_to)
    ? selected.ship_to as Record<string, unknown> : {};
  const address = [selectedShip.line1 ?? selectedShip.address ?? selectedShip.street, selectedShip.line2 ?? selectedShip.address2,
    [selectedShip.city, selectedShip.department ?? selectedShip.state ?? selectedShip.province].filter(Boolean).join(", "),
    selectedShip.country, selectedShip.postal_code ?? selectedShip.zip].filter(Boolean).join(" · ");
  const money = (cop: number) => selected?.currency === "USD" && Number(selected.subtotal_cop) > 0 && selected.total_usd != null
    ? formatUSD(cop * Number(selected.total_usd) / Number(selected.subtotal_cop))
    : formatCOP(cop);


  return { user, review, setReview, selectedId, setSelectedId, orders, isLoading, selected, selectedItems, selectedShip, address, money };
}

export type OrdersPageVM = ReturnType<typeof useOrdersPage>;
