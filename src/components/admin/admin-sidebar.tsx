import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, Boxes, ShoppingCart, Store, LogOut, Tag,
  ArrowLeftRight, PackagePlus, Percent, Users, Wallet, Gift, ArrowUpRight, ExternalLink, ShoppingBag, X, RotateCcw,
  Warehouse, Settings, ChevronDown, ChevronLeft, Mail, Menu, ClipboardList,
} from "lucide-react";
import { Cards as CardsIcon, Coins as CoinsIcon } from "@phosphor-icons/react";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useSession, useIsAdmin, userRolesOptions, isStoreManagerOnly, isWarehouseOnly, storeManagerAllows } from "@/lib/auth-hooks";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AdminBrand } from "@/components/admin/admin-brand";
import { AdminGlobalSearch } from "@/components/admin/global-search";
import { usePendingOnlineOrders } from "@/lib/admin/pending-online-orders";

type IconType = typeof LayoutDashboard | React.ComponentType<{ size?: number; className?: string }>;
type Item = { title: string; to: string; icon: IconType; exact?: boolean; params?: Record<string, string> };

const overview: Item[] = [
  { title: "Inicio", to: "/admin", icon: LayoutDashboard, exact: true },
];
const ventas: Item[] = [
  { title: "Productos", to: "/admin/productos", icon: CardsIcon },
  { title: "Colecciones", to: "/admin/colecciones", icon: Tag },
  { title: "Inventario", to: "/admin/inventario", icon: Boxes },
  { title: "Conteo físico", to: "/admin/conteo", icon: ClipboardList },
  { title: "Bodegas", to: "/admin/bodegas", icon: Warehouse },
  { title: "Traslados", to: "/admin/traslados", icon: ArrowLeftRight },
  { title: "Control financiero", to: "/admin/control-financiero", icon: Wallet },
];
const tienda: Item[] = [
  { title: "Clientes", to: "/admin/clientes", icon: Users },
  { title: "Pedidos", to: "/admin/pedidos", icon: ShoppingCart },
  { title: "Email marketing", to: "/admin/email-marketing", icon: Mail },
  { title: "Correos automáticos", to: "/admin/correos", icon: Mail },
  { title: "Cambios y devoluciones", to: "/admin/cambios", icon: RotateCcw },
  { title: "Promociones", to: "/admin/promociones", icon: Percent },
  { title: "Ofertas Cross y upsell", to: "/admin/ofertas-pos", icon: Gift },
  { title: "Puntos y fidelización", to: "/admin/loyalty", icon: CoinsIcon },
];

const tiendasAccesos: Item[] = [
  { title: "Tienda Online", to: "/admin/tienda", icon: ShoppingBag },
  { title: "B2B", to: "/admin/b2b", icon: Users },
  { title: "POS Eventos", to: "/pos/$sede", params: { sede: "cali" }, icon: Store },
  { title: "Ver storefront", to: "/", icon: ExternalLink },
];

