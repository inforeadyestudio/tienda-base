import { fetchAll } from "@/lib/fetch-all";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { adminListEmails } from "@/lib/admin/users.functions";

export type StoreFilter = "all" | "ecom_nac" | "ecom_intl" | "cali" | "bogota" | "b2b";

export interface CrmCustomer {
  key: string;
  userId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  total: number;
  count: number;
  last: string;
  stores: string[];
  isB2B: boolean;
  shopifyOrders: number;
  shopifySpent: number;
  city: string | null;
}

export const STORE_LABEL: Record<string, string> = {
  ecom_nac: "Online Nacional",
  ecom_intl: "Online Internacional",
  cali: "POS Eventos",
  shopify: "Online Nacional",
};

export function useCrmCustomers() {
  const listEmails = useServerFn(adminListEmails);

  const query = useQuery({
    queryKey: ["global-crm"],
    queryFn: async () => {
      return fetchAll<any>((from, to) => supabase
        .from("orders")
        .select(
          "id, contact_name, contact_email, contact_phone, total_cop, created_at, source, customer_id, pos_sales(session_id, pos_sessions(location_id, locations(code))), order_fulfillments(locations(code))",
        )
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to));
    },
  });

  const { data: b2bIds = [] } = useQuery({
    queryKey: ["b2b-user-ids"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "b2b");
      if (error) throw error;
      return new Set<string>((data ?? []).map((r) => r.user_id as string));
    },
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["crm-profiles"],
    queryFn: async () => {
      return fetchAll<any>((from, to) => supabase
        .from("profiles")
        .select("id, full_name, phone, is_staff, created_at")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to));
    },
  });

  const { data: emails = [] } = useQuery({
    queryKey: ["crm-emails"],
    queryFn: () => listEmails(),
    retry: false,
    staleTime: 60_000,
  });

  const { data: shopify = [] } = useQuery({
    queryKey: ["crm-shopify"],
    queryFn: async () => {
      const out: any[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("shopify_customers")
          .select("shopify_id, first_name, last_name, email, phone, user_id, created_at, total_spent, orders_count, tags, note, city")
          .order("shopify_id")
          .range(from, from + 999);
        if (error) throw error;
        out.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return out;
    },
  });

  const { data: addresses = [] } = useQuery({
    queryKey: ["crm-addresses"],
    queryFn: async () => {
      return fetchAll<any>((from, to) => supabase
        .from("addresses")
        .select("user_id, city, is_default")
        .order("is_default", { ascending: false })
        .order("id")
        .range(from, to));
    },
  });

  const cityByUserId = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of addresses as { user_id: string; city: string | null }[]) {
      if (a.city && !m.has(a.user_id)) m.set(a.user_id, a.city);
    }
    return m;
  }, [addresses]);

  const emailById = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of emails ?? []) if (u.email) m.set(u.id, u.email);
    return m;
  }, [emails]);

  const customers = useMemo<CrmCustomer[]>(() => {
    const rows = query.data;
    const map = new Map<string, CrmCustomer & { storeSet: Set<string> }>();

    // Registered customers first (so they show up even without purchases)
    for (const p of profiles as { id: string; full_name: string | null; phone: string | null; is_staff: boolean; created_at: string }[]) {
      if (p.is_staff) continue;
      map.set(p.id, {
        key: p.id,
        userId: p.id,
        name: p.full_name ?? "Sin nombre",
        email: emailById.get(p.id) ?? null,
        phone: p.phone,
        total: 0,
        count: 0,
        last: p.created_at,
        stores: [],
        storeSet: new Set<string>(),
        isB2B: b2bIds instanceof Set && b2bIds.has(p.id),
        shopifyOrders: 0,
        shopifySpent: 0,
        city: cityByUserId.get(p.id) ?? null,
      });
    }

    for (let o of (rows ?? []) as any[]) {
      let store: string | null = null;
      const posCode = o.pos_sales?.[0]?.pos_sessions?.locations?.code;
      const fulCode = o.order_fulfillments?.[0]?.locations?.code;
      if (o.source === "ecom") store = fulCode === "ecom_intl" ? "ecom_intl" : "ecom_nac";
      else if (posCode) store = posCode;
      else store = fulCode ?? o.source;

      const emailOwner = !o.customer_id && o.contact_email
        ? Array.from(emailById.entries()).find(([, e]) => e.toLowerCase() === String(o.contact_email).trim().toLowerCase())?.[0]
        : undefined;
      if (emailOwner) o = { ...o, customer_id: emailOwner };
      const key = o.customer_id ?? o.contact_email ?? o.contact_phone ?? `walkin-${o.id}`;
      const cur =
        map.get(key) ??
        ({
          key,
          userId: o.customer_id ?? null,
          name: o.contact_name ?? (o.source === "ecom" ? "—" : "Venta mostrador"),
          email: o.contact_email,
          phone: o.contact_phone,
          total: 0,
          count: 0,
          last: o.created_at,
          stores: [],
          storeSet: new Set<string>(),
          isB2B: false,
          shopifyOrders: 0,
          shopifySpent: 0,
          city: o.customer_id ? (cityByUserId.get(o.customer_id) ?? null) : null,
        } as CrmCustomer & { storeSet: Set<string> });
      cur.total += o.total_cop ?? 0;
      cur.count += 1;
      cur.storeSet.add(store ?? "otros");
      if (o.created_at > cur.last) cur.last = o.created_at;
      if (!cur.name || cur.name === "Sin nombre") cur.name = o.contact_name || cur.name;
      if (!cur.email && o.contact_email) cur.email = o.contact_email;
      if (!cur.phone && o.contact_phone) cur.phone = o.contact_phone;
      if (o.customer_id) cur.userId = o.customer_id;
      if (o.customer_id && b2bIds instanceof Set && b2bIds.has(o.customer_id)) cur.isB2B = true;
      map.set(key, cur);
    }

    const knownEmails = new Set(Array.from(map.values()).map((c) => c.email?.toLowerCase()).filter(Boolean));
    for (const s of shopify as any[]) {
      const sOrders = Number(s.orders_count ?? 0);
      const sSpent = Number(s.total_spent ?? 0);
      if (s.user_id && map.has(s.user_id)) {
        const c = map.get(s.user_id)!;
        c.storeSet.add("ecom_nac");
        c.shopifyOrders += sOrders;
        c.shopifySpent += sSpent;
        if (!c.city && s.city) c.city = s.city;
        continue;
      }
      if (s.email && knownEmails.has(s.email)) {
        const existing = Array.from(map.values()).find((c) => c.email?.toLowerCase() === String(s.email).toLowerCase());
        if (existing) {
          existing.shopifyOrders += sOrders;
          existing.shopifySpent += sSpent;
          existing.storeSet.add("ecom_nac");
          if (!existing.city && s.city) existing.city = s.city;
        }
        continue;
      }
      const key = s.user_id ?? `shopify-${s.shopify_id}`;
      map.set(key, {
        key,
        userId: s.user_id ?? null,
        name: [s.first_name, s.last_name].filter(Boolean).join(" ") || "Sin nombre",
        email: s.email,
        phone: s.phone,
        total: 0,
        count: 0,
        last: s.created_at,
        stores: [],
        storeSet: new Set<string>(["ecom_nac"]),
        isB2B: false,
        shopifyOrders: sOrders,
        shopifySpent: sSpent,
        city: s.city ?? null,
      });
    }

    return Array.from(map.values())
      .map((c) => ({ ...c, stores: Array.from(c.storeSet) }))
      .sort((a, b) => b.total - a.total);
  }, [query.data, b2bIds, profiles, emailById, shopify, cityByUserId]);

  return { customers, isLoading: query.isLoading };
}
