import { createFileRoute } from "@tanstack/react-router";
import { InventoryView } from "@/components/admin/inventory-view";

export const Route = createFileRoute("/_authenticated/admin/inventario")({
  component: () => <InventoryView />,
});