export function AdminSidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useSession();
  const { data: isAdmin } = useIsAdmin();
  const { data: pendingOrders = 0 } = usePendingOnlineOrders();
  const { data: myRoles } = useQuery({ ...userRolesOptions(user?.id ?? "anon"), enabled: !!user });
  const manager = isStoreManagerOnly(myRoles ?? []);
  const warehouse = isWarehouseOnly(myRoles ?? []);
  const allow = (i: Item) =>
    (!manager || (i.to !== "/admin" && storeManagerAllows(i.to)) || !!i.params) &&
    (!warehouse || i.to !== "/admin/control-financiero");
  const [tiendasOpen, setTiendasOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem("admin-nav-collapsed") === "1";
    } catch {
      return false;
    }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close the mobile drawer on every navigation
  useEffect(() => { setMobileOpen(false); }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setMobileOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { window.localStorage.setItem("admin-nav-collapsed", next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
  };

  useEffect(() => {
    if (!tiendasOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setTiendasOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [tiendasOpen]);

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const itemMatches = (item: Item) => {
    const resolved = item.params ? item.to.replace(/\$(\w+)/g, (_, k) => item.params![k]) : item.to;
    return item.exact ? pathname === resolved : pathname.startsWith(resolved);
  };

  const renderItem = (item: Item) => {
    const resolved = item.params
      ? item.to.replace(/\$(\w+)/g, (_, k) => item.params![k])
      : item.to;
    const active = item.exact ? pathname === resolved : pathname.startsWith(resolved);
    return (
      <Link
        key={item.title}
        to={item.to as "/admin"}
        params={item.params as never}
        title={item.title}
        onClick={() => setMobileOpen(false)}
        className={
          "flex items-center gap-3 py-2.5 mx-3 rounded-full text-sm transition-colors " +
          (collapsed ? "justify-center px-0" : "px-4") + " " +
          (active
            ? "bg-ink text-ivory"
            : "text-ink/70 hover:bg-sidebar-accent hover:text-ink")
        }
      >
        <item.icon className="size-4 shrink-0" /> {!collapsed && <span className="flex-1">{item.title}</span>}
        {item.to === "/admin/pedidos" && pendingOrders > 0 && <span aria-label={`${pendingOrders} pedidos pagados sin preparar`} className="min-w-5 h-5 px-1.5 rounded-full bg-clay text-ivory text-[10px] flex items-center justify-center">{pendingOrders}</span>}
      </Link>
    );
  };

  return (
    <>
      {/* Mobile hamburger — fixed bottom-right */}
      <button
        type="button"
        onClick={() => setMobileOpen((o) => !o)}
        aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
        className="md:hidden fixed bottom-4 right-4 z-[96] size-12 rounded-full bg-ink text-ivory shadow-lg flex items-center justify-center active:scale-95 transition-transform"
      >
        {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </button>
      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 z-[94] bg-ink/40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}
    <aside className={(collapsed ? "md:w-20" : "md:w-64") + " w-64 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border transition-[transform,width] duration-300 ease-out fixed inset-y-0 left-0 z-[95] h-dvh md:sticky md:top-0 md:translate-x-0 " + (mobileOpen ? "translate-x-0" : "-translate-x-full")}>
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label={collapsed ? "Expandir menú" : "Minimizar menú"}
        className="hidden md:flex absolute -right-3 top-9 z-20 size-7 rounded-full bg-white border border-ink/10 shadow-sm items-center justify-center text-ink/60 hover:text-ink"
      >
        <ChevronLeft className={"size-4 transition-transform duration-300 " + (collapsed ? "rotate-180" : "")} />
      </button>
      <div className={collapsed ? "px-4 pt-8 pb-6 text-center" : "px-6 pt-8 pb-6"}>
        <AdminBrand subtitle="Sales Hub" collapsed={collapsed} />
      </div>
      <nav className="flex-1 min-h-0 py-2 space-y-6 overflow-y-auto overscroll-contain sidebar-scroll">
        <div className="space-y-1">{overview.filter(allow).map(renderItem)}</div>
        <NavGroup id="tienda" label="Tienda" activeItem={ventas.find(itemMatches) ?? null} pathname={pathname} collapsed={collapsed}>
          {ventas.filter(allow).map(renderItem)}
        </NavGroup>
        <NavGroup id="ventas" label="Ventas" activeItem={tienda.find(itemMatches) ?? null} pathname={pathname} collapsed={collapsed}>
          {tienda.filter(allow).map(renderItem)}
        </NavGroup>
        {isAdmin && (
          <NavGroup id="sistema" label="Sistema" activeItem={pathname.startsWith("/admin/configuracion") ? ({} as Item) : null} pathname={pathname} collapsed={collapsed}>
            {renderItem({ title: "Configuración", to: "/admin/configuracion", icon: Settings })}
          </NavGroup>
        )}
        <div className="space-y-1 pt-2">
          <button
            onClick={() => setTiendasOpen(true)}
            title="Ir a tiendas"
            className={"w-[calc(100%-1.5rem)] flex items-center gap-3 py-2.5 mx-3 rounded-full text-sm text-ink/70 hover:bg-ink/5 hover:text-ink border border-ink/10 transition-colors " + (collapsed ? "justify-center px-0" : "px-4")}
          >
            <Store className="size-4 shrink-0" />
            {!collapsed && <><span className="flex-1 text-left">Ir a tiendas</span><ArrowUpRight className="size-4" /></>}
          </button>
        </div>
      </nav>
      <div className="shrink-0 pt-3 border-t border-sidebar-border">
        <AdminGlobalSearch placement="sidebar" collapsed={collapsed} />
      </div>
      <div className={"shrink-0 py-5 " + (collapsed ? "px-3 text-center" : "px-6")}>
        {!collapsed && (
          <>
            <div className="text-[10px] uppercase tracking-[0.2em] text-ink/40">Sesión</div>
            <div className="text-sm text-ink truncate mt-1">{user?.email ?? "—"}</div>
          </>
        )}
        <button onClick={signOut} title="Cerrar sesión" className={"flex items-center gap-2 text-xs text-ink/60 hover:text-ink " + (collapsed ? "justify-center w-full" : "mt-3")}>
          <LogOut className="size-3.5" /> {!collapsed && "Cerrar sesión"}
        </button>
      </div>
      {tiendasOpen && typeof document !== "undefined" && createPortal(
        <div className="admin-scope fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={() => setTiendasOpen(false)} />
          <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-ink/40">Accesos</div>
                <div className="font-serif text-2xl text-ink mt-1">Ir a tiendas</div>
              </div>
              <button
                onClick={() => setTiendasOpen(false)}
                className="size-9 rounded-full flex items-center justify-center text-ink/60 hover:bg-ink/5"
                aria-label="Cerrar"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {tiendasAccesos.filter(allow).map((item) => (
                <Link
                  key={item.title}
                  to={item.to as "/admin"}
                  params={item.params as never}
                  onClick={() => setTiendasOpen(false)}
                  className="group flex flex-col justify-between h-32 p-4 rounded-2xl border border-ink/10 bg-white hover:bg-ink hover:text-ivory transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <item.icon className="size-5" />
                    <ArrowUpRight className="size-4 opacity-40 group-hover:opacity-100" />
                  </div>
                  <div className="text-sm font-medium">{item.title}</div>
                </Link>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </aside>
    </>
  );
}

function NavGroup({ id, label, activeItem, pathname, collapsed, children }: { id: string; label: string; activeItem: Item | null; pathname: string; collapsed?: boolean; children: ReactNode }) {
  const storageKey = `admin-nav-${id}`;
  const [open, setOpen] = useState<boolean | null>(null);
  const prevPathname = useRef(pathname);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(storageKey);
      setOpen(saved === null ? true : saved === "1");
    } catch {
      setOpen(true);
    }
  }, [storageKey]);

  // Only auto-expand when the user NAVIGATES into a page of this group,
  // so manual collapsing while already inside the group is respected.
  useEffect(() => {
    const changed = prevPathname.current !== pathname;
    prevPathname.current = pathname;
    if (changed && activeItem) {
      setOpen(true);
      try { window.localStorage.setItem(storageKey, "1"); } catch { /* noop */ }
    }
  }, [pathname, activeItem, storageKey]);

  const toggle = () => {
    const next = !(open ?? true);
    setOpen(next);
    try { window.localStorage.setItem(storageKey, next ? "1" : "0"); } catch { /* noop */ }
  };

  const expanded = collapsed ? true : (open ?? true);

  if (collapsed) {
    return <div className="space-y-1 pt-2 border-t border-sidebar-border/60 mx-3">{children}</div>;
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between px-7 text-[10px] uppercase tracking-[0.2em] text-ink/40 hover:text-ink/70 transition-colors mb-2"
      >
        <span>{label}</span>
        <ChevronDown className={"size-3.5 transition-transform duration-200 " + (expanded ? "" : "-rotate-90")} />
      </button>
      <div
        className={
          "grid transition-[grid-template-rows,opacity] duration-200 ease-out " +
          (expanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")
        }
      >
        <div className="overflow-hidden space-y-1">{children}</div>
      </div>
    </div>
  );
}