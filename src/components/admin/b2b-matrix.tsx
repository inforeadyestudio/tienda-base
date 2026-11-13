import { fetchAll } from "@/lib/fetch-all";
import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Download, Eye, Plus, Store, UserPlus, X } from "lucide-react";
import { useB2BAccounts } from "@/lib/b2b/admin";
import { B2BManualOrder } from "@/components/admin/b2b-manual-order";
import { supabase } from "@/integrations/supabase/client";
import { sizeLabel } from "@/lib/size-order";
import { groupMatrixSizes, matchesMatrixSearch, sumMatrixVariants } from "@/lib/b2b-matrix-sizes";
import { createB2BAccount } from "@/lib/b2b/admin.functions";
import { Button } from "@/components/ui/button";
import { matrixClientOrdered, matrixOverage } from "@/lib/b2b-matrix-overage";
import { matrixClientQuantity, matrixDraftQty, verifyMatrixEdits } from "@/lib/b2b-matrix-edits";

const clientKey = (customerId: string, storeId?: string | null) => (storeId ? `${customerId}~${storeId}` : customerId);
const rpcClient = (id: string) => {
  const [customer, store] = id.split("~");
  return store ? { _customer_id: customer, _store_id: store } : { _customer_id: customer };
};

const isQualityA = (q: string | null) => !q || /(^|\s)a$/i.test(q.trim());

type Kind = "tope" | "cut" | "pos_bogota" | "pos_cali" | "web" | "tr_bogota" | "tr_cali" | "saldo" | `client:${string}` | `event:${string}`;

