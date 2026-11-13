import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Item = { id: string; variant_id: string; qty: number; product_name: string | null; variant_label: string | null; fulfill_location_id: string | null };

/** Cambia la bodega de donde sale una prenda en un pedido pagado/reservado sin despachar. */
export function ChangeItemLocationModal({ item, onClose, onDone }: { item: Item; onClose: () => void; onDone: () => void }) {
  const [saving, setSaving] = useState<string | null>(null);
  const { data: options, isLoading } = useQuery({
    queryKey: ["item-location-options", item.variant_id],
    queryFn: async () => {
      const { data, error } = await supabase.from("inventory_levels")
        .select("location_id, on_hand, reserved, locations!inner(name, active)")
        .eq("variant_id", item.variant_id);
      if (error) throw error;
      return (data ?? [])
        .filter((r: any) => r.locations?.active && r.location_id !== item.fulfill_location_id)
        .map((r: any) => ({ id: r.location_id as string, name: r.locations.name as string, free: (r.on_hand ?? 0) - (r.reserved ?? 0) }))
        .sort((a, b) => b.free - a.free || a.name.localeCompare(b.name));
    },
  });

  const pick = async (locId: string) => {
    setSaving(locId);
    const { error } = await supabase.rpc("change_order_item_location" as any, { _item_id: item.id, _new_location_id: locId } as any);
    setSaving(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Bodega cambiada");
    onDone();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-start justify-between gap-3">
          <h3 className="font-nm text-base">Cambiar bodega</h3>
          <button type="button" aria-label="Cerrar" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-4 text-xs text-moss/70">{[item.product_name, item.variant_label, `${item.qty} u.`].filter(Boolean).join(" · ")}</p>
        {isLoading ? <p className="text-sm text-moss/60">Cargando bodegas…</p> : (
          <ul className="max-h-[60vh] divide-y divide-ink/5 overflow-auto">
            {(options ?? []).map((o) => {
              const ok = o.free >= item.qty;
              return (
                <li key={o.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span>{o.name} <span className="text-xs text-moss/60">· {Math.max(o.free, 0)} disponibles</span></span>
                  <button disabled={!ok || !!saving} onClick={() => pick(o.id)}
                    className="rounded-full border border-ink/15 px-3 py-1 text-xs hover:border-ink/40 disabled:opacity-40">
                    {saving === o.id ? "Cambiando…" : ok ? "Elegir" : "Sin stock"}
                  </button>
                </li>
              );
            })}
            {(options ?? []).length === 0 && <li className="py-2 text-sm text-moss/60">Ninguna otra bodega tiene esta talla.</li>}
          </ul>
        )}
        <p className="mt-4 text-[11px] text-moss/60">No cambia el pago, el precio ni la factura.</p>
      </div>
    </div>
  );
}
