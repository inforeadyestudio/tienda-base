import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import { searchRCountInvoice, issuePosCreditNote } from "@/lib/returns/pos-credit.functions";

type Line = { sku: string; name: string; quantity: number; returnable: number; returned: number; unit_price: number };
type Pick = { qty: number; reason: "talla" | "decision_propia" | "defecto"; condition: "buena" | "defectuosa" };

const REASONS = [["talla", "Talla"], ["decision_propia", "Decisión propia"], ["defecto", "Defecto"]] as const;

export function PosReturnModal({ orderId, orderNumber, invoiceNumber, onClose }: { orderId: string; orderNumber: string; invoiceNumber: string; onClose: () => void }) {
  const search = useServerFn(searchRCountInvoice);
  const issue = useServerFn(issuePosCreditNote);
  const qc = useQueryClient();
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [inv, setInv] = useState<{ number: string; has_cufe: boolean; lines: Line[] } | null>(null);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [resolution, setResolution] = useState<"reembolso" | "cambio">("reembolso");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    search({ data: { q: invoiceNumber } }).then((r) => {
      if (!r.ok) setErr(r.message ?? "Error");
      else {
        const f = r.invoices.find((i) => i.number.toUpperCase() === invoiceNumber.toUpperCase()) ?? r.invoices[0];
        if (!f) setErr("R-Count no encontró esta factura.");
        else setInv(f);
      }
    }).catch((e) => setErr(String(e?.message ?? e))).finally(() => setLoading(false));
  }, [invoiceNumber]);

  const selected = Object.entries(picks).filter(([, p]) => p.qty > 0);
  const total = selected.reduce((s, [sku, p]) => s + (inv?.lines.find((l) => l.sku === sku)?.unit_price ?? 0) * p.qty, 0);

  const submit = async () => {
    if (!inv || !selected.length) return;
    if (!confirm(`¿Emitir nota crédito sobre ${inv.number} ante la DIAN?`)) return;
    setBusy(true);
    try {
      const r: any = await issue({ data: { orderId, invoiceNumber: inv.number, resolution, notes: notes || undefined, lines: selected.map(([sku, p]) => ({ sku, quantity: p.qty, reason: p.reason, condition: p.condition })) } });
      if (r.status === "issued") toast.success(`Nota crédito emitida: ${r.numero_dian ?? r.externalId}`);
      else if (r.status === "duplicate") toast.warning("Esta devolución ya existía en R-Count.");
      else if (r.status === "draft") toast.warning("La nota quedó en borrador en R-Count.");
      else toast.error(`La DIAN no aprobó la nota: ${r.error ?? r.message ?? "sin detalle"}`);
      qc.invalidateQueries({ queryKey: ["fin-ventas"] });
      onClose();
    } catch (e: any) { toast.error(e?.message ?? "No se pudo emitir"); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6 space-y-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-moss/70">Devolución · {orderNumber}</p>
            <h2 className="text-2xl">Nota crédito sobre {invoiceNumber}</h2>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="size-8 rounded-full hover:bg-ink/5 flex items-center justify-center"><X className="size-4" /></button>
        </div>
        {loading ? <p className="text-sm text-ink/50">Buscando la factura en R-Count…</p>
        : err ? <p className="text-sm text-destructive">{err}</p>
        : inv && !inv.has_cufe && inv.lines.length === 0 ? <p className="text-sm text-ink/60">La factura no tiene prendas para devolver.</p>
        : inv && (
          <>
            <div className="divide-y divide-ink/5 border border-ink/10 rounded-2xl">
              {inv.lines.map((l) => {
                const p = picks[l.sku];
                const set = (patch: Partial<Pick>) => setPicks((s) => ({ ...s, [l.sku]: { ...({ qty: 0, reason: "talla", condition: "buena" } as Pick), ...s[l.sku], ...patch } }));
                return (
                  <div key={l.sku} className="p-4 space-y-2">
                    <div className="flex justify-between gap-3 text-sm">
                      <div><p>{l.name}</p><p className="font-mono text-xs text-ink/50">{l.sku} · facturadas {l.quantity} · devueltas {l.returned}</p></div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-ink/50">Devolver</span>
                        <input type="number" min={0} max={l.returnable} value={p?.qty ?? 0} disabled={l.returnable <= 0}
                          onChange={(e) => set({ qty: Math.max(0, Math.min(l.returnable, Number(e.target.value) || 0)) })}
                          className="w-16 border border-ink/15 rounded-lg px-2 py-1 text-sm" />
                        <span className="text-xs text-ink/50">/ {l.returnable}</span>
                      </div>
                    </div>
                    {p?.qty ? (
                      <div className="flex flex-wrap gap-2">
                        <select value={p.reason} onChange={(e) => set({ reason: e.target.value as Pick["reason"] })} className="border border-ink/15 rounded-full px-3 py-1 text-xs">
                          {REASONS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                        </select>
                        <select value={p.condition} onChange={(e) => set({ condition: e.target.value as Pick["condition"] })} className="border border-ink/15 rounded-full px-3 py-1 text-xs">
                          <option value="buena">Buena (vuelve al mismo producto)</option>
                          <option value="defectuosa">Defectuosa (Calidad C)</option>
                        </select>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2">
              {(["reembolso", "cambio"] as const).map((r) => (
                <button key={r} onClick={() => setResolution(r)} className={`px-4 py-2 rounded-full text-sm border ${resolution === r ? "bg-ink text-ivory border-ink" : "border-ink/15"}`}>
                  {r === "reembolso" ? "Reembolso" : "Cambio"}
                </button>
              ))}
            </div>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Nota (opcional)" maxLength={500} className="w-full border border-ink/15 rounded-2xl p-3 text-sm" rows={2} />
            <div className="flex items-center justify-between">
              <span className="text-sm text-ink/60">Total aprox.: ${total.toLocaleString("es-CO")}</span>
              <button disabled={busy || !selected.length} onClick={submit} className="px-5 py-2.5 rounded-full bg-ink text-ivory text-sm disabled:opacity-40">
                {busy ? "Emitiendo…" : "Emitir nota crédito"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
