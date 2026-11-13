import { useMemo, useRef, useState } from "react";
import { compareSizes, displaySize } from "@/lib/size-order";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X, Plus, Trash2, Search, FileSpreadsheet, ArrowRight, ScanBarcode } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { addTransferScan, matchesTransferCode } from "@/lib/transfer-scan";
import { Button } from "@/components/ui/button";


export type TransferLocation = { id: string; code: string; name: string };

export type TransferVariant = {
  id: string;
  sku: string;
  barcode?: string | null;
  size: string | null;
  color: string | null;
  quality: string | null;
  inventory_levels: { location_id: string; on_hand: number; reserved: number }[] | null;
};

export type TransferProduct = {
  id: string;
  name: string;
  reference_code: string | null;
  variants: TransferVariant[];
};

type Line = { variantId: string; qty: number };

const avail = (v: TransferVariant, locId: string | null) => {
  if (!locId) return 0;
  const lvl = (v.inventory_levels ?? []).find((l) => l.location_id === locId);
  return lvl ? lvl.on_hand - lvl.reserved : 0;
};

const variantLabel = (v: TransferVariant) =>
  [v.color, v.size ? displaySize(v.size) : null, v.quality ?? (/calidad\s+c/i.test(v.size ?? "") ? "Calidad C" : null)]
    .filter(Boolean).join(" · ") || "Único";

/** Calidad A (o sin calidad) primero, luego C; dentro de cada una XS, S, M, L, XL. */
const qualityRank = (v: TransferVariant) => (/\bC\b/i.test(`${v.quality ?? ""} ${v.size ?? ""}`.replace(/calidad/gi, "")) ? 1 : 0);
const sortVariants = (vs: TransferVariant[]) =>
  [...vs].sort((a, b) => qualityRank(a) - qualityRank(b) || compareSizes(a.size, b.size));

