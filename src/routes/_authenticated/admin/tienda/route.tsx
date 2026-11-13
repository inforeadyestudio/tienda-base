import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth-hooks";
import { ArrowLeft, LayoutDashboard, ShoppingCart, User, Users, Percent, Wallet, RotateCcw, ChartLine, Settings, LogOut, ArrowLeftRight, Boxes, Menu, X } from "lucide-react";
import { CirclesThreePlus, Cards as CardsIcon } from "@phosphor-icons/react";
import { AdminBrand } from "@/components/admin/admin-brand";
import { Button } from "@/components/ui/button";
import { usePendingOnlineOrders } from "@/lib/admin/pending-online-orders";

export const Route = createFileRoute("/_authenticated/admin/tienda")({
  component: TiendaLayout,
});

const items = [
  { title: "Diseño", to: "/admin/tienda/colecciones", icon: CirclesThreePlus },
  { title: "Portal cliente", to: "/admin/tienda/portal-cliente", icon: User },
  { title: "Estadísticas", to: "/admin/tienda/estadisticas", icon: ChartLine },
  { title: "Catálogo Meta", to: "/admin/tienda/catalogo-meta", icon: CardsIcon },
  { title: "Configuración", to: "/admin/tienda/configuracion", icon: Settings },
];


function TiendaLayout() {
  const { user } = useSession();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const { data: pendingOrders = 0 } = usePendingOnlineOrders();
  useEffect(() => { setMobileOpen(false); }, [pathname]);
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setMobileOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [mobileOpen]);
  const { data: incoming = 0 } = useQuery({
    queryKey: ["incoming-transfers-count", "ecom"],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data: loc } = await supabase.from("locations").select("id").eq("code", "ecom").maybeSingle();
      if (!loc) return 0;
      const { count } = await supabase.from("transfers").select("id", { count: "exact", head: true })
        .eq("to_location_id", loc.id).in("status", ["requested", "approved", "in_transit"]);
      return count ?? 0;
    },
  });
  const lastIncoming = useRef<number | null>(null);
  useEffect(() => {
    if (lastIncoming.current !== null && incoming > lastIncoming.current) {
      toast("Mercancía en camino a Ecommerce", { action: { label: "Ver", onClick: () => navigate({ to: "/admin/traslados" }) } });
    }
    lastIncoming.current = incoming;
  }, [incoming, navigate]);
  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };
  const fullBleed = pathname.includes("/admin/tienda/experiencia");
  if (fullBleed) {
    return (
      <div className="admin-scope h-screen overflow-hidden bg-ivory flex">
        <main className="flex-1 min-w-0 h-full min-h-0 flex flex-col"><Outlet /></main>
      </div>
    );
  }
  return (
    <div className="admin-scope min-h-screen min-w-0 bg-ivory flex">
      <Button type="button" variant="default" size="icon" onClick={() => setMobileOpen((open) => !open)} aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"} aria-expanded={mobileOpen} aria-controls="tienda-admin-menu" className="md:hidden fixed bottom-4 right-4 z-[96] size-12 rounded-full shadow-lg">
        {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
      </Button>
      {mobileOpen && <div className="md:hidden fixed inset-0 z-[94] bg-ink/40" onClick={() => setMobileOpen(false)} aria-hidden="true" />}
      <aside id="tienda-admin-menu" className={"w-64 shrink-0 bg-sidebar flex flex-col h-dvh fixed inset-y-0 left-0 z-[95] border-r border-sidebar-border transition-transform duration-200 md:sticky md:top-0 md:translate-x-0 " + (mobileOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className="px-6 pt-8 pb-6">
          <Link to="/admin" onClick={() => setMobileOpen(false)} className="text-xs text-moss flex items-center gap-1 mb-3"><ArrowLeft className="size-3" /> Volver al portal</Link>
          <AdminBrand subtitle="Tienda Online · Nacional · Internacional" />
        </div>
        <nav className="flex-1 min-h-0 py-2 space-y-1 overflow-y-auto overscroll-contain sidebar-scroll">
          {items.map((it) => {
            const active = (it as { exact?: boolean }).exact ? pathname === it.to : pathname.startsWith(it.to);
            return (
              <Link key={it.to} to={it.to as "/admin/tienda"} onClick={() => setMobileOpen(false)} className={"flex items-center gap-3 px-4 py-2.5 mx-3 rounded-full text-sm transition-colors " + (active ? "bg-ink text-ivory" : "text-ink/70 hover:bg-ink/5")}>
                 <it.icon className="size-4" /> {it.title}
                 {it.to === "/admin/tienda/pedidos" && pendingOrders > 0 && <span aria-label={`${pendingOrders} pedidos pagados sin preparar`} className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-clay text-ivory text-[10px] flex items-center justify-center">{pendingOrders}</span>}
                {it.to === "/admin/tienda/traslados" && incoming > 0 && <span className="ml-auto min-w-5 h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">{incoming}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="shrink-0 px-6 py-5 border-t border-sidebar-border">
          <div className="text-[10px] uppercase text-ink/40">Sesión</div>
          <div className="text-sm text-ink truncate mt-1">{user?.email ?? "—"}</div>
          <Button variant="ghost" size="sm" onClick={signOut} className="flex items-center gap-2 mt-3 px-0 text-xs text-ink/60 hover:text-ink"><LogOut className="size-3.5" /> Cerrar sesión</Button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 flex flex-col"><Outlet /></main>
    </div>
  );
}