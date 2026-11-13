import { createFileRoute, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { cashierSedes, isStoreManagerOnly, isWarehouseOnly, storeManagerAllows, staffAccessOptions, userRolesOptions } from "@/lib/auth-hooks";
import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { AdminGlobalSearch } from "@/components/admin/global-search";

export const Route = createFileRoute("/_authenticated/admin")({
  beforeLoad: async ({ context, location }) => {
    const user = context.user;
    if (!user) throw redirect({ to: "/auth" });
    const isStaff = await context.queryClient.ensureQueryData(staffAccessOptions(user.id));
    if (!isStaff) throw redirect({ to: "/" });
    const roles = await context.queryClient.ensureQueryData(userRolesOptions(user.id));
    if (isWarehouseOnly(roles)) {
      const path = location.pathname.replace(/\/+$/, "");
      if (path.startsWith("/admin/tienda")) throw redirect({ to: "/admin/pedidos" });
      if (path.startsWith("/admin/control-financiero")) throw redirect({ to: "/admin/pedidos" });
    }
    if (isStoreManagerOnly(roles) && !storeManagerAllows(location.pathname)) throw redirect({ to: "/admin/inventario" });
    const sedes = cashierSedes(roles);
    if (sedes) {
      const path = location.pathname.replace(/\/+$/, "");
      if (path !== "/admin") throw redirect({ to: "/pos/$sede", params: { sede: sedes[0] } });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  const { isPortal, isNested } = useRouterState({ select: (state) => ({
    isPortal: state.matches.some((match) => match.routeId === "/_authenticated/admin/"),
    isNested: state.matches.some((match) => match.routeId === "/_authenticated/admin/tienda" || match.routeId === "/_authenticated/admin/b2b"),
  }) });

  if (isPortal || isNested) {
    return (
      <div>
        <AdminGlobalSearch />
        <Outlet />
      </div>
    );
  }

  return (
    <div className="admin-scope min-h-screen bg-ivory flex animate-admin-arrival">
      <AdminSidebar />
      <main className="flex-1 min-w-0 flex flex-col">
        <Outlet />
      </main>
    </div>
  );
}
