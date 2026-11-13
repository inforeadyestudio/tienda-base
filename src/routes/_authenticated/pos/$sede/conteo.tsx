import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PhysicalCount } from "../../admin/conteo";
import { SEDES } from "./route";

export const Route = createFileRoute("/_authenticated/pos/$sede/conteo")({
  head: () => ({ meta: [{ title: "Conteo físico · POS" }, { name: "description", content: "Toma física del inventario de la tienda." }] }),
  component: SedeConteo,
});

function SedeConteo() {
  const { sede } = useParams({ from: "/_authenticated/pos/$sede/conteo" });
  const info = SEDES[sede as keyof typeof SEDES];
  const { data: loc, isLoading } = useQuery({
    queryKey: ["sede-loc", info.code],
    queryFn: async () => (await supabase.from("locations").select("id, code, name").eq("code", info.code).maybeSingle()).data,
  });
  if (isLoading) return <div className="p-10 text-sm text-moss">Cargando…</div>;
  if (!loc) return <div className="p-10 text-sm text-moss">No se encontró la bodega de esta tienda.</div>;
  return <PhysicalCount key={loc.id} lockedLocationId={loc.id} lockedName={loc.name} />;
}
