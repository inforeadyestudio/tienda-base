/** Analiza un Excel de inventario antes de cargarlo y explica qué entra y qué no. */
export type ImportVariant = {
  id: string;
  sku: string;
  levels: { location_id: string; on_hand: number; reserved: number }[];
};
export type ImportLocation = { id: string; name: string };

export type ImportLine = {
  row: number;
  sku: string;
  variantId: string;
  locationId: string;
  locationName: string;
  current: number;
  target: number;
  delta: number;
};
export type SkippedLine = { row: number; sku: string; location?: string; value?: string; reason: string };

export type ImportPlan = {
  stockColumns: string[];
  ignoredColumns: string[];
  lines: ImportLine[];
  unchanged: number;
  skipped: SkippedLine[];
  fileUnits: number;
  targetUnits: number;
  priceRows: number;
};

const norm = (s: unknown) => String(s ?? "").trim().replace(/\s+/g, "").toUpperCase();
const KNOWN = ["sku", "producto", "referencia", "color", "talla", "calidad", "precio cop", "precio usd", "costo cop"];

export function analyzeInventoryRows(
  rowsIn: unknown[][],
  variants: ImportVariant[],
  locationsIn: ImportLocation[],
  /** Bodega elegida: solo se carga en ella, desde «Stock», «Cantidad» o «Stock <bodega>». */
  target?: ImportLocation,
): ImportPlan {
  const locations = target ? [target] : locationsIn;
  const header = (rowsIn[0] ?? []).map((h) => String(h ?? "").trim());
  const skuIdx = header.findIndex((h) => h.toLowerCase() === "sku");
  if (skuIdx < 0) throw new Error("El archivo debe tener una columna SKU");

  const stockCols: { i: number; loc: ImportLocation }[] = [];
  const ignoredColumns: string[] = [];
  const GENERIC = ["stock", "cantidad", "unidades"];
  header.forEach((h, i) => {
    const lower = h.toLowerCase();
    // Con bodega elegida, cualquier columna de cantidad («Stock», «Stock <lo que sea>», «Cantidad») se carga en ella.
    const loc = target
      ? (GENERIC.includes(lower) || lower.startsWith("stock ") ? target : undefined)
      : locations.find((l) => lower === `stock ${l.name.toLowerCase()}`);
    if (loc && (!target || !stockCols.length)) stockCols.push({ i, loc });
    else if (loc) ignoredColumns.push(`${h} (ya se lee otra columna de cantidad)`);
    else if (!KNOWN.includes(lower)) ignoredColumns.push(h || `Columna ${i + 1} sin nombre`);
  });
  const priceCols = ["precio cop", "precio usd", "costo cop"].map((n) => header.findIndex((h) => h.toLowerCase() === n));

  const bySku = new Map<string, ImportVariant>();
  variants.forEach((v) => bySku.set(norm(v.sku), v));

  const lines: ImportLine[] = [];
  const skipped: SkippedLine[] = [];
  const seen = new Map<string, number>();
  let unchanged = 0, fileUnits = 0, targetUnits = 0, priceRows = 0;

  rowsIn.slice(1).forEach((r, idx) => {
    const row = idx + 2;
    const rawSku = String(r[skuIdx] ?? "").trim();
    const hasData = stockCols.some((c) => r[c.i] !== undefined && r[c.i] !== "");
    if (!rawSku) {
      if (hasData) skipped.push({ row, sku: "—", reason: "Fila sin SKU" });
      return;
    }
    for (const c of stockCols) {
      const n = Number(r[c.i]);
      if (r[c.i] !== undefined && r[c.i] !== "" && Number.isFinite(n) && n > 0) fileUnits += n;
    }
    const key = norm(rawSku);
    if (seen.has(key)) {
      skipped.push({ row, sku: rawSku, reason: `SKU repetido (ya está en la fila ${seen.get(key)}); se usa solo la primera` });
      return;
    }
    seen.set(key, row);
    const variant = bySku.get(key);
    if (!variant) {
      skipped.push({ row, sku: rawSku, reason: "El SKU no existe en el catálogo" });
      return;
    }
    if (priceCols.some((i) => i >= 0 && r[i] !== undefined && r[i] !== "")) priceRows++;
    for (const c of stockCols) {
      const val = r[c.i];
      if (val === undefined || val === null || String(val).trim() === "") {
        skipped.push({ row, sku: variant.sku, location: c.loc.name, reason: "Cantidad vacía: se deja como está" });
        continue;
      }
      const n = Number(val);
      if (!Number.isFinite(n)) {
        skipped.push({ row, sku: variant.sku, location: c.loc.name, value: String(val), reason: "La cantidad no es un número" });
        continue;
      }
      if (n < 0 || !Number.isInteger(n)) {
        skipped.push({ row, sku: variant.sku, location: c.loc.name, value: String(val), reason: n < 0 ? "Cantidad negativa" : "Cantidad con decimales" });
        continue;
      }
      const lvl = variant.levels.find((l) => l.location_id === c.loc.id);
      const current = lvl?.on_hand ?? 0;
      const reserved = lvl?.reserved ?? 0;
      if (n < reserved) {
        skipped.push({ row, sku: variant.sku, location: c.loc.name, value: String(n), reason: `Hay ${reserved} apartada(s) para pedidos; no se puede bajar a ${n}` });
        targetUnits += current;
        continue;
      }
      targetUnits += n;
      if (n === current) { unchanged++; continue; }
      lines.push({ row, sku: variant.sku, variantId: variant.id, locationId: c.loc.id, locationName: c.loc.name, current, target: n, delta: n - current });
    }
  });

  return { stockColumns: stockCols.map((c) => header[c.i]), ignoredColumns, lines, unchanged, skipped, fileUnits, targetUnits, priceRows };
}
