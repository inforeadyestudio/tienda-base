import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileUp, Loader2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  importShopifyProducts,
  type ShopifyImportProduct,
  type ShopifyImportResult,
} from "@/lib/shopify-import.functions";

type CsvRow = Record<string, string>;
type Preview = { products: ShopifyImportProduct[]; errors: string[]; rows: number; imageCount: number };

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell); cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(cell); cell = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
    } else cell += char;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const clean = (value: string | undefined) => value?.trim() ?? "";
const nullable = (value: string | undefined) => clean(value) || null;
const numberOrNull = (value: string | undefined) => {
  const raw = clean(value).replace(/[$\s]/g, "").replace(/,/g, "");
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const positiveOrNull = (value: string | undefined) => {
  const parsed = numberOrNull(value);
  return parsed && parsed > 0 ? parsed : null;
};
const truthy = (value: string | undefined) => ["true", "1", "yes", "si", "sí"].includes(clean(value).toLowerCase());

function optionValue(row: CsvRow, names: string[]) {
  for (let i = 1; i <= 3; i += 1) {
    if (names.includes(clean(row[`Option${i} Name`]).toLowerCase())) return nullable(row[`Option${i} Value`]);
  }
  return null;
}

function buildPreview(text: string): Preview {
  const matrix = parseCsv(text.replace(/^\uFEFF/, ""));
  const headers = matrix[0]?.map((header) => header.trim()) ?? [];
  if (!headers.includes("Handle") || !headers.includes("Variant SKU")) {
    return { products: [], errors: ["El archivo no tiene las columnas Handle y Variant SKU de Shopify."], rows: 0, imageCount: 0 };
  }
  const sourceRows = matrix.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
  const groups = new Map<string, CsvRow[]>();
  sourceRows.forEach((row) => {
    const handle = clean(row.Handle);
    if (!handle) return;
    groups.set(handle, [...(groups.get(handle) ?? []), row]);
  });

  const errors: string[] = [];
  const globalSkus = new Map<string, string>();
  const products: ShopifyImportProduct[] = [];
  groups.forEach((rows, handle) => {
    const primary = rows.find((row) => clean(row.Title)) ?? rows[0];
    if (!primary) return;
    const title = clean(primary.Title);
    if (!title) { errors.push(`${handle}: falta el nombre del producto.`); return; }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle)) { errors.push(`${handle}: Handle inválido.`); return; }

    const variants: ShopifyImportProduct["variants"] = [];
    const localSkus = new Set<string>();
    rows.forEach((row, index) => {
      const sku = clean(row["Variant SKU"]);
      const hasVariant = sku || clean(row["Option1 Value"]) || clean(row["Variant Price"]);
      if (!hasVariant) return;
      if (!sku) { errors.push(`${handle}, fila ${index + 2}: falta Variant SKU; no se importará esa variante.`); return; }
      if (localSkus.has(sku)) return;
      const otherHandle = globalSkus.get(sku);
      if (otherHandle && otherHandle !== handle) {
        errors.push(`${handle}: el SKU ${sku} también aparece en ${otherHandle}; se omitirá aquí.`);
        return;
      }
      localSkus.add(sku);
      globalSkus.set(sku, handle);
      variants.push({
        sku,
        size: optionValue(row, ["talla", "size"]),
        color: optionValue(row, ["color", "colour"]) ?? nullable(row["Color (product.metafields.shopify.color-pattern)"]),
        priceCop: positiveOrNull(row["Price / Colombia"]) ?? positiveOrNull(row["Variant Price"]) ?? 0,
        compareAtCop: positiveOrNull(row["Compare At Price / Colombia"]) ?? positiveOrNull(row["Variant Compare At Price"]),
        costCop: numberOrNull(row["Cost per item"]),
        barcode: nullable(row["Variant Barcodes"]),
        weightGrams: numberOrNull(row["Variant Grams"]),
        active: clean(row.Status || primary.Status).toLowerCase() !== "archived",
      });
    });
    if (!variants.length) { errors.push(`${handle}: no tiene variantes con SKU; se omitirá.`); return; }

    const imageMap = new Map<string, { url: string; alt: string | null; position: number }>();
    rows.forEach((row) => {
      [clean(row["Image Src"]), clean(row["Variant Image"])].filter(Boolean).forEach((url) => {
        if (!/^https?:\/\//i.test(url) || imageMap.has(url)) return;
        imageMap.set(url, {
          url,
          alt: nullable(row["Image Alt Text"]),
          position: Math.max(0, Math.round(numberOrNull(row["Image Position"]) ?? imageMap.size)),
        });
      });
    });
    const rawStatus = clean(primary.Status).toLowerCase();
    products.push({
      handle,
      title,
      description: nullable(primary["Body (HTML)"]),
      productType: nullable(primary.Type) ?? nullable(primary["Product Category"]),
      tags: clean(primary.Tags).split(",").map((tag) => tag.trim()).filter(Boolean),
      status: rawStatus === "active" ? "published" : rawStatus === "archived" ? "archived" : "draft",
      availableNational: rows.some((row) => truthy(row["Included / Colombia"])),
      images: [...imageMap.values()].sort((a, b) => a.position - b.position),
      variants,
    });
  });
  return { products, errors, rows: sourceRows.length, imageCount: products.reduce((sum, product) => sum + product.images.length, 0) };
}

