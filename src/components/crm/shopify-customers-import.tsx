import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { X, Upload, Download } from "lucide-react";
import { toast } from "sonner";
import { importShopifyCustomers, type ShopifyCustomerRow } from "@/lib/admin/shopify-customers.functions";

const clean = (v: unknown) => {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim().replace(/^'/, "");
  return s || undefined;
};

function parseRows(raw: Record<string, unknown>[]): ShopifyCustomerRow[] {
  return raw
    .map((r) => ({
      shopifyId: clean(r["Customer ID"]) ?? "",
      firstName: clean(r["First Name"]),
      lastName: clean(r["Last Name"]),
      email: clean(r["Email"])?.toLowerCase(),
      phone: clean(r["Phone"]) ?? clean(r["Default Address Phone"]),
      company: clean(r["Default Address Company"]),
      address1: clean(r["Default Address Address1"]),
      address2: clean(r["Default Address Address2"]),
      city: clean(r["Default Address City"]),
      provinceCode: clean(r["Default Address Province Code"]),
      countryCode: clean(r["Default Address Country Code"]),
      zip: clean(r["Default Address Zip"]),
      totalSpent: Number(clean(r["Total Spent"]) ?? 0) || 0,
      ordersCount: Number(clean(r["Total Orders"]) ?? 0) || 0,
      tags: clean(r["Tags"]),
      note: clean(r["Note"]),
      acceptsEmailMarketing: clean(r["Accepts Email Marketing"]) === "yes",
    }))
    .filter((r) => r.shopifyId);
}

function downloadCsv(name: string, rows: Record<string, unknown>[]) {
  const ws = XLSX.utils.json_to_sheet(rows);
  const blob = new Blob([XLSX.utils.sheet_to_csv(ws)], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}

export function ShopifyCustomersImport({ onClose }: { onClose: () => void }) {
  const run = useServerFn(importShopifyCustomers);
  const qc = useQueryClient();
  const [rows, setRows] = useState<ShopifyCustomerRow[]>([]);
  const [mode, setMode] = useState<"random" | "temp">("random");
  const [temp, setTemp] = useState("Cambiar2027%");
  const [done, setDone] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ created: number; existing: number; noEmail: number; errors: any[] } | null>(null);

  const onFile = async (f: File) => {
    const wb = XLSX.read(await f.arrayBuffer(), { type: "array", raw: true });
    const data = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: false });
    setRows(parseRows(data));
    setResult(null);
    setDone(0);
  };

  const start = async () => {
    setRunning(true);
    const acc = { created: 0, existing: 0, noEmail: 0, errors: [] as any[] };
    const size = 50;
    for (let i = 0; i < rows.length; i += size) {
      try {
        const r = await run({ data: { rows: rows.slice(i, i + size), passwordMode: mode, tempPassword: mode === "temp" ? temp : undefined } });
        acc.created += r.created; acc.existing += r.existing; acc.noEmail += r.noEmail; acc.errors.push(...r.errors);
      } catch (e) {
        acc.errors.push(...rows.slice(i, i + size).map((x) => ({ shopifyId: x.shopifyId, email: x.email, error: e instanceof Error ? e.message : "Error" })));
      }
      setDone(Math.min(i + size, rows.length));
    }
    setResult(acc);
    setRunning(false);
    qc.invalidateQueries({ queryKey: ["crm-shopify"] });
    qc.invalidateQueries({ queryKey: ["crm-profiles"] });
    qc.invalidateQueries({ queryKey: ["crm-emails"] });
    toast.success(`Importación terminada: ${acc.created} cuentas nuevas`);
  };

  const withEmail = rows.filter((r) => r.email).length;
  const marketing = rows.filter((r) => r.email && r.acceptsEmailMarketing);

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4" onClick={() => !running && onClose()}>
      <div className="bg-ivory rounded-3xl w-full max-w-lg p-7 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-moss/70">Shopify</p>
            <h2 className="text-2xl mt-1">Importar clientes</h2>
          </div>
          <button onClick={onClose} disabled={running} aria-label="Cerrar"><X className="size-5" /></button>
        </div>

        <label className="flex flex-col items-center gap-2 border border-dashed border-ink/25 rounded-2xl p-6 cursor-pointer text-sm text-ink/70 hover:border-ink/50">
          <Upload className="size-5" />
          {rows.length ? `${rows.length} clientes leídos` : "Sube el CSV exportado de Shopify"}
          <input type="file" accept=".csv,.xlsx" className="hidden" disabled={running} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>

        {rows.length > 0 && (
          <>
            <ul className="text-sm mt-4 space-y-1 text-ink/75">
              <li>- {withEmail} con correo: se les crea cuenta (o se vinculan si ya existen)</li>
              <li>- {rows.length - withEmail} sin correo: quedan como clientes sin cuenta</li>
              <li>- {marketing.length} aceptaron marketing por correo</li>
            </ul>

            <div className="mt-5 space-y-2 text-sm">
              <p className="text-[10px] uppercase tracking-widest text-moss/70">Contraseña de las cuentas</p>
              <label className="flex gap-2 items-start">
                <input type="radio" checked={mode === "random"} onChange={() => setMode("random")} className="mt-1" />
                <span>Sin clave conocida (recomendado). Cada cliente crea la suya con «¿Olvidaste tu contraseña?».</span>
              </label>
              <label className="flex gap-2 items-start">
                <input type="radio" checked={mode === "temp"} onChange={() => setMode("temp")} className="mt-1" />
                <span>Clave temporal para todos; se les pide cambiarla al entrar.</span>
              </label>
              {mode === "temp" && (
                <input value={temp} onChange={(e) => setTemp(e.target.value)} className="w-full bg-white border border-ink/15 rounded-full px-4 py-2" />
              )}
            </div>

            {(running || done > 0) && (
              <div className="mt-5">
                <div className="h-2 bg-ink/10 rounded-full overflow-hidden">
                  <div className="h-full bg-moss transition-all" style={{ width: `${(done / rows.length) * 100}%` }} />
                </div>
                <p className="text-xs text-ink/60 mt-1">{done} / {rows.length}</p>
              </div>
            )}

            {result ? (
              <div className="mt-5 text-sm space-y-1">
                <p>- Cuentas nuevas: {result.created}</p>
                <p>- Ya existían (vinculadas): {result.existing}</p>
                <p>- Sin correo: {result.noEmail}</p>
                <p>- Errores: {result.errors.length}</p>
                <div className="flex flex-wrap gap-2 pt-3">
                  {result.errors.length > 0 && (
                    <button onClick={() => downloadCsv("errores-importacion.csv", result.errors)} className="inline-flex items-center gap-1 rounded-full border border-ink/20 px-4 py-1.5 text-xs">
                      <Download className="size-3.5" /> Errores
                    </button>
                  )}
                  <button onClick={() => downloadCsv("invitacion-marketing.csv", marketing.map((r) => ({ email: r.email, nombre: r.firstName ?? "", apellido: r.lastName ?? "" })))} className="inline-flex items-center gap-1 rounded-full border border-ink/20 px-4 py-1.5 text-xs">
                    <Download className="size-3.5" /> Lista invitación (aceptan marketing)
                  </button>
                  <button onClick={() => downloadCsv("invitacion-todos.csv", rows.filter((r) => r.email).map((r) => ({ email: r.email, nombre: r.firstName ?? "", apellido: r.lastName ?? "" })))} className="inline-flex items-center gap-1 rounded-full border border-ink/20 px-4 py-1.5 text-xs">
                    <Download className="size-3.5" /> Lista invitación (todos)
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={start} disabled={running} className="mt-6 w-full rounded-full bg-ink text-ivory py-3 text-xs uppercase tracking-widest disabled:opacity-50">
                {running ? "Importando…" : `Importar ${rows.length} clientes`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
