import { createFileRoute, useParams } from "@tanstack/react-router";
import { GlobalCRM } from "@/components/crm/global-crm";

export const Route = createFileRoute("/_authenticated/pos/$sede/clientes")({
  component: SedeClientes,
});

function SedeClientes() {
  const { sede } = useParams({ from: "/_authenticated/pos/$sede/clientes" });
  return <GlobalCRM title="Clientes" eyebrow={`CRM global · POS ${sede === "cali" ? "Cali" : "Bogotá"}`} />;
}