import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useMemo, useRef, useState } from "react";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, ArrowLeftRight, History, Search, X, Printer, Sparkles, Loader2, TrendingUp, AlertTriangle, Lightbulb, Download, Upload, PackagePlus, MoreHorizontal, SlidersHorizontal } from "lucide-react";
import { ManualIntakeModal } from "@/components/admin/manual-intake-modal";
import { InventoryAdjustModal } from "@/components/admin/inventory-adjust-modal";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { sendRCountAdjustment } from "@/lib/rcount.functions";
import { TransferModal } from "@/components/admin/transfer-modal";
import { printLabels } from "@/components/admin/barcode-label";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { inventoryRecommendation, type InventoryInsight } from "@/lib/admin/inventory-ai.functions";
import { printOrderDocument } from "@/components/admin/order-print";
import { fetchAll } from "@/lib/fetch-all";
import { KardexModal } from "@/components/admin/kardex-modal";
import { InventoryImportPreview } from "@/components/admin/inventory-import-preview";
import { analyzeInventoryRows, type ImportPlan } from "@/lib/admin/inventory-import";
import { availableAfterCommitted } from "@/lib/admin/inventory-total";

const PAGE_SIZE = 50;

type InventoryViewProps = {
  /** Código de bodega fija (ecom, cali, bogota…). Si se pasa, la vista se limita a esa bodega. */
  fixedLocationCode?: string;
  /** Texto pequeño sobre el título. */
  eyebrow?: string;
  /** Descripción bajo el título. */
  description?: string;
};

