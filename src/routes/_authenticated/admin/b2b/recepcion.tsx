import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";

export const Route = createFileRoute("/_authenticated/admin/b2b/recepcion")({
  component: RecepcionPage,
});

const WILD_HOUSE_CODE = "bodega";

function RecepcionPage() {
  const qc = useQueryClient();

  const { data: wild } = useQuery({
    queryKey: ["wild-house"],
    queryFn: async () => (await supabase.from("locations").select("id, name").eq("code", WILD_HOUSE_CODE).maybeSingle()).data,
  });

  const { data: allocations } = useQuery({
    queryKey: ["preventa-pending"],
    queryFn: async () => {
      return fetchAll((from, to) =>
        supabase
          .from("preventa_allocations")
          .select("id, qty, fulfilled_qty, status, location_id, variant_id, created_at, orders(number), locations(name), product_variants(sku, size, quality, products(name, reference_code))")
          .eq("status", "pending")
          .order("created_at")
          .order("id")
          .range(from, to),
      );
    },
  });

  const variantIds = Array.from(new Set((allocations ?? []).map((a) => a.variant_id)));

  const { data: wildStock } = useQuery({
    queryKey: ["wild-stock", wild?.id, variantIds.join(",")],
    enabled: !!wild?.id && variantIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("inventory_levels")
        .select("variant_id, on_hand, reserved")
        .eq("location_id", wild!.id)
        .in("variant_id", variantIds);
      const map: Record<string, number> = {};
      (data ?? []).forEach((l) => { map[l.variant_id] = l.on_hand - l.reserved; });
      return map;
    },
  });

  const cover = useMutation({
    mutationFn: async (a: { id: string; variant_id: string; qty: number; location_id: string }) => {
      if (!wild?.id) throw new Error("Bodega Central no encontrada");
      const { error } = await supabase.rpc("request_transfer", {
        _from_location_id: wild.id,
        _to_location_id: a.location_id,
        _items: [{ variant_id: a.variant_id, qty: a.qty }] as never,
        _note: "Cubrimiento de preventa",
      });
      if (error) throw new Error(error.message);
      const { error: uErr } = await supabase
        .from("preventa_allocations")
        .update({ status: "covered", fulfilled_qty: a.qty })
        .eq("id", a.id);
      if (uErr) throw new Error(uErr.message);
    },
    onSuccess: () => {
      toast.success("Traslado solicitado y preventa marcada como cubierta");
      qc.invalidateQueries({ queryKey: ["preventa-pending"] });
      qc.invalidateQueries({ queryKey: ["transfers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  return (
    <div className="p-6 md:p-10">
      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-widest text-moss/70">Operación</p>
        <h1 className="mt-1 font-serif text-4xl italic">Control de recepción</h1>
        <p className="mt-2 max-w-2xl text-sm text-moss">
          Preventas comprometidas y su cobertura con la mercancía real que ingresa desde R Wear a Bodega Central. Cuando hay
          existencia suficiente, se genera el traslado hacia la bodega que vendió.
        </p>
      </header>

      <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-widest text-moss/70">
            <tr>
              <th className="px-4 py-3 text-left">Pedido</th>
              <th className="text-left">Ref</th>
              <th className="text-left">Descripción</th>
              <th className="text-left">SKU</th>
              <th className="text-left">Talla</th>
              <th className="text-right">Comprometido</th>
              <th className="text-right">En Bodega Central</th>
              <th className="text-right">Faltante</th>
              <th className="px-4 text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {(allocations ?? []).map((a) => {
              const stock = wildStock?.[a.variant_id] ?? 0;
              const missing = Math.max(0, a.qty - stock);
              return (
                <tr key={a.id} className="border-t border-ink/5">
                  <td className="px-4 py-3 font-mono text-[11px] text-ink/60">{a.orders?.number ?? "—"}</td>
                  <td className="font-mono text-[11px] text-ink/60">{a.product_variants?.products?.reference_code ?? "—"}</td>
                  <td>
                    {a.product_variants?.products?.name}
                    <span className="block text-[10px] uppercase tracking-widest text-moss/60">{a.locations?.name}</span>
                  </td>
                  <td className="font-mono text-[11px]">{a.product_variants?.sku}</td>
                  <td>{[a.product_variants?.size, a.product_variants?.quality].filter(Boolean).join(" · ") || "Única"}</td>
                  <td className="text-right">{a.qty}</td>
                  <td className="text-right">{stock}</td>
                  <td className={"text-right " + (missing > 0 ? "text-clay" : "text-moss")}>{missing}</td>
                  <td className="px-4 text-right">
                    <button
                      disabled={missing > 0 || cover.isPending}
                      onClick={() => cover.mutate({ id: a.id, variant_id: a.variant_id, qty: a.qty, location_id: a.location_id })}
                      className="rounded-full bg-ink px-4 py-1.5 text-xs text-ivory disabled:opacity-30"
                    >
                      {missing > 0 ? "Esperando mercancía" : "Cubrir preventa"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {(allocations ?? []).length === 0 && (
              <tr><td colSpan={9} className="px-6 py-10 text-center text-moss/60">No hay preventas pendientes.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
