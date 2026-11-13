import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCOP, formatUSD } from "@/lib/format";
import { fetchAll } from "@/lib/fetch-all";
import { indexBySku, buildPatch, parseSaleRows, patchWarning, type CurrentVariant, type VariantPatch } from "@/lib/sale-price-import";

type Line = { cur: CurrentVariant; patch: VariantPatch; warn: string | null; title: string };

export function SalePriceImportModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [lines, setLines] = useState<Line[] | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const onFile = async (file: File) => {
    setBusy(true);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer());
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: null });
      const rows = parseSaleRows(raw);
      if (!rows.length) throw new Error("No se encontró la columna SKU con datos.");
      const titles = new Map<string, string>();
      raw.forEach((r: any) => r.SKU && titles.set(String(r.SKU).toUpperCase().replace(/\s+/g, ""), String(r.Title ?? "")));
      const all = await fetchAll<any>((from, to) => supabase.from("product_variants")
        .select("id, sku, price_cop, compare_at_cop, price_usd, compare_at_usd")
        .not("sku", "is", null).order("id").range(from, to));
      const found = indexBySku(all as CurrentVariant[]);
      const out: Line[] = [];
      const miss: string[] = [];
      for (const r of rows) {
        const cur = found.get(r.sku);
        if (!cur) { miss.push(r.sku); continue; }
        const patch = buildPatch(r, cur);
        out.push({ cur, patch, warn: patchWarning(patch, cur), title: titles.get(r.sku) ?? "" });
      }
      setLines(out); setMissing(miss);
    } catch (e: any) {
      toast.error(e.message ?? "No se pudo leer el Excel");
    } finally { setBusy(false); }
  };

  const apply = async () => {
    if (!lines) return;
    setBusy(true); setProgress(0);
    let ok = 0;
    try {
      for (let i = 0; i < lines.length; i += 10) {
        const chunk = lines.slice(i, i + 10).filter((l) => Object.keys(l.patch).length);
        const res = await Promise.all(chunk.map((l) => supabase.from("product_variants").update(l.patch as any).eq("id", l.cur.id)));
        const err = res.find((r) => r.error)?.error;
        if (err) throw err;
        ok += chunk.length; setProgress(ok);
      }
      toast.success(`${ok} tallas actualizadas`);
      onSaved();
    } catch (e: any) {
      toast.error(`Se actualizaron ${ok}. Error: ${e.message ?? "desconocido"}`);
    } finally { setBusy(false); }
  };

  const cell = (before: number | null, after: number | undefined, f: (n: number) => string) =>
    after === undefined || after === before ? <span className="text-ink/50">{before ? f(before) : "—"}</span>
      : <span><span className="text-ink/40 line-through">{before ? f(before) : "—"}</span> → <b>{f(after)}</b></span>;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/45 p-4" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-ink/10 px-6 py-5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-moss/70">Precios desde Excel</p>
            <h2 className="mt-1 font-serif italic text-2xl">Subir precios del Sale</h2>
            <p className="mt-1 text-xs text-moss">Columnas: SKU, PRECIO CO, COMPARACION CO, PRECIO USD, COMPARACION US. Pesos en miles (200 = $200.000). Si COMPARACION US está vacía se usa el precio US$ actual.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-ink/5" aria-label="Cerrar"><X className="h-4 w-4" /></button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {!lines ? (
            <label className="flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-ink/20 p-10 text-sm text-moss hover:bg-cream/40">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Elegir archivo Excel"}
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" disabled={busy} onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
            </label>
          ) : (
            <>
              <p className="mb-3 text-sm">{lines.length} tallas encontradas{missing.length ? ` · ${missing.length} SKU no encontrados` : ""}{lines.some((l) => l.warn) ? ` · ${lines.filter((l) => l.warn).length} con aviso` : ""}</p>
              {missing.length > 0 && <p className="mb-3 rounded-xl bg-clay/10 p-3 text-xs text-clay">No encontrados: {missing.join(", ")}</p>}
              <table className="w-full text-xs">
                <thead className="text-[10px] uppercase tracking-widest text-moss/70">
                  <tr><th className="py-2 text-left">Prenda / SKU</th><th className="text-left">Precio COP</th><th className="text-left">Comparación COP</th><th className="text-left">Precio US$</th><th className="text-left">Comparación US$</th></tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.cur.id} className="border-t border-ink/5 align-top">
                      <td className="py-1.5 pr-2">{l.title}<div className="font-mono text-[10px] text-ink/50">{l.cur.sku}</div>{l.warn && <div className="text-[10px] text-clay">{l.warn}</div>}</td>
                      <td>{cell(l.cur.price_cop, l.patch.price_cop, formatCOP)}</td>
                      <td>{cell(l.cur.compare_at_cop, l.patch.compare_at_cop, formatCOP)}</td>
                      <td>{cell(l.cur.price_usd, l.patch.price_usd, (n) => formatUSD(n))}</td>
                      <td>{cell(l.cur.compare_at_usd, l.patch.compare_at_usd, (n) => formatUSD(n))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
        {lines && (
          <footer className="flex items-center justify-end gap-3 border-t border-ink/10 px-6 py-4">
            {busy && <span className="text-xs text-moss">{progress}/{lines.length}</span>}
            <button type="button" onClick={() => { setLines(null); setMissing([]); }} disabled={busy} className="rounded-full border border-ink/15 px-4 py-2 text-sm">Otro archivo</button>
            <button type="button" onClick={apply} disabled={busy || !lines.length} className="rounded-full bg-ink px-5 py-2 text-sm text-ivory disabled:opacity-50">Aplicar precios</button>
          </footer>
        )}
      </div>
    </div>
  );
}
