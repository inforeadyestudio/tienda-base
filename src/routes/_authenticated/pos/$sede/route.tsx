import {
  createFileRoute,
  Link,
  Outlet,
  notFound,
  redirect,
  useNavigate,
  useParams,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { Cards as CardsIcon } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowLeftRight,
  Boxes,
  CalendarDays,
  BarChart3,
  TrendingUp,
  LogOut,
  PackageCheck,
  RotateCcw,
  Store,
  Terminal,
  Users,
  Wallet,
  ClipboardList,
} from "lucide-react";
import { cashierSedes, isWarehouseOnly, staffAccessOptions, userRolesOptions, useSession } from "@/lib/auth-hooks";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { AdminBrand } from "@/components/admin/admin-brand";
import { OnlinePickAlert } from "@/components/pos/online-pick-alert";
import { AdminSupportPanel } from "@/components/admin/support-panel";

const SEDES = {
  cali: { code: "cali", label: "Tienda Cali" },
  bogota: { code: "bogota", label: "Tienda Bogotá" },
} as const;

export const Route = createFileRoute("/_authenticated/pos/$sede")({
  beforeLoad: async ({ params, context }) => {
    if (!(params.sede in SEDES)) throw notFound();
    const user = context.user;
    if (!user) throw redirect({ to: "/auth" });
    const isStaff = await context.queryClient.ensureQueryData(staffAccessOptions(user.id));
    if (!isStaff) throw redirect({ to: "/" });
    const roles = await context.queryClient.ensureQueryData(userRolesOptions(user.id));
    if (isWarehouseOnly(roles)) throw redirect({ to: "/admin" });
    const sedes = cashierSedes(roles);
    if (sedes && !sedes.includes(params.sede)) throw redirect({ to: "/pos/$sede", params: { sede: sedes[0] } });
  },
  component: PosSedeLayout,
});

