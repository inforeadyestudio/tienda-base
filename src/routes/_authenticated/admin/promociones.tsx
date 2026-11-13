import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { formatCOP, formatUSD } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/promociones")({
  head: () => ({ meta: [{ title: "Códigos de descuento | Tu Marca" }, { name: "description", content: "Gestiona códigos de descuento en pesos, dólares y porcentajes de Tu Marca." }, { property: "og:title", content: "Códigos de descuento | Tu Marca" }, { property: "og:description", content: "Gestiona los descuentos de Tu Marca por canal y moneda." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: PromosPage,
});

const CHANNELS = [
  { id: "ecom_nacional", label: "Ecom Nacional" },
  { id: "ecom_intl", label: "Ecom Internacional" },
  { id: "pos_cali", label: "POS Eventos" },
];

function PromosPage() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [kind, setKind] = useState<"percent" | "amount" | "amount_usd">("percent");
  const [value, setValue] = useState(10);
  const [channels, setChannels] = useState<string[]>(["ecom_nacional"]);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["promotions"],
    queryFn: async () => (await supabase.from("promotions").select("*").order("created_at", { ascending: false })).data ?? [],
  });

  const reset = () => { setEditingId(null); setName(""); setCode(""); setKind("percent"); setValue(10); setChannels(["ecom_nacional"]); };

  const create = useMutation({
    mutationFn: async () => {
      if (!name) throw new Error("Nombre requerido");
      if (!Number.isFinite(value) || value <= 0 || (kind === "percent" && value > 100)) throw new Error("Escribe un valor válido");
      if (kind !== "amount_usd" && !Number.isInteger(value)) throw new Error("El valor debe ser entero");
      if (!channels.length) throw new Error("Escoge al menos un canal");
      const payload = { name: name.trim(), code: code.trim().toUpperCase() || null, kind: kind === "amount_usd" ? "amount" : kind, value: kind === "amount_usd" ? 0 : value, amount_currency: kind === "amount_usd" ? "USD" : "COP", amount_usd: kind === "amount_usd" ? Math.round(value * 100) / 100 : null, channels: kind === "amount_usd" ? ["ecom_intl"] : channels };
      const { error } = editingId
        ? await supabase.from("promotions").update(payload).eq("id", editingId)
        : await supabase.from("promotions").insert({ ...payload, active: true });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(editingId ? "Código actualizado" : "Código creado"); reset(); qc.invalidateQueries({ queryKey: ["promotions"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("promotions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Código eliminado"); reset(); qc.invalidateQueries({ queryKey: ["promotions"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const startEdit = (p: { id: string; name: string; code: string | null; kind: string; value: number; channels: string[] | null; amount_currency: string; amount_usd: number | null }) => {
    setEditingId(p.id); setName(p.name); setCode(p.code ?? ""); setKind(p.amount_currency === "USD" ? "amount_usd" : p.kind === "percent" ? "percent" : "amount"); setValue(p.amount_currency === "USD" ? Number(p.amount_usd) : p.value); setChannels(p.channels ?? []);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="p-4 sm:p-10 max-w-6xl">
      <header className="mb-6">
        <p className="text-[10px] uppercase tracking-widest text-moss/70">Ventas</p>
        <h1 className="font-serif italic text-4xl mt-1">Códigos de descuento</h1>
      </header>

      <section className="border-b border-border pb-6 mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-xs uppercase tracking-widest text-moss/70">Nombre interno</label>
          <input aria-label="Nombre interno" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-full border border-ink/15 px-4 py-2.5 bg-ivory" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest text-moss/70">Código público</label>
          <input aria-label="Código público" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} className="mt-1 w-full rounded-full border border-ink/15 px-4 py-2.5 bg-ivory font-mono" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest text-moss/70">Tipo</label>
          <select aria-label="Tipo de descuento" value={kind} onChange={(e) => { const next = e.target.value; if (next !== "percent" && next !== "amount" && next !== "amount_usd") return; setKind(next); if (next === "amount_usd") setChannels(["ecom_intl"]); }} className="mt-1 w-full rounded-full border border-ink/15 px-4 py-2.5 bg-ivory">
            <option value="percent">Porcentaje</option>
            <option value="amount">Monto fijo (COP)</option>
            <option value="amount_usd">Monto fijo (US$)</option>
          </select>
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest text-moss/70">{kind === "amount_usd" ? "Valor en US$" : "Valor"}</label>
          <input aria-label="Valor del descuento" type="number" step={kind === "amount_usd" ? "0.01" : "1"} min={kind === "amount_usd" ? 0.01 : 1} max={kind === "percent" ? 100 : undefined} value={value} onChange={(e) => setValue(Number(e.target.value))} className="mt-1 w-full rounded-full border border-ink/15 px-4 py-2.5 bg-ivory" />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs uppercase tracking-widest text-moss/70">Aplica en</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {CHANNELS.map((c) => {
              const on = channels.includes(c.id);
              return (
                <Button key={c.id} variant={on ? "default" : "outline"} aria-pressed={on} disabled={kind === "amount_usd"} onClick={() => setChannels((p) => on ? p.filter((x) => x !== c.id) : [...p, c.id])}>
                  {c.label}
                </Button>
              );
            })}
          </div>
        </div>
        <div className="md:col-span-2">
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            {editingId ? "Guardar cambios" : "Crear código"}
          </Button>
          {editingId && <Button variant="outline" onClick={reset} className="ml-2">Cancelar</Button>}
        </div>
      </section>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-widest text-moss/70">
            <tr><th className="text-left px-4 py-3">Nombre</th><th>Código</th><th>Tipo</th><th className="text-right">Valor</th><th className="text-left px-4">Canales</th><th></th></tr>
          </thead>
          <tbody>
            {data?.map((p) => (
              <tr key={p.id} className="border-t border-ink/5">
                <td className="px-4 py-3 font-serif italic">{p.name}</td>
                <td className="font-mono text-xs">{p.code ?? "—"}</td>
                <td className="text-xs text-moss">{p.kind === "percent" ? "Porcentaje" : p.amount_currency === "USD" ? "Monto fijo US$" : "Monto fijo COP"}</td>
                <td className="text-right whitespace-nowrap">{p.kind === "percent" ? `${p.value}%` : p.amount_currency === "USD" ? formatUSD(p.amount_usd) : formatCOP(p.value)}</td>
                <td className="px-4">
                  <div className="flex gap-1 flex-wrap">
                    {(p.channels ?? []).map((c) => (
                      <span key={c} className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded bg-moss/10 text-moss">{c}</span>
                    ))}
                  </div>
                </td>
                <td className="px-4 text-right whitespace-nowrap">
                  <Button variant="outline" size="sm" onClick={() => startEdit(p)} className="mr-2">Editar</Button>
                  <Button variant="outline" size="sm" onClick={() => { if (confirm(`¿Eliminar «${p.name}»?`)) remove.mutate(p.id); }} className="text-destructive">Borrar</Button>
                </td>
              </tr>
            ))}
            {(data?.length ?? 0) === 0 && <tr><td colSpan={6} className="px-6 py-10 text-center text-moss/60">Sin códigos aún.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}