import { redirect, createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatCOP } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/tienda/")({
  beforeLoad: () => { throw redirect({ to: "/admin/tienda/colecciones" }); },
  component: TiendaHome,
});

function TiendaHome() {
  const { data } = useQuery({
    queryKey: ["tienda-summary"],
    queryFn: async () => {
      const [orders, nat, itl] = await Promise.all([
        supabase.from("orders").select("total_cop").eq("source", "ecom").gte("created_at", new Date(Date.now() - 30 * 864e5).toISOString()),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("available_national", true),
        supabase.from("products").select("id", { count: "exact", head: true }).eq("available_international", true),
      ]);
      return { orders: orders.data ?? [], nacional: nat.count ?? 0, intl: itl.count ?? 0 };
    },
  });
  const total30 = (data?.orders ?? []).reduce((s, o) => s + (o.total_cop ?? 0), 0);
  const nacional = data?.nacional ?? 0;
  const intl = data?.intl ?? 0;
  return (
    <div className="p-10">
      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-widest text-moss/70">Tienda Online</p>
        <h1 className="font-serif italic text-4xl mt-1">Resumen</h1>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card label="Ventas últimos 30 días" value={formatCOP(total30)} />
        <Card label="Productos en Nacional" value={String(nacional)} />
        <Card label="Productos en Internacional" value={String(intl)} />
      </div>
    </div>
  );
}
function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-ink/10 rounded-2xl p-6">
      <p className="text-[10px] uppercase tracking-widest text-moss/70">{label}</p>
      <p className="font-serif italic text-4xl mt-2">{value}</p>
    </div>
  );
}