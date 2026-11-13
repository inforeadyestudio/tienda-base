import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Globe2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Ship = Record<string, any>;
type Props = { order: any; ship: Ship; box?: { id: string; number: number; carrier?: string | null; tracking?: string | null; weight_kg?: number | null; dims?: string | null } };

export function isInternationalShip(ship: Ship | null | undefined) {
  const c = String(ship?.country ?? "").trim().toLowerCase();
  return !!c && !["colombia", "co", "col"].includes(c);
}

/** Guía internacional manual: solo transportadora y número de guía. */
export function InternationalLabelCard({ order, box }: Props) {
  const qc = useQueryClient();
  const [carrier, setCarrier] = useState<string>((box ? box.carrier : order.shipping_carrier) ?? "");
  const [tracking, setTracking] = useState<string>((box ? box.tracking : order.tracking_number) ?? "");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!carrier.trim() || !tracking.trim()) return toast.error("Escribe la transportadora y el número de guía");
    setBusy(true);
    let error: any = null;
    if (box) {
      ({ error } = await (supabase as any).from("b2b_boxes").update({ carrier: carrier.trim(), tracking: tracking.trim() }).eq("id", box.id));
    } else {
      const { data: o } = await supabase.from("orders").select("status").eq("id", order.id).maybeSingle();
      const markDelivered = ["paid", "preparing"].includes(String(o?.status));
      ({ error } = await supabase.from("orders").update({
        shipping_carrier: carrier.trim(), tracking_number: tracking.trim(),
        ...(markDelivered ? { status: "delivered" } : {}),
      } as any).eq("id", order.id));
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Guía internacional guardada");
    qc.invalidateQueries({ queryKey: ["admin", "order", order.id] });
    qc.invalidateQueries({ queryKey: ["b2b-boxes", order.id] });
  };

  const input = "w-full border border-ink/15 rounded-lg px-3 py-2 text-sm bg-white";
  const lbl = "text-[11px] uppercase tracking-widest text-moss/60 mb-1 block";
  return (
    <div className="bg-white border border-ink/10 rounded-2xl p-5 space-y-3">
      <p className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-moss/70">
        <Globe2 className="size-3.5" /> Guía de envío internacional
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label><span className={lbl}>Transportadora</span>
          <input className={input} value={carrier} onChange={(e) => setCarrier(e.target.value)} placeholder="Ej. FedEx" /></label>
        <label><span className={lbl}>Número de guía</span>
          <input className={input} value={tracking} onChange={(e) => setTracking(e.target.value)} placeholder="Ej. 7727 5917 5960" /></label>
      </div>
      <button onClick={save} disabled={busy} className="w-full rounded-full bg-ink text-ivory py-2.5 text-xs uppercase tracking-widest">
        {busy ? <Loader2 className="size-4 animate-spin mx-auto" /> : "Guardar guía"}
      </button>
    </div>
  );
}
