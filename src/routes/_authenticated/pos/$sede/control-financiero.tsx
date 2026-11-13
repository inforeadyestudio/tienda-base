import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PosFinanzas } from "@/components/finanzas/pos-finanzas";

export const Route = createFileRoute("/_authenticated/pos/$sede/control-financiero")({
  component: SedeControlFinancieroPage,
});

function SedeControlFinancieroPage() {
  const { sede } = useParams({ from: "/_authenticated/pos/$sede/control-financiero" });
  const { data: location } = useQuery({
    queryKey: ["sede-location", sede],
    queryFn: async () => (await supabase.from("locations").select("id, name").eq("code", sede).maybeSingle()).data,
  });

  return (
    <div className="p-10 max-w-[1400px]">
      <header className="mb-8">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-moss/70">{location?.name ?? sede}</p>
          <h1 className="text-3xl">Control financiero</h1>
          <p className="text-sm text-ink/60 mt-1">Cierres y ventas de esta sede.</p>
        </div>
      </header>
      {location?.id ? (
        <PosFinanzas lockedSedeId={location.id} />
      ) : (
        <p className="text-sm text-ink/50 py-10">Cargando sede…</p>
      )}
    </div>
  );
}
