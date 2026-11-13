import { redirect, createFileRoute } from "@tanstack/react-router";
import { EcomFinanzas } from "@/components/finanzas/ecom-finanzas";

export const Route = createFileRoute("/_authenticated/admin/tienda/control-financiero")({
  beforeLoad: () => { throw redirect({ to: "/admin/control-financiero" }); },
  component: TiendaControlFinancieroPage,
});

function TiendaControlFinancieroPage() {
  return (
    <div className="p-10 max-w-[1400px]">
      <header className="mb-8">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-moss/70">Tienda Online</p>
          <h1 className="text-3xl">Control financiero</h1>
          <p className="text-sm text-ink/60 mt-1">Pedidos y ventas del ecommerce nacional e internacional.</p>
        </div>
      </header>
      <EcomFinanzas />
    </div>
  );
}
