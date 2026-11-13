import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Ban, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { usePaged } from "@/components/ui/use-paged";
import { TransferDiscrepancies } from "@/components/admin/transfer-discrepancies";
import type { Database } from "@/integrations/supabase/types";
import { SEDES } from "./route";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { scannedCodeFilter } from "@/lib/scanned-code";
import { addTransferScan } from "@/lib/transfer-scan";

type TransferStatus = Database["public"]["Enums"]["transfer_status"];

export const Route = createFileRoute("/_authenticated/pos/$sede/traslados")({
  head: () => ({ meta: [
    { title: "Traslados de tienda · Tu Marca" },
    { name: "description", content: "Solicitud y recepción de prendas entre bodegas y tiendas Tu Marca." },
    { property: "og:title", content: "Traslados de tienda · Tu Marca" },
    { property: "og:description", content: "Solicitud y recepción de prendas entre bodegas y tiendas Tu Marca." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: SedeTraslados,
});

const TABS: { id: TransferStatus | "all"; label: string }[] = [
  { id: "requested", label: "Solicitados" },
  { id: "in_transit", label: "En tránsito" },
  { id: "received", label: "Recibidos" },
  { id: "ajustes" as never, label: "Ajustes" },
  { id: "all", label: "Todos" },
];

type Row = { variantId: string; qty: number; sku: string; name: string };

function SedeTraslados() {
  const { sede } = useParams({ from: "/_authenticated/pos/$sede/traslados" });
  return <TrasladosPanel info={SEDES[sede as keyof typeof SEDES]} />;
}

export function TrasladosPanel({ info }: { info: { code: string; label: string } }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TransferStatus | "all">("all");
  const [showNew, setShowNew] = useState(false);
  const [origin, setOrigin] = useState<string>("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState(1);

  const { data: locs } = useQuery({
    queryKey: ["locations-all"],
    queryFn: async () => (await supabase.from("locations").select("id, code, name").eq("active", true).order("priority")).data ?? [],
  });

  const sedeLoc = useMemo(() => locs?.find((l) => l.code === info.code), [locs, info.code]);

  const { data: transfersAll } = useQuery({
    queryKey: ["sede-transfers", sedeLoc?.id],
    enabled: !!sedeLoc?.id,
    queryFn: async () => {
      return await fetchAll((from, to) => supabase
        .from("transfers")
        .select("id, transfer_number, status, note, carrier, tracking, created_at, from_location_id, to_location_id, order_id, transfer_items(variant_id, qty, product_variants(sku, barcode, size, products(name)))")
        .or(`from_location_id.eq.${sedeLoc!.id},to_location_id.eq.${sedeLoc!.id}`)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to));
    },
  });

  // «Solicitado» es solo lo que la tienda pide (saliente). Lo que le envían
  // (entrante) se muestra como «En tránsito» aunque el origen no haya marcado despacho.
  const transfers = useMemo(() => {
    const list = transfersAll ?? [];
    const isIncoming = (t: (typeof list)[number]) => t.to_location_id === sedeLoc?.id;
    switch (tab) {
      case "all": return list;
      case "requested": return list.filter((t) => !isIncoming(t) && ["requested", "approved"].includes(t.status));
      case "in_transit": return list.filter((t) => (isIncoming(t) && ["requested", "approved", "in_transit"].includes(t.status)) || (!isIncoming(t) && t.status === "in_transit"));
      case "received": return list.filter((t) => t.status === "received");
      default: return list;
    }
  }, [transfersAll, tab, sedeLoc?.id]);

  const { pageItems: transfersPage, pager: transfersPager } = usePaged((transfers ?? []) as any[]);

  const [receiving, setReceiving] = useState<string | null>(null);
  const [recvQty, setRecvQty] = useState<Record<string, number>>({});
  const [recvNote, setRecvNote] = useState("");
  const [scanCode, setScanCode] = useState("");
  const [extras, setExtras] = useState<Record<string, { qty: number; sku: string; name: string }>>({});
  // Sin escáner por ahora: la recepción arranca con lo enviado y se edita a mano.
  const scanRequired = false;
  const [recvPage, setRecvPage] = useState(0);
  const [openItems, setOpenItems] = useState<string | null>(null);
  const [itemsPage, setItemsPage] = useState(0);
  const PAGE = 25;

  const openReceiving = (t: { id: string; transfer_items: { variant_id: string; qty: number }[] }) => {
    setReceiving(t.id);
    setRecvPage(0);
    setRecvNote("");
    setScanCode("");
    setExtras({});
    // POS: todo arranca en 0 y se va marcando con la pistola. Ecommerce: arranca con lo enviado.
    // Todo arranca en 0 y suma con cada escaneo; «Recibir todo completo» llena lo enviado.
    const zero: Record<string, number> = {};
    for (const i of t.transfer_items) zero[i.variant_id] = 0;
    setRecvQty(zero);
  };

  const scanItem = (t: { transfer_items: { variant_id: string; qty: number; product_variants: { sku: string | null; barcode: string | null; products: { name: string } | null } | null }[] }) => {
    // Lectores configurados en otra distribución de teclado (p. ej. inglés en un Mac en español)
    // escriben el guion como ' ? ¿ / _ o – y pueden enviar minúsculas: normalizamos antes de buscar.
    const code = scanCode.trim().toUpperCase().replace(/['?¿\/_´`‐‑–—]/g, "-").replace(/\s+/g, "");
    if (!code) return;
    const norm = (v: string | null | undefined) => (v ?? "").trim().toUpperCase();
    const item = t.transfer_items.find((i) => norm(i.product_variants?.sku) === code || norm(i.product_variants?.barcode) === code);
    if (!item) {
      setScanCode("");
      void (async () => {
        const { data: v } = await supabase.from("product_variants").select("id, sku, products(name)").or(`sku.ilike.${code.replace(/[,()%*]/g, "")},barcode.ilike.${code.replace(/[,()%*]/g, "")}`).limit(1).maybeSingle();
        if (!v) { toast.error(`«${scanCode.trim()}» no existe en el catálogo`); return; }
        setExtras((p) => ({ ...p, [v.id]: { qty: (p[v.id]?.qty ?? 0) + 1, sku: v.sku, name: (v.products as any)?.name ?? "" } }));
        toast.warning(`${v.sku} no estaba en el traslado: queda como ajuste`);
      })();
      return;
    }
    const current = recvQty[item.variant_id] ?? 0;
    setRecvQty((p) => ({ ...p, [item.variant_id]: current + 1 }));
    toast.success(`+1 ${item.product_variants?.sku ?? code}`);
    setScanCode("");
  };
  const receive = useMutation({
    mutationFn: async (t: { id: string; transfer_items: { variant_id: string; qty: number }[] }) => {
      const items = t.transfer_items.map((i) => ({ variant_id: i.variant_id, qty: recvQty[i.variant_id] ?? 0 }));
      const extraList = Object.entries(extras).map(([variant_id, e]) => ({ variant_id, qty: e.qty }));
      const diff = extraList.length > 0 || t.transfer_items.some((i) => (recvQty[i.variant_id] ?? 0) !== i.qty);
      if (diff && !recvNote.trim()) throw new Error("Explica el ajuste en la nota antes de confirmar");
      const { error } = await supabase.rpc("receive_transfer" as never, {
        _transfer_id: t.id, _received_items: items, _note: recvNote.trim() || null, _extra_items: extraList.length ? extraList : null,
      } as never);
      if (error) throw new Error(error.message);
      return diff;
    },
    onSuccess: (diff) => {
      toast.success(diff ? "Se ingresó lo que llegó bien; el ajuste se notificó a la bodega de origen" : "Mercancía recibida e ingresada al inventario");
      setReceiving(null); setRecvQty({}); setRecvNote(""); setExtras({});
      qc.invalidateQueries({ queryKey: ["sede-transfers"] });
      qc.invalidateQueries({ queryKey: ["incoming-transfers-count"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  const locName = (id: string | null) => locs?.find((l) => l.id === id)?.name ?? "—";

  const [editing, setEditing] = useState<any>(null);

  const cancelTransfer = async (t: any) => {
    const label = t.transfer_number ? `TR-${t.transfer_number}` : t.id.slice(0, 8);
    if (!window.confirm(`¿Cancelar el traslado ${label}? Las unidades vuelven a quedar disponibles en ${locName(t.from_location_id)}.`)) return;
    const reason = window.prompt("Motivo de la cancelación (opcional):") ?? undefined;
    const { error } = await supabase.rpc("cancel_transfer" as never, { _transfer_id: t.id, _reason: reason?.trim() || null } as never);
    if (error) { toast.error(error.message); return; }
    toast.success("Traslado cancelado");
    qc.invalidateQueries({ queryKey: ["sede-transfers"] });
    qc.invalidateQueries({ queryKey: ["incoming-transfers-count"] });
  };

  const addRow = async (code = sku, units = qty) => {
    if (!code.trim() || units <= 0) return;
    if (!origin) { toast.error("Selecciona primero la bodega origen"); return; }
    const { data, error } = await supabase
      .from("product_variants")
      .select("id, sku, products(name)")
      .or(scannedCodeFilter(code))
      .maybeSingle();
    if (error || !data) { toast.error(`Código no encontrado: ${code}`); return; }
    setRows((prev) => addTransferScan(prev, { variantId: data.id, qty: units, sku: data.sku, name: data.products?.name ?? "" }));
    toast.success(`+${units} ${data.sku}`);
    setSku(""); setQty(1);
  };
  const scanQueue = useRef(Promise.resolve());
  useBarcodeScanner((code) => {
    const currentAdd = addRow;
    scanQueue.current = scanQueue.current.then(() => currentAdd(code, 1)).catch(() => { toast.error("No se pudo cargar el código; vuelve a escanearlo"); });
  }, { enabled: showNew });

  const create = useMutation({
    mutationFn: async () => {
      if (!origin || !sedeLoc || rows.length === 0) throw new Error("Selecciona origen y agrega piezas");
      const { error } = await supabase.rpc("request_transfer", {
        _from_location_id: origin,
        _to_location_id: sedeLoc.id,
        _items: rows.map((r) => ({ variant_id: r.variantId, qty: r.qty })),
        _note: note || undefined,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Traslado solicitado");
      setShowNew(false); setRows([]); setOrigin(""); setNote("");
      qc.invalidateQueries({ queryKey: ["sede-transfers"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  return (
    <div className="p-10">
      <header className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-moss/70">Operación · {info.label}</p>
          <h1 className="font-serif italic text-4xl mt-1">Traslados</h1>
          <p className="text-sm text-moss mt-2 max-w-xl">Traslados entrantes y salientes de {info.label}. Lo que te envían aparece «En tránsito» hasta que lo recibes; lo que pides aparece «Solicitado».</p>
        </div>
        <button onClick={() => setShowNew((v) => !v)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-ink text-ivory text-sm font-medium hover:bg-ink/85">
          <Plus className="size-4" /> Solicitar traslado
        </button>
      </header>

      {showNew && (
        <div className="rounded-2xl bg-white border border-ink/10 p-6 mb-6 space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs uppercase tracking-widest text-moss/70">Origen</label>
              <select value={origin} onChange={(e) => setOrigin(e.target.value)} className="mt-1 w-full px-4 py-2.5 rounded-full border border-ink/15 bg-ivory/60 text-sm">
                <option value="">Selecciona origen…</option>
                {locs?.filter((l) => l.id !== sedeLoc?.id).map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-widest text-moss/70">Destino</label>
              <div className="mt-1 px-4 py-2.5 rounded-full border border-ink/10 bg-ivory/40 text-sm text-ink/70">{info.label}</div>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className="text-xs uppercase tracking-widest text-moss/70">SKU</label>
              <input aria-label="Código de barras del traslado" value={sku} onChange={(e) => setSku(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.defaultPrevented) { e.preventDefault(); void addRow(); } }} placeholder="Escanear código de barras…" className="mt-1 w-full px-4 py-2.5 rounded-full border border-ink/15 bg-ivory/60 text-sm font-mono" />
            </div>
            <div className="w-28">
              <label className="text-xs uppercase tracking-widest text-moss/70">Cantidad</label>
              <input type="number" min={1} value={qty} onChange={(e) => setQty(parseInt(e.target.value) || 1)} className="mt-1 w-full px-4 py-2.5 rounded-full border border-ink/15 bg-ivory/60 text-sm" />
            </div>
            <button onClick={() => void addRow()} className="px-4 py-2.5 rounded-full bg-ink text-ivory text-sm">Agregar</button>
          </div>
          {rows.length > 0 && (
            <ul className="divide-y divide-ink/5 border border-ink/10 rounded-2xl overflow-hidden">
              {rows.map((r) => (
                <li key={r.variantId} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span>{r.qty}× <span className="font-mono text-xs">{r.sku}</span> · {r.name}</span>
                  <button onClick={() => setRows((p) => p.filter((x) => x.variantId !== r.variantId))} className="text-ink/40 hover:text-ink"><Trash2 className="size-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota (opcional)" className="w-full px-4 py-3 rounded-2xl border border-ink/15 bg-ivory/60 text-sm" rows={2} />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowNew(false)} className="px-4 py-2 rounded-full border border-ink/15 text-sm">Cancelar</button>
            <button onClick={() => create.mutate()} disabled={create.isPending} className="px-5 py-2 rounded-full bg-ink text-ivory text-sm disabled:opacity-50">
              {create.isPending ? "Enviando…" : "Enviar solicitud"}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={"px-4 py-2 rounded-full text-sm border transition-colors " + (tab === t.id ? "bg-ink text-ivory border-ink" : "bg-white text-ink/70 border-ink/10 hover:bg-ink/5")}>
            {t.label}
          </button>
        ))}
      </div>

      {(tab as string) === "ajustes" ? <TransferDiscrepancies originId={sedeLoc?.id ?? null} /> : (
      <div className="bg-white border border-ink/10 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-widest text-moss/70">
            <tr>
              <th className="text-left px-4 py-3">Dirección</th>
              <th className="text-left">Piezas</th>
              <th className="text-left">Estado</th>
              <th className="text-left">Fecha</th>
            </tr>
          </thead>
          <tbody>
            {transfersPage.map((t) => {
              const dir = t.from_location_id === sedeLoc?.id ? "Saliente" : "Entrante";
              return (
                <tr key={t.id} className="border-t border-ink/5 align-top">
                  <td className="px-4 py-3">
                    <div className="text-[10px] uppercase tracking-widest text-moss/70">{dir}</div>
                    {t.note && <div className="text-sm font-medium mt-0.5">{t.note}</div>}
                    <div className="font-serif italic">{(t as any).transfer_number ? <span className="not-italic font-sans text-xs font-semibold mr-2">TR-{(t as any).transfer_number}</span> : null}{locName(t.from_location_id)} → {locName(t.to_location_id)}</div>
                    <p className="text-xs text-moss mt-1">{(t.transfer_items ?? []).length} referencias · {(t.transfer_items ?? []).reduce((s: number, i: any) => s + i.qty, 0)} piezas</p>
                    {receiving !== t.id && (
                      <button onClick={() => { setOpenItems(openItems === t.id ? null : t.id); setItemsPage(0); }} className="mt-1 text-xs underline text-ink/60 hover:text-ink">
                        {openItems === t.id ? "Ocultar prendas" : "Ver prendas"}
                      </button>
                    )}
                    {openItems === t.id && receiving !== t.id && (() => {
                      const list = t.transfer_items ?? [];
                      const pages = Math.max(1, Math.ceil(list.length / PAGE));
                      return (
                        <div className="mt-2 max-w-2xl">
                          <ul className="text-xs text-moss space-y-0.5">
                            {list.slice(itemsPage * PAGE, (itemsPage + 1) * PAGE).map((i: any, idx: number) => (
                              <li key={idx}>{i.qty}× <span className="font-mono">{i.product_variants?.sku}</span> · {i.product_variants?.products?.name}</li>
                            ))}
                          </ul>
                          {pages > 1 && (
                            <div className="flex items-center gap-2 mt-2 text-xs">
                              <button disabled={itemsPage === 0} onClick={() => setItemsPage((p) => p - 1)} className="px-3 py-1 rounded-full border border-ink/15 disabled:opacity-40">Anterior</button>
                              <span>{itemsPage + 1} / {pages}</span>
                              <button disabled={itemsPage >= pages - 1} onClick={() => setItemsPage((p) => p + 1)} className="px-3 py-1 rounded-full border border-ink/15 disabled:opacity-40">Siguiente</button>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    {!(t as any).order_id && receiving !== t.id && (["requested", "approved"].includes(t.status) || ["requested", "approved", "in_transit"].includes(t.status)) && (
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {["requested", "approved"].includes(t.status) && (
                          <button type="button" title="Editar unidades" onClick={() => setEditing(t)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-ink/20 text-sm text-ink/80 hover:text-ink hover:bg-ink/5">
                            <Pencil className="size-4" /> Unidades
                          </button>
                        )}
                        {["requested", "approved", "in_transit"].includes(t.status) && (
                          <button type="button" title="Cancelar traslado" onClick={() => void cancelTransfer(t)} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-destructive/40 text-sm text-destructive hover:bg-destructive/10">
                            <Ban className="size-4" /> Cancelar
                          </button>
                        )}
                      </div>
                    )}
                    {dir === "Entrante" && ["requested", "approved", "in_transit"].includes(t.status) && receiving !== t.id && (
                      <button onClick={() => openReceiving(t as never)} className="mt-3 px-4 py-2 rounded-full bg-ink text-ivory text-sm font-medium hover:bg-ink/85">
                        Recibir mercancía
                      </button>
                    )}
                    {receiving === t.id && (
                      <div className="mt-3 rounded-2xl border border-ink/10 bg-ivory/50 p-4 space-y-3 max-w-2xl">
                        <p className="text-xs text-moss">
                          {scanRequired
                            ? "Escanea cada prenda que llegó con la pistola (o escribe el código y Enter). La tabla compara lo enviado contra lo recibido."
                            : "Puedes escanear las prendas una a una, ajustar las cantidades a mano, o simplemente confirmar si llegó todo completo."}
                        </p>
                        {(() => {
                          const list = t.transfer_items ?? [];
                          const sent = list.reduce((s: number, i: any) => s + i.qty, 0);
                          const got = list.reduce((s: number, i: any) => s + (recvQty[i.variant_id] ?? 0), 0);
                          return (
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="text-sm">Recibidas <b>{got}</b> de {sent} piezas</span>
                              <button onClick={() => { const all: Record<string, number> = {}; for (const i of list) all[i.variant_id] = i.qty; setRecvQty(all); }} className="px-4 py-2 rounded-full border border-ink/20 bg-white text-xs font-medium">
                                Recibir todo completo
                              </button>
                            </div>
                          );
                        })()}
                        <div className="flex items-center gap-2">
                          <input
                            value={scanCode}
                            onChange={(e) => setScanCode(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); scanItem(t as never); } }}
                            placeholder="Opcional: escribe un código de barras / SKU…"
                            className="flex-1 px-4 py-2.5 rounded-full border border-ink/15 bg-white text-sm font-mono"
                          />
                          <button onClick={() => scanItem(t as never)} className="px-4 py-2.5 rounded-full bg-ink text-ivory text-xs">Registrar</button>
                        </div>
                        <table className="w-full text-xs">
                          <thead className="text-[10px] uppercase tracking-widest text-moss/70">
                            <tr>
                              <th className="text-left py-1.5">Prenda</th>
                              <th className="text-right py-1.5">Enviado</th>
                              <th className="text-right py-1.5">Recibido</th>
                              <th className="text-right py-1.5">Faltante</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(t.transfer_items ?? []).slice(recvPage * PAGE, (recvPage + 1) * PAGE).map((i: any) => {
                              const got = recvQty[i.variant_id] ?? 0;
                              const missing = i.qty - got;
                              return (
                                <tr key={i.variant_id} className="border-t border-ink/5">
                                  <td className="py-1.5 pr-2"><span className="font-mono">{i.product_variants?.sku}</span> · {i.product_variants?.products?.name}</td>
                                  <td className="py-1.5 text-right">{i.qty}</td>
                                  <td className="py-1.5 text-right">
                                    {scanRequired ? (
                                      <span className={"font-medium " + (missing !== 0 ? "text-clay" : "text-moss")}>{got}</span>
                                    ) : (
                                      <input type="number" min={0} value={got}
                                        onChange={(e) => setRecvQty((p) => ({ ...p, [i.variant_id]: Math.max(0, parseInt(e.target.value) || 0) }))}
                                        className={"w-20 px-3 py-1.5 rounded-full border text-sm text-right " + (missing !== 0 ? "border-clay text-clay" : "border-ink/15")} />
                                    )}
                                  </td>
                                  <td className={"py-1.5 text-right font-medium " + (missing > 0 ? "text-clay" : missing < 0 ? "text-amber-600" : "text-moss")}>
                                    {missing > 0 ? `-${missing}` : missing < 0 ? `+${-missing}` : "✓"}
                                  </td>
                                </tr>
                              );
                            })}
                            {Object.entries(extras).map(([vid, e]) => (
                              <tr key={vid} className="border-t border-ink/5 bg-clay/5">
                                <td className="py-1.5 pr-2"><span className="font-mono">{e.sku}</span> · {e.name} <span className="text-clay">· no estaba en el envío</span></td>
                                <td className="py-1.5 text-right">0</td>
                                <td className="py-1.5 text-right text-clay font-medium">{e.qty}</td>
                                <td className="py-1.5 text-right"><button onClick={() => setExtras((p) => { const n = { ...p }; delete n[vid]; return n; })} className="text-ink/40 hover:text-ink"><Trash2 className="size-3.5 inline" /></button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {(() => {
                          const pages = Math.max(1, Math.ceil((t.transfer_items ?? []).length / PAGE));
                          return pages > 1 ? (
                            <div className="flex items-center gap-2 text-xs">
                              <button disabled={recvPage === 0} onClick={() => setRecvPage((p) => p - 1)} className="px-3 py-1 rounded-full border border-ink/15 disabled:opacity-40">Anterior</button>
                              <span>{recvPage + 1} / {pages}</span>
                              <button disabled={recvPage >= pages - 1} onClick={() => setRecvPage((p) => p + 1)} className="px-3 py-1 rounded-full border border-ink/15 disabled:opacity-40">Siguiente</button>
                            </div>
                          ) : null;
                        })()}
                        <p className="text-[11px] text-moss">Solo entra al inventario lo que llegó bien. Faltantes, sobrantes y prendas trocadas se notifican a la bodega de origen como caso de ajuste.</p>
                        <textarea value={recvNote} onChange={(e) => setRecvNote(e.target.value)} placeholder="Nota de recepción (obligatoria si hay faltantes o ajustes)" rows={2} className="w-full px-3 py-2 rounded-xl border border-ink/15 bg-white text-xs" />
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setReceiving(null)} className="px-4 py-1.5 rounded-full border border-ink/15 text-xs">Cancelar</button>
                          <button disabled={receive.isPending} onClick={() => receive.mutate(t as never)} className="px-4 py-1.5 rounded-full bg-ink text-ivory text-xs disabled:opacity-50">
                            {receive.isPending ? "Ingresando…" : "Confirmar e ingresar al inventario"}
                          </button>
                        </div>
                      </div>
                    )}
                  </td>
                  <td>{(t.transfer_items ?? []).reduce((s: number, i: any) => s + i.qty, 0)}</td>
                  <td><span className="text-[10px] uppercase tracking-widest px-2 py-1 rounded bg-moss/15 text-moss">{dir === "Entrante" && ["requested", "approved"].includes(t.status) ? "En tránsito" : (({ requested: "Solicitado", draft: "Borrador", approved: "Aprobado", in_transit: "En tránsito", received: "Recibido", cancelled: "Cancelado", rejected: "Rechazado" } as Record<string, string>)[t.status] ?? t.status)}</span></td>
                  <td className="text-xs text-moss">{new Date(t.created_at).toLocaleDateString("es-CO")}</td>
                </tr>
              );
            })}
            {(transfers?.length ?? 0) === 0 && (
              <tr><td colSpan={4} className="px-6 py-10 text-center text-moss/60">Sin traslados en este estado.</td></tr>
            )}
          </tbody>
        </table>
        {transfersPager}
      </div>
      )}
      {editing && (
        <EditItemsModal
          transfer={editing}
          title={`${locName(editing.from_location_id)} → ${locName(editing.to_location_id)}`}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); qc.invalidateQueries({ queryKey: ["sede-transfers"] }); qc.invalidateQueries({ queryKey: ["incoming-transfers-count"] }); }}
        />
      )}
    </div>
  );
}

type EditItem = { qty: number; variant_id: string; product_variants: { sku: string | null; products: { name: string } | null } | null };

function EditItemsModal({ transfer, title, onClose, onDone }: {
  transfer: { id: string; status: string; transfer_items: EditItem[] | null };
  title: string; onClose: () => void; onDone: () => void;
}) {
  const items = transfer.transfer_items ?? [];
  const [qtys, setQtys] = useState<Record<string, number>>(() => Object.fromEntries(items.map((i) => [i.variant_id, i.qty])));
  const [saving, setSaving] = useState(false);
  const kept = items.filter((i) => (qtys[i.variant_id] ?? 0) > 0);
  const changed = items.some((i) => (qtys[i.variant_id] ?? 0) !== i.qty);

  const submit = async () => {
    if (kept.length === 0) { toast.error("El traslado debe conservar al menos una prenda; si no va a salir nada, usa Cancelar"); return; }
    setSaving(true);
    const { error } = await supabase.rpc("edit_transfer_items" as never, {
      _transfer_id: transfer.id,
      _items: items.map((i) => ({ variant_id: i.variant_id, qty: qtys[i.variant_id] ?? 0 })),
    } as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Unidades actualizadas");
    onDone();
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card text-card-foreground rounded-2xl w-full max-w-xl max-h-[85vh] overflow-auto p-6" onClick={(e) => e.stopPropagation()}>
        <p className="text-[10px] uppercase tracking-widest text-moss/70">Editar traslado</p>
        <h2 className="font-serif italic text-2xl mt-1">{title}</h2>
        <p className="text-sm text-moss mt-1">
          Ajusta las unidades de cada referencia. Pon 0 para quitarla del traslado.
          {transfer.status === "approved" ? " Las unidades apartadas en la bodega de origen se ajustan solas." : ""}
        </p>
        <table className="w-full text-sm mt-4">
          <thead className="text-[10px] uppercase tracking-widest text-moss/70">
            <tr><th className="text-left py-2">Referencia</th><th className="text-right">Antes</th><th className="text-right">Ahora</th></tr>
          </thead>
          <tbody>
            {items.map((i) => {
              const q = qtys[i.variant_id] ?? 0;
              return (
                <tr key={i.variant_id} className={"border-t border-ink/5 " + (q === 0 ? "opacity-50" : "")}>
                  <td className="py-2"><div>{i.product_variants?.products?.name}</div><div className="font-mono text-xs text-moss">{i.product_variants?.sku}</div></td>
                  <td className="text-right">{i.qty}</td>
                  <td className="text-right">
                    <input type="number" min={0} value={q}
                      onChange={(e) => setQtys((prev) => ({ ...prev, [i.variant_id]: Math.max(0, Number(e.target.value) || 0) }))}
                      className="no-spin w-16 text-right border border-ink/15 rounded-lg px-2 py-1 bg-background" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="text-sm mt-3">Total: {kept.reduce((s, i) => s + (qtys[i.variant_id] ?? 0), 0)} piezas en {kept.length} referencias</p>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 rounded-full border border-ink/15 text-sm">Volver</button>
          <button disabled={saving || !changed} onClick={submit} className="px-4 py-2 rounded-full bg-ink text-ivory text-sm disabled:opacity-50">
            {saving ? "Guardando…" : "Guardar unidades"}
          </button>
        </div>
      </div>
    </div>
  );
}