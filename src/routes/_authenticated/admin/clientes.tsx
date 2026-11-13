import { createFileRoute } from "@tanstack/react-router";
import { GlobalCRM } from "@/components/crm/global-crm";

export const Route = createFileRoute("/_authenticated/admin/clientes")({
  component: CustomersPage,
});

function CustomersPage() {
  return <GlobalCRM title="Clientes" eyebrow="CRM global · Sales Hub" />;
}