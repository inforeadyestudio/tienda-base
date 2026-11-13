import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { queryOptions, useQuery } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";

export function useSession() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (!mounted) return;
        setUser(data.user ?? null);
      })
      .catch(() => {
        if (mounted) setUser(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
}

export function staffAccessOptions(userId: string) {
  return queryOptions({
    queryKey: ["is_staff", userId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("is_staff", { _user_id: userId });
      if (error) throw error;
      return Boolean(data);
    },
    staleTime: 60_000,
  });
}

export function useIsStaff() {
  const { user } = useSession();
  return useQuery({
    ...staffAccessOptions(user?.id ?? "anon"),
    enabled: !!user,
  });
}

export function useIsAdmin() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["is_admin", user?.id ?? "anon"],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase.rpc("is_admin", { _user_id: user.id });
      if (error) throw error;
      return Boolean(data);
    },
    enabled: !!user,
  });
}

export function useIsB2B() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["is_b2b", user?.id ?? "anon"],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase.rpc("is_b2b", { _user_id: user.id });
      if (error) throw error;
      return Boolean(data);
    },
    enabled: !!user,
  });
}

export function useProfile() {
  const { user } = useSession();
  return useQuery({
    queryKey: ["profile", user?.id ?? "anon"],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });
}
/** Roles del usuario; los de caja (staff_cali / staff_bogota) sin otro rol solo acceden a su POS. */
export function userRolesOptions(userId: string) {
  return queryOptions({
    queryKey: ["user_roles", userId],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
      return ((data ?? []) as { role: string }[]).map((r) => r.role);
    },
    staleTime: 60_000,
  });
}

/** Sedes POS permitidas si el usuario es solo de caja; null = sin restricción. */
export function cashierSedes(roles: string[]): string[] | null {
  if (!roles.length || roles.some((r) => r !== "staff_cali" && r !== "staff_bogota")) return null;
  return roles.map((r) => (r === "staff_cali" ? "cali" : "bogota"));
}

/** Jefe de tiendas (solo con roles de tienda): ambos POS + Inventario, Productos, Clientes, Cambios y Pedidos del Sales Hub. */
export const STORE_MANAGER_PATHS = ["/admin/inventario", "/admin/productos", "/admin/clientes", "/admin/cliente", "/admin/cambios", "/admin/pedidos", "/admin/pedido", "/admin/promociones", "/admin/ofertas-pos", "/admin/loyalty"];
export function isStoreManagerOnly(roles: string[]): boolean {
  return roles.includes("jefe_tiendas") && roles.every((r) => ["jefe_tiendas", "staff_cali", "staff_bogota"].includes(r));
}

/** Bodega (sin otros roles): solo el Sales Hub; sin POS, Tienda Online ni B2B. */
export function isWarehouseOnly(roles: string[]): boolean {
  return roles.length > 0 && roles.every((r) => r === "bodega");
}
export function storeManagerAllows(path: string): boolean {
  const p = path.replace(/\/+$/, "");
  return p === "/admin" || STORE_MANAGER_PATHS.some((x) => p === x || p.startsWith(x + "/") || p.startsWith(x + "."));
}
