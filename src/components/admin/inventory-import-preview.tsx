import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X, Download } from "lucide-react";
import * as XLSX from "xlsx";
import type { ImportPlan } from "@/lib/admin/inventory-import";

export function InventoryImportPreview({
  plan, fileName, locationName, running, progress, onConfirm, onClose,
}: {
  plan: ImportPlan;
  fileName: string;
  locationName: string;
  running: boolean;
  progress: { done: number; total: number; errors: { sku: string; message: string }[] } | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"in" | "out">(plan.skipped.some((s) => !s.reason.startsWith("Cantidad vacía")) ? "out" : "in");
  const reasons = useMemo(() => {
    const m = new Map<string, number>();
    plan.skipped.forEach((s) => {
      const k = s.reason.startsWith("Hay ") ? "Por debajo de lo apartado para pedidos" : s.reason.startsWith("SKU repetido") ? "SKU repetido" : s.reason;
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [plan]);
  const up = plan.lines.reduce((s, l) => s + Math.max(0, l.delta), 0);
  const down = plan.lines.reduce((s, l) => s + Math.min(0, l.delta), 0);

  const downloadSkipped = () => {
    const ws = XLSX.utils.aoa_to_sheet([["Fila", "SKU", "Bodega", "Valor", "Motivo"], ...plan.skipped.map((s) => [s.row, s.sku, s.location ?? "", s.value ?? "", s.reason])]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "No se cargan");
    XLSX.writeFile(wb, "filas-que-no-se-cargan.xlsx");
  };

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 p-4" onClick={running ? undefined : onClose}>
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-ivory shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between border-b border-ink/10 px-6 py-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-moss/70">Revisión antes de cargar</p>
            <h2 className="font-serif text-2xl text-ink">{fileName}</h2>
            <p className="mt-1 text-sm text-ink">Bodega que se actualiza: <strong>{locationName}</strong></p>
            <p className="text-xs text-ink/60">Columna que se lee: {plan.stockColumns.join(", ") || "ninguna"}</p>
          </div>
          {!running && <button onClick={onClose} aria-label="Cerrar"><X className="h-5 w-5" /></button>}
        </div>

        <div className="grid grid-cols-2 gap-3 px-6 py-4 md:grid-cols-4">
          <Stat label="Unidades en el Excel" value={plan.fileUnits} />
          <Stat label="Quedarán en el sistema" value={plan.targetUnits} />
          <Stat label="Tallas que cambian" value={plan.lines.length} hint={`+${up} / ${down}`} />
          <Stat label="No se cargan" value={plan.skipped.length} tone={plan.skipped.length ? "warn" : undefined} />
        </div>

        {plan.ignoredColumns.length > 0 && (
          <p className="mx-6 mb-3 rounded-2xl bg-ink/5 px-4 py-2 text-xs text-ink/70">
            Columnas que no se leen porque no coinciden con «Stock + nombre de bodega»: {plan.ignoredColumns.join(", ")}
          </p>
        )}
        {reasons.length > 0 && (
          <ul className="mx-6 mb-3 space-y-1 text-xs text-ink/75">
            {reasons.map(([r, n]) => <li key={r}>- {r}: <b>{n}</b></li>)}
          </ul>
        )}
        <p className="mx-6 mb-3 text-xs text-ink/55">{plan.unchanged} tallas ya tienen la misma cantidad y no se tocan. Cada cambio queda en el kardex como «Ajuste».</p>

        <div className="flex gap-2 px-6">
          <button onClick={() => setTab("in")} className={`rounded-full px-4 py-1.5 text-xs ${tab === "in" ? "bg-ink text-ivory" : "border border-ink/15"}`}>Se cargan ({plan.lines.length})</button>
          <button onClick={() => setTab("out")} className={`rounded-full px-4 py-1.5 text-xs ${tab === "out" ? "bg-ink text-ivory" : "border border-ink/15"}`}>No se cargan ({plan.skipped.length})</button>
          {tab === "out" && plan.skipped.length > 0 && (
            <button onClick={downloadSkipped} className="ml-auto inline-flex items-center gap-1 text-xs text-moss underline"><Download className="h-3.5 w-3.5" /> Descargar lista</button>
          )}
        </div>

        <div className="m-6 mt-3 min-h-0 flex-1 overflow-auto rounded-2xl border border-ink/10 bg-white">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white">
              {tab === "in" ? (
                <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-ink/45"><th className="px-3 py-2">Fila</th><th className="px-3">SKU</th><th className="px-3">Bodega</th><th className="px-3 text-right">Hoy</th><th className="px-3 text-right">Queda</th><th className="px-3 text-right">Cambio</th></tr>
              ) : (
                <tr className="text-left text-[10px] uppercase tracking-[0.12em] text-ink/45"><th className="px-3 py-2">Fila</th><th className="px-3">SKU</th><th className="px-3">Bodega</th><th className="px-3">Valor</th><th className="px-3">Motivo</th></tr>
              )}
            </thead>
            <tbody>
              {tab === "in"
                ? plan.lines.map((l) => (
                    <tr key={`${l.row}-${l.locationId}`} className="border-t border-ink/5">
                      <td className="px-3 py-1.5 text-ink/50">{l.row}</td><td className="px-3 font-mono">{l.sku}</td><td className="px-3">{l.locationName}</td>
                      <td className="px-3 text-right">{l.current}</td><td className="px-3 text-right">{l.target}</td>
                      <td className={`px-3 text-right ${l.delta > 0 ? "text-moss" : "text-destructive"}`}>{l.delta > 0 ? `+${l.delta}` : l.delta}</td>
                    </tr>
                  ))
                : plan.skipped.map((s, i) => (
                    <tr key={i} className="border-t border-ink/5">
                      <td className="px-3 py-1.5 text-ink/50">{s.row}</td><td className="px-3 font-mono">{s.sku}</td><td className="px-3">{s.location ?? "—"}</td><td className="px-3">{s.value ?? ""}</td><td className="px-3">{s.reason}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-ink/10 px-6 py-4">
          <p className="text-xs text-ink/60">
            {progress ? `Cargando ${progress.done} de ${progress.total}…${progress.errors.length ? ` · ${progress.errors.length} con error` : ""}` : "No cierres esta ventana mientras carga."}
          </p>
          <div className="flex gap-2">
            {!running && <button onClick={onClose} className="rounded-full border border-ink/15 px-5 py-2 text-sm">Cancelar</button>}
            <button disabled={running || (plan.lines.length === 0 && plan.priceRows === 0)} onClick={onConfirm} className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2 text-sm text-ivory disabled:opacity-50">
              {running && <Loader2 className="h-4 w-4 animate-spin" />} Cargar {plan.lines.length} cambios en {locationName}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: "warn" }) {
  return (
    <div className={`rounded-2xl border px-4 py-3 ${tone === "warn" ? "border-destructive/30 bg-destructive/5" : "border-ink/10 bg-white"}`}>
      <div className="text-[10px] uppercase tracking-[0.12em] text-ink/50">{label}</div>
      <div className="font-serif text-2xl text-ink">{value.toLocaleString("es-CO")}</div>
      {hint && <div className="text-[11px] text-ink/50">{hint}</div>}
    </div>
  );
}
