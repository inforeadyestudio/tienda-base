// Diseño (editable desde Claude). Datos y acciones llegan en `vm`; no calcules precios ni stock aquí.
import { RefreshCcw, Printer } from "lucide-react";
import { formatCOP, formatDate } from "@/lib/format";
import { PageHeader, EmptyState } from "@/components/cuenta/ui";
import { ReturnWizard } from "@/components/cuenta/return-wizard";
import { type ReturnsPageVM } from "@/logic/account/use-returns-page";
const STATUS_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  en_revision: "En revisión",
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  cambiado: "Cambiado",
  reembolsado: "Devolución de dinero",
  completado: "Completado",
};

export function ReturnsView({ vm }: { vm: ReturnsPageVM }) {
  const { open, setOpen, rows, isLoading, onPrint } = vm;
  return (
    <>
      <PageHeader title="Cambios y devoluciones" subtitle="Solicita un cambio o la devolución de tu dinero en pocos pasos." />

      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full bg-ink text-ivory px-6 py-3 text-[10px] uppercase tracking-[0.25em]"
      >
        <RefreshCcw className="w-3.5 h-3.5" strokeWidth={1.5} /> Nueva solicitud
      </button>

      <div className="mt-6">
        {isLoading ? (
          <p className="text-xs text-moss/70">Cargando solicitudes…</p>
        ) : (rows?.length ?? 0) === 0 ? (
          <EmptyState title="Sin solicitudes" description="Cuando pidas un cambio o una devolución vas a poder seguir su estado aquí." />
        ) : (
          <ul className="space-y-3">
            {rows!.map((r) => (
              <li key={r.id} className="flex items-center gap-4 rounded-2xl border border-ink/5 bg-white/60 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium capitalize">
                    {r.kind === "cambio" ? "Cambio" : "Devolución"} · Pedido {(r.orders as { number: string } | null)?.number ?? "—"}
                  </p>
                  <p className="text-[11px] text-moss/70 truncate">{r.reason} · {formatDate(r.created_at)}</p>
                </div>
                <div className="text-right">
                  {r.refund_cop > 0 && <p className="text-sm">{formatCOP(r.refund_cop)}</p>}
                  <p className="text-[10px] uppercase tracking-[0.2em] text-moss">{STATUS_LABEL[r.status] ?? r.status}</p>
                  {r.desired && <p className="text-[11px] text-moss/70 mt-0.5">Quiere: {r.desired}</p>}
                </div>
                <button
                  onClick={() => onPrint(r as unknown as Record<string, unknown>)}
                  className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-moss hover:border-ink"
                >
                  <Printer className="w-3.5 h-3.5" strokeWidth={1.5} /> Guía
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {open && <ReturnWizard onClose={() => setOpen(false)} />}
    </>
  );
}