function addResults(target: ShopifyImportResult, next: ShopifyImportResult) {
  target.created += next.created;
  target.updated += next.updated;
  target.variantsCreated += next.variantsCreated;
  target.variantsUpdated += next.variantsUpdated;
  target.imagesCreated += next.imagesCreated;
  target.skipped.push(...next.skipped);
}

export function ShopifyImportModal({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const importProducts = useServerFn(importShopifyProducts);
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ShopifyImportResult | null>(null);
  const variantCount = useMemo(() => preview?.products.reduce((sum, product) => sum + product.variants.length, 0) ?? 0, [preview]);

  const chooseFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) { toast.error("Selecciona el CSV exportado de Shopify."); return; }
    setFileName(file.name);
    setResult(null);
    setPreview(buildPreview(await file.text()));
  };

  const runImport = async () => {
    if (!preview?.products.length || busy) return;
    setBusy(true);
    setProgress(0);
    const total: ShopifyImportResult = { created: 0, updated: 0, variantsCreated: 0, variantsUpdated: 0, imagesCreated: 0, skipped: [] };
    try {
      const batches = Array.from({ length: Math.ceil(preview.products.length / 20) }, (_, index) => preview.products.slice(index * 20, index * 20 + 20));
      for (let index = 0; index < batches.length; index += 1) {
        const batch = batches[index];
        if (!batch) continue;
        const next = await importProducts({ data: { products: batch } });
        addResults(total, next);
        setProgress(Math.round(((index + 1) / batches.length) * 100));
      }
      setResult(total);
      onImported();
      toast.success("Importación de Shopify terminada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo completar la importación.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/45 backdrop-blur-sm" onClick={busy ? undefined : onClose} />
      <section className="relative flex max-h-[88vh] w-full max-w-2xl flex-col overflow-hidden rounded-lg border border-ink/10 bg-shell shadow-2xl">
        <header className="flex items-start justify-between border-b border-ink/10 p-5 md:p-6">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-moss/70">Catálogo</p>
            <h2 className="mt-1 font-serif text-2xl italic text-ink">Importar desde Shopify</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={busy} aria-label="Cerrar"><X /></Button>
        </header>
        <div className="overflow-y-auto p-5 md:p-6">
          <label className="flex min-h-36 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-ink/25 bg-background px-5 text-center hover:border-ink/50">
            <FileUp className="size-7 text-moss" />
            <span className="text-sm font-medium text-ink">{fileName || "Seleccionar archivo CSV"}</span>
            <span className="text-xs text-moss/65">Exportación de productos de Shopify</span>
            <input className="sr-only" type="file" accept=".csv,text/csv" onChange={(event) => chooseFile(event.target.files?.[0])} />
          </label>

          {preview && (
            <div className="mt-5 space-y-4">
              <div className="grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-ink/10 bg-ink/10">
                {[[preview.products.length, "Productos"], [variantCount, "Variantes"], [preview.imageCount, "Imágenes"]].map(([value, label]) => (
                  <div key={label} className="bg-background p-4 text-center"><strong className="block text-xl text-ink">{value}</strong><span className="text-[10px] uppercase tracking-widest text-moss/65">{label}</span></div>
                ))}
              </div>
              <p className="text-xs text-moss/70">{preview.rows} filas analizadas. Handle será el enlace interno y Variant SKU se conservará sin cambios.</p>
              {preview.errors.length > 0 && (
                <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
                  <p className="text-xs font-medium text-destructive">{preview.errors.length} observaciones</p>
                  <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs text-ink/70">
                    {preview.errors.slice(0, 30).map((error, index) => <li key={`${error}-${index}`}>• {error}</li>)}
                    {preview.errors.length > 30 && <li>• Y {preview.errors.length - 30} más.</li>}
                  </ul>
                </div>
              )}
            </div>
          )}

          {busy && <div className="mt-5"><div className="h-1.5 overflow-hidden rounded-full bg-ink/10"><div className="h-full bg-moss transition-[width]" style={{ width: `${progress}%` }} /></div><p className="mt-2 text-xs text-moss/70">Importando… {progress}%</p></div>}
          {result && (
            <div className="mt-5 rounded-lg border border-ink/10 bg-background p-4 text-sm text-ink">
              <p className="font-medium">Importación completada</p>
              <p className="mt-1 text-xs text-moss/75">{result.created} productos creados · {result.updated} actualizados · {result.variantsCreated} variantes creadas · {result.variantsUpdated} actualizadas · {result.imagesCreated} imágenes agregadas.</p>
              {result.skipped.length > 0 && <p className="mt-2 text-xs text-destructive">{result.skipped.length} elementos requieren revisión.</p>}
            </div>
          )}
        </div>
        <footer className="flex justify-end gap-2 border-t border-ink/10 bg-background p-4 md:px-6">
          <Button variant="outline" onClick={onClose} disabled={busy}>Cerrar</Button>
          <Button onClick={runImport} disabled={!preview?.products.length || busy || !!result} className="bg-ink text-ivory hover:bg-ink/85">
            {busy ? <Loader2 className="animate-spin" /> : <Upload />} Importar {preview?.products.length ?? 0} productos
          </Button>
        </footer>
      </section>
    </div>
  );
}