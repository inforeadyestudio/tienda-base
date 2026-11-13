import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { InventoryAdjustModal } from "@/components/admin/inventory-adjust-modal";

type Case = { variant_id: string; sku: string | null; name: string | null; sent: number; received: number; kind: "faltante" | "sobrante" | "no_enviado" };

const KIND: Record<Case["kind"], string> = { faltante: "Faltante", sobrante: "Sobrante", no_enviado: "Llegó trocado (no estaba en el envío)" };

/** Casos de ajuste de traslados recibidos con diferencias. Si se da originId, solo los que salieron de esa bodega. */
export function TransferDiscrepancies({ originId }: { originId?: string | null }) {
  const qc = useQueryClient();
  const [show, setShow] = useState<"open" | "resolved">("open");
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [adjusting, setAdjusting] = useState<any | null>(null);

  const { data: locs } = useQuery({
    queryKey: ["transfer-locs"],
    queryFn: async () => (await supabase.from("locations").select("id, name, code, kind").eq("active", true)).data ?? [],
  });
  const openAdjust = (t: any) => {
    const cases = (t.discrepancy_items ?? []) as Case[];
    const missing = cases.filter((c) => c.kind === "faltante").reduce((s, c) => s + (c.sent - c.received), 0);
    const extra = cases.filter((c) => c.kind !== "faltante").reduce((s, c) => s + (c.received - c.sent), 0);
    setAdjusting({
      t,
      initial: {
        dir: missing >= extra ? "in" : "out",
        locationId: t.from_location_id,
        note: `${locName(t.from_location_id)} → ${locName(t.to_location_id)}${t.receipt_note ? ` · ${t.receipt_note}` : ""}`,
        lines: cases.map((c) => ({ id: c.variant_id, sku: c.sku ?? "", label: `${c.name ?? ""} · ${KIND[c.kind] ?? c.kind}`, qty: String(Math.abs(c.sent - c.received) || 1) })),
      },
    });
  };
  const locName = (id: string | null) => locs?.find((l) => l.id === id)?.name ?? "—";

  const { data: rows, isLoading } = useQuery({
    queryKey: ["transfer-discrepancies", originId ?? "all", show],
    enabled: originId !== null,
    queryFn: async () => {
      let q = (supabase.from("transfers") as any)
        .select("id, from_location_id, to_location_id, received_at, receipt_note, discrepancy_items, discrepancy_resolution, discrepancy_resolved_at")
        .eq("discrepancy_status", show)
        .order("received_at", { ascending: false })
        .limit(200);
      if (originId) q = q.eq("from_location_id", originId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const resolve = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("resolve_transfer_discrepancy" as never, { _transfer_id: id, _resolution: notes[id] ?? "" } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Caso marcado como resuelto");
      qc.invalidateQueries({ queryKey: ["transfer-discrepancies"] });
      qc.invalidateQueries({ queryKey: ["incoming-transfers-count"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["open", "resolved"] as const).map((s) => (
          <button key={s} onClick={() => setShow(s)} className={"px-3 py-1.5 rounded-full text-xs border " + (show === s ? "bg-ink text-ivory border-ink" : "bg-white text-ink/70 border-ink/10")}>
            {s === "open" ? "Por revisar" : "Resueltos"}
          </button>
        ))}
      </div>
      {isLoading && <p className="text-sm text-moss/70">Cargando…</p>}
      {!isLoading && (rows?.length ?? 0) === 0 && (
        <div className="bg-white border border-ink/10 rounded-2xl px-6 py-10 text-center text-moss/60 text-sm">
          {show === "open" ? "Sin ajustes pendientes." : "Sin casos resueltos."}
        </div>
      )}
      {(rows ?? []).map((t) => (
        <div key={t.id} className="bg-white border border-ink/10 rounded-2xl p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-serif italic text-lg">{locName(t.from_location_id)} → {locName(t.to_location_id)}</p>
            <p className="text-xs text-moss">Recibido {t.received_at ? new Date(t.received_at).toLocaleString("es-CO") : "—"}</p>
          </div>
          <table className="w-full text-xs mt-3">
            <thead className="text-[10px] uppercase tracking-widest text-moss/70">
              <tr><th className="text-left py-1.5">Prenda</th><th className="text-left">Caso</th><th className="text-right">Enviado</th><th className="text-right">Llegó</th></tr>
            </thead>
            <tbody>
              {((t.discrepancy_items ?? []) as Case[]).map((c, i) => (
                <tr key={i} className="border-t border-ink/5">
                  <td className="py-1.5 pr-2"><span className="font-mono">{c.sku}</span> · {c.name}</td>
                  <td className="text-clay">{KIND[c.kind] ?? c.kind}</td>
                  <td className="text-right">{c.sent}</td>
                  <td className="text-right">{c.received}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {t.receipt_note && <p className="text-xs text-ink/70 mt-3">Nota de quien recibió: {t.receipt_note}</p>}
          {show === "open" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <input value={notes[t.id] ?? ""} onChange={(e) => setNotes((n) => ({ ...n, [t.id]: e.target.value }))} maxLength={500}
                placeholder="Cómo se resolvió (opcional)" className="flex-1 min-w-[220px] px-4 py-2 rounded-full border border-ink/15 text-xs bg-ivory/50" />
              <button disabled={resolve.isPending} onClick={() => resolve.mutate(t.id)} className="px-4 py-2 rounded-full bg-ink text-ivory text-xs disabled:opacity-50">
                Marcar como resuelto
              </button>
              <button onClick={() => openAdjust(t)} className="px-4 py-2 rounded-full border border-ink/20 text-xs hover:bg-ink/5">
                Ajuste de inventario
              </button>
            </div>
          ) : (
            <p className="text-xs text-moss mt-3">Resuelto {t.discrepancy_resolved_at ? new Date(t.discrepancy_resolved_at).toLocaleDateString("es-CO") : ""}{t.discrepancy_resolution ? ` · ${t.discrepancy_resolution}` : ""}</p>
          )}
        </div>
      ))}
      {adjusting && (
        <InventoryAdjustModal
          locations={(locs ?? []).map((l: any) => ({ id: l.id, name: l.name }))}
          initial={adjusting.initial}
          prefix="Ajuste por traslado"
          onDone={() => setNotes((n) => ({ ...n, [adjusting.t.id]: n[adjusting.t.id] || "Ajuste de inventario registrado" }))}
          onClose={() => setAdjusting(null)}
        />
      )}
    </div>
  );
}
