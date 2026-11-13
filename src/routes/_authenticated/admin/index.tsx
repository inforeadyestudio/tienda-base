import { createFileRoute, Link } from "@tanstack/react-router";
import { LayoutGrid, Globe, Store, Handshake } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cashierSedes, isStoreManagerOnly, isWarehouseOnly, userRolesOptions, useSession } from "@/lib/auth-hooks";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({ meta: [
    { title: "Admin Portal · Tu Marca" },
    { name: "description", content: "Accede a Sales Hub, Tienda Online, B2B y las cajas POS de Tu Marca." },
    { property: "og:title", content: "Admin Portal · Tu Marca" },
    { property: "og:description", content: "Accesos a los portales de operaciones de Tu Marca." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: AdminPortal,
});

function AdminPortal() {
  const { user } = useSession();
  const { data: roles } = useQuery({ ...userRolesOptions(user?.id ?? "anon"), enabled: !!user });
  const sedes = cashierSedes(roles ?? []);
  const manager = isStoreManagerOnly(roles ?? []);
  const warehouse = isWarehouseOnly(roles ?? []);
  const portals: Array<{
    title: string;
    description: string;
    icon: typeof LayoutGrid;
    href: string;
    params?: Record<string, string>;
    color: string;
  }> = [
    {
      title: "Sales Hub",
      description:
        "Panel general: Administrar productos, estadísticas e ingreso a la bodega central",
      icon: LayoutGrid,
      href: manager ? "/admin/inventario" : "/admin/pedidos",
      color: "bg-ink text-ivory",
    },
    {
      title: "Tienda Online",
      description: "E-commerce nacional e internacional.",
      icon: Globe,
      href: "/admin/tienda",
      color: "bg-white text-ink border border-ink/10",
    },
    {
      title: "B2B",
      description: "Mayoristas: clientes, accesos al portal, pedidos, mensajes e inventario",
      icon: Handshake,
      href: "/admin/b2b",
      color: "bg-white text-ink border border-ink/10",
    },
    {
      title: "POS Eventos",
      description: "Punto de venta para eventos.",
      icon: Store,
      href: "/pos/$sede",
      params: { sede: "cali" },
      color: "bg-white text-ink border border-ink/10",
    },
  ];

  return (
    <div className="admin-scope min-h-screen bg-background p-6 md:p-12 flex flex-col items-center justify-center">
      <div className="max-w-4xl w-full">
        <header className="mb-12 text-center">
          <p className="text-[10px] uppercase tracking-[0.2em] text-moss/70 mb-2">Tu Marca</p>
          <h1 className="font-serif italic text-4xl md:text-5xl text-ink">Admin Portal</h1>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {portals.filter((p) => !warehouse || p.title === "Sales Hub" || p.title === "B2B").filter((p) => !manager || p.title === "Sales Hub" || p.params?.sede).filter((p) => !sedes || (p.params?.sede && sedes.includes(p.params.sede))).map((portal) => (
            <Link
              key={portal.title}
              to={portal.href as "/admin"}
              params={portal.params as never}
              preload="intent"
              viewTransition={{ types: ["admin-portal"] }}
              className={`group p-8 rounded-[2rem] flex flex-col h-72 transition-[transform,box-shadow] duration-200 ease-out motion-safe:hover:scale-[1.015] motion-safe:active:scale-[0.985] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-moss ${portal.color}`}
            >
              <div className="mb-auto">
                <portal.icon className="w-8 h-8 opacity-80" />
              </div>
              <div>
                <h2 className="font-serif italic text-3xl mb-2">{portal.title}</h2>
                <p className="text-sm opacity-70 leading-relaxed max-w-[280px] whitespace-pre-line">
                  {portal.description}
                </p>
              </div>
            </Link>
          ))}
        </div>

        <footer className="mt-16 text-center">
          <p className="text-[10px] uppercase tracking-widest text-moss/40">
            Tu Marca Sales Hub · Central de Operaciones
          </p>
        </footer>
      </div>
    </div>
  );
}
