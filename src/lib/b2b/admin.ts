import { fetchAll } from "@/lib/fetch-all";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type B2BAccount = {
  userId: string;
  name: string;
  phone: string | null;
  since: string;
  orders: number;
  total: number;
  last: string | null;
};

export function useB2BAccounts() {
  return useQuery({
    queryKey: ["admin-b2b-accounts"],
    queryFn: async (): Promise<B2BAccount[]> => {
      const { data: roles, error } = await supabase
        .from("user_roles")
        .select("user_id, created_at")
        .eq("role", "b2b");
      if (error) throw error;
      const ids = (roles ?? []).map((r) => r.user_id);
      if (!ids.length) return [];

      const [{ data: profiles }, { data: orders }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, phone, company_name").in("id", ids),
        fetchAll<any>((from, to) => supabase.from("orders").select("customer_id, total_cop, created_at, status").in("customer_id", ids).order("created_at", { ascending: false }).order("id").range(from, to)).then((data) => ({ data })),
      ]);

      const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
      return (roles ?? []).map((r) => {
        const mine = (orders ?? []).filter((o) => o.customer_id === r.user_id);
        const paid = mine.filter((o) => o.status !== "cancelled" && o.status !== "draft");
        return {
          userId: r.user_id,
          name: (pmap.get(r.user_id) as any)?.company_name || pmap.get(r.user_id)?.full_name || "Cuenta mayorista",
          phone: pmap.get(r.user_id)?.phone ?? null,
          since: r.created_at,
          orders: paid.length,
          total: paid.reduce((s, o) => s + (o.total_cop ?? 0), 0),
          last: mine[0]?.created_at ?? null,
        };
      });
    },
  });
}

export function useB2BOrders() {
  return useQuery({
    queryKey: ["admin-b2b-orders"],
    queryFn: async () => {
      const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "b2b");
      const ids = (roles ?? []).map((r) => r.user_id);
      if (!ids.length) return [];
      return fetchAll<any>((from, to) => supabase
        .from("orders")
        .select("id, number, contact_name, total_cop, total_usd:total_usd_exact, currency, notes, status, created_at, customer_id, b2b_mode, b2b_ship_eta, order_items(qty, variant_id)")
        .in("customer_id", ids)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to));
    },
  });
}

export function useWholesaleInventory() {
  return useQuery({
    queryKey: ["admin-b2b-inventory"],
    queryFn: async () => {
      const { data: locations, error: le } = await supabase
        .from("locations")
        .select("id, code, name, kind, channels")
        .eq("active", true);
      if (le) throw le;
      // Solo bodegas de consignación (kind wholesale, una por cliente mayorista);
      // las bodegas propias con canal b2b (p. ej. Bodega Central) no son clientes.
      const wholesale = (locations ?? []).filter((l) => l.kind === "wholesale");
      if (!wholesale.length) return { locations: [], rows: [] as any[] };
      const { data, error } = await supabase
        .from("inventory_levels")
        .select("on_hand, reserved, location_id, product_variants(id, sku, size, color, quality, products(name))")
        .in("location_id", wholesale.map((l) => l.id));
      if (error) throw error;
      return { locations: wholesale, rows: data ?? [] };
    },
  });
}
