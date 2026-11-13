import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { FileText } from "lucide-react";
import { getReconciledOrderInvoices } from "@/lib/rcount.functions";

type Inv = { order_id: string; status: string; number: string | null; pdf_url: string | null };

/** Última factura por pedido (número DIAN devuelto por Factus + PDF). */
export function useOrderInvoices(orderIds: string[]) {
  const ids = [...new Set(orderIds)].sort();
  const getInvoices = useServerFn(getReconciledOrderInvoices);
  return useQuery({
    queryKey: ["order-invoices", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const map = new Map<string, Inv>();
      for (let i = 0; i < ids.length; i += 200) {
        const data = await getInvoices({ data: { orderIds: ids.slice(i, i + 200) } });
        for (const r of data as Inv[]) {
          const cur = map.get(r.order_id);
          if (!cur || (cur.status !== "issued" && r.status === "issued")) map.set(r.order_id, r);
        }
      }
      return map;
    },
  });
}

export function InvoiceCell({ inv }: { inv?: Inv }) {
  if (!inv) return <span className="text-moss/40">—</span>;
  if (inv.status !== "issued" || !inv.number)
    return <span className="text-[11px] text-moss/60">{inv.status === "error" ? "Error" : "Pendiente DIAN"}</span>;
  return inv.pdf_url ? (
    <a href={inv.pdf_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 font-mono text-xs text-ink underline decoration-ink/20 hover:decoration-ink">
      <FileText className="size-3.5" /> {inv.number}
    </a>
  ) : (
    <span className="font-mono text-xs">{inv.number}</span>
  );
}
