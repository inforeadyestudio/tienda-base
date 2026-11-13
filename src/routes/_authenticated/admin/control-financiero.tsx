import { createFileRoute } from "@tanstack/react-router";
import { PosFinanzas } from "@/components/finanzas/pos-finanzas";

export const Route = createFileRoute("/_authenticated/admin/control-financiero")({
  component: ControlFinancieroPage,
});

function ControlFinancieroPage() {
  return (
    <div className="p-10 max-w-[1400px]">
      <header className="mb-8">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-moss/70">Sales Hub</p>
          <h1 className="text-3xl">Control financiero</h1>
          <p className="text-sm text-ink/60 mt-1">Ingresos por canal: online, punto de venta y mayoristas.</p>
        </div>
      </header>
      <PosFinanzas />
    </div>
  );
}
