import { useState } from "react";
import { Button } from "@/components/ui/button";

const input = "w-full px-2 py-1.5 rounded-md bg-white border border-ink/10 text-sm text-center focus:outline-none focus:border-ink/30";

const ROWS = [
  { key: "bust", label: "Busto" },
  { key: "waist", label: "Cintura alta" },
  { key: "low_waist", label: "Cintura baja" },
  { key: "hip", label: "Cadera" },
  { key: "length", label: "Largo" },
  { key: "inseam", label: "Entrepierna" },
] as const;
type Key = (typeof ROWS)[number]["key"];
type Grid = Record<string, Partial<Record<Key, string>>>;

const SIZES = ["XS", "S", "M", "L"];
const STANDARD: Grid = {
  XS: { bust: "88", waist: "68", low_waist: "70", hip: "92", length: "105", inseam: "80" },
  S: { bust: "92", waist: "72", low_waist: "74", hip: "96", length: "105", inseam: "80" },
  M: { bust: "96", waist: "76", low_waist: "78", hip: "100", length: "105", inseam: "80" },
  L: { bust: "100", waist: "80", low_waist: "82", hip: "104", length: "105", inseam: "80" },
};
const RANGE: Key[] = ["bust", "waist", "hip"];

function toGrid(chart: any): Grid {
  const grid: Grid = {};
  if (!Array.isArray(chart)) return grid;
  for (const row of chart) {
    if (!row?.size) continue;
    grid[row.size] = {};
    for (const { key } of ROWS) {
      const v = Array.isArray(row[key]) ? row[key][0] : row[key];
      if (v !== null && v !== undefined) grid[row.size][key] = String(v);
    }
  }
  return grid;
}

function toChart(grid: Grid) {
  return SIZES.filter((s) => grid[s] && Object.values(grid[s]).some((v) => v)).map((size) => {
    const row: Record<string, unknown> = { size };
    for (const { key } of ROWS) {
      const n = Number(grid[size]?.[key]);
      if (!grid[size]?.[key] || !Number.isFinite(n)) { row[key] = null; continue; }
      row[key] = RANGE.includes(key) ? [n, n] : n;
    }
    return row;
  });
}

/** Tabla de medidas estándar por tipo de prenda; al guardar se copia a la guía de tallas de sus productos. */
export function TypeSizeChart({ chart, onSave }: { chart: unknown; onSave: (chart: unknown[] | null) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [grid, setGrid] = useState<Grid>(() => toGrid(chart));
  const [busy, setBusy] = useState(false);
  const has = Array.isArray(chart) && chart.length > 0;
  const [active, setActive] = useState<Key[]>(() => {
    const g = toGrid(chart);
    const used = ROWS.map((r) => r.key).filter((k) => SIZES.some((sz) => g[sz]?.[k]));
    return used.length ? used : ROWS.map((r) => r.key);
  });
  const removeRow = (key: Key) => {
    setActive((a) => a.filter((k) => k !== key));
    setGrid((g) => Object.fromEntries(Object.entries(g).map(([sz, r]) => [sz, { ...r, [key]: "" }])));
  };
  const hidden = ROWS.filter((r) => !active.includes(r.key));
  const set = (size: string, key: Key, value: string) => setGrid((g) => ({ ...g, [size]: { ...g[size], [key]: value } }));

  return (
    <div className="mt-3 rounded-lg border border-ink/10">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm">
        <span>Tabla de medidas (cm) {has ? "· configurada" : "· sin configurar"}</span>
        <span className="text-moss/60">{open ? "Cerrar" : "Editar"}</span>
      </button>
      {open && (
        <div className="space-y-3 border-t border-ink/10 p-3">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead><tr><th className="py-1 text-left font-normal text-moss/70">Talla</th>{SIZES.map((s) => <th key={s} className="py-1 font-normal">{s}</th>)}<th /></tr></thead>
              <tbody>
                {ROWS.filter((row) => active.includes(row.key)).map((row) => (
                  <tr key={row.key}>
                    <td className="py-1 pr-2 text-moss/80">{row.label}</td>
                    {SIZES.map((s) => <td key={s} className="p-1"><input className={input} type="number" min="0" value={grid[s]?.[row.key] ?? ""} onChange={(e) => set(s, row.key, e.target.value)} /></td>)}
                    <td className="p-1"><button type="button" onClick={() => removeRow(row.key)} className="px-2 text-xs text-moss/60 hover:text-ink" aria-label={`Quitar ${row.label}`}>Quitar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hidden.length > 0 && <div className="flex flex-wrap items-center gap-2 text-xs text-moss/70">Añadir medida: {hidden.map((r) => <button key={r.key} type="button" onClick={() => setActive((a) => ROWS.map((x) => x.key).filter((k) => a.includes(k) || k === r.key))} className="rounded-full border border-ink/15 px-2 py-0.5 hover:border-ink/40">+ {r.label}</button>)}</div>}
          <p className="text-[11px] text-moss/60">Quita las medidas que este tipo no lleva (por ejemplo, cintura y cadera en un corset). Al guardar, se reemplaza la guía de tallas de todas las prendas de este tipo y el recomendador de talla usa solo las medidas que queden.</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setGrid(Object.fromEntries(SIZES.map((sz) => [sz, Object.fromEntries(active.map((k) => [k, STANDARD[sz][k]]))])))}>Usar tabla estándar Tu Marca</Button>
            <Button size="sm" disabled={busy} onClick={async () => { setBusy(true); try { const c = toChart(grid); await onSave(c.length ? c : null); } finally { setBusy(false); } }}>{busy ? "Guardando…" : "Guardar y aplicar a las prendas"}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
