import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatUSD } from "@/lib/format";
import { useState } from "react";

import { toast } from "sonner";
import { listOrphanPayments, recoverOrphanPayment } from "@/lib/payments.functions";

/** Aviso de cobros confirmados por la pasarela que no generaron pedido. */
export function OrphanPaymentsBanner({ showEmpty = false }: { showEmpty?: boolean }) {
  const list = useServerFn(listOrphanPayments);
  const recover = useServerFn(recoverOrphanPayment);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const { data = [] } = useQuery({ queryKey: ["orphan-payments"], queryFn: () => list(), refetchInterval: 120_000 });
  if (!data.length) return showEmpty ? <p className="text-sm text-moss">No hay cobros pendientes sin pedido.</p> : null;
  return (
    <div className="mb-6 border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p className="font-medium text-destructive">Cobros recibidos sin pedido ({data.length})</p>
      <p className="mt-1 text-xs text-moss">La pasarela confirmó el pago pero la tienda no creó el pedido.</p>
      <ul className="mt-3 space-y-2">
        {data.map((p) => (
          <li key={p.reference} className="flex flex-wrap items-center justify-between gap-2 border-t border-ink/10 pt-2">
            <span>
              {p.provider.toUpperCase()} · {p.currency === "USD" ? formatUSD(p.amount) : `$${p.amount.toLocaleString("es-CO")}`} · {p.name || "Sin nombre"} {p.email && `· ${p.email}`}
              <span className="ml-2 text-xs text-moss">{new Date(p.at).toLocaleString("es-CO")} · ref {p.reference.slice(0, 8)}</span>
            </span>
            {p.hasDraft ? (
              <button
                disabled={busy === p.reference}
                className="border border-ink/20 px-3 py-1 text-[11px] uppercase tracking-widest hover:border-ink disabled:opacity-50"
                onClick={async () => {
                  setBusy(p.reference);
                  try {
                    const order = await recover({ data: { reference: p.reference } });
                    toast.success(`Pedido ${order.number} creado`);
                    qc.invalidateQueries();
                  } catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo crear el pedido."); }
                  setBusy(null);
                }}
              >Crear pedido</button>
            ) : <span className="text-xs text-moss">Sin carrito guardado: crear como pedido manual</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
