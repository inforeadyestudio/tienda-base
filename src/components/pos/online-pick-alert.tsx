import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

/** Prendas de pedidos online que salen de esta sede y aún no se han separado. */
export function OnlinePickAlert({ locationCode }: { locationCode: string }) {
  const qc = useQueryClient();
  const key = ["pos-online-picks", locationCode];
  const { data = [] } = useQuery({
    queryKey: key,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data: loc } = await supabase.from("locations").select("id").eq("code", locationCode).maybeSingle();
      if (!loc) return [];
      const { data, error } = await (supabase.from("order_items") as any)
        .select("id, qty, product_name, variant_label, orders!inner(number, source, is_manual, status)")
        .eq("fulfill_location_id", loc.id)
        .is("picked_at", null)
        .eq("orders.source", "ecom")
        .eq("orders.is_manual", false)
        .in("orders.status", ["paid", "preparing"]);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const pick = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.rpc as any)("mark_online_item_picked", { _item_id: id });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Marcada como separada"); qc.invalidateQueries({ queryKey: key }); },
    onError: (e: any) => toast.error(e.message ?? "No se pudo marcar"),
  });
  if (!data.length) return null;
  return (
    <details className="group border-b border-clay/30 bg-clay/10 px-6 py-2 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-[10px] uppercase tracking-widest text-clay">
        <span>Separar para pedido online ({data.length})</span>
        <span className="transition-transform group-open:rotate-180">▾</span>
      </summary>
      <ul className="mt-1.5 max-h-[50vh] space-y-1 overflow-y-auto pb-1">
        {data.map((i) => (
          <li key={i.id} className="flex flex-wrap items-center gap-2">
            <span className="font-medium">#{i.orders?.number}</span>
            <span>{i.product_name}{i.variant_label ? ` · ${i.variant_label}` : ""} × {i.qty}</span>
            <button
              type="button"
              disabled={pick.isPending}
              onClick={() => pick.mutate(i.id)}
              className="rounded-full border border-ink/20 px-2.5 py-0.5 text-[10px] uppercase tracking-wider hover:bg-ink/5 disabled:opacity-50"
            >
              Separado
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