export function B2BMatrix() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [collectionId, setCollectionId] = useState("");
  const [onlyPreventa, setOnlyPreventa] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRow, setSelectedRow] = useState<string | null>(null);

  const { data: collections } = useQuery({
    queryKey: ["matrix-collections"],
    queryFn: async () => (await supabase.from("collections").select("id, title").eq("is_page", false).order("position")).data ?? [],
  });
  const activeCol = collectionId || collections?.[0]?.id || "";

  // Manual event columns (e.g. Feria de Cali): planning only, never orders or stock.
  const { data: events } = useQuery({
    queryKey: ["matrix-events", activeCol],
    enabled: !!activeCol,
    queryFn: async () => ((await (supabase as any).from("preventa_matrix_events").select("id, name").eq("collection_id", activeCol).order("position").order("created_at")).data ?? []) as { id: string; name: string }[],
  });
  const refreshEvents = () => { qc.invalidateQueries({ queryKey: ["matrix-events", activeCol] }); qc.invalidateQueries({ queryKey: ["b2b-matrix"] }); };
  const addEvent = async () => {
    const name = window.prompt("Nombre del evento (ej. Feria de Cali)")?.trim();
    if (!name || !activeCol) return;
    const { error } = await (supabase as any).from("preventa_matrix_events").insert({ collection_id: activeCol, name, position: (events?.length ?? 0) });
    if (error) return toast.error(error.message);
    refreshEvents();
  };
  const renameEvent = async (ev: { id: string; name: string }) => {
    const name = window.prompt("Nuevo nombre del evento", ev.name)?.trim();
    if (!name || name === ev.name) return;
    const { error } = await (supabase as any).from("preventa_matrix_events").update({ name }).eq("id", ev.id);
    if (error) return toast.error(error.message);
    refreshEvents();
  };
  const removeEvent = async (ev: { id: string; name: string }) => {
    if (!window.confirm(`¿Quitar la columna «${ev.name}»? Se borran sus cantidades.`)) return;
    await supabase.from("preventa_matrix_cells").delete().eq("column_kind", `event:${ev.id}`);
    const { error } = await (supabase as any).from("preventa_matrix_events").delete().eq("id", ev.id);
    if (error) return toast.error(error.message);
    refreshEvents();
  };

  const { data, isLoading } = useQuery({
    queryKey: ["b2b-matrix", activeCol],
    enabled: !!activeCol,
    queryFn: async () => {
      const { data: cp } = await supabase
        .from("collection_products")
        .select("products(id, name, reference_code, product_variants(id, size, color, quality, active))")
        .eq("collection_id", activeCol);
      const products = (cp ?? []).map((r: any) => r.products).filter(Boolean);
      const variants = products.flatMap((p: any) =>
        (p.product_variants ?? []).filter((v: any) => v.active !== false && isQualityA(v.quality)).map((v: any) => ({ ...v, product: p })),
      );
      const ids = variants.map((v: any) => v.id);
      if (!ids.length) return { variants: [], rules: [], cells: [], items: [], clients: [] as { id: string; name: string }[], preventaLoc: null as string | null, moves: [] as any[], bogotaLoc: null as string | null, caliLoc: null as string | null, orderRef: {} as Record<string, { id: string; number: string }> };

      const [{ data: rules }, { data: cells }, { data: items }, { data: roles }, { data: locs }, { data: stores }] = await Promise.all([
        fetchAll<any>((f, t) => supabase.from("preventa_rules").select("variant_id, max_qty, location_id").in("variant_id", ids).order("id").range(f, t)).then((data) => ({ data, error: null })),
        fetchAll<any>((f, t) => supabase.from("preventa_matrix_cells").select("variant_id, column_kind, qty").in("variant_id", ids).order("id").range(f, t)).then((data) => ({ data, error: null })),
        (async () => {
          // Paginate: a single read stops at 1000 rows and silently dropped client quantities.
          const all: any[] = [];
          for (let from = 0; ; from += 1000) {
            const { data: page, error } = await supabase.from("order_items")
              .select("id, variant_id, qty, orders!inner(id, number, created_at, customer_id, status, b2b_store_id, source, notes)")
              .in("variant_id", ids).eq("orders.source", "assisted").order("id").range(from, from + 999);
            if (error) throw error;
            all.push(...(page ?? []));
            if (!page || page.length < 1000) break;
          }
          return { data: all };
        })(),
        supabase.from("user_roles").select("user_id").eq("role", "b2b"),
        supabase.from("locations").select("id").eq("allow_preventa", true).order("priority", { ascending: false }).limit(1),
        supabase.from("locations").select("id, name").eq("kind", "store").eq("active", true),
      ]);
      const bogotaLoc = (stores ?? []).find((l: any) => /bogot/i.test(l.name))?.id ?? null;
      const caliLoc = (stores ?? []).find((l: any) => /cali/i.test(l.name))?.id ?? null;
      const storeLocIds = [bogotaLoc, caliLoc].filter(Boolean) as string[];
      const { data: moves } = storeLocIds.length
        ? await fetchAll<any>((f, t) => supabase.from("inventory_movements").select("variant_id, location_id, qty").in("variant_id", ids).in("location_id", storeLocIds).eq("kind", "transfer_in").order("id").range(f, t)).then((data) => ({ data }))
        : { data: [] as any[] };
      const b2b = new Set((roles ?? []).map((r) => r.user_id));
      const validItems = (items ?? []).filter((i: any) => b2b.has(i.orders?.customer_id) && i.orders?.status !== "cancelled" && i.orders?.status !== "refunded");
      const allIds = [...b2b];
      const { data: profiles } = allIds.length
        ? await supabase.from("profiles").select("id, full_name, company_name").in("id", allIds)
        : { data: [] as any[] };
      const { data: clientStores } = allIds.length
        ? await (supabase as any).from("b2b_client_stores").select("id, customer_id, name").eq("active", true).in("customer_id", allIds).order("name")
        : { data: [] as any[] };
      const clients: { id: string; name: string }[] = [];
      (profiles ?? []).map((p: any) => ({ id: p.id, name: p.company_name || p.full_name || "Cliente B2B" }))
        .sort((a, b) => a.name.localeCompare(b.name))
        .forEach((c) => {
          clients.push(c);
          (clientStores ?? []).filter((st: any) => st.customer_id === c.id)
            .forEach((st: any) => clients.push({ id: `${c.id}~${st.id}`, name: `${c.name} · ${st.name}` }));
        });
      return { variants, rules: rules ?? [], cells: cells ?? [], items: validItems, clients, preventaLoc: locs?.[0]?.id ?? null, moves: moves ?? [], bogotaLoc, caliLoc };
    },
  });

  useEffect(() => {
    const ch = supabase
      .channel("b2b-matrix")
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, () => qc.invalidateQueries({ queryKey: ["b2b-matrix"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "preventa_rules" }, () => qc.invalidateQueries({ queryKey: ["b2b-matrix"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "preventa_matrix_cells" }, () => qc.invalidateQueries({ queryKey: ["b2b-matrix"] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "inventory_movements" }, () => qc.invalidateQueries({ queryKey: ["b2b-matrix"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const model = useMemo(() => {
    const d = data;
    if (!d) return null;
    const val: Record<string, number> = {}; // `${kind}|${variantId}`
    const add = (k: string, n: number) => { val[k] = (val[k] ?? 0) + n; };
    d.rules.forEach((r: any) => add(`tope|${r.variant_id}`, r.max_qty));
    d.cells.forEach((c: any) => add(`${c.column_kind}|${c.variant_id}`, c.qty));
    (d.moves ?? []).forEach((m: any) => {
      const k = m.location_id === d.bogotaLoc ? "tr_bogota" : m.location_id === d.caliLoc ? "tr_cali" : null;
      if (k) add(`${k}|${m.variant_id}`, m.qty);
    });
    const clientsWithOrders = new Set<string>();
    const openDraft = new Set<string>();
    const shipped: Record<string, number> = {};
    // Orden por columna de cliente: preferimos el borrador activo (el que edita la matriz); si no hay, el más reciente.
    const draftOrder: Record<string, { id: string; number: string }> = {};
    const latestOrder: Record<string, { id: string; number: string; at: string }> = {};
    d.items.forEach((i: any) => {
      const cid = clientKey(i.orders.customer_id, i.orders.b2b_store_id);
      const k = `client:${cid}|${i.variant_id}`;
      add(k, i.qty);
      if (i.orders.status === "draft") {
        draftOrder[cid] = { id: i.orders.id, number: i.orders.number };
        openDraft.add(cid);
      } else {
        if (i.orders.status === "shipped" || i.orders.status === "delivered") shipped[k] = (shipped[k] ?? 0) + i.qty;
        if (!latestOrder[cid] || String(i.orders.created_at ?? "") > latestOrder[cid].at) {
          latestOrder[cid] = { id: i.orders.id, number: i.orders.number, at: String(i.orders.created_at ?? "") };
        }
      }
      clientsWithOrders.add(cid);
    });
    const orderRef: Record<string, { id: string; number: string }> = {};
    Object.keys(draftOrder).forEach((cid) => { orderRef[cid] = draftOrder[cid]; });
    Object.keys(latestOrder).forEach((cid) => { if (!orderRef[cid]) orderRef[cid] = latestOrder[cid]; });
    const inPreventa = new Set(d.rules.map((r: any) => r.variant_id));

    const grouped = groupMatrixSizes(d.variants);
    const sizes = grouped.sizes;
    let rows = grouped.rows;
    if (onlyPreventa) rows = rows.filter((r) => Object.values(r.bySize).flat().some((id) => inPreventa.has(id) || (val[`cut|${id}`] ?? 0) > 0));
    const allRows = rows;
    if (search.trim()) rows = rows.filter((r) => matchesMatrixSearch(r, search));
    const clients = d.clients.filter((c) => clientsWithOrders.has(c.id));
    return { val, sizes, rows, allRows, clients, shipped, openDraft, orderRef };
  }, [data, onlyPreventa, search]);

  const { data: marks } = useQuery({
    queryKey: ["b2b-matrix-marks"],
    queryFn: async () => {
      const m = await fetchAll<any>((f, t) => supabase.from("b2b_matrix_marks").select("client_key, row_key, mark").order("client_key").order("row_key").range(f, t));
      return Object.fromEntries((m ?? []).map((x) => [`${x.client_key}|${x.row_key}`, x.mark])) as Record<string, string>;
    },
  });
  const setMark = async (clientKey: string, rowKey: string, mark: string | null) => {
    const { data: u } = await supabase.auth.getUser();
    const q = mark
      ? supabase.from("b2b_matrix_marks").upsert({ client_key: clientKey, row_key: rowKey, mark, updated_by: u.user?.id ?? null, updated_at: new Date().toISOString() }, { onConflict: "client_key,row_key" })
      : supabase.from("b2b_matrix_marks").delete().eq("client_key", clientKey).eq("row_key", rowKey);
    const { error } = await q;
    if (error) toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["b2b-matrix-marks"] });
  };

  const [addClient, setAddClient] = useState("");
  const [showNewClient, setShowNewClient] = useState(false);
  const [showNewOrder, setShowNewOrder] = useState(false);
  const [showStores, setShowStores] = useState(false);
  const extraClients = useMemo(() => {
    if (!model || !data) return [];
    return data.clients.filter((c) => !model.clients.some((m) => m.id === c.id));
  }, [model, data]);
  const [pinned, setPinned] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem("b2b-matrix-pinned") ?? "[]"); } catch { return []; }
  });
  useEffect(() => {
    try { localStorage.setItem("b2b-matrix-pinned", JSON.stringify(pinned)); } catch { /* ignore */ }
  }, [pinned]);
  const clientCols = useMemo(() => {
    if (!model || !data) return [];
    const pins = data.clients.filter((c) => pinned.includes(c.id) && !model.clients.some((m) => m.id === c.id));
    return [...model.clients, ...pins];
  }, [model, data, pinned]);

  // Cantidades digitadas en columnas de cliente que aún no se han convertido en pedido de preventa.
  const [pending, setPending] = useState<Record<string, number>>({});
  const [creatingFor, setCreatingFor] = useState<string | null>(null);
  const [destinationByClient, setDestinationByClient] = useState<Record<string, "nacional" | "internacional">>({});

  const save = async (kind: Kind, variantId: string, qty: number) => {
    qty = Math.max(0, Math.round(qty || 0));
    try {
      if (kind === "tope") {
        if (!data?.preventaLoc) throw new Error("No hay bodega con preventa habilitada");
        const { error } = await supabase.from("preventa_rules")
          .upsert({ location_id: data.preventaLoc, variant_id: variantId, max_qty: qty }, { onConflict: "location_id,variant_id" });
        if (error) throw error;
      } else if (kind.startsWith("client:")) {
        const { error } = await supabase.rpc("set_preventa_order_qty" as any, { ...rpcClient(kind.slice(7)), _variant_id: variantId, _qty: qty });
        if (error) throw error;
      } else {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase.from("preventa_matrix_cells")
          .upsert({ variant_id: variantId, column_kind: kind, qty, updated_by: u.user?.id ?? null }, { onConflict: "variant_id,column_kind" });
        if (error) throw error;
      }
      qc.invalidateQueries({ queryKey: ["b2b-matrix"] });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo guardar");
    }
  };

  const pendingFor = (kind: string) => Object.entries(pending).filter(([k]) => k.startsWith(`${kind}|`));

  const createPreventa = async (kind: Kind) => {
    const entries = pendingFor(kind);
    if (!entries.length || creatingFor) return;
    setCreatingFor(kind);
    try {
      const customer = kind.slice(7);
      // The cell shows confirmed + draft units; only the part above the confirmed orders goes to the preventa draft.
      const changes: [string, number][] = entries.map(([k, qty]) => {
        const variantId = k.slice(kind.length + 1);
        return [variantId, matrixDraftQty(data?.items ?? [], customer, variantId, qty)];
      });
      let orderId: string | null = null;
      for (const [variantId, qty] of changes) {
        const { data: createdId, error } = await supabase.rpc("set_preventa_order_qty" as any, { ...rpcClient(customer), _variant_id: variantId, _qty: qty });
        if (error) throw error;
        if (createdId) orderId = createdId as string;
      }
      if (orderId) {
        const { error } = await (supabase.rpc as any)("set_b2b_preventa_destination", { _order_id: orderId, _destination: destinationByClient[kind.slice(7)] ?? "nacional" });
        if (error) throw error;
      }
      // Keep the typed zero visible until the refreshed saved order confirms removal.
      await qc.invalidateQueries({ queryKey: ["b2b-matrix", activeCol] });
      const refreshed = qc.getQueryData<typeof data>(["b2b-matrix", activeCol]);
      if (!refreshed) throw new Error("No se pudo comprobar el pedido guardado. Vuelve a intentarlo.");
      verifyMatrixEdits(refreshed.items, customer, changes);
      setPinned((p) => p.includes(customer) ? p : [...p, customer]);
      setPending((p) => {
        const next = { ...p };
        entries.forEach(([k, qty]) => { if (next[k] === qty) delete next[k]; });
        return next;
      });
      toast.success(model?.openDraft?.has(kind.slice(7)) ? "Pedido actualizado" : "Pedido de preventa creado");
      qc.invalidateQueries({ queryKey: ["admin-b2b-orders"] });
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo crear el pedido de preventa");
    } finally {
      setCreatingFor(null);
    }
  };

  const groups: { kind: Kind; label: string; tone: string; editable: boolean }[] = [
    { kind: "cut", label: "Curva Corte", tone: "bg-cream", editable: true },
    { kind: "pos_cali", label: "POS Eventos", tone: "bg-ink/5", editable: true },
    { kind: "web", label: "Ecommerce", tone: "bg-clay/15", editable: true },
    ...(events ?? []).map((ev) => ({ kind: `event:${ev.id}` as Kind, label: ev.name, tone: "bg-clay/10", editable: true })),
    { kind: "saldo", label: "Saldo", tone: "bg-moss/30", editable: false },
    { kind: "tope", label: "Tope preventa", tone: "bg-moss/25", editable: true },
    ...clientCols.map((c) => ({ kind: `client:${c.id}` as Kind, label: c.name, tone: "bg-cream", editable: true })),
  ];

  type VariantIds = string | string[] | undefined;
  const raw = (k: string, ids: VariantIds) => sumMatrixVariants(ids, id => model?.val[`${k}|${id}`] ?? 0);
  // Saldo = lo que queda de la Curva Corte tras asignar POS Eventos y Ecommerce.
  const eventsSum = (id: string | string[]) => (events ?? []).reduce((a, ev) => a + raw(`event:${ev.id}`, id), 0);
  const get = (k: string, id?: string | string[]) =>
    k === "saldo" ? (id ? raw("cut", id) - raw("pos_bogota", id) - raw("pos_cali", id) - raw("web", id) - eventsSum(id) : 0) : raw(k, id);
  const orderedFor = (id?: string | string[]) =>
    id ? matrixClientOrdered(clientCols.map(c => get(`client:${c.id}`, id))) : 0;
  const grandFor = (id?: string | string[]) => id ? get("pos_bogota", id) + get("pos_cali", id) + get("web", id) + eventsSum(id) + orderedFor(id) : 0;
  const [breakdown, setBreakdown] = useState<{ title: string; lines: [string, number][]; total: number; cut?: number } | null>(null);
  const openBreakdown = (kind: "orders" | "grand", name: string, sizeTitle: string, ids?: string[]) => {
    if (!ids?.length) return;
    const clients = clientCols.map((c) => [c.name, get(`client:${c.id}`, ids)] as [string, number]);
    const lines: [string, number][] = kind === "grand"
      ? [["POS Eventos", get("pos_cali", ids)], ["Ecommerce", get("web", ids)], ...(events ?? []).map((ev) => [ev.name, get(`event:${ev.id}`, ids)] as [string, number]), ...clients]
      : clients;
    const shown = lines.filter(([, n]) => n > 0);
    setBreakdown({ title: `${kind === "grand" ? "Total B2B + B2C" : "Total B2B"} · ${name} · ${sizeTitle}`, lines: shown, total: shown.reduce((a, [, n]) => a + n, 0), cut: kind === "grand" ? get("cut", ids) : undefined });
  };
  const overageFor = (ids?: string | string[]) => sumMatrixVariants(ids, id => matrixOverage(orderedFor(id), get("tope", id)));
  const overageTitle = (extra: number) => extra > 0 ? `Sobreventa: ${extra} ${extra === 1 ? "unidad de más" : "unidades de más"}` : undefined;
  const overageTone = (extra: number) => extra > 0 ? "bg-destructive text-destructive-foreground font-semibold" : "";

  const exportXlsx = async () => {
    if (!model) return;
    const { default: ExcelJS } = await import("exceljs");
    const title = collections?.find((c) => c.id === activeCol)?.title ?? "Matriz";
    const all = [...groups.map((g) => ({ label: g.label, fn: (id?: string | string[]) => get(g.kind, id) })), { label: "Total B2B", fn: orderedFor }, { label: "Total B2B + B2C", fn: grandFor }, { label: "Saldo", fn: (id?: string | string[]) => get("cut", id) - grandFor(id) }];
    const n = model.sizes.length + 1;
    const palette = ["FFE8E2D0", "FFDCE5D5", "FFF1E4D3", "FFE0E6EE", "FFEDE0E8", "FFE4EDE4"];
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(title.slice(0, 30), { views: [{ state: "frozen", xSplit: 2, ySplit: 4 }] });
    const thin = { style: "thin" as const, color: { argb: "FFB8B2A3" } };
    const box = { top: thin, left: thin, bottom: thin, right: thin };
    const fill = (argb: string) => ({ type: "pattern" as const, pattern: "solid" as const, fgColor: { argb } });
    const center = { horizontal: "center" as const, vertical: "middle" as const };
    ws.getCell(1, 1).value = title.toUpperCase();
    ws.getCell(1, 1).font = { bold: true, size: 16, name: "Arial" };
    ws.mergeCells(3, 1, 4, 1); ws.mergeCells(3, 2, 4, 2);
    ws.getCell(3, 1).value = "Referencia"; ws.getCell(3, 2).value = "Color";
    [1, 2].forEach((c) => { const cell = ws.getCell(3, c); cell.font = { bold: true, name: "Arial", color: { argb: "FFFFFFFF" } }; cell.fill = fill("FF2B2B26"); cell.alignment = center; cell.border = box; ws.getCell(4, c).border = box; });
    all.forEach((g, gi) => {
      const c0 = 3 + gi * n;
      const color = g.label === "Total B2B + B2C" ? "FF3F4A36" : g.label === "Total B2B" ? "FF5E6B52" : palette[gi % palette.length];
      const dark = g.label === "Total B2B + B2C" || g.label === "Total B2B";
      ws.mergeCells(3, c0, 3, c0 + n - 1);
      const h = ws.getCell(3, c0); h.value = g.label.toUpperCase();
      h.font = { bold: true, name: "Arial", size: 11, color: { argb: dark ? "FFFFFFFF" : "FF1F1F1A" } }; h.fill = fill(color); h.alignment = center;
      for (let k = 0; k < n; k++) {
        ws.getCell(3, c0 + k).border = box;
        const sc = ws.getCell(4, c0 + k);
        sc.value = k < n - 1 ? sizeLabel(model.sizes[k]) : "Total";
        sc.font = { bold: true, name: "Arial", size: 9 }; sc.fill = fill(dark ? "FFD9DDD2" : "FFF5F1E6"); sc.alignment = center; sc.border = box;
        ws.getColumn(c0 + k).width = k < n - 1 ? 7 : 8;
      }
    });
    ws.getRow(3).height = 24; ws.getRow(4).height = 18;
    ws.getColumn(1).width = 34; ws.getColumn(2).width = 14;
    const totals = all.map(() => Array(n).fill(0));
    model.rows.forEach((r, ri) => {
      const row = ws.getRow(5 + ri);
      row.getCell(1).value = r.name; row.getCell(2).value = r.color || "";
      const cutBy = model.sizes.map((s) => get("cut", r.bySize[s]));
      all.forEach((g, gi) => {
        let t = 0;
        model.sizes.forEach((s, k) => { const v = g.fn(r.bySize[s]); t += v; totals[gi][k] += v; const cell = row.getCell(3 + gi * n + k); cell.value = r.bySize[s] && v ? v : null; if (g.label === "Total B2B + B2C" && r.bySize[s] && v > cutBy[k]) { cell.fill = fill("FFD64545"); cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial" }; } });
        totals[gi][n - 1] += t;
        const tc = row.getCell(3 + gi * n + n - 1); tc.value = t; tc.font = { bold: true, name: "Arial" };
        if (g.label === "Total B2B + B2C" && t > cutBy.reduce((a, b) => a + b, 0)) { tc.fill = fill("FFD64545"); tc.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Arial" }; }
      });
      row.eachCell({ includeEmpty: true }, (cell, col) => {
        cell.border = box;
        if (col > 2) cell.alignment = center;
        if (!cell.font?.bold) cell.font = { name: "Arial", size: 10 };
        if (!(cell.fill as any)?.fgColor && ri % 2 === 1) cell.fill = fill("FFFAF8F2");
      });
    });
    const tr = ws.getRow(5 + model.rows.length);
    tr.getCell(1).value = "TOTALES";
    all.forEach((_, gi) => totals[gi].forEach((v, k) => { tr.getCell(3 + gi * n + k).value = v; }));
    for (let c = 1; c <= 2 + all.length * n; c++) { const cell = tr.getCell(c); cell.font = { bold: true, name: "Arial" }; cell.fill = fill("FFE8E2D0"); cell.border = { ...box, top: { style: "medium", color: { argb: "FF2B2B26" } } }; if (c > 2) cell.alignment = center; }
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
    const a = document.createElement("a"); a.href = url; a.download = `Matriz B2B + B2C - ${title}.xlsx`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const collectionTitle = collections?.find((c) => c.id === activeCol)?.title ?? "";
  const sizes = model?.sizes ?? [];
  const totalsFor = (fn: (id?: string | string[]) => number) => sizes.map((s) => (model?.rows ?? []).reduce((sum, r) => sum + fn(r.bySize[s]), 0));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select value={activeCol} onChange={(e) => setCollectionId(e.target.value)} className="rounded-full border border-ink/10 bg-white py-2.5 pl-4 pr-9 text-sm">
          {(collections ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
        {extraClients.length > 0 && (
          <select
            value={addClient}
            onChange={(e) => { if (e.target.value) setPinned((p) => [...p, e.target.value]); setAddClient(""); }}
            className="rounded-full border border-ink/10 bg-white py-2.5 pl-4 pr-9 text-sm"
          >
            <option value="">+ Agregar columna de cliente</option>
            {extraClients.filter((c) => !pinned.includes(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        <button
          onClick={() => setShowNewClient(true)}
          className="inline-flex items-center gap-2 rounded-full border border-ink/15 bg-white px-4 py-2.5 text-xs font-medium text-ink hover:bg-cream"
        >
          <UserPlus className="h-4 w-4" /> Cliente
        </button>
        <button
          onClick={() => setShowStores(true)}
          className="inline-flex items-center gap-2 rounded-full border border-ink/15 bg-white px-4 py-2.5 text-xs font-medium text-ink hover:bg-cream"
        >
          <Store className="h-4 w-4" /> Tiendas del cliente
        </button>
        <button
          onClick={() => setShowNewOrder(true)}
          className="inline-flex items-center gap-2 rounded-full border border-ink/15 bg-white px-4 py-2.5 text-xs font-medium text-ink hover:bg-cream"
        >
          <Plus className="h-4 w-4" /> Nuevo pedido
        </button>
        <button
          onClick={addEvent}
          className="inline-flex items-center gap-2 rounded-full border border-ink/15 bg-white px-4 py-2.5 text-xs font-medium text-ink hover:bg-cream"
        >
          <Plus className="h-4 w-4" /> Evento
        </button>
        {(events ?? []).map((ev) => (
          <span key={ev.id} className="inline-flex items-center gap-1 rounded-full border border-ink/15 bg-cream px-3 py-2 text-xs text-ink">
            <button onClick={() => renameEvent(ev)} title="Renombrar evento" className="hover:underline">{ev.name}</button>
            <button onClick={() => removeEvent(ev)} title="Quitar columna" aria-label={`Quitar ${ev.name}`} className="text-ink/50 hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
          </span>
        ))}
        <button onClick={exportXlsx} className="ml-auto inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-xs text-ivory">
          <Download className="h-4 w-4" /> Exportar a Excel
        </button>
      </div>

      <label className="mb-3 flex w-fit cursor-pointer items-center gap-2 rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs text-moss">
        <input type="checkbox" checked={onlyPreventa} onChange={(e) => setOnlyPreventa(e.target.checked)} className="accent-moss" />
        Solo referencias en preventa
      </label>
      <div className="mb-3 flex w-full max-w-sm items-center gap-2 rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs">
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar referencia…" aria-label="Buscar referencia" className="w-full bg-transparent outline-none" />
        {search && <button type="button" onClick={() => setSearch("")} aria-label="Limpiar búsqueda"><X className="h-3.5 w-3.5" /></button>}
      </div>

       <p className="mb-3 text-xs text-moss/70">Solo Calidad A. Saldo = Curva Corte − POS Eventos − Ecommerce. Las celdas, incluida la Curva Corte y Ecommerce, se pueden digitar a mano y se guardan al salir del campo.</p>
       <p className="mb-3 flex flex-wrap items-center gap-4 text-[11px] text-moss/70">
         <span className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full bg-clay" /> Separado para el cliente</span>
          <span className="inline-flex items-center gap-1.5">Marcas por cliente: <span className="inline-block size-2.5 rounded-full bg-moss" /> OK <span className="inline-block size-2.5 rounded-full bg-mark-pending" /> Pendiente <span className="inline-block size-2.5 rounded-full bg-destructive" /> No disponible</span>
         <span className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full bg-ink" /> Despachado parcialmente</span>
         <span className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-full bg-moss" /> Enviado oficialmente</span>
       </p>

      <div className="overflow-auto rounded-2xl border border-ink/10 bg-white max-h-[75vh]">
        <table className="w-max table-fixed border-collapse text-xs">
          <colgroup>
            <col style={{ width: 180 }} />
            <col style={{ width: 110 }} />
            {Array.from({ length: groups.length + 2 }).flatMap((_, g) => [
              ...sizes.map((s) => <col key={`c${g}-${s}`} style={{ width: 40 }} />),
              <col key={`c${g}-t`} style={{ width: 44 }} />,
            ])}
          </colgroup>
          <thead className="sticky top-0 z-50">
            <tr>
              <th colSpan={2} className="sticky left-0 z-30 bg-white px-3 py-3 text-left font-serif text-lg">{collectionTitle.toUpperCase()}</th>
              {groups.map((g) => {
                 const pend = g.kind.startsWith("client:") ? pendingFor(g.kind).length : 0;
                 const hasOpen = g.kind.startsWith("client:") && (model?.openDraft?.has(g.kind.slice(7)) ?? false);
                 const isPinned = g.kind.startsWith("client:") && pinned.includes(g.kind.slice(7));
                 return (
                  <th key={g.kind} colSpan={sizes.length + 1} className={`${g.kind === "cut" ? "sticky left-[290px] z-30" : ""} border-l border-ink/10 bg-white p-0 text-center text-[10px] uppercase tracking-wider`}>
                   <div className={`${g.tone} flex min-h-9 items-center justify-center px-2 py-2`}>
                    {g.label}
                    {g.kind.startsWith("client:") && model?.orderRef?.[g.kind.slice(7)] && (() => {
                      const ref = model.orderRef[g.kind.slice(7)];
                      return (
                        <button
                          type="button"
                          onClick={() => navigate({ to: "/admin/pedido/$id", params: { id: ref.id } })}
                          title={`Abrir pedido ${ref.number}`}
                          aria-label={`Abrir pedido de ${g.label}`}
                          className="ml-1 inline-flex size-4 items-center justify-center rounded-full text-ink/45 hover:bg-ink/10 hover:text-ink"
                        >
                          <Eye className="size-3" />
                        </button>
                      );
                    })()}
                    {isPinned && (
                      <button
                        onClick={() => setPinned((p) => p.filter((id) => id !== g.kind.slice(7)))}
                        title="Ocultar esta columna de cliente"
                        className="ml-1.5 inline-flex size-4 items-center justify-center rounded-full text-ink/40 hover:bg-ink/10 hover:text-ink"
                      >
                        <X className="size-3" />
                      </button>
                    )}
                     {pend > 0 && (
                       <select aria-label={`Destino de ${g.label}`} value={destinationByClient[g.kind.slice(7)] ?? "nacional"} onChange={(e) => setDestinationByClient((prev) => ({ ...prev, [g.kind.slice(7)]: e.target.value as "nacional" | "internacional" }))} className="ml-2 border border-ink/15 bg-white px-1 py-0.5 text-[10px] normal-case tracking-normal">
                         <option value="nacional">Nacional · COP</option><option value="internacional">Internacional · USD</option>
                       </select>
                     )}
                     {pend > 0 && (
                      <Button
                        onClick={() => createPreventa(g.kind)}
                        disabled={creatingFor !== null}
                        className="ml-2 h-auto rounded-full bg-ink px-2.5 py-0.5 text-[9px] font-medium normal-case tracking-normal text-ivory hover:opacity-90 disabled:opacity-50"
                      >
                        {creatingFor === g.kind ? "Guardando…" : hasOpen ? "Actualizar pedido" : "Crear pedido preventa"}
                      </Button>
                    )}
                   </div>
                  </th>
                 );
               })}
              <th colSpan={sizes.length + 1} className="border-l border-ink/10 bg-[color-mix(in_oklab,var(--color-ink)_15%,white)] px-2 py-2 text-center text-[10px] uppercase tracking-wider">Total B2B</th>
              <th colSpan={sizes.length + 1} className="border-l border-ink/10 bg-[color-mix(in_oklab,var(--color-moss)_25%,white)] px-2 py-2 text-center text-[10px] uppercase tracking-wider" title="POS Eventos + Ecommerce + eventos + clientes B2B">Total B2B + B2C</th>
              <th colSpan={sizes.length + 1} className="border-l border-ink/10 bg-cream px-2 py-2 text-center text-[10px] uppercase tracking-wider" title="Curva Corte menos Total B2B + B2C">Saldo</th>
            </tr>
            <tr className="bg-white">
                 <th className="sticky left-0 z-40 w-[180px] min-w-[180px] max-w-[180px] bg-white px-3 py-2 text-left">Referencia</th>
                 <th className="sticky left-[180px] z-40 w-[110px] min-w-[110px] max-w-[110px] bg-white px-2 py-2 text-left">Color</th>
              {[...groups.map((g) => g.kind), "tot", "grand", "final"].map((k) => (
                   <SizeHeads key={k} sizes={sizes} sticky={k === "cut"} />
              ))}
            </tr>
          </thead>
          <tbody>
            {(model?.rows ?? []).map((r) => {
              const selectionKey = `${activeCol}|${r.key}`;
              const selected = selectedRow === selectionKey;
              return (
                <tr
                  key={r.key}
                  className="b2b-matrix-row border-t border-ink/5"
                  data-selected={selected}
                  aria-selected={selected}
                  onClick={() => setSelectedRow(selectionKey)}
                  onFocusCapture={(event) => {
                    if (event.target instanceof HTMLInputElement) setSelectedRow(selectionKey);
                  }}
                >
                   <td className="sticky left-0 z-20 w-[180px] min-w-[180px] max-w-[180px] bg-white px-3 py-1.5 font-medium">
                     <Button
                       type="button"
                       variant="ghost"
                       aria-pressed={selected}
                       aria-label={`Resaltar ${r.name}, ${r.color}`}
                       onClick={(event) => {
                         event.stopPropagation();
                         setSelectedRow(selected ? null : selectionKey);
                       }}
                       className="h-auto min-h-7 w-full justify-start whitespace-normal rounded-sm px-0 py-0 text-left text-xs font-medium hover:bg-transparent"
                     >
                       {r.name}
                     </Button>
                   </td>
                   <td className="sticky left-[180px] z-20 w-[110px] min-w-[110px] max-w-[110px] bg-white px-2 py-1.5 text-ink/60">{r.color}</td>
                  {groups.map((g) => {
                    let t = 0;
                    const cKey = g.kind.startsWith("client:") ? g.kind.slice(7) : null;
                    const mark = cKey ? marks?.[`${cKey}|${r.key}`] : undefined;
                    const markTint = mark === "green" ? "bg-[color-mix(in_oklab,var(--color-moss)_22%,transparent)]" : mark === "yellow" ? "bg-[color-mix(in_oklab,var(--color-mark-pending)_40%,transparent)]" : mark === "red" ? "bg-destructive/20" : "";
                    return [
                      ...sizes.map((s, i) => {
                        const ids = r.bySize[s];
                        const id = ids?.length === 1 ? ids[0] : undefined;
                        const n = get(g.kind, ids); t += n;
                        const isClient = g.kind.startsWith("client:");
                        const shipped = isClient ? sumMatrixVariants(ids, variantId => model?.shipped?.[`${g.kind}|${variantId}`] ?? 0) : 0;
                        const lockedQty = isClient ? sumMatrixVariants(ids, variantId => matrixClientQuantity(data?.items ?? [], g.kind.slice(7), variantId, true)) : 0;
                        const locked = isClient && lockedQty > 0;
                        const pKey = `${g.kind}|${id}`;
                        const tone = !n || !isClient ? "" : shipped >= n ? "text-moss font-semibold" : shipped > 0 ? "text-ink font-semibold" : "text-clay";
                        return (
                           <td key={g.kind + s} title={locked ? `${lockedQty} de ${n} en pedidos confirmados · puedes sumar unidades nuevas; para bajar, desde el detalle del pedido` : undefined} className={`${i === 0 ? "border-l border-ink/10" : ""} ${g.kind === "cut" ? "sticky z-10 bg-white" : ""} ${shipped >= n && n > 0 ? "bg-moss/10" : markTint} w-10 min-w-10 max-w-10 p-0 text-center`} style={g.kind === "cut" ? { left: `${290 + i * 40}px` } : undefined}>
                              {id ? (
                                locked && !(g.editable && isClient) ? (
                                  <span className="mx-auto my-0.5 block w-9 rounded-md bg-clay/20 py-1 text-clay font-semibold">{n}</span>
                                ) : g.editable ? (
                                  isClient ? (
                                    <input
                                      type="number"
                                      aria-label={`${g.label} · ${r.name} · ${sizeLabel(s)}`}
                                      disabled={creatingFor !== null}
                                      value={pending[pKey] ?? (n || "")}
                                      onChange={(e) => setPending((p) => ({ ...p, [pKey]: Math.max(0, Number(e.target.value) || 0) }))}
                                      min={locked ? lockedQty : 0}
                                      className={`w-10 ${locked ? "bg-clay/15" : "bg-transparent"} py-1.5 text-center outline-none focus:bg-moss/10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${pending[pKey] !== undefined ? "font-semibold text-ink" : tone}`}
                                    />
                                  ) : (
                                    <input
                                      key={`${id}-${n}-${shipped}`}
                                      type="number"
                                      min={0}
                                      defaultValue={n || ""}
                                      onBlur={(e) => { const v = Number(e.target.value) || 0; if (v !== n) save(g.kind, id, v); }}
                                      className={`w-10 bg-transparent py-1.5 text-center outline-none focus:bg-moss/10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none ${tone}`}
                                    />
                                  )
                                ) : g.kind === "saldo" ? <span className={`block py-1.5 ${n < 0 ? "bg-destructive text-destructive-foreground" : "text-ink/70"}`}>{n}</span> : <span className="py-1.5 text-ink/70">{n || ""}</span>
                              ) : ids?.length ? <span title="Varias variantes de la misma talla; cantidades agrupadas" className={`block py-1.5 ${tone}`}>{n || ""}</span> : <span className="text-ink/20">·</span>}
                           </td>
                         );
                      }),
                       <td key={g.kind + "t"} className={`${g.kind === "cut" ? "sticky z-10 bg-white" : markTint} w-11 min-w-11 max-w-11 px-1 text-center font-semibold`} style={g.kind === "cut" ? { left: `${290 + sizes.length * 40}px` } : undefined}>
                         {t || ""}
                         {cKey && <MarkPicker value={mark} onChange={(m) => setMark(cKey, r.key, m)} />}
                       </td>,
                    ];
                  })}
                  {(() => {
                    let t = 0;
                    let extra = 0;
                    return [
                      ...sizes.map((s, i) => { const n = orderedFor(r.bySize[s]); const over = overageFor(r.bySize[s]); t += n; extra += over; return <td key={"o" + s} title={overageTitle(over)} onClick={(e) => { e.stopPropagation(); openBreakdown("orders", r.name, sizeLabel(s), r.bySize[s]); }} className={`${i === 0 ? "border-l border-ink/10" : ""} ${overageTone(over)} cursor-pointer px-2 text-center hover:underline`}>{r.bySize[s] ? n : ""}</td>; }),
                      <td key="ot" title={overageTitle(extra)} onClick={(e) => { e.stopPropagation(); openBreakdown("orders", r.name, "todas las tallas", Object.values(r.bySize).flat()); }} className={`${overageTone(extra)} cursor-pointer px-2 text-center font-semibold hover:underline`}>{t}</td>,
                    ];
                  })()}
                  {(() => {
                    let t = 0;
                    let cutT = 0;
                    const over = (n: number, c: number) => n > c ? "bg-destructive text-destructive-foreground font-semibold" : "";
                    return [
                      ...sizes.map((s, i) => { const n = grandFor(r.bySize[s]); const c = get("cut", r.bySize[s]); t += n; cutT += c; return <td key={"g" + s} title={n > c ? `Supera la Curva Corte (${c}) en ${n - c}` : undefined} onClick={(e) => { e.stopPropagation(); openBreakdown("grand", r.name, sizeLabel(s), r.bySize[s]); }} className={`${i === 0 ? "border-l border-ink/10" : ""} ${r.bySize[s] ? over(n, c) : ""} cursor-pointer px-2 text-center hover:underline`}>{r.bySize[s] ? n : ""}</td>; }),
                      <td key="gt" title={t > cutT ? `Supera la Curva Corte (${cutT}) en ${t - cutT}` : undefined} onClick={(e) => { e.stopPropagation(); openBreakdown("grand", r.name, "todas las tallas", Object.values(r.bySize).flat()); }} className={`${over(t, cutT)} cursor-pointer px-2 text-center font-semibold hover:underline`}>{t}</td>,
                    ];
                  })()}
                  {(() => {
                    let t = 0;
                    const tone = (n: number) => n < 0 ? "bg-destructive text-destructive-foreground font-semibold" : "";
                    return [
                      ...sizes.map((s, i) => { const n = r.bySize[s] ? get("cut", r.bySize[s]) - grandFor(r.bySize[s]) : 0; t += n; return <td key={"f" + s} title={n < 0 ? `Supera la Curva Corte en ${-n}` : undefined} className={`${i === 0 ? "border-l border-ink/10" : ""} ${tone(n)} px-2 text-center`}>{r.bySize[s] ? n : ""}</td>; }),
                      <td key="ft" className={`${tone(t)} px-2 text-center font-semibold`}>{t}</td>,
                    ];
                  })()}
                </tr>
              );
            })}
          </tbody>
          {model && model.rows.length > 0 && (
            <tfoot className="sticky bottom-0 bg-cream font-semibold">
              <tr className="border-t-2 border-ink/20">
                 <td colSpan={2} className="sticky left-0 z-20 bg-cream px-3 py-2">Totales</td>
                {groups.map((g) => {
                  const tt = totalsFor((id) => get(g.kind, id));
                   return [...tt.map((n, i) => <td key={g.kind + i} className={`${i === 0 ? "border-l border-ink/10" : ""} ${g.kind === "cut" ? "sticky z-10 bg-cream" : ""} w-10 min-w-10 max-w-10 px-1 text-center`} style={g.kind === "cut" ? { left: `${290 + i * 40}px` } : undefined}>{n}</td>), <td key={g.kind + "T"} className={`${g.kind === "cut" ? "sticky z-10 bg-cream" : ""} w-11 min-w-11 max-w-11 px-1 text-center`} style={g.kind === "cut" ? { left: `${290 + sizes.length * 40}px` } : undefined}>{tt.reduce((a, b) => a + b, 0)}</td>];
                })}
                {(() => { const tt = totalsFor(orderedFor); const excess = sizes.map(s => model.rows.reduce((sum, row) => sum + overageFor(row.bySize[s]), 0)); const extra = excess.reduce((a, b) => a + b, 0); return [...tt.map((n, i) => <td key={"o" + i} title={overageTitle(excess[i])} className={`${i === 0 ? "border-l border-ink/10" : ""} ${overageTone(excess[i])} px-2 text-center`}>{n}</td>), <td key="oT" title={overageTitle(extra)} className={`${overageTone(extra)} px-2 text-center`}>{tt.reduce((a, b) => a + b, 0)}</td>]; })()}
                {(() => { const tt = totalsFor(grandFor); return [...tt.map((n, i) => <td key={"g" + i} className={`${i === 0 ? "border-l border-ink/10" : ""} px-2 text-center`}>{n}</td>), <td key="gT" className="px-2 text-center">{tt.reduce((a, b) => a + b, 0)}</td>]; })()}
                {(() => { const tt = totalsFor((id) => get("cut", id) - grandFor(id)); const T = tt.reduce((a, b) => a + b, 0); return [...tt.map((n, i) => <td key={"f" + i} className={`${i === 0 ? "border-l border-ink/10" : ""} ${n < 0 ? "bg-destructive text-destructive-foreground" : ""} px-2 text-center`}>{n}</td>), <td key="fT" className={`${T < 0 ? "bg-destructive text-destructive-foreground" : ""} px-2 text-center`}>{T}</td>]; })()}
              </tr>
            </tfoot>
          )}
        </table>
        {breakdown && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/40 p-4" onClick={() => setBreakdown(null)}>
            <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="mb-3 flex items-start justify-between gap-3">
                <h3 className="font-nm text-base">{breakdown.title}</h3>
                <button type="button" aria-label="Cerrar" onClick={() => setBreakdown(null)}><X className="h-4 w-4" /></button>
              </div>
              {breakdown.lines.length ? (
                <ul className="max-h-[60vh] divide-y divide-ink/5 overflow-auto text-sm">
                  {breakdown.lines.map(([l, n]) => <li key={l} className="flex justify-between py-1.5"><span>{l}</span><span className="font-semibold">{n}</span></li>)}
                </ul>
              ) : <p className="text-sm text-moss/70">No hay unidades en esta casilla.</p>}
              <div className="mt-3 flex justify-between border-t border-ink/15 pt-2 text-sm font-semibold"><span>Total</span><span>{breakdown.total}</span></div>
              {breakdown.cut !== undefined && (
                <div className={`mt-1 flex justify-between text-sm ${breakdown.total > breakdown.cut ? "text-destructive font-semibold" : "text-moss/70"}`}>
                  <span>Curva Corte</span><span>{breakdown.cut}{breakdown.total > breakdown.cut ? ` · se pasa en ${breakdown.total - breakdown.cut}` : ""}</span>
                </div>
              )}
            </div>
          </div>
        )}
        {showNewClient && (
          <NewClientModal
            onClose={() => setShowNewClient(false)}
            onCreated={(id) => {
              setShowNewClient(false);
              setPinned((p) => [...p, id]);
              qc.invalidateQueries({ queryKey: ["b2b-matrix"] });
            }}
          />
        )}
        {showStores && (
          <ClientStoresModal
            onClose={() => { setShowStores(false); qc.invalidateQueries({ queryKey: ["b2b-matrix"] }); }}
            onPin={(id) => setPinned((p) => (p.includes(id) ? p : [...p, id]))}
          />
        )}
        {showNewOrder && (
          <B2BManualOrder
            onClose={() => setShowNewOrder(false)}
            onCreated={(id) => { setPinned((p) => (p.includes(id) ? p : [...p, id])); qc.invalidateQueries({ queryKey: ["b2b-matrix"] }); }}
          />
        )}
        {isLoading && <p className="px-5 py-8 text-sm text-moss/60">Cargando matriz…</p>}
        {!isLoading && model && !model.rows.length && (
          <p className="px-5 py-8 text-sm text-moss/60">
            {search.trim() ? "Ninguna referencia coincide con la búsqueda." : onlyPreventa ? "Ninguna referencia de esta colección está en preventa. Agrégalas en la pestaña Selección o desmarca el filtro." : "Esta colección no tiene referencias."}
          </p>
        )}
      </div>
    </div>
  );
}

function NewClientModal({ onClose, onCreated }: { onClose: () => void; onCreated: (userId: string) => void }) {
  const [form, setForm] = useState({ fullName: "", company: "", email: "", password: "" });
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [pick, setPick] = useState("");
  const { data: accounts } = useB2BAccounts();
  const set = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const res = await createB2BAccount({ data: { ...form, email: form.email.trim() } });
      toast.success("Cliente B2B creado. Su columna ya está en la matriz: ingresa cantidades para generar el pedido.");
      onCreated(res.userId);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo crear el cliente");
    } finally {
      setSaving(false);
    }
  };

  const input = "w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-moss/40";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl bg-ivory p-6 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-lg">Cliente B2B</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-ink/5"><X className="h-4 w-4" /></button>
        </div>
        <div className="mb-4 flex gap-2">
          {([["existing", "Cliente existente"], ["new", "Crear nuevo"]] as const).map(([k, l]) => (
            <button key={k} onClick={() => setMode(k)} className={"rounded-full px-4 py-2 text-xs " + (mode === k ? "bg-ink text-ivory" : "border border-ink/10 bg-white text-ink/70")}>{l}</button>
          ))}
        </div>
        {mode === "existing" ? (
          <>
            <select value={pick} onChange={(e) => setPick(e.target.value)} className={input + " pr-9"}>
              <option value="">Selecciona un cliente…</option>
              {(accounts ?? []).map((a) => <option key={a.userId} value={a.userId}>{a.name}</option>)}
            </select>
            <p className="mt-3 text-[11px] text-moss/70">Su columna queda fijada en la matriz. Al ingresar cantidades aparece el botón «Crear pedido preventa» en su columna.</p>
            <button
              onClick={() => { onCreated(pick); toast.success("Columna agregada"); }}
              disabled={!pick}
              className="mt-4 w-full rounded-full bg-ink py-3 text-sm text-ivory disabled:opacity-40"
            >
              Agregar columna
            </button>
          </>
        ) : (<>
        <div className="space-y-3">
          <input className={input} placeholder="Nombre del contacto" value={form.fullName} onChange={set("fullName")} />
          <input className={input} placeholder="Empresa / multimarca" value={form.company} onChange={set("company")} />
          <input className={input} type="email" placeholder="Correo" value={form.email} onChange={set("email")} />
          <input className={input} type="text" placeholder="Clave de acceso (mín. 8 caracteres)" value={form.password} onChange={set("password")} />
        </div>
        <p className="mt-3 text-[11px] text-moss/70">Se crea la cuenta con rol B2B y su columna queda fijada en la matriz. Al ingresar cantidades en su columna aparece el botón «Crear pedido preventa» para generar el pedido.</p>
        <button
          onClick={submit}
          disabled={saving || !form.fullName || !form.company || !form.email || form.password.length < 8}
          className="mt-4 w-full rounded-full bg-ink py-3 text-sm text-ivory disabled:opacity-40"
        >
          {saving ? "Creando…" : "Crear cliente y agregar columna"}
        </button>
        </>)}
      </div>
    </div>
  );
}

const MARKS = [
  { v: "green", label: "OK, disponible", cls: "bg-moss" },
  { v: "yellow", label: "Pendiente", cls: "bg-mark-pending" },
  { v: "red", label: "No disponible", cls: "bg-destructive" },
];
function MarkPicker({ value, onChange }: { value?: string; onChange: (m: string | null) => void }) {
  return (
    <span className="mt-0.5 flex justify-center gap-0.5" onClick={(e) => e.stopPropagation()}>
      {MARKS.map((m) => (
        <button key={m.v} type="button" title={m.label} aria-label={m.label} aria-pressed={value === m.v}
          onClick={() => onChange(value === m.v ? null : m.v)}
          className={`size-2.5 rounded-full ${m.cls} ${value === m.v ? "ring-2 ring-ink ring-offset-1" : "opacity-40 hover:opacity-100"}`} />
      ))}
    </span>
  );
}

function SizeHeads({ sizes, sticky = false }: { sizes: string[]; sticky?: boolean }) {
  return (
    <>
      {sizes.map((s, i) => <th key={s} className={`${i === 0 ? "border-l border-ink/10" : ""} ${sticky ? "sticky z-30 bg-white" : ""} w-10 min-w-10 max-w-10 whitespace-nowrap px-0.5 py-2 text-center font-medium`} style={sticky ? { left: `${290 + i * 40}px` } : undefined}>{sizeLabel(s).replace(/\s*-\s*/g, "-")}</th>)}
      <th className={`${sticky ? "sticky z-30 bg-white" : ""} w-11 min-w-11 max-w-11 px-1 py-2 text-center font-semibold`} style={sticky ? { left: `${290 + sizes.length * 40}px` } : undefined}>Total</th>
    </>
  );
}

function ClientStoresModal({ onClose, onPin }: { onClose: () => void; onPin: (columnId: string) => void }) {
  const { data: accounts } = useB2BAccounts();
  const [customer, setCustomer] = useState("");
  const blank = { name: "", recipient: "", phone: "", line1: "", city: "", department: "", country: "CO" };
  const [draft, setDraft] = useState(blank);
  const { data: stores, refetch } = useQuery({
    queryKey: ["b2b-client-stores", customer],
    enabled: !!customer,
    queryFn: async () => (await (supabase as any).from("b2b_client_stores").select("*").eq("customer_id", customer).order("name")).data ?? [],
  });
  const update = async (id: string, patch: Record<string, unknown>) => {
    const { error } = await (supabase as any).from("b2b_client_stores").update(patch).eq("id", id);
    if (error) toast.error(error.message); else refetch();
  };
  const add = async () => {
    if (!draft.name.trim()) return;
    const { error } = await (supabase as any).from("b2b_client_stores").insert({ ...draft, name: draft.name.trim(), customer_id: customer });
    if (error) toast.error(error.message); else { setDraft(blank); refetch(); toast.success("Tienda agregada"); }
  };
  const input = "w-full rounded-lg border border-ink/10 bg-white px-2 py-1.5 text-xs outline-none focus:border-moss/40";
  const fields = [["name", "Tienda"], ["recipient", "Recibe"], ["phone", "Teléfono"], ["line1", "Dirección"], ["city", "Ciudad"], ["department", "Departamento"], ["country", "País (CO, PE…)"]] as const;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-t-3xl bg-ivory p-6 sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="font-serif text-lg">Tiendas del cliente</h3>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-ink/5"><X className="h-4 w-4" /></button>
        </div>
        <select value={customer} onChange={(e) => setCustomer(e.target.value)} className={input + " mb-3 py-2.5 text-sm"}>
          <option value="">Selecciona un cliente…</option>
          {(accounts ?? []).map((a) => <option key={a.userId} value={a.userId}>{a.name}</option>)}
        </select>
        <p className="mb-3 text-[11px] text-moss/70">Cada tienda es una columna en la matriz y genera su propio pedido con despacho a su dirección. La factura siempre sale a nombre del cliente.</p>
        {customer && (
          <table className="w-full text-xs">
            <thead><tr>{fields.map(([, l]) => <th key={l} className="px-1 py-1 text-left font-medium">{l}</th>)}<th /></tr></thead>
            <tbody>
              {(stores ?? []).map((st: any) => (
                <tr key={st.id} className={st.active ? "" : "opacity-50"}>
                  {fields.map(([k]) => (
                    <td key={k} className="px-1 py-1">
                      <input key={`${st.id}-${st[k] ?? ""}`} defaultValue={st[k] ?? ""} className={input}
                        onBlur={(e) => { const v = e.target.value.trim(); if (v !== (st[k] ?? "") && (k !== "name" || v)) update(st.id, { [k]: v || null }); }} />
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-1 py-1">
                    <button onClick={() => { onPin(`${customer}~${st.id}`); toast.success("Columna agregada a la matriz"); }} className="mr-1 rounded-full bg-ink px-2.5 py-1 text-[10px] text-ivory">Columna</button>
                    <button onClick={() => update(st.id, { active: !st.active })} className="rounded-full border border-ink/15 px-2.5 py-1 text-[10px]">{st.active ? "Desactivar" : "Activar"}</button>
                  </td>
                </tr>
              ))}
              <tr>
                {fields.map(([k]) => (
                  <td key={k} className="px-1 py-1"><input value={draft[k]} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} placeholder={k === "name" ? "Nueva tienda" : ""} className={input} /></td>
                ))}
                <td className="px-1 py-1"><button onClick={add} disabled={!draft.name.trim()} className="rounded-full bg-moss px-2.5 py-1 text-[10px] text-ivory disabled:opacity-40">Agregar</button></td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