function PosSedeLayout() {
  const { sede } = useParams({ from: "/_authenticated/pos/$sede" });
  const sedeInfo = SEDES[sede as keyof typeof SEDES];
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user } = useSession();
  const qc = useQueryClient();

  const { data: pendingDispatch } = useQuery({
    queryKey: ["dispatch-count", sedeInfo.code],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data: loc } = await supabase.from("locations").select("id").eq("code", sedeInfo.code).maybeSingle();
      if (!loc) return 0;
      const { data } = await supabase
        .from("order_fulfillments")
        .select("order_id, orders!inner(status, source)")
        .eq("location_id", loc.id)
        .eq("orders.source", "ecom")
        .in("orders.status", ["paid"]);
      return (data ?? []).length;
    },
  });

  const { data: incomingTransfers } = useQuery({
    queryKey: ["incoming-transfers-count", sedeInfo.code],
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data: loc } = await supabase.from("locations").select("id").eq("code", sedeInfo.code).maybeSingle();
      if (!loc) return 0;
      const { count } = await supabase
        .from("transfers")
        .select("id", { count: "exact", head: true })
        .eq("to_location_id", loc.id)
        .in("status", ["requested", "approved", "in_transit"]);
      const { count: adj } = await (supabase.from("transfers") as any)
        .select("id", { count: "exact", head: true })
        .eq("from_location_id", loc.id)
        .eq("discrepancy_status", "open");
      return (count ?? 0) + (adj ?? 0);
    },
  });

  const lastTransfers = useRef<number | null>(null);
  useEffect(() => {
    if (incomingTransfers == null) return;
    if (lastTransfers.current != null && incomingTransfers > lastTransfers.current) {
      toast("Mercancía en camino", {
        description: `Tienes ${incomingTransfers} traslado(s) por recibir en ${sedeInfo.label}.`,
        action: { label: "Ver", onClick: () => navigate({ to: `/pos/${sede}/traslados` as any }) },
        duration: 15000,
      });
    }
    lastTransfers.current = incomingTransfers;
  }, [incomingTransfers]);

  const lastCount = useRef<number | null>(null);
  useEffect(() => {
    if (pendingDispatch == null) return;
    if (lastCount.current != null && pendingDispatch > lastCount.current) {
      toast("Prenda vendida online para despacho", {
        description: `Tienes ${pendingDispatch} pedido(s) por empacar en ${sedeInfo.label}.`,
        action: { label: "Ver", onClick: () => navigate({ to: `/pos/${sede}/pedidos` as any }) },
        duration: 15000,
      });
    }
    lastCount.current = pendingDispatch;
  }, [pendingDispatch]);


  const base = `/pos/${sede}`;
  const items = [
    { title: "Caja", to: base, icon: Terminal, exact: true },
    { title: "Control financiero", to: `${base}/control-financiero`, icon: Wallet },
    { title: "Productos", to: `${base}/productos`, icon: CardsIcon },
    { title: "Inventario", to: `${base}/inventario`, icon: Boxes },
    { title: "Conteo físico", to: `${base}/conteo`, icon: ClipboardList },
    { title: "Traslados", to: `${base}/traslados`, icon: ArrowLeftRight, badge: incomingTransfers ?? 0 },
    { title: "Pedidos Web", to: `${base}/pedidos`, icon: PackageCheck, badge: pendingDispatch ?? 0 },
    { title: "Cambios y devoluciones", to: `${base}/cambios`, icon: RotateCcw },
    { title: "Citas", to: `${base}/citas`, icon: CalendarDays },
    { title: "Clientes", to: `${base}/clientes`, icon: Users },
    { title: "Estadísticas", to: `${base}/estadisticas`, icon: BarChart3 },
    { title: "Rentabilidad", to: `${base}/rentabilidad`, icon: TrendingUp },
  ];

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="admin-scope min-h-screen bg-ivory flex">
      <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground flex flex-col h-dvh sticky top-0 border-r border-sidebar-border">
        <div className="px-6 pt-8 pb-6">
          <Link to="/admin" className="flex items-center gap-2 text-xs text-ink/50 hover:text-ink transition-colors">
            <ArrowLeft className="size-3.5" /> Portal
          </Link>
          <div className="mt-4">
            <AdminBrand subtitle="POS · Panel" />
          </div>
          <div className="mt-5 flex items-center gap-2 text-ink">
            <Store className="size-5" />
            <div>
              <div className="font-serif italic text-2xl leading-none">{sedeInfo.label}</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 min-h-0 py-2 space-y-1 overflow-y-auto overscroll-contain sidebar-scroll">
          {items.map((item) => {
            const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={
                  "flex items-center gap-3 px-4 py-2.5 mx-3 rounded-full text-sm transition-colors " +
                  (active ? "bg-ink text-ivory" : "text-ink/70 hover:bg-sidebar-accent hover:text-ink")
                }
              >
                <item.icon className="size-4" />
                <span className="flex-1">{item.title}</span>
                {"badge" in item && (item as any).badge > 0 && (
                  <span className={"text-[10px] font-medium px-2 py-0.5 rounded-full " + (active ? "bg-ivory text-ink" : "bg-clay text-ivory")}>
                    {(item as any).badge}
                  </span>
                )}
              </Link>
            );
          })}
          <AdminSupportPanel placement="sidebar" />
        </nav>
        <div className="shrink-0 px-6 py-5 border-t border-sidebar-border">
          <div className="text-[10px] uppercase tracking-[0.2em] text-ink/40">Sesión</div>
          <div className="text-sm text-ink truncate mt-1">{user?.email ?? "—"}</div>
          <button onClick={signOut} className="flex items-center gap-2 mt-3 text-xs text-ink/60 hover:text-ink">
            <LogOut className="size-3.5" /> Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 flex flex-col">
        {SEDES[sede as keyof typeof SEDES] && <OnlinePickAlert locationCode={SEDES[sede as keyof typeof SEDES].code} />}
        <Outlet />
      </main>
    </div>
  );
}

export { SEDES };