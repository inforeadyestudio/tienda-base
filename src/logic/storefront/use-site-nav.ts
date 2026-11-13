// Lógica (Claude NO modifica este archivo). El diseño recibe el resultado como `vm`.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useCart } from "@/lib/cart";
import { useSession } from "@/lib/auth-hooks";
import { DEFAULT_NAV, siteNavQuery, type NavChild, type NavItem } from "@/lib/site-nav";
import { MarqueeBar, useAnnouncements } from "@/lib/announcements";



export function useSiteNav({ hideAnnouncement = false }: { hideAnnouncement?: boolean } = {}) {
  const ann = useAnnouncements();
  const { count } = useCart();
  const { user } = useSession();
  const [cartOpen, setCartOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [searchOpen, setSearchOpen] = useState(false);
  const { data: navData } = useQuery(siteNavQuery());
  const nav = (navData ?? DEFAULT_NAV)
    .filter((i) => i.enabled)
    .map((i) => ({ ...i, children: (i.children ?? []).filter((c: NavChild) => c.enabled) }));

  return { hideAnnouncement, ann, count, user, cartOpen, setCartOpen, menuOpen, setMenuOpen, collapsed, setCollapsed, searchOpen, setSearchOpen, navData, nav };
}

export type SiteNavVM = ReturnType<typeof useSiteNav>;
