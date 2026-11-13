import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useB2BGoals, type B2BGoal } from "@/components/b2b/order-extras";

export const Route = createFileRoute("/_authenticated/admin/b2b/metas")({
  head: () => ({ meta: [{ title: "Metas de pedido B2B · Tu Marca" }] }),
  component: Metas,
});

function Metas() {
  const { data } = useB2BGoals();
  const qc = useQueryClient();
  const [goals, setGoals] = useState<B2BGoal[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) setGoals(data); }, [data]);
  const patch = (id: string, p: Partial<B2BGoal>) => setGoals((g) => g.map((x) => (x.id === id ? { ...x, ...p } : x)));
  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("app_settings").upsert({ key: "b2b_goals", value: { goals } } as any, { onConflict: "key" });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Metas guardadas");
    qc.invalidateQueries({ queryKey: ["b2b-goals"] });
  };
  const input = "rounded-full border border-ink/15 bg-white px-3 py-1.5 text-sm";
  return (
    <div className="p-6 md:p-10 max-w-3xl">
      <p className="text-[10px] uppercase tracking-[0.2em] text-moss/70">Upsells mayoristas</p>
      <h1 className="font-serif text-3xl md:text-4xl text-ink mt-1">Metas de pedido</h1>
      <p className="text-sm text-moss mt-2">El cliente ve «Agrega X más y ganarás…» mientras arma su preventa. Define el monto en dólares y en pesos.</p>
      <div className="mt-6 space-y-3">
        {goals.map((g) => (
          <div key={g.id} className="bg-white border border-ink/10 rounded-2xl p-4 flex flex-wrap items-end gap-3">
            <label className="text-[10px] uppercase tracking-widest text-moss">Monto USD
              <input type="number" value={g.amount_usd || ""} onChange={(e) => patch(g.id, { amount_usd: Number(e.target.value) || 0 })} className={input + " mt-1 block w-28"} /></label>
            <label className="text-[10px] uppercase tracking-widest text-moss">Monto COP
              <input type="number" value={g.amount_cop || ""} onChange={(e) => patch(g.id, { amount_cop: Number(e.target.value) || 0 })} className={input + " mt-1 block w-36"} /></label>
            <label className="flex-1 min-w-48 text-[10px] uppercase tracking-widest text-moss">Recompensa
              <input value={g.reward} onChange={(e) => patch(g.id, { reward: e.target.value })} placeholder="Envío gratis" className={input + " mt-1 block w-full"} /></label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={g.active} onChange={(e) => patch(g.id, { active: e.target.checked })} /> Activa</label>
            <button onClick={() => setGoals((x) => x.filter((y) => y.id !== g.id))} className="p-2 text-clay"><Trash2 className="size-4" /></button>
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        <button onClick={() => setGoals((g) => [...g, { id: crypto.randomUUID(), amount_usd: 0, amount_cop: 0, reward: "", active: true }])}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-ink/15 text-xs"><Plus className="size-4" /> Agregar meta</button>
        <button disabled={saving} onClick={save} className="px-5 py-2 rounded-full bg-ink text-ivory text-xs disabled:opacity-50">Guardar</button>
      </div>
    </div>
  );
}
