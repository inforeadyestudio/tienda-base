import { createFileRoute, useParams } from "@tanstack/react-router";
import { InventoryView } from "@/components/admin/inventory-view";
import { SEDES } from "./route";

export const Route = createFileRoute("/_authenticated/pos/$sede/inventario")({
  component: SedeInventario,
});

function SedeInventario() {
  const { sede } = useParams({ from: "/_authenticated/pos/$sede/inventario" });
  const info = SEDES[sede as keyof typeof SEDES];
  return (
    <InventoryView
      fixedLocationCode={info.code}
      eyebrow={`Operación · ${info.label}`}
      description="Stock disponible en esta sede. Si necesitas reponer, solicita un traslado desde bodega central u otra tienda."
    />
  );
}
