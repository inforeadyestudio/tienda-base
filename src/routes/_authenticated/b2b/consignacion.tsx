import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { B2BTopBar } from "@/components/b2b/b2b-topbar";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/b2b/consignacion")({
  head: () => ({
    meta: [
      { title: "Envíos en consignación · Tu Marca" },
      { name: "description", content: "Confirma la recepción de las prendas enviadas a tu boutique en consignación." },
      { property: "og:title", content: "Envíos en consignación · Tu Marca" },
      { property: "og:description", content: "Confirma la recepción de las prendas enviadas a tu boutique en consignación." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: B2BConsignment,
});

type Item = { variant_id: string; qty: number; received_qty: number | null; sold_qty: number; name: string; sku: string; label: string };
type Transfer = { id: string; transfer_number: number | null; status: string; created_at: string; received_at: string | null; carrier: string | null; tracking: string | null; from_name: string | null; to_name: string; items: Item[] };

const STATUS: Record<string, string> = { approved: "Preparando envío", in_transit: "En camino", received: "Recibido" };

function B2BConsignment() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["b2b-my-consignment"],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("b2b_my_consignment_transfers");
      if (error) throw error;
      return (Array.isArray(data) ? data : []) as Transfer[];
    },
  });
  const [openId, setOpenId] = useState<string | null>(null);
  const [recv, setRecv] = useState<Record<string, number>>({});
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const open = (t: Transfer) => {
    setOpenId(openId === t.id ? null : t.id);
    setRecv(Object.fromEntries(t.items.map((i) => [i.variant_id, i.qty])));
    setNote("");
  };

  const confirm = async (t: Transfer) => {
    const missing = t.items.some((i) => (recv[i.variant_id] ?? i.qty) !== i.qty);
    if (missing && !note.trim()) { toast.error("Cuéntanos qué pasó con las prendas que no llegaron"); return; }
    setBusy(true);
    const { error } = await (supabase.rpc as any)("b2b_receive_consignment_transfer", {
      _transfer_id: t.id,
      _items: t.items.map((i) => ({ variant_id: i.variant_id, qty: recv[i.variant_id] ?? i.qty })),
      _note: note.trim() || null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Recepción confirmada");
    setOpenId(null);
    qc.invalidateQueries({ queryKey: ["b2b-my-consignment"] });
  };

  return (
    <div>
      <B2BTopBar />
      <div className="px-6 md:px-10 py-8 max-w-5xl">
        <h1 className="font-nm text-3xl md:text-4xl mb-2">Envíos en consignación</h1>
        <p className="text-sm text-ink/60 mb-8">Revisa las prendas que te enviamos y confirma lo que recibiste.</p>
        {isLoading ? <p className="text-sm text-ink/60">Cargando…</p> : !data?.length ? (
          <p className="text-sm text-ink/60">Aún no tienes envíos en consignación.</p>
        ) : (
          <div className="space-y-3">
            {data.map((t) => {
              const units = t.items.reduce((a, i) => a + (i.received_qty ?? i.qty), 0);
              const sold = t.items.reduce((a, i) => a + (i.sold_qty ?? 0), 0);
              const pending = t.status !== "received";
              return (
                <div key={t.id} className="bg-white rounded-2xl border border-ink/10">
                  <button onClick={() => open(t)} className="w-full text-left px-5 py-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">Envío #{t.transfer_number ?? "—"}</p>
                      <p className="text-xs text-ink/50">{new Date(t.created_at).toLocaleDateString("es-CO")} · {units} prendas{t.status === "received" ? ` · ${sold} vendidas` : ""}{t.tracking ? ` · Guía ${t.tracking}` : ""}</p>
                    </div>
                    <span className={`text-xs px-3 py-1 rounded-full ${pending ? "bg-ink text-ivory" : "bg-ink/5 text-ink/70"}`}>{STATUS[t.status] ?? t.status}</span>
                  </button>
                  {openId === t.id && (
                    <div className="border-t border-ink/10 px-5 py-4">
                      <table className="w-full text-sm">
                        <thead><tr className="text-[10px] uppercase tracking-widest text-ink/50 text-left">
                          <th className="py-2">Prenda</th><th className="py-2 text-right">Enviado</th>
                          <th className="py-2 text-right">{pending ? "Recibido" : "Recibido / vendido"}</th>
                        </tr></thead>
                        <tbody className="divide-y divide-ink/5">
                          {t.items.map((i) => (
                            <tr key={i.variant_id}>
                              <td className="py-2">{i.name}<div className="text-[11px] text-ink/50">{i.label} · {i.sku}</div></td>
                              <td className="py-2 text-right">{i.qty}</td>
                              <td className="py-2 text-right">
                                {pending ? (
                                  <input type="number" min={0} value={recv[i.variant_id] ?? i.qty}
                                    onChange={(e) => setRecv((r) => ({ ...r, [i.variant_id]: Math.max(0, parseInt(e.target.value) || 0) }))}
                                    className="no-spin w-16 text-center rounded-full border border-ink/15 px-2 py-1" />
                                ) : `${i.received_qty ?? i.qty} / ${i.sold_qty ?? 0}`}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {pending && (
                        <div className="mt-4 space-y-3">
                          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (obligatoria si falta o sobra algo)"
                            className="w-full border border-ink/15 rounded-xl px-3 py-2 text-sm" rows={2} />
                          <button disabled={busy} onClick={() => confirm(t)} className="px-6 py-3 rounded-full bg-ink text-ivory text-xs disabled:opacity-50">
                            {busy ? "Confirmando…" : "Confirmar recepción"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
