import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth-hooks";
import { ArrowLeft, LayoutDashboard, Users, KeyRound, ClipboardList, MessageSquare, Boxes, CalendarClock, Truck, Inbox, RotateCcw, Images, LogOut } from "lucide-react";
import { AdminBrand } from "@/components/admin/admin-brand";
import { useB2BOrders } from "@/lib/b2b/admin";
import { etaStatus } from "@/components/b2b/order-extras";
import { Gift, HandCoins } from "lucide-react";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/b2b")({
  component: B2BAdminLayout,
});

const items = [
  { title: "Resumen", to: "/admin/b2b", icon: LayoutDashboard, exact: true },
  { title: "Preventa", to: "/admin/b2b/preventa", icon: CalendarClock },
  { title: "Control de envíos", to: "/admin/b2b/envios", icon: Truck },
  { title: "Devoluciones B2B", to: "/admin/b2b/devoluciones", icon: RotateCcw },
  { title: "Pedidos", to: "/admin/b2b/pedidos", icon: ClipboardList },
  { title: "Ventas a crédito", to: "/admin/b2b/credito", icon: HandCoins },
  { title: "Metas de pedido", to: "/admin/b2b/metas", icon: Gift },
  { title: "Portada del portal", to: "/admin/b2b/portada", icon: Images },
  { title: "Solicitudes Wholesale", to: "/admin/b2b/solicitudes", icon: Inbox },
  { title: "Clientes", to: "/admin/b2b/clientes", icon: Users },
  { title: "Accesos al portal", to: "/admin/b2b/accesos", icon: KeyRound },
  { title: "Mensajes", to: "/admin/b2b/mensajes", icon: MessageSquare },
  { title: "Inventario consignación", to: "/admin/b2b/inventario", icon: Boxes },
];

function B2BAdminLayout() {
  const { user } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);
  const { data: b2bOrders } = useB2BOrders();
  const etaAlerts = (b2bOrders ?? []).filter((o: any) => etaStatus(o.b2b_ship_eta, o.status)?.label).length;

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="admin-scope min-h-screen min-w-0 bg-ivory flex">
      <Button type="button" variant="default" size="icon" onClick={() => setMobileOpen((open) => !open)} aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"} aria-expanded={mobileOpen} aria-controls="b2b-admin-menu" className="md:hidden fixed bottom-4 right-4 z-[96] size-12 rounded-full shadow-lg">
        {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </Button>
      {mobileOpen && <div className="md:hidden fixed inset-0 z-[94] bg-ink/40" onClick={() => setMobileOpen(false)} aria-hidden="true" />}
      <aside id="b2b-admin-menu" className={"w-64 shrink-0 bg-sidebar flex flex-col h-dvh fixed inset-y-0 left-0 z-[95] border-r border-sidebar-border transition-transform duration-200 md:sticky md:top-0 md:translate-x-0 " + (mobileOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className="px-6 pt-8 pb-6">
          <Link to="/admin" onClick={() => setMobileOpen(false)} className="text-xs text-moss flex items-center gap-1 mb-3">
            <ArrowLeft className="size-3" /> Volver al portal
          </Link>
          <AdminBrand subtitle="B2B · Mayoristas · Wholesale" />
        </div>
        <nav className="flex-1 min-h-0 py-2 space-y-1 overflow-y-auto overscroll-contain sidebar-scroll">
          {items.map((it) => {
            const active = it.exact ? pathname === it.to : pathname.startsWith(it.to);
            return (
              <Link
                key={it.to}
                to={it.to as "/admin/b2b"}
                  onClick={() => setMobileOpen(false)}
                className={
                  "flex items-center gap-3 px-4 py-2.5 mx-3 rounded-full text-sm transition-colors " +
                  (active ? "bg-ink text-ivory" : "text-ink/70 hover:bg-ink/5")
                }
              >
                <it.icon className="size-4" /> <span className="flex-1">{it.title}</span>
                {it.to === "/admin/b2b/pedidos" && etaAlerts > 0 && <span className="min-w-5 h-5 px-1.5 rounded-full bg-clay text-ivory text-[10px] flex items-center justify-center">{etaAlerts}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="shrink-0 px-6 py-5 border-t border-sidebar-border">
          <Link to="/b2b" className="text-[11px] text-ink/60 hover:text-ink">Ver portal B2B →</Link>
          <div className="text-sm text-ink truncate mt-3">{user?.email ?? "—"}</div>
          <Button variant="ghost" size="sm" onClick={signOut} className="flex items-center gap-2 mt-3 px-0 text-xs text-ink/60 hover:text-ink"><LogOut className="size-3.5" /> Cerrar sesión</Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 flex flex-col"><Outlet /></main>
    </div>
  );
}
