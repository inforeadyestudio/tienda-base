import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PROVIDER_LABEL, orderInvoicesQuery, providerForCurrency } from "@/lib/billing";
import { resendOrderBilling } from "@/lib/rcount.functions";
import { supabase } from "@/integrations/supabase/client";

/** Emisión manual de la factura electrónica de un pedido. En B2B las facturas se emiten por caja al despacharla. */
export function InvoicePanel({ orderId, currency, b2b }: { orderId: string; currency: string; b2b?: boolean }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const { data: invoices } = useQuery(orderInvoicesQuery(orderId));
  const { data: boxes } = useQuery({
    queryKey: ["b2b-boxes-brief", orderId],
    enabled: !!b2b,
    queryFn: async () => ((await (supabase.from as any)("b2b_boxes").select("id, box_number, status").eq("order_id", orderId).order("created_at", { ascending: true })).data ?? []) as any[],
  });
  const resendFn = useServerFn(resendOrderBilling);
  const { data: log } = useQuery({
    queryKey: ["rcount-log", orderId],
    queryFn: async () => ((await (supabase.from as any)("rcount_sync_log").select("id, entity, trigger, target, status, created_at").eq("order_id", orderId).order("created_at", { ascending: false }).limit(5)).data ?? []) as any[],
  });
  const resend = async () => {
    setBusy(true);
    try {
      const r = await resendFn({ data: { orderId } });
      r.ok ? toast.success(r.message) : toast.error(r.message);
      qc.invalidateQueries({ queryKey: ["rcount-log", orderId] });
      qc.invalidateQueries({ queryKey: ["invoices", orderId] });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); } finally { setBusy(false); }
  };

  const provider = providerForCurrency(currency);
  const issued = (invoices ?? []).find((invoice) => invoice.status === "issued");
  const lastError = (invoices ?? []).find((invoice) => invoice.status === "error");
  const rcountPending = (invoices ?? []).some((invoice) => invoice.provider === "rcount_co" && invoice.status === "pending");

  // «Emitir factura» pasa por R-Count (igual que el envío automático al pagar):
  // la emisión directa con Factus/eFactura quedó solo como respaldo interno.
  const issue = async () => {
    setBusy(true);
    try {
      const result = await resendFn({ data: { orderId } });
      result.ok ? toast.success(result.message) : toast.error(result.message);
      qc.invalidateQueries({ queryKey: ["invoices", orderId] });
      qc.invalidateQueries({ queryKey: ["rcount-log", orderId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No pudimos emitir la factura");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-5">
      <p className="text-sm font-medium text-ink">Facturación</p>
      {!issued && rcountPending && (
        <p className="mt-2 text-sm">En R-Count · pendiente DIAN</p>
      )}
      {b2b ? (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-moss/75">
            Las facturas se emiten automáticamente con <strong>{PROVIDER_LABEL[provider]}</strong> al despachar cada caja.
          </p>
          {(invoices ?? []).length === 0 ? (
            <p className="text-xs text-moss/60">Aún no hay facturas. Aparecerán aquí a medida que se despachen las cajas.</p>
          ) : (
            <ul className="space-y-2">
              {(invoices ?? []).map((inv) => {
                const box = (boxes ?? []).find((b) => b.id === (inv as any).box_id);
                const ok = inv.status === "issued" && inv.number;
                return (
                  <li key={inv.id} className="rounded-lg border border-ink/10 px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-ink">{box ? `Caja ${box.box_number}` : "Pedido completo"}</span>
                      <span className={ok ? "text-ink" : inv.status === "error" ? "text-red-600" : "text-moss/70"}>
                        {ok ? "Emitida" : inv.status === "error" ? "Error" : "Pendiente DIAN"}
                      </span>
                    </div>
                    {ok && <p className="mt-0.5 text-moss/70">Factura {inv.number}{inv.issued_at ? ` · ${new Date(inv.issued_at).toLocaleDateString("es-CO")}` : ""}</p>}
                    {inv.status === "error" && inv.error && <p className="mt-0.5 text-red-600">{inv.error}</p>}
                    {inv.pdf_url && <a className="mt-0.5 inline-block underline" href={inv.pdf_url} target="_blank" rel="noreferrer">Ver factura</a>}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : issued ? (
        <div className="mt-2 space-y-1 text-sm">
          <p className="font-medium">{issued.number ?? "Emitida"} · {issued.provider === "rcount_co" ? "Factus DIAN vía R-Count" : PROVIDER_LABEL[issued.provider as "factus" | "efactura_pa"]}</p>
          {issued.provider === "rcount_co" && issued.external_id && <p className="text-[11px] text-moss/60">Referencia Hub: {issued.external_id}</p>}
          {issued.cufe && <p className="text-xs break-all text-moss/75">CUFE/Folio: {issued.cufe}</p>}
          {issued.issued_at && <p className="text-xs text-moss/70">{new Date(issued.issued_at).toLocaleString("es-CO")}</p>}
          {issued.pdf_url && (
            <a className="inline-block text-xs underline" href={issued.pdf_url} target="_blank" rel="noreferrer">Ver factura</a>
          )}
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <p className="text-xs text-moss/75">
            Este pedido se facturará a través de <strong>R-Count</strong> ({currency?.toUpperCase() === "USD" ? "dólares" : "pesos"}).
          </p>
          {lastError?.error && <p className="text-xs text-red-600">{lastError.error}</p>}
          <Button size="sm" onClick={issue} disabled={busy}>
            {busy ? "Emitiendo…" : lastError ? "Reintentar factura" : "Emitir factura"}
          </Button>
        </div>
      )}
      <div className="mt-4 border-t border-ink/5 pt-3">
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-widest text-moss/70">R-Count Colombia</p>
          <button onClick={resend} disabled={busy} className="text-xs underline disabled:opacity-50">Reenviar a R-Count</button>
        </div>
        {(log ?? []).length === 0 ? <p className="text-xs text-moss/60 mt-1">Sin envíos todavía.</p> : (
          <ul className="mt-2 space-y-1">
            {(log ?? []).map((l) => (
              <li key={l.id} className="text-xs flex justify-between gap-2">
                <span>{l.trigger === "paid" ? "Pago" : l.trigger === "dispatch" ? "Despacho" : "Manual"} · {l.target === "direct" ? "Factura directa" : "R-Count"}</span>
                <span className={l.status === "sent" ? "text-ink" : "text-red-600"}>{l.status === "sent" ? "Enviado" : l.status === "skipped" ? "Sin emitir" : "Error"} · {new Date(l.created_at).toLocaleDateString("es-CO")}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
