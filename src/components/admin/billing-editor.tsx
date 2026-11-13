import { RCountEditor } from "@/components/admin/rcount-editor";

/**
 * Configuración de facturación electrónica.
 * La integración directa con Factus / eFactura se eliminó del Hub: cada R-Count
 * (Colombia y Panamá) se encarga de facturar por su cuenta. Aquí solo queda la
 * conexión con R-Count, a donde el Hub envía cada pedido.
 */
export function BillingEditor() {
  return (
    <div className="space-y-5">
      <p className="rounded-lg border border-ink/10 bg-white p-4 text-xs text-moss/80">
        El Hub envía cada pedido a <strong>R-Count</strong> y la facturación electrónica
        (Factus en Colombia, eFactura en Panamá) la hace cada R-Count, no esta tienda.
        Aquí solo configuras la conexión con R-Count.
      </p>
      <RCountEditor />
    </div>
  );
}
