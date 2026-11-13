import { redirect, createFileRoute } from "@tanstack/react-router";
import { InventoryView } from "@/components/admin/inventory-view";

export const Route = createFileRoute("/_authenticated/admin/tienda/inventario")({
  beforeLoad: () => { throw redirect({ to: "/admin/inventario" }); },
  component: () => (
    <InventoryView
      fixedLocationCode="ecom"
      eyebrow="Operación · Bodega Ecommerce"
      description="Stock de la bodega de la tienda online. Si necesitas reponer, solicita un traslado desde Bodega Central u otra tienda."
    />
  ),
});