export function TransferModal({
  products,
  locations,
  initialProductId,
  initialVariantId,
  initialTransfer,
  onClose,
}: {
  products: TransferProduct[];
  locations: TransferLocation[];
  initialProductId?: string;
  initialVariantId?: string;
  initialTransfer?: { from_location_id: string | null; to_location_id: string | null; note: string | null; transfer_items: { variant_id: string; qty: number }[] };
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [from, setFrom] = useState<string>(initialTransfer?.from_location_id ?? "");
  const [to, setTo] = useState<string>(initialTransfer?.to_location_id ?? "");
  const [note, setNote] = useState(initialTransfer?.note ?? "");
  const [query, setQuery] = useState("");
  const [scanCode, setScanCode] = useState("");
  const [openProduct, setOpenProduct] = useState<string | null>(initialProductId ?? null);
  const [lines, setLines] = useState<Line[]>(
    initialTransfer ? initialTransfer.transfer_items.map((item) => ({ variantId: item.variant_id, qty: item.qty })) : initialVariantId ? [{ variantId: initialVariantId, qty: 1 }] : [],
  );

  const variantIndex = useMemo(() => {
    const map = new Map<string, { product: TransferProduct; variant: TransferVariant }>();
    products.forEach((p) => p.variants.forEach((v) => map.set(v.id, { product: p, variant: v })));
    return map;
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.reference_code ?? "").toLowerCase().includes(q) ||
        p.variants.some((v) => v.sku.toLowerCase().includes(q)),
    );
  }, [products, query]);

  const setQty = (variantId: string, qty: number) =>
    setLines((prev) => {
      if (qty <= 0) return prev.filter((l) => l.variantId !== variantId);
      const found = prev.find((l) => l.variantId === variantId);
      if (found) return prev.map((l) => (l.variantId === variantId ? { ...l, qty } : l));
      return [...prev, { variantId, qty }];
    });

  const qtyOf = (variantId: string) => lines.find((l) => l.variantId === variantId)?.qty ?? 0;
  const linesRef = useRef(lines);
  linesRef.current = lines;

  const scan = (code: string) => {
    if (!code.trim()) return;
    if (!from) { toast.error("Selecciona primero la bodega origen"); return; }
    const hit = Array.from(variantIndex.values()).find(({ variant }) => matchesTransferCode(variant, code));
    if (!hit) { toast.error(`Código no encontrado: ${code}`); return; }
    const { product, variant } = hit;
    const disponible = avail(variant, from);
    const next = (linesRef.current.find((line) => line.variantId === variant.id)?.qty ?? 0) + 1;
    if (next > disponible) { toast.error(`Sin disponible en origen: ${variant.sku}`); return; }
    const updated = addTransferScan(linesRef.current, { variantId: variant.id, qty: 1 });
    linesRef.current = updated;
    setLines(updated);
    setScanCode("");
    setOpenProduct(product.id);
    toast.success(`${product.name} · ${variantLabel(variant)} ×${next}`);
  };
  useBarcodeScanner(scan);


  const addAllOfProduct = (p: TransferProduct) => {
    if (!from) { toast.error("Selecciona primero la bodega origen"); return; }
    const additions = p.variants
      .map((v) => ({ variantId: v.id, qty: avail(v, from) }))
      .filter((l) => l.qty > 0);
    if (additions.length === 0) { toast.error("Sin stock disponible en la bodega origen"); return; }
    setLines((prev) => {
      const map = new Map(prev.map((l) => [l.variantId, l]));
      additions.forEach((a) => map.set(a.variantId, a));
      return Array.from(map.values());
    });
  };

  const totalUnits = lines.reduce((s, l) => s + l.qty, 0);

  type ImportRow = { variantId: string; sku: string; name: string; qty: number; available: number };
  const [importing, setImporting] = useState<{ file: string; rows: ImportRow[]; missing: string[]; skipped: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const skuIndex = useMemo(() => {
    const m = new Map<string, { product: TransferProduct; variant: TransferVariant }>();
    products.forEach((p) => p.variants.forEach((v) => m.set(v.sku.trim().toUpperCase().replace(/\s+/g, ""), { product: p, variant: v })));
    return m;
  }, [products]);

  const onExcel = async (file: File) => {
    if (!from || !to) { toast.error("Selecciona primero bodega origen y destino"); return; }
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer());
      const totals = new Map<string, number>();
      let skipped = 0;
      for (const name of wb.SheetNames) {
        const grid = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, defval: null });
        if (grid.length === 0) continue;
        const head = (grid[0] ?? []).map((h) => String(h ?? "").trim().toLowerCase());
        const skuCol = head.findIndex((h) => h === "sku" || h.includes("sku") || h === "código" || h === "codigo");
        let qtyCol = head.findIndex((h) => /^(cantidad|qty|unidades|und|cant)/.test(h));
        if (skuCol < 0) continue;
        if (qtyCol < 0) {
          const tallaCol = head.findIndex((h) => h === "talla");
          const blank = head.findIndex((h, i) => h === "" && i !== skuCol && (tallaCol < 0 || i > tallaCol));
          qtyCol = blank;
        }
        if (qtyCol < 0) { toast.error(`No encontré la columna de cantidad en la hoja ${name}`); continue; }
        for (const r of grid.slice(1)) {
          const sku = String(r[skuCol] ?? "").trim().toUpperCase().replace(/\s+/g, "");
          if (!sku) continue;
          const q = Math.floor(Number(r[qtyCol]) || 0);
          if (q <= 0) { skipped++; continue; }
          totals.set(sku, (totals.get(sku) ?? 0) + q);
        }
      }
      const rows: ImportRow[] = [];
      const missing: string[] = [];
      totals.forEach((qty, sku) => {
        const hit = skuIndex.get(sku);
        if (!hit) { missing.push(sku); return; }
        rows.push({ variantId: hit.variant.id, sku: hit.variant.sku, name: `${hit.product.name} · ${variantLabel(hit.variant)}`, qty, available: avail(hit.variant, from) });
      });
      if (rows.length === 0 && missing.length === 0) { toast.error("El archivo no tiene prendas con cantidad"); return; }
      setImporting({ file: file.name, rows, missing, skipped });
    } catch (e) {
      toast.error("No se pudo leer el Excel");
      console.error(e);
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const applyImport = (limit: boolean) => {
    if (!importing) return;
    setLines((prev) => {
      const map = new Map(prev.map((l) => [l.variantId, l]));
      importing.rows.forEach((r) => {
        const q = limit ? Math.min(r.qty, Math.max(0, r.available)) : r.qty;
        if (q > 0) map.set(r.variantId, { variantId: r.variantId, qty: q });
      });
      return Array.from(map.values());
    });
    setImporting(null);
    toast.success("Prendas del Excel agregadas al traslado");
  };

  const downloadTemplate = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet([["SKU", "Cantidad"], ["AGUBERGRE-S", 2]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Traslado");
    XLSX.writeFile(wb, "plantilla-traslado.xlsx");
  };

  const locLabel = (id: string) => locations.find((l) => l.id === id)?.name ?? "—";

  const create = useMutation({
    mutationFn: async () => {
      if (!from || !to) throw new Error("Selecciona bodega origen y destino");
      if (from === to) throw new Error("El origen y el destino deben ser distintos");
      if (lines.length === 0) throw new Error("Agrega al menos una variante");
      for (const l of lines) {
        const entry = variantIndex.get(l.variantId);
        if (!entry) throw new Error("Una variante del traslado original ya no existe. Retírala para continuar.");
        if (entry && l.qty > avail(entry.variant, from)) {
          throw new Error(`Cantidad mayor al disponible en ${entry.variant.sku}`);
        }
      }
      const { error } = await supabase.rpc("request_transfer", {
        _from_location_id: from,
        _to_location_id: to,
        _items: lines.map((l) => ({ variant_id: l.variantId, qty: l.qty })),
        _note: note || undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Traslado registrado");
      qc.invalidateQueries({ queryKey: ["inventory-tree"] });
      qc.invalidateQueries({ queryKey: ["transfers"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-ivory shadow-xl [font-family:'Inter',ui-sans-serif,system-ui,sans-serif] [&_.font-serif]:[font-family:'Inter',ui-sans-serif,system-ui,sans-serif] [&_.font-mono]:[font-family:'Inter',ui-sans-serif,system-ui,sans-serif]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink/10 px-6 py-5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-moss/70">Operación</p>
             <h2 className="font-serif text-2xl">{initialTransfer ? "Duplicar traslado" : "Nuevo traslado"}</h2>
            <p className="mt-1 text-xs text-moss">Escoge origen y destino, luego agrega variantes por referencia o masivamente.</p>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-ink/60 hover:bg-ink/5"><X className="h-4 w-4" /></button>
        </header>

        <div className="grid gap-3 border-b border-ink/10 px-6 py-4 md:grid-cols-2">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-moss/70">Bodega origen</label>
            <select value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-full rounded-full border border-ink/15 bg-white px-4 py-2.5 text-sm">
              <option value="">Selecciona origen…</option>
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-moss/70">Bodega destino</label>
            <select value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-full border border-ink/15 bg-white px-4 py-2.5 text-sm">
              <option value="">Selecciona destino…</option>
              {locations.filter((l) => l.id !== from).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div className="flex min-h-0 flex-1 flex-col border-b border-ink/10 md:border-b-0 md:border-r">
            <div className="flex items-center gap-2 px-6 pt-3">
              <ScanBarcode className="size-5 shrink-0 text-moss" />
              <input aria-label="Código de barras del traslado" value={scanCode}
                onChange={(e) => setScanCode(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.defaultPrevented) { e.preventDefault(); scan(scanCode); } }}
                placeholder="Escanear código de barras…"
                className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" />
              <Button type="button" variant="outline" size="icon" aria-label="Agregar código al traslado" title="Agregar código al traslado" onClick={() => scan(scanCode)}><Plus /></Button>
            </div>
            <div className="flex items-center gap-2 px-6 py-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-moss/50" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar referencia, nombre o SKU…"
                  className="w-full rounded-full border border-ink/10 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-ink/30 focus:outline-none"
                />
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onExcel(f); }} />
              <button
                onClick={() => { if (!from || !to) { toast.error("Selecciona primero bodega origen y destino"); return; } fileRef.current?.click(); }}
                className="flex shrink-0 items-center gap-1.5 rounded-full border border-ink/15 bg-white px-3 py-2.5 text-xs hover:bg-ink/5"
              >
                <FileSpreadsheet className="h-4 w-4" /> Subir Excel
              </button>
            </div>
            <div className="-mt-1 px-6 pb-2 text-[10px] text-moss/70">
              Excel con columnas SKU y Cantidad.{" "}
              <button onClick={() => void downloadTemplate()} className="underline">Descargar plantilla</button>
            </div>
            {importing && (() => {
              const over = importing.rows.filter((r) => r.qty > r.available);
              const units = importing.rows.reduce((s, r) => s + r.qty, 0);
              return (
                <div className="mx-6 mb-3 rounded-2xl border border-ink/15 bg-white p-4 text-xs">
                  <div className="mb-2 flex items-center gap-2 text-sm">
                    <span>Sale de <b>{locLabel(from)}</b></span>
                    <ArrowRight className="h-4 w-4 text-moss" />
                    <span>Llega a <b>{locLabel(to)}</b></span>
                  </div>
                  <p className="text-moss">{importing.file}: {importing.rows.length} prendas encontradas · {units} und{importing.skipped > 0 ? ` · ${importing.skipped} filas en 0 omitidas` : ""}</p>
                  {importing.missing.length > 0 && (
                    <div className="mt-2 rounded-xl bg-clay/10 p-2">
                      <b>{importing.missing.length} SKU no encontrados:</b>
                      <div className="mt-1 max-h-20 overflow-y-auto font-mono text-[10px]">{importing.missing.join(", ")}</div>
                    </div>
                  )}
                  {over.length > 0 && (
                    <div className="mt-2 rounded-xl bg-clay/10 p-2">
                      <b>{over.length} prendas piden más de lo disponible en origen:</b>
                      <ul className="mt-1 max-h-24 overflow-y-auto font-mono text-[10px]">
                        {over.map((r) => <li key={r.variantId}>{r.sku}: pide {r.qty}, hay {Math.max(0, r.available)}</li>)}
                      </ul>
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button onClick={() => applyImport(true)} className="rounded-full bg-ink px-4 py-2 text-ivory">
                      {over.length > 0 ? "Agregar (limitar a disponible)" : "Agregar al traslado"}
                    </button>
                    <button onClick={() => setImporting(null)} className="rounded-full px-4 py-2 text-ink/60">Cancelar</button>
                  </div>
                </div>
              );
            })()}
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5">
              {filtered.map((p) => {
                const isOpen = openProduct === p.id;
                return (
                  <div key={p.id} className="mb-2 rounded-2xl border border-ink/10 bg-white">
                    <div className="flex items-center gap-2 px-4 py-3">
                      <button onClick={() => setOpenProduct(isOpen ? null : p.id)} className="flex-1 text-left">
                        <div className="font-serif text-base">{p.name}</div>
                        <div className="font-mono text-[10px] text-ink/45">{p.reference_code ?? "—"} · {p.variants.length} variantes</div>
                      </button>
                      <button
                        onClick={() => addAllOfProduct(p)}
                        title="Agregar todo el disponible de esta referencia"
                        className="rounded-full border border-ink/15 px-3 py-1.5 text-[11px] hover:bg-ink/5"
                      >
                        Todo
                      </button>
                    </div>
                    {isOpen && (
                      <ul className="divide-y divide-ink/5 border-t border-ink/5">
                        {sortVariants(p.variants).map((v) => {
                          const disponible = avail(v, from);
                          return (
                            <li key={v.id} className="flex items-center gap-3 px-4 py-2 text-xs">
                              <div className="flex-1">
                                <div>{variantLabel(v)}</div>
                                <div className="font-mono text-[10px] text-ink/45">{v.sku}</div>
                              </div>
                              <span className={"text-[11px] " + (disponible <= 0 ? "text-clay" : "text-moss")}>
                                disp. {disponible}
                              </span>
                              <input
                                type="number"
                                min={0}
                                max={disponible}
                                value={qtyOf(v.id) || ""}
                                placeholder="0"
                                onChange={(e) => setQty(v.id, parseInt(e.target.value) || 0)}
                                className="w-16 rounded-full border border-ink/15 bg-ivory/60 px-3 py-1.5 text-right text-xs"
                              />
                              <button
                                onClick={() => setQty(v.id, qtyOf(v.id) + 1)}
                                disabled={!from || disponible <= 0}
                                className="rounded-full p-1.5 text-ink/60 hover:bg-ink/5 disabled:opacity-30"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && <p className="py-8 text-center text-sm text-moss/60">Sin resultados.</p>}
            </div>
          </div>

          <div className="flex w-full min-h-0 flex-col md:w-80">
            <div className="px-6 py-3 text-[10px] uppercase tracking-widest text-moss/70">
              Piezas ({lines.length} variantes · {totalUnits} und)
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6">
              {lines.map((l) => {
                const entry = variantIndex.get(l.variantId);
                return (
                  <div key={l.variantId} className="mb-2 flex items-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs">
                    <div className="flex-1">
                      <div>{entry?.product.name ?? "—"}</div>
                      <div className="font-mono text-[10px] text-ink/45">{entry?.variant.sku}</div>
                    </div>
                    <span className="font-serif italic">{l.qty}</span>
                    <button onClick={() => setQty(l.variantId, 0)} className="text-ink/40 hover:text-ink"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                );
              })}
              {lines.length === 0 && <p className="py-6 text-center text-xs text-moss/60">Aún no agregas piezas.</p>}
            </div>
            <div className="space-y-2 px-6 py-4">
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                placeholder="Nota (opcional)"
                className="w-full rounded-2xl border border-ink/15 bg-white px-4 py-2.5 text-sm"
              />
              <button
                onClick={() => create.mutate()}
                disabled={create.isPending}
                className="w-full rounded-full bg-ink px-5 py-2.5 text-sm text-ivory disabled:opacity-50"
              >
                {create.isPending ? "Enviando…" : "Solicitar traslado"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
