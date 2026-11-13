import { redirect, createFileRoute } from "@tanstack/react-router";
import { GlobalCRM } from "@/components/crm/global-crm";

export const Route = createFileRoute("/_authenticated/admin/tienda/clientes")({
  beforeLoad: () => { throw redirect({ to: "/admin/clientes" }); },
  component: TiendaClientes,
});

function TiendaClientes() {
  return <GlobalCRM title="Clientes" eyebrow="CRM global · Tienda Online" />;
}
