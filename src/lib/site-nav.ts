import { readAppSetting } from "@/lib/public-settings";
import { supabase } from "@/integrations/supabase/client";
import { queryOptions } from "@tanstack/react-query";

export const SITE_NAV_KEY = "site_nav";

export type NavChild = { id: string; label: string; href: string; enabled: boolean };
export type NavItem = NavChild & { children: NavChild[] };

export const DEFAULT_NAV: NavItem[] = [
  { id: "home", label: "Home", href: "/home", enabled: false, children: [] },
  { id: "colecciones", label: "Colecciones", href: "/coleccion/todo", enabled: true, children: [] },
  { id: "tienda", label: "Shop", href: "/tienda", enabled: true, children: [] },
  { id: "world", label: "Our World", href: "/our-world", enabled: true, children: [] },
  { id: "wholesale", label: "Wholesale", href: "/wholesale", enabled: true, children: [] },
  { id: "contact", label: "Contact", href: "/contacto", enabled: true, children: [] },
];

export function newNavId() {
  return crypto.randomUUID().slice(0, 8);
}

function normalizeChild(raw: any): NavChild | null {
  if (!raw || typeof raw.href !== "string" || typeof raw.label !== "string") return null;
  return { id: String(raw.id ?? newNavId()), label: raw.label, href: raw.href, enabled: raw.enabled !== false };
}

export function normalizeNav(raw: any): NavItem[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_NAV;
  const items = raw
    .map((r) => {
      const base = normalizeChild(r);
      if (!base) return null;
      const children = Array.isArray(r.children) ? (r.children.map(normalizeChild).filter(Boolean) as NavChild[]) : [];
      return { ...base, children };
    })
    .filter(Boolean) as NavItem[];
  return items.length ? items : DEFAULT_NAV;
}

export const siteNavQuery = () =>
  queryOptions({
    queryKey: ["site-nav"],
    staleTime: 60_000,
    queryFn: async (): Promise<NavItem[]> => {
      const data = { value: await readAppSetting(SITE_NAV_KEY).catch(() => null) };
      return normalizeNav(data?.value);
    },
  });

export async function saveSiteNav(items: NavItem[]) {
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: SITE_NAV_KEY, value: items as any }, { onConflict: "key" });
  if (error) throw error;
}
