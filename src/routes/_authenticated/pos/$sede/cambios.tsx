import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ReturnsPanel } from "@/components/admin/returns-panel";
import { BrandLoader } from "@/components/ui/page-loader";
import { ReturnReceiveModal } from "@/components/pos/return-receive-modal";
import { LegacyCreditPanel } from "@/components/pos/legacy-credit-panel";

export const Route = createFileRoute("/_authenticated/pos/$sede/cambios")({
  head: () => ({ meta: [
    { title: "Cambios y notas crédito POS · Tu Marca" },
    { name: "description", content: "Devoluciones de tienda y notas crédito de ventas actuales o del sistema anterior en Tu Marca." },
    { property: "og:title", content: "Cambios y notas crédito POS · Tu Marca" },
    { property: "og:description", content: "Gestión de cambios, devoluciones y notas crédito en las tiendas Tu Marca." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: PosCambios,
});

function PosCambios() {
  const { sede } = useParams({ from: "/_authenticated/pos/$sede/cambios" });
  const [open, setOpen] = useState(false);
  const { data: loc, isLoading } = useQuery({
    queryKey: ["pos-location", sede],
    queryFn: async () => (await supabase.from("locations").select("id, name").eq("code", sede).maybeSingle()).data,
  });
  if (isLoading) return <BrandLoader />;
  return (
    <div>
      <ReturnsPanel
        scope={{ kind: "location", locationCode: sede, locationId: loc?.id ?? null }}
        title="Cambios y devoluciones"
        subtitle={loc?.name ?? sede}
        onNew={() => loc?.id && setOpen(true)}
      />
      {loc?.id && <LegacyCreditPanel locationId={loc.id} locationName={loc.name} />}
      {open && loc?.id && <ReturnReceiveModal locationId={loc.id} locationName={loc.name} sede={sede} onClose={() => setOpen(false)} />}
    </div>
  );
}
