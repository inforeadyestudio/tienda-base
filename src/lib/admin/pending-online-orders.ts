import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Pedidos Ecommerce (online y manuales, nacionales e internacionales) con pago
 * confirmado que aún no han sido enviados/preparados. Los manuales pagados
 * permanecen en status "draft" hasta generar guía, por eso se excluyen los
 * estados terminales en lugar de listar los activos.
 */
export function usePendingOnlineOrders() {
  return useQuery({
    queryKey: ["admin", "pending-online-orders"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { count, error } = await supabase.from("orders")
        .select("id", { count: "exact", head: true })
        .eq("source", "ecom")
        .or("payment_status.eq.paid,paid_at.not.is.null")
        .not("status", "in", "(shipped,delivered,cancelled,refunded)");
      if (error) throw error;
      return count ?? 0;
    },
  });
}