export function InventoryView({ fixedLocationCode, eyebrow = "Operación", description }: InventoryViewProps) {
  const [transfer, setTransfer] = useState<{ productId?: string; variantId?: string } | null>(null);
  const [query, setQuery] = usePersistedState("inv:query", "");
  const [fStockOp, setFStockOp] = usePersistedState("inv:fStockOp", "");
  const [fStockQty, setFStockQty] = usePersistedState("inv:fStockQty", "");
  const [fQuality, setFQuality] = usePersistedState("inv:fQuality", "");
  const [fCollection, setFCollection] = usePersistedState("inv:fCollection", "");
  const [fLocationState, setFLocationState] = usePersistedState("inv:fLocationState", "");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [view, setView] = usePersistedState<"tree" | "matrix">("inv:view", "tree");
  const [kardexProduct, setKardexProduct] = useState<{ id: string; name: string } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [recoOpen, setRecoOpen] = useState(false);
  const [committedFor, setCommittedFor] = useState<{ variantId?: string; productId?: string; label: string } | null>(null);
  const [dispatchOrder, setDispatchOrder] = useState<string | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [totalsOpen, setTotalsOpen] = useState(false);
  const [mobileProductId, setMobileProductId] = useState<string | null>(null);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportLocationId, setExportLocationId] = useState("all");

  const { data: locations } = useQuery({
    queryKey: ["locations", "active"],
    queryFn: async () => {
      const rows =
        (await supabase.from("locations").select("id, code, name, kind, priority").eq("active", true)).data ?? [];
      // Bodega Central (bodega principal) siempre de primera
      return rows.sort((a, b) => {
        const wa = a.code === "bodega" ? 0 : 1;
        const wb = b.code === "bodega" ? 0 : 1;
        if (wa !== wb) return wa - wb;
        return (b.priority ?? 0) - (a.priority ?? 0);
      });
    },
  });

  const fixedLoc = fixedLocationCode ? (locations ?? []).find((l) => l.code === fixedLocationCode) : undefined;
  const fLocation = fixedLoc ? fixedLoc.id : fLocationState;

  const { data: collections } = useQuery({
    queryKey: ["inv-collections"],
    queryFn: async () => (await supabase.from("collections").select("id, title").order("position")).data ?? [],
  });

  const { data: products } = useQuery({
    queryKey: ["inventory-tree"],
    queryFn: () =>
      fetchAll((from, to) =>
        supabase
          .from("products")
          .select("id, name, product_type, reference_code, collection_products(collection_id), product_variants(id, sku, size, quality, color, active, price_cop, price_usd, cost_cop, inventory_levels(location_id, on_hand, reserved, returned_qty))")
          .order("name")
          .order("id")
          .range(from, to),
      ),
  });

  // Comprometido B2B: preventas/pedidos mayoristas pendientes de entrega por variante
  const { data: committed } = useQuery({
    queryKey: ["b2b-committed"],
    queryFn: async () => {
      return fetchAll((from, to) =>
        supabase
          .from("preventa_allocations")
          .select("id, variant_id, qty, order_id, orders(number, contact_name, status)")
          .eq("status", "pending")
          .order("id")
          .range(from, to),
      );
    },
  });

  const committedByVariant = useMemo(() => {
    const m = new Map<string, number>();
    (committed ?? []).forEach((a) => m.set(a.variant_id, (m.get(a.variant_id) ?? 0) + a.qty));
    return m;
  }, [committed]);

  // La bodega mayorista no es física: su lectura es la columna «Comprometido B2B» junto a Bodega Central
  const shownLocations = (fLocation ? (locations ?? []).filter((l) => l.id === fLocation) : (locations ?? []))
    .filter((l) => l.kind !== "wholesale");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const need = Number(fStockQty);
    const useStock = fStockOp !== "" && fStockQty.trim() !== "" && Number.isFinite(need);
    return (products ?? [])
      .map((p) => {
        const variants = (p.product_variants ?? []).filter((v) => v.active && (!fQuality || qualityLetter(v.quality) === fQuality));
        return { ...p, variants };
      })
      .filter((p) => {
        if (fCollection && !(p.collection_products ?? []).some((cp) => cp.collection_id === fCollection)) return false;
        if (q) {
          const hit = p.name.toLowerCase().includes(q) || p.variants.some((v) => v.sku.toLowerCase().includes(q));
          if (!hit) return false;
        }
        if (useStock) {
          const total = p.variants.reduce((s, v) => s + (v.inventory_levels ?? []).reduce((x, l) => {
            const loc = shownLocations.find((sl) => sl.id === l.location_id);
            return loc ? x + l.on_hand - l.reserved : x;
          }, 0), 0);
          if (fStockOp === "gt" && !(total > need)) return false;
          if (fStockOp === "gte" && !(total >= need)) return false;
          if (fStockOp === "lt" && !(total < need)) return false;
          if (fStockOp === "lte" && !(total <= need)) return false;
          if (fStockOp === "eq" && total !== need) return false;
        }
        return p.variants.length > 0;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products, query, fCollection, fQuality, fStockOp, fStockQty, fLocation, locations]);

  const [page, setPage] = usePersistedState("inv:page", 0);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const stockFor = (variant: (typeof rows)[number]["variants"][number], locId: string) => {
    const lvl = (variant.inventory_levels ?? []).find((l) => l.location_id === locId);
    return lvl ? lvl.on_hand - lvl.reserved : 0;
  };

  const returnedFor = (variant: (typeof rows)[number]["variants"][number], locId: string) => {
    const lvl = (variant.inventory_levels ?? []).find((l) => l.location_id === locId) as any;
    return lvl?.returned_qty ?? 0;
  };

  const productStock = (p: (typeof rows)[number], locId: string) =>
    p.variants.reduce((sum, v) => sum + stockFor(v, locId), 0);

  const mobileProduct = mobileProductId ? rows.find((r) => r.id === mobileProductId) ?? null : null;

  const variantPhysical = (v: (typeof rows)[number]["variants"][number]) => shownLocations.reduce((s, l) => s + stockFor(v, l.id), 0);
  // Total disponible = físico en bodegas − Comprometido B2B (nunca negativo).
  const variantTotal = (v: (typeof rows)[number]["variants"][number]) => availableAfterCommitted(variantPhysical(v), committedForVariant(v.id));
  const productTotal = (p: (typeof rows)[number]) => p.variants.reduce((sum, v) => sum + variantTotal(v), 0);
  const productPhysical = (p: (typeof rows)[number]) => p.variants.reduce((sum, v) => sum + variantPhysical(v), 0);

  // Lo comprometido B2B es global (no de una tienda): solo se resta cuando se ven todas las bodegas.
  const committedForVariant = (variantId: string) => (fLocation ? 0 : committedByVariant.get(variantId) ?? 0);
  const committedForProduct = (p: (typeof rows)[number]) =>
    p.variants.reduce((s, v) => s + committedForVariant(v.id), 0);

  const committedCell = (qty: number, onOpen: () => void, className = "") =>
    qty > 0 ? (
      <button type="button" onClick={onOpen} className={"rounded-full bg-clay/10 px-2 py-0.5 text-clay hover:bg-clay/20 " + className} title="Ver pedidos comprometidos">
        {qty}
      </button>
    ) : (
      <span className="text-ink/30">0</span>
    );

  const openTransfer = (opts?: { productId?: string; variantId?: string }) => {
    setTransfer(opts ?? {});
  };

  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);


  const exportExcel = (locationId = "all") => {
    const availableLocations = (locations ?? []).filter((l) => l.kind !== "wholesale");
    const locs = fixedLoc
      ? [fixedLoc]
      : locationId === "all"
        ? shownLocations
        : availableLocations.filter((l) => l.id === locationId);
    if (locs.length === 0) {
      toast.error("Selecciona una bodega para descargar");
      return;
    }
    const header = ["SKU", "Producto", "Referencia", "Color", "Talla", "Calidad", "Precio COP", "Precio USD", "Costo COP", ...locs.map((l) => `Stock ${l.name}`)];
    const data = rows.flatMap((p) =>
      p.variants.map((v) => [
        v.sku, p.name, p.reference_code ?? "", v.color ?? "", v.size ?? "", qualityLetter(v.quality),
        v.price_cop ?? 0, v.price_usd ?? 0, v.cost_cop ?? 0,
        ...locs.map((l) => stockFor(v, l.id)),
      ]),
    );
    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    ws["!cols"] = header.map((h, i) => ({ wch: i === 1 ? 28 : 14 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Inventario");
    const selectedLocation = locs.length === 1 ? locs[0] : null;
    const safeName = selectedLocation?.name.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    XLSX.writeFile(wb, selectedLocation ? `inventario-${safeName}.xlsx` : "inventario-todas-las-bodegas.xlsx");
    setExportOpen(false);
    toast.success("Inventario descargado");
  };

  const [importPreview, setImportPreview] = useState<{ plan: ImportPlan; fileName: string; rows: unknown[][]; locationName: string } | null>(null);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number; errors: { sku: string; message: string }[] } | null>(null);
  const sendRCountImport = useServerFn(sendRCountAdjustment);

  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const [importLocId, setImportLocId] = useState("");
  const importExcel = async (file: File, locId: string) => {
    setPendingImport(null);
    setImporting(true);
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rowsIn = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" });
      const chosen = (locations ?? []).find((l) => l.id === locId);
      if (!chosen) throw new Error("Elige la bodega que se va a actualizar");
      const target = { id: chosen.id, name: chosen.name };
      const targetLocs = [target];
      const variants = (products ?? []).flatMap((p) => (p.product_variants ?? []).map((v) => ({
        id: v.id, sku: v.sku,
        levels: (v.inventory_levels ?? []).map((l) => ({ location_id: l.location_id, on_hand: l.on_hand ?? 0, reserved: l.reserved ?? 0 })),
      })));
      const plan = analyzeInventoryRows(rowsIn, variants, targetLocs, target);
      if (!plan.stockColumns.length && !plan.priceRows) throw new Error(`No encontré la columna de cantidad. Debe llamarse «Stock», «Cantidad» o «Stock ${target.name}».`);
      setImportPreview({ plan, fileName: file.name, rows: rowsIn, locationName: target.name });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo leer el archivo");
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const confirmImport = async () => {
    if (!importPreview) return;
    const { plan, rows: rowsIn, fileName } = importPreview;
    setImporting(true);
    const errors: { sku: string; message: string }[] = [];
    setImportProgress({ done: 0, total: plan.lines.length, errors });
    try {
      // Precios y costo (la calidad no se cambia por Excel)
      const header = (rowsIn[0] ?? []).map((h) => String(h ?? "").trim().toLowerCase());
      const skuIdx = header.indexOf("sku");
      const iPrice = header.indexOf("precio cop"), iUsd = header.indexOf("precio usd"), iCost = header.indexOf("costo cop");
      const bySku = new Map<string, string>();
      (products ?? []).forEach((p) => (p.product_variants ?? []).forEach((v) => bySku.set(v.sku.trim().replace(/\s+/g, "").toUpperCase(), v.id)));
      const has = (r: unknown[], i: number) => i >= 0 && r[i] !== undefined && r[i] !== "" && Number.isFinite(Number(r[i]));
      const pricePatches: { id: string; patch: { price_cop?: number; price_usd?: number; cost_cop?: number } }[] = [];
      for (const r of rowsIn.slice(1)) {
        const id = bySku.get(String(r[skuIdx] ?? "").trim().replace(/\s+/g, "").toUpperCase());
        if (!id) continue;
        const patch: { price_cop?: number; price_usd?: number; cost_cop?: number } = {};
        if (has(r, iPrice)) patch.price_cop = Number(r[iPrice]);
        if (has(r, iUsd)) patch.price_usd = Number(r[iUsd]);
        if (has(r, iCost)) patch.cost_cop = Number(r[iCost]);
        if (Object.keys(patch).length) pricePatches.push({ id, patch });
      }
      for (let i = 0; i < pricePatches.length; i += 8) {
        await Promise.all(pricePatches.slice(i, i + 8).map(({ id, patch }) => supabase.from("product_variants").update(patch).eq("id", id)));
      }
      // Stock: cada diferencia queda como «Ajuste» en el kardex.
      // Se cargan en tandas de 8 en paralelo para que no se quede «congelada» una por una.
      const note = `Carga Excel · ${fileName}`;
      const sentByLoc = new Map<string, { variant_id: string; qty: number }[]>();
      let done = 0;
      const BATCH = 8;
      for (let i = 0; i < plan.lines.length; i += BATCH) {
        const batch = plan.lines.slice(i, i + BATCH);
        const results = await Promise.all(
          batch.map((l) =>
            supabase.rpc("adjust_inventory" as never, {
              _location_id: l.locationId, _variant_id: l.variantId, _qty: l.delta, _kind: "adjustment", _note: note,
            } as never),
          ),
        );
        results.forEach(({ error }, j) => {
          const l = batch[j];
          if (error) errors.push({ sku: `${l.sku} (${l.locationName})`, message: error.message });
          else sentByLoc.set(l.locationId, [...(sentByLoc.get(l.locationId) ?? []), { variant_id: l.variantId, qty: l.delta }]);
        });
        done += batch.length;
        setImportProgress({ done, total: plan.lines.length, errors: [...errors] });
      }
      const rcountFails: string[] = [];
      let rcountSent = 0;
      for (const [location_id, all] of sentByLoc) {
        for (let i = 0; i < all.length; i += 500) {
          const items = all.slice(i, i + 500);
          try {
            const r = await sendRCountImport({ data: { kind: "ajuste", reason: note, items, location_id } });
            if (r.ok) rcountSent += items.length; else rcountFails.push(r.message);
          } catch (e) { rcountFails.push(e instanceof Error ? e.message : "No se pudo enviar a R-Count"); }
        }
      }
      if (rcountFails.length) toast.error(`R-Count no recibió el ajuste: ${rcountFails[0]}. Quedó guardado; reenvíalo desde el kardex (Ajuste inv. → registro).`, { duration: Infinity, closeButton: true });
      else if (rcountSent) toast.success(`Ajuste enviado a R-Count (${rcountSent} tallas, entradas y salidas), pendiente de aprobación en «Ajustes Hub»`, { duration: 12000 });
      const ok = plan.lines.length - errors.length;
      if (errors.length) toast.error(`${errors.length} no se pudieron cargar: ${errors.slice(0, 3).map((e) => `${e.sku}: ${e.message}`).join(" · ")}`, { duration: 15000 });
      toast.success(`${ok} tallas actualizadas y registradas en el kardex`);
      queryClient.invalidateQueries({ queryKey: ["inventory-tree"] });
      setImportPreview(null);
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const labelsFor = (list: (typeof rows)) =>
    list.flatMap((p) =>
      p.variants.map((v) => ({
        code: v.sku,
        name: p.name,
        variant: [v.color, v.size, v.quality].filter(Boolean).join(" · ") || null,
      })),
    );

  const printProductLabels = (p: (typeof rows)[number]) => printLabels(labelsFor([p]));

  const exportLabels = (list: (typeof rows)) => {
    const data = list.flatMap((p) =>
      p.variants.filter((v) => v.sku).map((v) => ({
        "Código": v.sku,
        Producto: p.name,
        Color: v.color ?? "",
        Talla: v.size ?? "",
        Copias: 1,
      })),
    );
    if (!data.length) return;
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 18 }, { wch: 36 }, { wch: 16 }, { wch: 8 }, { wch: 8 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Etiquetas");
    XLSX.writeFile(wb, `etiquetas-${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const selectedRows = rows.filter((p) => selected.includes(p.id));
  const allShownSelected = rows.length > 0 && rows.every((p) => selected.includes(p.id));
  const toggleOne = (id: string) =>
    setSelected((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));
  const toggleAll = () => setSelected(allShownSelected ? [] : rows.map((p) => p.id));

  const columnTotals = {
    byLocation: shownLocations.map((l) => ({ id: l.id, name: l.name, total: rows.reduce((s, p) => s + productStock(p, l.id), 0) })),
    committed: rows.reduce((s, p) => s + committedForProduct(p), 0),
    grand: rows.reduce((s, p) => s + productTotal(p), 0),
    physical: rows.reduce((s, p) => s + productPhysical(p), 0),
  };

  useBarcodeScanner((code) => {
    if (transfer) return;
    const found = rows.find((p) => p.variants.some((v) => v.sku.toLowerCase() === code.trim().toLowerCase()));
    setQuery(code.trim());
    if (found) {
      setExpanded((c) => ({ ...c, [found.id]: true }));
      toast.success(`${found.name} · ${code}`);
    } else {
      toast.error(`Código no encontrado: ${code}`);
    }
  }, { enabled: !transfer });

  const adjustLocations = fixedLoc ? [fixedLoc] : (locations ?? []);

  return (
    <div className="p-10">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-moss/70">{eyebrow}</p>
          <h1 className="font-serif italic text-4xl mt-1">Inventario</h1>
          <p className="mt-1 text-xs text-moss">{description ?? "Escanea con la pistola para buscar una referencia al instante."}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {intakeOpen && <ManualIntakeModal onClose={() => setIntakeOpen(false)} />}
          {adjustOpen && <InventoryAdjustModal locations={adjustLocations} onClose={() => setAdjustOpen(false)} />}
          {exportOpen && !fixedLoc && createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/45 p-4" onMouseDown={() => setExportOpen(false)}>
              <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl" onMouseDown={(event) => event.stopPropagation()}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest text-moss/70">Inventario</p>
                    <h2 className="mt-1 font-serif text-2xl italic">Descargar Excel</h2>
                    <p className="mt-2 text-sm text-moss">Escoge la bodega que quieres incluir en el archivo.</p>
                  </div>
                  <button type="button" onClick={() => setExportOpen(false)} className="rounded-full p-2 hover:bg-ink/5" aria-label="Cerrar">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <label className="mt-6 block text-xs font-medium uppercase tracking-wider text-moss" htmlFor="export-location">Bodega</label>
                <select
                  id="export-location"
                  value={exportLocationId}
                  onChange={(event) => setExportLocationId(event.target.value)}
                  className="mt-2 w-full rounded-md border border-ink/15 bg-white px-4 py-3 text-sm focus:border-ink/40 focus:outline-none"
                >
                  <option value="all">Todas las bodegas</option>
                  {(locations ?? []).filter((location) => location.kind !== "wholesale").map((location) => (
                    <option key={location.id} value={location.id}>{location.name}</option>
                  ))}
                </select>
                <div className="mt-6 flex justify-end gap-2">
                  <button type="button" onClick={() => setExportOpen(false)} className="rounded-full border border-ink/15 px-5 py-2.5 text-sm hover:bg-ink/5">Cancelar</button>
                  <button type="button" onClick={() => exportExcel(exportLocationId)} className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm text-ivory hover:bg-ink/85">
                    <Download className="h-4 w-4" /> Descargar
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { setImportLocId(fixedLoc?.id ?? ""); setPendingImport(f); } if (fileRef.current) fileRef.current.value = ""; }}
          />
          <button
            type="button"
            onClick={() => setAdjustOpen(true)}
            className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-5 py-2.5 text-sm hover:bg-ink/5"
          >
            <SlidersHorizontal className="h-4 w-4" /> Ajuste inv.
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((o) => !o)}
              className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-5 py-2.5 text-sm hover:bg-ink/5"
            >
              {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />} Más acciones
            </button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMoreOpen(false)} />
                <div className="absolute right-0 z-40 mt-2 w-56 overflow-hidden rounded-2xl border border-ink/10 bg-white py-1 shadow-lg">
                  {[
                    ...(!fixedLoc ? [
                      { icon: Sparkles, label: "Analiza con Ready", run: () => setRecoOpen(true) },
                      { icon: PackagePlus, label: "Entrada manual", run: () => setIntakeOpen(true) },
                    ] : []),
                    { icon: Printer, label: "Imprimir etiquetas", run: () => printLabels(labelsFor(rows)) },
                    { icon: Download, label: "Exportar etiquetas (Excel)", run: () => exportLabels(rows) },
                    { icon: Download, label: "Descargar Excel", run: () => (fixedLoc ? exportExcel(fixedLoc.id) : setExportOpen(true)) },
                    ...(!fixedLoc ? [{ icon: Upload, label: "Subir Excel", run: () => fileRef.current?.click() }] : []),
                  ].map(({ icon: Icon, label, run }) => (
                    <button
                      key={label}
                      type="button"
                      disabled={importing && label === "Subir Excel"}
                      onClick={() => { setMoreOpen(false); run(); }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm hover:bg-ink/5 disabled:opacity-50"
                    >
                      <Icon className="h-4 w-4" /> {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => openTransfer()}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm text-ivory hover:bg-ink/85"
          >
            <ArrowLeftRight className="h-4 w-4" /> Nuevo traslado
          </button>
        </div>
      </header>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-moss/50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o SKU…"
            className="w-full rounded-full border border-ink/10 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-ink/30 focus:outline-none"
          />
        </div>
        <select value={fStockOp} onChange={(e) => setFStockOp(e.target.value)} className="rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm">
          <option value="">Unidades disponibles</option>
          <option value="gt">mayores a</option>
          <option value="gte">mayores o iguales a</option>
          <option value="lt">menores a</option>
          <option value="lte">menores o iguales a</option>
          <option value="eq">iguales a</option>
        </select>
        {fStockOp && (
          <input
            type="number" min="0" step="1" value={fStockQty}
            onChange={(e) => setFStockQty(e.target.value)}
            placeholder="unidades"
            className="no-spin w-32 rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm focus:border-ink/30 focus:outline-none"
          />
        )}
        <select value={fQuality} onChange={(e) => setFQuality(e.target.value)} className="rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm">
          <option value="">Todas las calidades</option>
          <option value="A">Tipo A</option>
          <option value="B">Tipo B</option>
          <option value="C">Tipo C</option>
        </select>
        <select value={fCollection} onChange={(e) => setFCollection(e.target.value)} className="rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm">
          <option value="">Todas las colecciones</option>
          {(collections ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        {!fixedLoc && (
          <select value={fLocation} onChange={(e) => setFLocationState(e.target.value)} className="rounded-full border border-ink/10 bg-white px-4 py-2.5 text-sm">
            <option value="">Todas las bodegas</option>
            {(locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        )}
        {(query || fQuality || fCollection || (!fixedLoc && fLocation) || fStockOp || fStockQty) && (
          <button onClick={() => { setQuery(""); setFQuality(""); setFCollection(""); setFLocationState(""); setFStockOp(""); setFStockQty(""); }} className="text-xs text-moss/70 underline">limpiar</button>
        )}
        <div className="ml-auto flex rounded-full border border-ink/10 bg-white p-1 text-xs">
          {(["tree", "matrix"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={"rounded-full px-3 py-1.5 " + (view === v ? "bg-ink text-ivory" : "text-ink/60")}
            >
              {v === "tree" ? "Árbol" : "Matriz"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 pb-2 mb-8">
        <button
          type="button"
          onClick={() => setTotalsOpen(true)}
          className="text-sm text-ink underline decoration-ink/25 underline-offset-4 transition-colors hover:decoration-ink/70"
        >
          Total {columnTotals.grand} unidades disponibles
        </button>
        <span className="text-xs text-moss/60">Comprometido B2B {columnTotals.committed} · {rows.length} productos · toca Total para ver el detalle por bodega</span>
      </div>

      <div className="hidden md:block">
      {view === "matrix" ? (
        <div className="space-y-6">
          {pageRows.map((p) => {
            const sizes = Array.from(
              new Map(
                p.variants.map((v) => [
                  [v.size, v.quality].filter(Boolean).join(" · ") || "Única",
                  [v.size, v.quality].filter(Boolean).join(" · ") || "Única",
                ]),
              ).keys(),
            );
            const variantsFor = (size: string) =>
              p.variants.filter((v) => ([v.size, v.quality].filter(Boolean).join(" · ") || "Única") === size);
            const cell = (size: string, locId: string) =>
              variantsFor(size).reduce((s, v) => s + stockFor(v, locId), 0);

            return (
              <div key={p.id} className="overflow-x-auto rounded-2xl border border-ink/10 bg-white">
                <div className="flex flex-wrap items-baseline gap-3 border-b border-ink/5 px-5 py-4">
                  <h2 className="font-serif text-[15px]">{p.name}</h2>
                  <span className="font-mono text-[11px] text-ink/50">{p.reference_code ?? "—"}</span>
                  <span className="text-[10px] uppercase tracking-widest text-moss/60">
                    {p.variants.length} variante{p.variants.length === 1 ? "" : "s"}
                  </span>
                </div>
                <table className="w-full min-w-[720px] text-sm">
                  <thead className="text-xs uppercase tracking-widest text-moss/70">
                    <tr>
                      <th className="px-5 py-3 text-left">Bodega</th>
                      {sizes.map((s) => (
                        <th key={s} className="px-2 text-right whitespace-nowrap">{s}</th>
                      ))}
                      <th className="px-5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownLocations.map((l, i) => (
                      <Fragment key={l.id}>
                        <tr className="border-t border-ink/5">
                          <td className="px-5 py-2.5 whitespace-nowrap">{l.name}</td>
                          {sizes.map((s) => {
                            const stock = cell(s, l.id);
                            return (
                              <td key={s} className={"px-2 text-right " + (stock <= 3 ? "text-clay" : "")}>{stock}</td>
                            );
                          })}
                          <td className="px-5 text-right font-serif italic">{productStock(p, l.id)}</td>
                        </tr>
                        {i === 0 && (
                          <tr className="border-t border-ink/5 bg-clay/5">
                            <td className="px-5 py-2.5 whitespace-nowrap text-clay">Comprometido B2B</td>
                            {sizes.map((s) => {
                              const qty = variantsFor(s).reduce((sum, v) => sum + committedForVariant(v.id), 0);
                              return (
                                <td key={s} className="px-2 text-right">
                                  {committedCell(qty, () => setCommittedFor({ productId: p.id, label: p.name }))}
                                </td>
                              );
                            })}
                            <td className="px-5 text-right font-serif italic text-clay">{committedForProduct(p)}</td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                    <tr className="border-t border-ink/10 bg-cream/60 text-xs uppercase tracking-widest">
                      <td className="px-5 py-2.5">Total</td>
                      {sizes.map((s) => (
                        <td key={s} className="px-2 text-right">
                          {shownLocations.reduce((sum, l) => sum + cell(s, l.id), 0)}
                        </td>
                      ))}
                      <td className="px-5 text-right font-serif italic">{productTotal(p)}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="border-t border-ink/5 px-5 py-3 font-mono text-[10px] text-ink/40">
                  {p.variants.map((v) => v.sku).join(" · ")}
                </div>
              </div>
            );
          })}
          {rows.length === 0 && (
            <div className="rounded-2xl border border-ink/10 bg-white px-6 py-10 text-center text-moss/60">Sin resultados.</div>
          )}
        </div>
      ) : (
      <div className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-widest text-moss/70">
            <tr>
              <th className="w-8 pl-4">
                <input type="checkbox" checked={allShownSelected} onChange={toggleAll} className="h-3.5 w-3.5 accent-ink" aria-label="Seleccionar todo" />
              </th>
              <th className="w-8"></th>
              <th className="px-4 py-3 text-left">Pieza</th>

              <th className="text-left">SKU</th>
              {shownLocations.map((l, i) => (
                <Fragment key={l.id}>
                  <th className="px-2 text-right whitespace-nowrap">{l.name}</th>
                  {i === 0 && <th className="px-2 text-right whitespace-nowrap text-clay">Comprometido B2B</th>}
                </Fragment>
              ))}
              <th className="text-right">Total</th>
              <th className="px-4"></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((p) => {
              const isOpen = expanded[p.id];
              const anyOpen = Object.values(expanded).some(Boolean);
              const dimmed = anyOpen && !isOpen;
              return (
                <Fragment key={p.id}>
                  <tr className={`border-t border-ink/5 transition-opacity ${isOpen ? "bg-cream/60" : "hover:bg-cream/40"} ${dimmed ? "opacity-30" : ""}`}>
                    <td className="pl-4">
                      <input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleOne(p.id)} className="h-3.5 w-3.5 accent-ink" aria-label={`Seleccionar ${p.name}`} />
                    </td>
                    <td className="pl-2">

                      <button type="button" onClick={() => setExpanded((c) => ({ ...c, [p.id]: !c[p.id] }))} className="rounded-full p-1 text-ink/60 hover:bg-ink/5">
                        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => setExpanded((c) => ({ ...c, [p.id]: !c[p.id] }))} className="text-left font-serif text-[15px] hover:underline">
                        {p.name}
                      </button>
                      <div className="text-[10px] uppercase tracking-widest text-moss/50">
                        {p.variants.length} variante{p.variants.length === 1 ? "" : "s"}{p.product_type ? ` · ${p.product_type}` : ""}
                      </div>
                    </td>
                    <td className="text-xs text-moss/50">—</td>
                    {shownLocations.map((l, i) => {
                      const stock = productStock(p, l.id);
                      return (
                        <Fragment key={l.id}>
                          <td className={"px-2 text-right " + (stock <= 3 ? "text-clay" : "")}>{stock}</td>
                          {i === 0 && (
                            <td className="px-2 text-right">
                              {committedCell(committedForProduct(p), () => setCommittedFor({ productId: p.id, label: p.name }))}
                            </td>
                          )}
                        </Fragment>
                      );
                    })}
                    <td className="text-right font-serif italic">{productTotal(p)}</td>
                    <td className="px-4">
                      <div className="flex justify-end gap-1">
                        <button type="button" onClick={() => printProductLabels(p)} title="Imprimir códigos de barras" className="rounded-full p-2 text-ink/60 hover:bg-ink/5">
                          <Printer className="h-4 w-4" />
                        </button>
                        <button type="button" onClick={() => setKardexProduct({ id: p.id, name: p.name })} title="Historial / Kardex" className="rounded-full p-2 text-ink/60 hover:bg-ink/5">
                          <History className="h-4 w-4" />
                        </button>

                        <button type="button" onClick={() => openTransfer({ productId: p.id })} title="Solicitar traslado" className="rounded-full p-2 text-ink/60 hover:bg-ink/5">
                          <ArrowLeftRight className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  {isOpen && p.variants.map((v) => (
                    <tr key={v.id} className="border-t border-ink/5 bg-cream/60 text-xs">
                      <td></td>
                      <td></td>

                      <td className="py-2 pl-8 pr-4 text-moss">
                        <span className="inline-flex items-center gap-1.5">
                          {[v.color, v.size].filter(Boolean).join(" · ") || "Único"}
                          <span
                            title="Calidad (se cambia con un ajuste de inventario)"
                            className="rounded-full border border-ink/15 bg-white px-2 py-0.5 text-[10px] font-medium text-ink/70"
                          >
                            {qualityLetter(v.quality)}
                          </span>
                          {fixedLoc && returnedFor(v, fixedLoc.id) > 0 && (
                            <span className="rounded-full bg-clay/15 text-clay px-2 py-0.5 text-[10px]">Devuelto · {returnedFor(v, fixedLoc.id)}</span>
                          )}
                        </span>
                      </td>
                      <td className="font-mono text-[11px] text-ink/70">{v.sku}</td>
                      {shownLocations.map((l, i) => {
                        const stock = stockFor(v, l.id);
                        return (
                          <Fragment key={l.id}>
                            <td className={"px-2 text-right " + (stock <= 3 ? "text-clay" : "")}>{stock}</td>
                            {i === 0 && (
                              <td className="px-2 text-right">
                                {committedCell(committedForVariant(v.id), () => setCommittedFor({ variantId: v.id, label: `${p.name} · ${[v.color, v.size].filter(Boolean).join(" · ") || "Único"}` }))}
                              </td>
                            )}
                          </Fragment>
                        );
                      })}
                      <td className={`text-right ${variantPhysical(v) > 0 && variantTotal(v) === 0 && committedForVariant(v.id) > 0 ? "text-destructive" : ""}`}>{variantTotal(v)}</td>
                      <td className="px-4">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => printLabels([{ code: v.sku, name: p.name, variant: [v.color, v.size, v.quality].filter(Boolean).join(" · ") || null }])}
                            title="Imprimir código de barras"
                            className="rounded-full p-1.5 text-ink/60 hover:bg-ink/5"
                          >
                            <Printer className="h-3.5 w-3.5" />
                          </button>

                          <button type="button" onClick={() => openTransfer({ productId: p.id, variantId: v.id })} title="Trasladar esta variante" className="rounded-full p-1.5 text-ink/60 hover:bg-ink/5">
                            <ArrowLeftRight className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
            {rows.length === 0 && (
              <tr><td colSpan={4 + shownLocations.length} className="px-6 py-10 text-center text-moss/60">Sin resultados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      )}
      </div>

      <div className="space-y-2 md:hidden">
        {pageRows.map((p) => {
          const committed = committedForProduct(p);
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setMobileProductId(p.id)}
              className="block w-full min-w-0 rounded-2xl border border-ink/10 bg-white px-4 py-3 text-left active:bg-cream/60"
            >
              <div className="truncate font-serif text-[15px]">{p.name}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-moss/70">
                <span>Stock <span className="font-medium text-ink">{productTotal(p)}</span></span>
                {committed > 0 && <span className="text-clay">B2B {committed}</span>}
                <span>{p.variants.length} variante{p.variants.length === 1 ? "" : "s"}</span>
                {p.reference_code && <span className="font-mono">{p.reference_code}</span>}
              </div>
            </button>
          );
        })}
        {rows.length === 0 && (
          <div className="rounded-2xl border border-ink/10 bg-white px-6 py-10 text-center text-moss/60">Sin resultados.</div>
        )}
      </div>

      {mobileProduct && (() => {
        const p = mobileProduct;
        const label = (v: (typeof p.variants)[number]) => [v.size, v.quality].filter(Boolean).join(" · ") || "Única";
        const sizes: string[] = Array.from(new Set<string>(p.variants.map((v) => label(v))));
        const vs = (s: string) => p.variants.filter((v) => label(v) === s);
        const cell = (s: string, locId: string) => vs(s).reduce((sum, v) => sum + stockFor(v, locId), 0);
        return (
          <div className="fixed inset-0 z-[120] flex items-end justify-center bg-ink/40 md:hidden" onClick={() => setMobileProductId(null)}>
            <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-ivory p-5" onClick={(e) => e.stopPropagation()}>
              <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-serif text-xl">{p.name}</h2>
                  <div className="text-[11px] text-moss/70">Stock total {productTotal(p)}{p.reference_code ? ` · ${p.reference_code}` : ""}</div>
                </div>
                <button type="button" onClick={() => setMobileProductId(null)} className="rounded-full border border-ink/10 bg-white px-3 py-1 text-xs">Cerrar</button>
              </div>
              <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white">
                <table className="w-full text-xs">
                  <thead className="uppercase tracking-widest text-moss/70">
                    <tr>
                      <th className="sticky left-0 bg-white px-3 py-2 text-left">Bodega</th>
                      {sizes.map((s) => <th key={s} className="px-2 text-right whitespace-nowrap">{s}</th>)}
                      <th className="px-3 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shownLocations.map((l, i) => (
                      <Fragment key={l.id}>
                        <tr className="border-t border-ink/5">
                          <td className="sticky left-0 bg-white px-3 py-2 whitespace-nowrap">{l.name}</td>
                          {sizes.map((s) => {
                            const st = cell(s, l.id);
                            return <td key={s} className={"px-2 text-right " + (st <= 3 ? "text-clay" : "")}>{st}</td>;
                          })}
                          <td className="px-3 text-right font-serif italic">{productStock(p, l.id)}</td>
                        </tr>
                        {i === 0 && committedForProduct(p) > 0 && (
                          <tr className="border-t border-ink/5 bg-clay/5">
                            <td className="sticky left-0 bg-ivory px-3 py-2 whitespace-nowrap text-clay">Comprometido B2B</td>
                            {sizes.map((s) => (
                              <td key={s} className="px-2 text-right">
                                {committedCell(vs(s).reduce((sum, v) => sum + committedForVariant(v.id), 0), () => setCommittedFor({ productId: p.id, label: p.name }))}
                              </td>
                            ))}
                            <td className="px-3 text-right text-clay">{committedForProduct(p)}</td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                    <tr className="border-t border-ink/10 bg-cream/60 uppercase tracking-widest">
                      <td className="sticky left-0 bg-cream px-3 py-2">Total</td>
                      {sizes.map((s) => <td key={s} className="px-2 text-right">{shownLocations.reduce((sum, l) => sum + cell(s, l.id), 0)}</td>)}
                      <td className="px-3 text-right font-serif italic">{productTotal(p)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <button type="button" onClick={() => { setMobileProductId(null); setKardexProduct({ id: p.id, name: p.name }); }} className="inline-flex items-center justify-center gap-1.5 rounded-full border border-ink/10 bg-white py-2"><History className="h-3.5 w-3.5" /> Kardex</button>
                <button type="button" onClick={() => printProductLabels(p)} className="inline-flex items-center justify-center gap-1.5 rounded-full border border-ink/10 bg-white py-2"><Printer className="h-3.5 w-3.5" /> Códigos</button>
                <button type="button" onClick={() => { setMobileProductId(null); openTransfer({ productId: p.id }); }} className="inline-flex items-center justify-center gap-1.5 rounded-full border border-ink/10 bg-white py-2"><ArrowLeftRight className="h-3.5 w-3.5" /> Traslado</button>
              </div>
            </div>
          </div>
        );
      })()}

      {rows.length > PAGE_SIZE && (
        <div className="mt-5 flex items-center justify-between text-xs text-ink/60">
          <span>{safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, rows.length)} de {rows.length} productos</span>
          <div className="flex items-center gap-2">
            <button disabled={safePage === 0} onClick={() => setPage(safePage - 1)} className="rounded-full border border-ink/10 bg-white px-4 py-1.5 disabled:opacity-40">Anterior</button>
            <span>Página {safePage + 1} de {pageCount}</span>
            <button disabled={safePage >= pageCount - 1} onClick={() => setPage(safePage + 1)} className="rounded-full border border-ink/10 bg-white px-4 py-1.5 disabled:opacity-40">Siguiente</button>
          </div>
        </div>
      )}

      {selected.length > 0 && view === "tree" && (
        <div className="fixed bottom-3 left-1/2 z-[100] -translate-x-1/2 rounded-full bg-ink px-4 py-2.5 text-[11px] text-ivory shadow-2xl">
          <div className="flex items-center gap-3">
            <span>{selected.length} seleccionado{selected.length === 1 ? "" : "s"}</span>
            <button onClick={() => setSelected([])} className="text-ivory/60 underline">limpiar</button>
            <span className="h-3.5 w-px bg-ivory/25" />
            <button onClick={() => printLabels(labelsFor(selectedRows))} className="inline-flex items-center gap-1.5 hover:text-ivory/80">
              <Printer className="h-3.5 w-3.5" /> Imprimir etiquetas
            </button>
            <span className="h-3.5 w-px bg-ivory/25" />
            <button onClick={() => exportLabels(selectedRows)} className="inline-flex items-center gap-1.5 hover:text-ivory/80">
              <Download className="h-3.5 w-3.5" /> Etiquetas en Excel
            </button>
            <span className="h-3.5 w-px bg-ivory/25" />
            <button onClick={() => setBulkOpen(true)} className="hover:text-ivory/80">Edición masiva</button>
            <span className="h-3.5 w-px bg-ivory/25" />
            <button onClick={() => openTransfer()} className="hover:text-ivory/80">Traslado</button>
          </div>
        </div>
      )}

      {bulkOpen && (
        <BulkStockModal
          products={selectedRows.map((p) => ({ id: p.id, name: p.name, variants: p.variants.map((v) => ({ id: v.id, sku: v.sku, size: v.size, color: v.color })) }))}
          locations={adjustLocations}
          onClose={() => setBulkOpen(false)}
        />
      )}

      {importPreview && (
        <InventoryImportPreview plan={importPreview.plan} fileName={importPreview.fileName} locationName={importPreview.locationName} running={importing} progress={importProgress} onConfirm={confirmImport} onClose={() => setImportPreview(null)} />
      )}

      {pendingImport && createPortal(
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 p-4" onClick={() => setPendingImport(null)}>
          <div className="w-full max-w-md rounded-3xl bg-ivory p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-moss/70">Subir inventario</p>
            <h2 className="font-serif text-2xl text-ink">¿A qué bodega se carga este inventario?</h2>
            <p className="mt-1 truncate text-xs text-ink/60">{pendingImport.name}</p>
            <select value={importLocId} onChange={(e) => setImportLocId(e.target.value)} disabled={!!fixedLoc} aria-label="Bodega" className="mt-4 w-full rounded-full border border-ink/15 bg-ivory px-4 py-2 text-sm">
              <option value="">Elige una bodega…</option>
              {(locations ?? []).filter((l) => l.kind !== "wholesale").map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            <p className="mt-3 text-xs text-ink/60">Se lee la columna «Stock», «Cantidad» o «Stock + nombre de la bodega». Las columnas de otras bodegas no se tocan. Cada cambio queda como ajuste en el kardex y se envía a R-Count.</p>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setPendingImport(null)} className="rounded-full border border-ink/15 px-4 py-2 text-sm">Cancelar</button>
              <button disabled={!importLocId} onClick={() => importExcel(pendingImport, importLocId)} className="rounded-full bg-ink px-5 py-2 text-sm text-ivory disabled:opacity-50">Revisar archivo</button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {recoOpen && <RecommendationModal onClose={() => setRecoOpen(false)} />}

      {totalsOpen && (
        <TotalsModal
          byLocation={columnTotals.byLocation}
          committed={columnTotals.committed}
          grand={columnTotals.grand}
          physical={columnTotals.physical}
          productCount={rows.length}
          onClose={() => setTotalsOpen(false)}
        />
      )}

      {kardexProduct && (
        <KardexModal productId={kardexProduct.id} productName={kardexProduct.name} locations={locations ?? []} onClose={() => setKardexProduct(null)} />
      )}

      {transfer && (
        <TransferModal
          products={(products ?? [])
            .map((p) => ({ id: p.id, name: p.name, reference_code: p.reference_code, variants: (p.product_variants ?? []).filter((v) => v.active) }))
            .filter((p) => p.variants.length > 0)}
          locations={locations ?? []}
          initialProductId={transfer.productId}
          initialVariantId={transfer.variantId}
          onClose={() => setTransfer(null)}
        />
      )}

      {committedFor && (
        <CommittedModal
          variantId={committedFor.variantId}
          productId={committedFor.productId}
          label={committedFor.label}
          onClose={() => setCommittedFor(null)}
          onOpenOrder={(orderId) => { setCommittedFor(null); setDispatchOrder(orderId); }}
        />
      )}

      {dispatchOrder && (
        <DispatchModal orderId={dispatchOrder} onClose={() => setDispatchOrder(null)} />
      )}

    </div>
  );
}

/** Modal Total: unidades y porcentaje del stock por bodega, con un análisis sencillo de concentración. */
function TotalsModal({ byLocation, committed, grand, physical, productCount, onClose }: {
  physical: number;
  byLocation: { id: string; name: string; total: number }[];
  committed: number;
  grand: number;
  productCount: number;
  onClose: () => void;
}) {
  const pct = (n: number) => (physical > 0 ? Math.round((n / physical) * 1000) / 10 : 0);
  const rows = byLocation.map((l) => ({ ...l, share: pct(l.total) }));
  const sorted = [...rows].sort((a, b) => b.share - a.share);
  const top = sorted[0];
  const committedShare = pct(committed);
  const insights: { tone: "warn" | "info"; text: string }[] = [];
  if (top && rows.length > 1 && top.share > 60) {
    insights.push({ tone: "warn", text: `El ${top.share}% del stock está concentrado en ${top.name}. Si esa bodega se queda sin operar, casi todo el inventario queda detenido — conviene repartir o tener un plan alterno.` });
  }
  if (committedShare > 25) {
    insights.push({ tone: "warn", text: `El Comprometido B2B ya es el ${committedShare}% del total de unidades. Revisa que los envíos mayoristas no dejen sin stock a la tienda.` });
  }
  const empty = rows.filter((r) => r.total === 0);
  if (empty.length) {
    insights.push({ tone: "info", text: `${empty.length} ${empty.length === 1 ? "bodega está" : "bodegas están"} sin unidades: ${empty.map((e) => e.name).join(", ")}.` });
  }
  if (!insights.length) {
    insights.push({ tone: "info", text: "El stock está repartido de forma equilibrada; no hay una concentración excesiva en una sola bodega." });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-6" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-ink/10 px-6 py-5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-clay">Inventario</p>
            <h2 className="mt-1 font-serif text-2xl">Total</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-ink/5" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="mb-5 grid grid-cols-3 gap-3 text-center">
            <div className="rounded-2xl border border-ink/10 px-3 py-3">
              <div className="text-[10px] uppercase tracking-widest text-moss/60">Productos</div>
              <div className="font-serif text-xl">{productCount}</div>
            </div>
            <div className="rounded-2xl border border-ink/10 px-3 py-3">
              <div className="text-[10px] uppercase tracking-widest text-moss/60">Disponible</div>
              <div className="font-serif text-xl italic">{grand}</div>
              <div className="text-[10px] text-moss/60">{physical} en bodegas − {committed}</div>
            </div>
            <div className="rounded-2xl border border-ink/10 px-3 py-3">
              <div className="text-[10px] uppercase tracking-widest text-clay">Comprometido B2B</div>
              <div className="font-serif text-xl text-clay">{committed} <span className="text-xs not-italic">({committedShare}%)</span></div>
            </div>
          </div>

          <h3 className="mb-2 text-[10px] uppercase tracking-widest text-moss/60">Unidades por bodega</h3>
          <div className="space-y-3">
            {sorted.map((l) => (
              <div key={l.id}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span>{l.name}</span>
                  <span className="text-ink/60">{l.total} unidades · {l.share}%</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-ink/10">
                  <div className="h-full rounded-full bg-ink" style={{ width: `${Math.min(l.share, 100)}%` }} />
                </div>
              </div>
            ))}
            <div>
              <div className="mb-1 flex items-baseline justify-between text-sm">
                <span className="text-clay">Comprometido B2B</span>
                <span className="text-ink/60">{committed} unidades · {committedShare}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-ink/10">
                <div className="h-full rounded-full bg-clay" style={{ width: `${Math.min(committedShare, 100)}%` }} />
              </div>
            </div>
          </div>

          <h3 className="mb-2 mt-6 text-[10px] uppercase tracking-widest text-moss/60">Análisis de distribución</h3>
          <div className="space-y-2">
            {insights.map((i, idx) => (
              <div key={idx} className="flex items-start gap-2 rounded-2xl border border-ink/10 p-3 text-sm">
                {i.tone === "warn" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-clay" /> : <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-moss/70" />}
                <span>{i.text}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-moss/60">Los totales siguen los filtros que tengas activos (búsqueda, colección, bodega, calidad).</p>
        </div>
      </div>
    </div>
  );
}

/** Lista los pedidos B2B que tienen comprometida una prenda/talla en Bodega Central. */
function CommittedModal({ variantId, productId, label, onClose, onOpenOrder }: {
  variantId?: string;
  productId?: string;
  label: string;
  onClose: () => void;
  onOpenOrder: (orderId: string) => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["committed-detail", variantId ?? productId],
    queryFn: async () => {
      let variantIds: string[] = [];
      if (variantId) {
        variantIds = [variantId];
      } else if (productId) {
        const { data: vs } = await supabase.from("product_variants").select("id").eq("product_id", productId);
        variantIds = (vs ?? []).map((v) => v.id);
      }
      if (!variantIds.length) return [];
      return fetchAll((from, to) =>
        supabase
          .from("preventa_allocations")
          .select("id, qty, variant_id, order_id, orders(number, contact_name, status, created_at), product_variants(sku, size, color)")
          .eq("status", "pending")
          .in("variant_id", variantIds)
          .order("created_at")
          .order("id")
          .range(from, to),
      );
    },
  });

  const byOrder = useMemo(() => {
    const m = new Map<string, { orderId: string; number: string; client: string; items: { sku: string; size: string; qty: number }[]; total: number }>();
    (data ?? []).forEach((a: any) => {
      const cur = m.get(a.order_id) ?? {
        orderId: a.order_id,
        number: a.orders?.number ?? "—",
        client: a.orders?.contact_name ?? "Cliente B2B",
        items: [] as { sku: string; size: string; qty: number }[],
        total: 0,
      };
      cur.items.push({ sku: a.product_variants?.sku ?? "", size: [a.product_variants?.color, a.product_variants?.size].filter(Boolean).join(" · ") || "Única", qty: a.qty });
      cur.total += a.qty;
      m.set(a.order_id, cur);
    });
    return Array.from(m.values());
  }, [data]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-6" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-ink/10 px-6 py-5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-clay">Comprometido B2B</p>
            <h2 className="mt-1 font-serif text-2xl">{label}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-ink/5" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <p className="py-10 text-center text-sm text-moss/60">Cargando pedidos…</p>
          ) : byOrder.length === 0 ? (
            <p className="py-10 text-center text-sm text-moss/60">No hay pedidos comprometidos.</p>
          ) : (
            <div className="space-y-3">
              {byOrder.map((o) => (
                <div key={o.orderId} className="rounded-2xl border border-ink/10 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{o.client}</p>
                      <p className="font-mono text-[11px] text-ink/50">Pedido {o.number} · {o.total} unidades</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenOrder(o.orderId)}
                      className="rounded-full bg-ink px-4 py-1.5 text-xs text-ivory hover:bg-ink/85"
                    >
                      Abrir pedido para empaque
                    </button>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {o.items.map((it, i) => (
                      <span key={i} className="rounded-full bg-cream px-2.5 py-1 text-[11px] text-ink/70">
                        {it.size} × {it.qty}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Resumen de empaque y despacho directo desde Bodega Central + lista de empaque imprimible. */
function DispatchModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: order, isLoading } = useQuery({
    queryKey: ["dispatch-order", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("*, order_items(id, qty, product_name, variant_label, unit_price_cop, product_variants(sku))")
        .eq("id", orderId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const dispatch = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase.rpc as any)("dispatch_b2b_shipment", { _order_id: orderId, _carrier: carrier.trim(), _tracking: tracking.trim(), _note: "" });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Pedido despachado: se descontó de Bodega Central y se cerró el compromiso");
      qc.invalidateQueries({ queryKey: ["b2b-committed"] });
      qc.invalidateQueries({ queryKey: ["inventory-tree"] });
      qc.invalidateQueries({ queryKey: ["preventa-pending"] });
      if (order) printOrderDocument(order, "delivery");
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error al despachar"),
  });

  const items = (order?.order_items ?? []) as any[];
  const totalUnits = items.reduce((s, it) => s + (it.qty ?? 0), 0);
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const alreadyShipped = order?.status === "shipped" || order?.status === "delivered";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/45 p-6" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-ink/10 px-6 py-5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-moss/70">Empaque y despacho</p>
            <h2 className="mt-1 font-serif text-2xl">Pedido {order?.number ?? ""}</h2>
            <p className="mt-0.5 text-xs text-moss">{order?.contact_name} · {totalUnits} unidades</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-ink/5" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {isLoading ? (
            <p className="py-10 text-center text-sm text-moss/60">Cargando pedido…</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-widest text-moss/70">
                <tr>
                  <th className="py-2 text-left">Referencia</th>
                  <th className="text-left">SKU</th>
                  <th className="text-right">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t border-ink/5">
                    <td className="py-2.5">
                      <span className="font-medium">{it.product_name}</span>
                      {it.variant_label && <span className="block text-[11px] text-moss/70">{it.variant_label}</span>}
                    </td>
                    <td className="font-mono text-[11px] text-ink/60">{it.product_variants?.sku ?? "—"}</td>
                    <td className="text-right">{it.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <footer className="flex items-center justify-between gap-3 border-t border-ink/10 px-6 py-4">
          <button
            type="button"
            onClick={() => order && printOrderDocument(order, "delivery")}
            className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-5 py-2.5 text-sm hover:bg-ink/5"
          >
            <Printer className="h-4 w-4" /> Lista de empaque
          </button>
          {alreadyShipped ? (
            <span className="text-sm text-moss">Este pedido ya fue despachado.</span>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
            {order?.status === "preparing" && <><input aria-label="Transportadora" placeholder="Transportadora" value={carrier} onChange={(e) => setCarrier(e.target.value)} className="w-36 border border-ink/15 px-2 py-2 text-xs" /><input aria-label="Número de guía" placeholder="Número de guía" value={tracking} onChange={(e) => setTracking(e.target.value)} className="w-36 border border-ink/15 px-2 py-2 text-xs" /></>}
            <button
              type="button"
              disabled={dispatch.isPending || isLoading || order?.status !== "preparing" || !carrier.trim() || !tracking.trim()}
              onClick={() => dispatch.mutate()}
              className="rounded-full bg-ink px-6 py-2.5 text-sm text-ivory hover:bg-ink/85 disabled:opacity-40"
            >
              {dispatch.isPending ? "Despachando…" : "Generar guía y despachar"}
            </button>
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}

type BulkProduct = { id: string; name: string; variants: { id: string; sku: string; size: string | null; color: string | null }[] };

function BulkStockModal({ products, locations, onClose }: { products: BulkProduct[]; locations: { id: string; name: string }[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [mode, setMode] = useState<"add" | "set">("add");
  const [qty, setQty] = useState(0);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const sendRCount = useServerFn(sendRCountAdjustment);
  const variantIds = products.flatMap((p) => p.variants.map((v) => v.id));

  const apply = async () => {
    if (!locationId) return toast.error("Elige una bodega.");
    if (mode === "add" && qty === 0) return toast.error("Indica una cantidad distinta de cero.");
    setSaving(true);
    try {
      if (mode === "add") {
        const { error } = await supabase.rpc("create_intake", {
          _location_id: locationId,
          _items: variantIds.map((id) => ({ variant_id: id, qty })),
          _note: note || "ajuste masivo de inventario",
        });
        if (error) throw error;
        const r = await sendRCount({ data: { kind: "ajuste", reason: note || "Ajuste masivo de inventario", items: variantIds.map((id) => ({ variant_id: id, qty })), location_id: locationId } });
        if (!r.ok) toast.error(r.message);
      } else {
        const { error } = await supabase
          .from("inventory_levels")
          .upsert(
            variantIds.map((id) => ({ variant_id: id, location_id: locationId, on_hand: qty })),
            { onConflict: "variant_id,location_id" },
          );
        if (error) throw error;
        await supabase.from("inventory_movements").insert(
          variantIds.map((id) => ({
            variant_id: id,
            location_id: locationId,
            kind: "count" as const,
            qty,
            ref_type: "bulk_edit",
            note: note || "conteo masivo",
          })),
        );
      }
      await qc.invalidateQueries({ queryKey: ["inventory-tree"] });
      toast.success(`Inventario actualizado en ${variantIds.length} variantes.`);
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar el inventario.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/45 p-6" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-ink/10 px-6 py-5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-moss/70">Edición masiva</p>
            <h2 className="mt-1 font-serif text-2xl">{products.length} producto{products.length === 1 ? "" : "s"}</h2>
            <p className="mt-1 text-xs text-moss/70">{variantIds.length} variantes se verán afectadas.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-ink/5" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5 text-sm">
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-moss/70">Bodega</span>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="mt-1 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5">
              {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <div className="flex rounded-full border border-ink/10 bg-cream p-1 text-xs">
            {(["add", "set"] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={"flex-1 rounded-full px-3 py-2 " + (mode === m ? "bg-ink text-ivory" : "text-ink/60")}>
                {m === "add" ? "Sumar / restar" : "Fijar cantidad"}
              </button>
            ))}
          </div>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-moss/70">Cantidad por variante</span>
            <input type="number" value={qty} onChange={(e) => setQty(Number(e.target.value))} className="mt-1 w-full rounded-xl border border-ink/10 px-3 py-2.5" />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase tracking-widest text-moss/70">Nota</span>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. conteo físico septiembre" className="mt-1 w-full rounded-xl border border-ink/10 px-3 py-2.5" />
          </label>
          <div className="max-h-40 overflow-y-auto rounded-xl border border-ink/10 bg-cream/50 px-3 py-2 text-xs text-moss">
            {products.map((p) => <div key={p.id}>{p.name} · {p.variants.length} var.</div>)}
          </div>
        </div>
        <footer className="flex justify-end gap-2 border-t border-ink/10 px-6 py-4">
          <button onClick={onClose} className="rounded-full border border-ink/15 px-5 py-2.5 text-sm">Cancelar</button>
          <button onClick={apply} disabled={saving} className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm text-ivory disabled:opacity-50">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Aplicar
          </button>
        </footer>
      </div>
    </div>
  );
}

function RecommendationModal({ onClose }: { onClose: () => void }) {
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["inventory-reco"],
    queryFn: () => inventoryRecommendation(),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const icon = (kind: InventoryInsight["kind"]) =>
    kind === "problema" ? <AlertTriangle className="h-4 w-4 text-clay" /> : kind === "oportunidad" ? <TrendingUp className="h-4 w-4 text-moss" /> : <Lightbulb className="h-4 w-4 text-ink/60" />;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-ink/45 p-6" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-ink/10 px-6 py-5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-moss/70">Análisis</p>
            <h2 className="mt-1 font-serif italic text-2xl">Recomendación de inventario</h2>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => refetch()} disabled={isFetching} className="rounded-full border border-ink/15 px-3 py-1.5 text-xs disabled:opacity-50">
              Actualizar
            </button>
            <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-ink/5" aria-label="Cerrar">
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {isLoading || isFetching ? (
            <div className="flex flex-col items-center gap-3 py-14 text-sm text-moss/70">
              <Loader2 className="h-5 w-5 animate-spin" />
              Analizando stock, ventas y bodegas…
            </div>
          ) : error ? (
            <p className="py-10 text-center text-sm text-clay">{error instanceof Error ? error.message : "No se pudo generar el análisis."}</p>
          ) : (
            <div className="space-y-4">
              {data?.summary && <p className="font-serif text-lg leading-snug">{data.summary}</p>}
              {(data?.insights ?? []).map((it, i) => (
                <div key={i} className="rounded-2xl border border-ink/10 bg-cream/40 px-5 py-4">
                  <div className="flex items-center gap-2">
                    {icon(it.kind)}
                    <span className="text-[10px] uppercase tracking-widest text-moss/70">{it.kind}</span>
                  </div>
                  <h3 className="mt-1.5 font-serif text-[17px]">{it.title}</h3>
                  <p className="mt-1 text-sm text-moss">{it.detail}</p>
                  <p className="mt-2 text-sm"><span className="text-[10px] uppercase tracking-widest text-moss/70">Acción · </span>{it.action}</p>
                </div>
              ))}
              {(data?.insights ?? []).length === 0 && !data?.summary && (
                <p className="py-10 text-center text-sm text-moss/60">Sin recomendaciones por ahora.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Calidad A si no tiene calidad o termina en "a"; B/C según la letra final
function qualityLetter(q: string | null | undefined): string {
  const t = (q ?? "").trim().toLowerCase();
  if (!t) return "A";
  return t.slice(-1).toUpperCase();
}
