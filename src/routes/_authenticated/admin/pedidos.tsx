import { createFileRoute } from "@tanstack/react-router";
import { isAwaitingGateway, AWAITING_KEY } from "@/lib/admin/awaiting-gateway";
import { useDraftState } from "@/hooks/use-draft-state";
import { useQuery } from "@tanstack/react-query";
import { useOrderInvoices, InvoiceCell } from "@/components/admin/invoice-cell";
import { useMemo, useState } from "react";
import { usePersistedState } from "@/hooks/use-persisted-state";
import { Search, Download, ChevronDown, ChevronUp, Info, Package, StickyNote } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip as ChartTooltip } from "recharts";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { formatCOP, formatUSD } from "@/lib/format";
import { normSearch } from "@/lib/search-text";
import { sumOrderIva, sumOrderTotals } from "@/lib/order-totals";
import { orderBackupRows, type BackupItem } from "@/lib/order-backup";
import { analysisAmount, analysisBillingIncludes, analysisIncludes, analysisTotals } from "@/lib/order-analysis";
import { calendarSalesRange, colombiaClock, colombiaDate, inSalesRange } from "@/lib/ready/sales-period";
import { useReadyPageContext } from "@/components/ready/ready-context";
import { channelOf, type ChannelKey } from "@/lib/order-channel";
import { ManualOrderModal } from "@/components/admin/manual-order-modal";
import { Plus, CalendarDays, Store, List, BarChart3, ArrowUpRight } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function shortRange(from: string, to: string) {
  const [, fm, fd] = from.split("-").map(Number);
  const [, tm, td] = to.split("-").map(Number);
  if (from === to) return `${td} ${MONTHS_SHORT[tm - 1]}`;
  return fm === tm ? `${fd}–${td} ${MONTHS_SHORT[tm - 1]}` : `${fd} ${MONTHS_SHORT[fm - 1]} – ${td} ${MONTHS_SHORT[tm - 1]}`;
}
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchAll } from "@/lib/fetch-all";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { MobileOrderList } from "@/components/admin/mobile-order-list";
import { changePct, TrendChart, type TrendPoint } from "@/components/analytics/shopify-charts";
import { isWarehouseOnly, userRolesOptions, useSession } from "@/lib/auth-hooks";

export const Route = createFileRoute("/_authenticated/admin/pedidos")({
  head: () => ({ meta: [
    { title: "Pedidos de ventas | Tu Marca" },
    { name: "description", content: "Consulta y gestión de pedidos de todos los canales de Tu Marca." },
    { property: "og:title", content: "Pedidos de ventas | Tu Marca" },
    { property: "og:description", content: "Consulta y gestión de pedidos de todos los canales de Tu Marca." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: OrdersAdmin,
});

// La barra de totales sobre la tabla solo la ven Nelcy (contabilidad) y Juan.
const TOTALS_VIEWERS = new Set([
  "9b71625c-a712-4ab4-9d43-9f459a04d2a9", // Nelcy
  "d69f1c93-53fd-4494-9772-e0b8633619b3", // Juan
]);

const STORE_OPTIONS = [
  { value: "all", label: "Todos los canales" },
  { value: "ecom", label: "Web" },
  { value: "cali", label: "POS Eventos" },
  { value: "assisted", label: "B2B" },
  { value: "manual", label: "Pedido Manual" },
];

const GATEWAY_LABEL: Record<string, string> = {
  bold: "Bold",
  wompi: "Wompi", addi: "Addi", transfer: "Transferencia", transferencia: "Transferencia",
  paguelofacil: "Páguelo Fácil", paguelo_facil: "Páguelo Fácil", paypal: "PayPal",
  efectivo: "Efectivo", datafono: "Datáfono", tarjeta: "Tarjeta", card: "Tarjeta",
};
function gatewayLabel(o: OrderRow, providers: Map<string, string> | undefined) {
  const creditMethod = [o.b2b_payment_method, o.payment_method].find((method) => method?.startsWith("credito"));
  if (creditMethod) return `Crédito · ${Number(creditMethod.replace(/\D/g, "")) || 15} días`;
  if (o.pos_sales?.length) return "POS";
  const m = (o.payment_method ?? "").toLowerCase();
  if (o.source === "ecom" && !o.is_manual && o.payment_reference) {
    const provider = providers?.get(o.payment_reference)?.toLowerCase();
    if (provider) return GATEWAY_LABEL[provider] ?? provider;
  }
  if (m === "card") return providers ? "Pasarela no disponible" : "Consultando pasarela…";
  return GATEWAY_LABEL[m] ?? (m || "—");
}

function todayISO(offsetDays = 0) {
  return colombiaDate(offsetDays);
}

type OrderRow = {
  id: string;
  number: string;
  status: string;
  source: string;
  is_manual: boolean;
  b2b_mode: string | null;
  customer_id: string | null;
  subtotal_cop: number;
  total_cop: number;
  tax_included_cop: number;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  paid_at: string | null;
  payment_status: string | null;
  payment_method: string | null;
  b2b_payment_method: string | null;
  payment_reference: string | null;
  currency: string | null;
  total_usd: number | null;
  notes: string | null;
  created_at: string;
  order_items: BackupItem[];
  invoices?: { status: string; number: string | null }[];
  returns?: { kind: string | null; status: string | null }[];
  pos_sales: { pos_sessions: { locations: { code: string; name: string } | null } | null }[];
};

const ORDER_SELECT =
"id, number, status, source, is_manual, b2b_mode, customer_id, subtotal_cop, total_cop, tax_included_cop, contact_name, contact_email, contact_phone, paid_at, payment_status, payment_method, b2b_payment_method, payment_reference, currency, total_usd:total_usd_exact, created_at, needs_stock, notes, order_items(qty, product_name, variant_label, unit_price_cop, unit_price_usd, product_variants(size, color, sku)), pos_sales(pos_sessions(locations(code, name))), sold_by:locations!orders_sold_by_location_id_fkey(name), returns!returns_order_id_fkey(kind, status)";

function storeOf(o: OrderRow) {
  if (o.source === "assisted") return "assisted";
  const loc = o.pos_sales?.[0]?.pos_sessions?.locations?.code;
  if (loc) return loc;
  return o.source === "ecom" ? "ecom" : o.source;
}

const CHANNELS: { key: ChannelKey; label: string; color: string }[] = [
  { key: "online", label: "Online", color: "var(--channel-online)" },
  { key: "manual", label: "Pedido Manual", color: "var(--channel-manual)" },
  { key: "b2b", label: "B2B", color: "var(--channel-b2b)" },
  { key: "pos", label: "POS", color: "var(--channel-pos)" },
];

/** Reparte el 100 % entre canales sin que el redondeo pase de 100. */
function sharesOf(values: number[], total: number) {
  if (!total) return values.map(() => 0);
  const raw = values.map((v) => (v / total) * 100);
  const base = raw.map((r) => Math.floor(r));
  let left = 100 - base.reduce((s, r) => s + r, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (const o of order) {
    if (left <= 0) break;
    base[o.i] += 1;
    left -= 1;
  }
  return base;
}

function channelLabel(o: OrderRow) {
  const isB2B = channelOf(o) === "b2b";
  const b2b = isB2B ? (o.b2b_mode === "restock" ? "B2B Restock" : "B2B") : null;
  if (o.source === "assisted") {
    if (b2b) return b2b;
    const by = (o as any).sold_by?.name as string | undefined;
    return by ? `B2B · ${by.replace("Tienda ", "")}` : "B2B";
  }
  const locName = o.pos_sales?.[0]?.pos_sessions?.locations?.name;
  if (locName) return locName;
  if (o.source === "ecom") return b2b ?? (o.is_manual ? "Pedido Manual" : "Online");
  if (o.source === "pos") return "POS";
  return "Asistido";
}

type Dest = "all" | "nacional" | "internacional";

const DEST_OPTIONS: { value: Dest; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "nacional", label: "Nacionales · COP" },
  { value: "internacional", label: "Internacionales · USD" },
];

/** Un pedido es internacional cuando se cobra en dólares (Panamá y resto del mundo). */
function isInternational(o: OrderRow) {
  return o.currency === "USD";
}

function OrdersAdmin() {
  const [tab, setTab] = usePersistedState<"lista" | "analisis">("pedidos.tab", "lista");
  const [newOrder, setNewOrder] = useDraftState("draft-manual-order-open", false);
  const [dest, setDest] = usePersistedState<Dest>("pedidos.dest", "all");
  const { user } = useSession();
  const { data: roles } = useQuery({ ...userRolesOptions(user?.id ?? "anon"), enabled: !!user });
  const isWarehouse = isWarehouseOnly(roles ?? []);
  return (
    <div className="w-full min-w-0 p-4 md:p-10">
      <header className="mb-5 md:mb-6 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 md:flex md:flex-wrap md:justify-between md:gap-4">
        <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-moss/70">Ventas</p>
        <h1 className="font-serif text-3xl md:text-4xl mt-1">Pedidos</h1>
        <p className="text-sm text-moss/70 mt-2"><span className="md:hidden">Gestiona todas tus ventas</span><span className="hidden md:inline">Todos los pedidos de todas las tiendas en un solo lugar.</span></p>
        </div>
        <button
          onClick={() => setNewOrder(true)}
          className="shrink-0 flex items-center gap-1.5 md:gap-2 px-4 md:px-5 py-2 md:py-2.5 rounded-full bg-ink text-ivory text-xs md:uppercase md:tracking-widest hover:bg-ink/85"
        >
          <Plus className="size-3.5" /> <span className="md:hidden">Pedido</span><span className="hidden md:inline">Pedido manual</span>
        </button>
      </header>
      {newOrder && <ManualOrderModal onClose={() => setNewOrder(false)} />}

      <div className="md:hidden mb-4 space-y-3">
        <div className="grid grid-cols-3 gap-1 rounded-full border border-ink/10 bg-white p-1">
          {DEST_OPTIONS.map((d) => (
            <button key={d.value} onClick={() => setDest(d.value)}
              className={"rounded-full py-2 text-xs transition-colors " + (dest === d.value ? "bg-ink text-ivory" : "text-moss")}>
              {d.label.split(" · ")[0]}
            </button>
          ))}
        </div>
        {!isWarehouse && (
          <button onClick={() => setTab((t) => (t === "analisis" ? "lista" : "analisis"))} className="inline-flex items-center gap-1.5 text-sm text-ink">
            {tab === "analisis" ? <><List className="size-4" /> Ver lista</> : <><BarChart3 className="size-4" /> Ver análisis <ArrowUpRight className="size-3.5" /></>}
          </button>
        )}
      </div>

      <div className="hidden md:flex flex-wrap gap-2 mb-8">
        {!isWarehouse && (
        <button
          onClick={() => setTab((t) => (t === "analisis" ? "lista" : "analisis"))}
          className={
            "px-5 py-2 rounded-full text-xs uppercase tracking-widest transition-colors " +
            (tab === "analisis"
              ? "bg-ink text-ivory"
              : "bg-white border border-ink/10 text-moss hover:text-ink")
          }
        >
          Análisis
        </button>
        )}
        <div className="flex min-w-0 flex-wrap gap-1.5 md:ml-4">
          {DEST_OPTIONS.map((d) => (
            <button
              key={d.value}
              onClick={() => setDest(d.value)}
              className={
                "px-4 py-2 rounded-full text-xs uppercase tracking-widest transition-colors " +
                (dest === d.value
                  ? "bg-ink text-ivory"
                  : "bg-white border border-ink/10 text-moss hover:text-ink")
              }
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "analisis" && !isWarehouse ? (
        <OrdersAnalytics dest={dest} />
      ) : (
        <OrdersList key="todos" scope="todos" dest={dest} />
      )}
    </div>
  );
}


// ======================= Lista global de pedidos =======================

const STATUS_LABEL: Record<string, string> = {
  pendiente_pago: "Pendiente pago",
  pagado: "Pagado",
  credito: "Crédito",
  no_preparado: "No preparado",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

function paymentBadge(o: OrderRow) {
  if (o.status === "cancelled") return { key: "cancelado", label: "Cancelado", cls: "bg-red-50 text-red-600" };
  if (o.status === "refunded") return { key: "cancelado", label: "Reembolsado", cls: "bg-ink/5 text-moss" };
  const creditMethod = [o.b2b_payment_method, o.payment_method].find((method) => method?.startsWith("credito"));
  if (creditMethod && o.payment_status !== "paid") return {
    key: "credito",
    label: `Crédito · ${Number(creditMethod.replace(/\D/g, "")) || 15} días`,
    cls: "bg-channel-manual/10 text-ink",
  };
  if (o.payment_status === "paid" || o.paid_at) return { key: "pagado", label: "Pagado", cls: "bg-ink/5 text-ink" };
  return { key: "pendiente_pago", label: "Pendiente pago", cls: "bg-amber-50 text-amber-700" };
}

function fulfillmentBadge(o: OrderRow) {
  if (o.status === "cancelled" || o.status === "refunded") return { key: "cancelado", label: "—", cls: "bg-ink/5 text-moss/50" };
  const anyO = o as any;
  const isB2bOrManual = String(o.number ?? "").startsWith("B2B-") || (!!anyO.b2b_mode && anyO.b2b_mode !== "direct") || !!anyO.is_manual;
  const isPos = !isB2bOrManual && (o.source === "pos" || o.source === "assisted" || !!o.pos_sales?.[0]?.pos_sessions?.locations);
  if (isPos) return { key: "entregado", label: "Entregado", cls: "bg-ink/5 text-ink" };
  if (o.status === "shipped" || o.status === "delivered") return { key: "entregado", label: "Entregado", cls: "bg-ink/5 text-ink" };
  if (o.status === "preparing") return { key: "no_preparado", label: "En preparación", cls: "bg-yellow-100 text-yellow-800" };
  return { key: "no_preparado", label: "No preparado", cls: "bg-yellow-100 text-yellow-800" };
}

function relativeDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  const time = d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
  if (diffDays === 0) return `Hoy a las ${time}`;
  if (diffDays === 1) return `Ayer a las ${time}`;
  const day = d.toLocaleDateString("es-CO", { weekday: "long" });
  if (diffDays < 7) return `${day} a las ${time}`;
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" }) + ` · ${time}`;
}

function OrdersList({ scope, dest }: { scope: "todos" | "web" | "pos"; dest: Dest }) {
  const navigate = useNavigate();
  const { user } = useSession();
  const [query, setQuery] = usePersistedState("pedidos.q", "");
  const [fStore, setFStore] = usePersistedState("pedidos.store", "ecom");
  const [fStatus, setFStatus] = usePersistedState("pedidos.status", "all");
  const [fFrom, setFFrom] = usePersistedState("pedidos.from", "");
  const [fTo, setFTo] = usePersistedState("pedidos.to", "");
  const [sortDesc, setSortDesc] = usePersistedState("pedidos.sort", true);
  const [limit, setLimit] = usePersistedState("pedidos.limit", 50);
  const [itemsFor, setItemsFor] = useState<OrderRow | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const [expFrom, setExpFrom] = useState(todayISO(-29));
  const [expTo, setExpTo] = useState(todayISO(0));
  const [exporting, setExporting] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "orders-list"],
    queryFn: async () => {
      const data = await fetchAll((from, to) => supabase
        .from("orders")
        .select(ORDER_SELECT)
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to));
      return data as unknown as OrderRow[];
    },
  });

  // Notas internas del equipo por pedido (las 3 más recientes de cada uno)
  const { data: orderNotes } = useQuery({
    queryKey: ["admin", "order-team-notes"],
    queryFn: async () => {
      const { data } = await supabase
        .from("team_notes")
        .select("id, entity_id, body, created_at")
        .eq("entity_type", "order")
        .order("created_at", { ascending: false });
      const map = new Map<string, { id: string; body: string; created_at: string }[]>();
      for (const n of (data ?? []) as { id: string; entity_id: string; body: string; created_at: string }[]) {
        const list = map.get(n.entity_id) ?? [];
        if (list.length < 3) list.push(n);
        map.set(n.entity_id, list);
      }
      return map;
    },
  });

  const filtered = useMemo(() => {
    let rows = data ?? [];
    if (dest !== "all") rows = rows.filter((o) => isInternational(o) === (dest === "internacional"));
    if (scope === "web") {
      rows = rows.filter((o) => channelOf(o) === "online");
    } else if (scope === "pos") {
      rows = rows.filter((o) => o.source === "pos" || o.source === "assisted" || !!o.pos_sales?.[0]?.pos_sessions?.locations);
    }
    if (fStore !== "all") rows = rows.filter((o) => fStore === "manual" ? !!o.is_manual : storeOf(o) === fStore);
    if (fStatus === AWAITING_KEY) rows = rows.filter((o) => isAwaitingGateway(o));
    else {
      rows = rows.filter((o) => !isAwaitingGateway(o));
      if (fStatus !== "all") rows = rows.filter((o) => paymentBadge(o).key === fStatus || fulfillmentBadge(o).key === fStatus);
    }
    const q = normSearch(query);
    if (q) {
      if (/^\d+$/.test(q)) {
        // Solo dígitos: buscar por el consecutivo final del número de pedido
        rows = rows.filter((o) => normSearch(o.number).endsWith(q));
      } else {
        rows = rows.filter((o) =>
          normSearch(o.number).includes(q) ||
          normSearch(o.contact_name).includes(q) ||
          normSearch(o.contact_email).includes(q) ||
          normSearch(o.contact_phone).includes(q) ||
          (o.order_items ?? []).some((i) => normSearch(i.product_name).includes(q)),
        );
      }
    }
    if (fFrom || fTo) {
      const range = calendarSalesRange(fFrom || fTo, fTo || fFrom);
      rows = rows.filter((o) => inSalesRange(o.created_at, range.from, range.to));
    }
    if (!sortDesc) rows = [...rows].reverse();
    return rows;
  }, [data, scope, dest, fStore, fStatus, fFrom, fTo, query, sortDesc]);

  const visible = filtered.slice(0, limit);
  const totals = useMemo(() => sumOrderTotals(filtered), [filtered]);
  const { data: invoices } = useOrderInvoices(visible.map((o) => o.id));
  const references = visible.filter((o) => o.source === "ecom" && !o.is_manual && o.payment_reference).map((o) => o.payment_reference as string);
  const { data: providers } = useQuery({
    queryKey: ["admin", "order-payment-providers", references],
    enabled: references.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_attempts").select("reference, provider").in("reference", references);
      if (error) throw error;
      return new Map((data ?? []).map((row) => [row.reference, row.provider]));
    },
  });

  const writeOrdersExcel = async (rows: OrderRow[], tag: string) => {
    const XLSX = await import("xlsx");
    const exportProviders = new Map(providers ?? []);
    const paymentRefs = [...new Set(rows.map((o) => o.payment_reference).filter((ref): ref is string => Boolean(ref)))];
    for (let start = 0; start < paymentRefs.length; start += 100) {
      const { data: attempts, error } = await supabase.from("payment_attempts").select("reference, provider").in("reference", paymentRefs.slice(start, start + 100));
      if (error) throw error;
      for (const attempt of attempts ?? []) exportProviders.set(attempt.reference, attempt.provider);
    }
    const backup = orderBackupRows(rows, (o) => channelLabel(o as OrderRow), (o) => gatewayLabel(o as OrderRow, exportProviders));
    const wb = XLSX.utils.book_new();
    for (const [name, entries] of [["Pedidos", backup.summary], ["Productos y tallas", backup.items]] as const) {
      const ws = XLSX.utils.json_to_sheet(entries);
      const headers = entries[0] ? Object.keys(entries[0]) : [];
      ws["!cols"] = headers.map((h) => ({ wch: h === "Productos y tallas" ? 70 : h === "Producto" || h === "Cliente" || h.includes("Estado") ? 32 : 23 }));
      if (ws["!ref"]) ws["!autofilter"] = { ref: ws["!ref"] };
      headers.forEach((h, c) => {
        if (!h.includes("COP") && !h.includes("US$")) return;
        entries.forEach((_, r) => {
          const cell = ws[XLSX.utils.encode_cell({ r: r + 1, c })];
          if (cell?.t === "n") cell.z = h.includes("US$") ? '"US$"#,##0.00' : '"$"#,##0';
        });
      });
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
    XLSX.writeFile(wb, `pedidos-${tag}-${todayISO()}.xlsx`);
  };

  const exportExcel = async (channel?: string) => {
    let rows = filtered;
    let tag = "filtrados";
    if (channel) {
      rows = (data ?? []).filter((o) => {
        if (channel === "online") return channelOf(o) === "online";
        if (channel === "manual") return channelOf(o) === "manual";
        if (channel === "b2b") return channelOf(o) === "b2b";
        if (channel === "pos_cali") return storeOf(o) === "cali";
        if (channel === "pos_bogota") return storeOf(o) === "bogota";
        return true;
      });
      tag = channel;
    }
    await writeOrdersExcel(rows, tag);
  };

  // Listado completo de pedidos de todos los canales en un rango de fechas (hora Colombia).
  const exportRange = async () => {
    setExporting(true);
    try {
      const range = calendarSalesRange(expFrom, expTo);
      const rows = await fetchAll((offsetFrom, offsetTo) => supabase
        .from("orders")
        .select(ORDER_SELECT)
        .gte("created_at", range.from)
        .lt("created_at", range.to)
        .order("created_at", { ascending: false })
        .order("id")
        .range(offsetFrom, offsetTo));
      await writeOrdersExcel(rows as unknown as OrderRow[], `todos_${expFrom}_a_${expTo}`);
      setRangeOpen(false);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative w-full min-w-0 sm:flex-1 sm:min-w-64">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-moss/50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por número, cliente, email, teléfono o producto…"
            className="w-full bg-white border border-ink/10 rounded-full pl-11 pr-4 py-2.5 text-sm text-ink placeholder:text-moss/40"
          />
        </div>
        {scope === "todos" && <select value={fStore} onChange={(e) => setFStore(e.target.value)}
          className="pill-select bg-white border border-ink/10 rounded-full px-4 py-2.5 text-sm text-ink">
          {STORE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>}
        {scope === "pos" && <select value={fStore} onChange={(e) => setFStore(e.target.value)}
          className="pill-select bg-white border border-ink/10 rounded-full px-4 py-2.5 text-sm text-ink">
          <option value="all">Ambas tiendas</option>
          <option value="cali">POS Eventos</option>
        </select>}
        <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}
          className="pill-select bg-white border border-ink/10 rounded-full px-4 py-2.5 text-sm text-ink">
          <option value="all">Todos los estados</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          <option value={AWAITING_KEY}>Esperando pago en pasarela</option>
        </select>
        <div className="flex items-center gap-1.5">
          <input type="date" value={fFrom} onChange={(e) => setFFrom(e.target.value)} aria-label="Desde" title="Desde"
            className="bg-white border border-ink/10 rounded-full px-3 py-2 text-sm text-ink" />
          <span className="text-xs text-moss/50">a</span>
          <input type="date" value={fTo} onChange={(e) => setFTo(e.target.value)} aria-label="Hasta" title="Hasta"
            className="bg-white border border-ink/10 rounded-full px-3 py-2 text-sm text-ink" />
          {(fFrom || fTo) && (
            <button onClick={() => { setFFrom(""); setFTo(""); }} className="text-xs text-moss underline underline-offset-2 hover:text-ink">
              Limpiar
            </button>
          )}
        </div>
        <div className="relative">
          <button disabled={isLoading} onClick={() => setExportOpen((v) => !v)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white border border-ink/10 text-xs uppercase tracking-widest text-moss hover:text-ink">
            <Download className="size-3.5" /> Exportar <ChevronDown className="size-3" />
          </button>
          {exportOpen && (
            <div className="absolute right-0 top-full mt-2 z-30 w-52 bg-white border border-ink/10 rounded-2xl shadow-lg py-2 text-sm text-ink">
              {[
                ["", "Vista actual (filtros)"],
                ["online", "Online"],
                ["manual", "Pedido Manual"],
                ["b2b", "B2B"],
                ["pos_cali", "POS Eventos"],
              ].map(([val, label]) => (
                <button key={val} onClick={() => { setExportOpen(false); void exportExcel(val || undefined); }}
                  className="block w-full text-left px-4 py-2 hover:bg-ivory/60">
                  {label}
                </button>
              ))}
              <button onClick={() => { setExportOpen(false); setRangeOpen(true); }}
                className="block w-full text-left px-4 py-2 hover:bg-ivory/60 border-t border-ink/10">
                Rango de fechas (todos los canales)
              </button>
            </div>
          )}
        </div>
      </div>

      {!isLoading && filtered.length > 0 && TOTALS_VIEWERS.has(user?.id ?? "") && (
        <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 rounded-2xl border border-ink/10 bg-white px-5 py-3">
          <span className="text-[11px] uppercase tracking-widest text-moss/80">
            {totals.sales} venta{totals.sales === 1 ? "" : "s"}
            {totals.cancelled > 0 && <span className="normal-case tracking-normal text-moss/60"> · {totals.cancelled} cancelada{totals.cancelled === 1 ? "" : "s"} sin contar</span>}
          </span>
          <span className="font-mono text-sm font-medium text-ink">
            {totals.cop > 0 && formatCOP(totals.cop)}
            {totals.cop > 0 && totals.usd > 0 && <span className="text-moss/40"> · </span>}
            {totals.usd > 0 && formatUSD(totals.usd)}
          </span>
          <span className="text-[11px] text-moss/80">{totals.units} artículo{totals.units === 1 ? "" : "s"}</span>
        </div>
      )}

      <div className="max-w-full bg-card border border-border rounded-2xl overflow-x-auto">
        <MobileOrderList orders={visible} loading={isLoading} />
        <table className="hidden w-full text-[13px] min-w-[760px] md:table">
          <thead className="text-[10px] uppercase tracking-widest text-moss/70 border-b border-ink/10">
            <tr>
              <th className="text-left py-3 pl-5 pr-2">Pedido</th>
              <th className="text-left px-2 cursor-pointer select-none" onClick={() => setSortDesc((s) => !s)}>
                <span className="inline-flex items-center gap-1">
                  Fecha {sortDesc ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />}
                </span>
              </th>
              <th className="text-left px-2">Cliente</th>
              <th className="text-left px-2">Canal</th>
              <th className="text-left px-2">Pasarela</th>
              <th className="text-right px-2">Total</th>
              <th className="text-left px-2">Factura</th>
              <th className="text-left px-2">Estado del pago</th>
              <th className="text-left px-2">Preparación</th>
              <th className="text-left px-2">Nota</th>
              <th className="text-right px-2 pr-5">Artículos</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((o) => {
              const pay = paymentBadge(o);
              const ful = fulfillmentBadge(o);
              const units = (o.order_items ?? []).reduce((a, i) => a + i.qty, 0);
              const cancelled = o.status === "cancelled";
              const noteText = [o.notes?.trim() ?? "", ...(orderNotes?.get(o.id) ?? []).map((n) => n.body.trim())].filter(Boolean);
              return (
                <tr key={o.id} onClick={() => navigate({ to: "/admin/pedido/$id", params: { id: o.id } })}
                  className="border-t border-ink/5 hover:bg-ink/[0.02] transition-colors cursor-pointer">
                  <td className="py-3 pl-5 pr-2">
                    <span className={"font-medium text-ink" + (cancelled ? " line-through decoration-[1.5px] decoration-moss/50" : "")}>#{o.number}</span>{(o as any).needs_stock && (
                    <TooltipProvider delayDuration={120}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span
                            className="ml-1.5 inline-flex size-4 cursor-help items-center justify-center rounded-full bg-destructive/10 text-destructive align-middle"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Info className="size-3" />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="top">Sin inventario asignado</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  </td>
                  <td className="px-2 text-moss">{relativeDate(o.created_at)}</td>
                  <td className="px-2">
                    <p className={"text-ink" + (cancelled ? " line-through decoration-[1.5px] decoration-moss/50" : "")}>{o.contact_name ?? "—"}</p>
                    {o.contact_email && <p className="text-[11px] text-moss/60">{o.contact_email}</p>}
                  </td>
                  <td className="px-2 text-moss">{channelLabel(o)}</td>
                   <td className="px-2 text-moss">{gatewayLabel(o, providers)}</td>
                  <td className={"px-2 text-right font-mono text-xs" + (cancelled ? " text-moss/60 line-through decoration-[1.5px] decoration-moss/50" : "")}>{o.currency === "USD" ? formatUSD(o.total_usd) : formatCOP(o.total_cop)}</td>
                  <td className="px-2"><InvoiceCell inv={invoices?.get(o.id)} /></td>
                  <td className="px-2 whitespace-nowrap">
                    <span className={"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap " + pay.cls}>
                      <span className="size-1 rounded-full bg-current" /> {pay.label}
                    </span>
                    {o.returns?.some((r) => r.kind === "cambio" && !["rechazado", "cancelado"].includes(r.status ?? "")) && (
                      <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap border border-moss/40 text-moss">Cambio</span>
                    )}
                  </td>
                  <td className="px-2 whitespace-nowrap">
                    <span className={"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap " + ful.cls}>
                      <span className="size-1 rounded-full bg-current" /> {ful.label}
                    </span>
                  </td>
                  <td className="px-2">
                    {noteText.length > 0 ? (
                      <TooltipProvider delayDuration={120}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span
                              className="inline-flex size-5 cursor-help items-center justify-center rounded-full bg-ink/[0.06] text-moss align-middle"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <StickyNote className="size-3" />
                            </span>
                          </TooltipTrigger>
                          <TooltipContent side="left" className="max-w-xs whitespace-pre-wrap text-[11px] leading-relaxed">
                            {noteText.map((t, i) => (
                              <p key={i} className={i ? "mt-1.5 pt-1.5 border-t border-white/15" : ""}>{t}</p>
                            ))}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-moss/25">—</span>
                    )}
                  </td>
                  <td className="px-2 pr-5 text-right">
                    <button
                      onClick={(e) => { e.stopPropagation(); setItemsFor(o); }}
                      className="text-moss underline-offset-2 hover:text-ink hover:underline cursor-pointer"
                      title="Ver productos del pedido"
                    >
                      {units} artículo{units === 1 ? "" : "s"}
                    </button>
                  </td>
                </tr>
              );
            })}
            {!isLoading && visible.length === 0 && (
              <tr><td colSpan={11} className="py-14 text-center text-sm text-moss/60">Sin pedidos que coincidan con la búsqueda.</td></tr>
            )}
            {isLoading && (
              <tr><td colSpan={11} className="py-14 text-center text-sm text-moss/60">Cargando pedidos…</td></tr>
            )}
          </tbody>
          <tfoot>
            {!isLoading && filtered.length > 0 && (
              <tr className="border-t-2 border-ink/15 bg-ivory/70">
                <td colSpan={5} className="py-3 pl-5 pr-2">
                  <span className="text-[11px] uppercase tracking-widest text-moss/80">
                    {totals.sales} venta{totals.sales === 1 ? "" : "s"}
                  </span>
                  {totals.cancelled > 0 && (
                    <span className="ml-2 text-[11px] text-moss/60">
                      + {totals.cancelled} cancelada{totals.cancelled === 1 ? "" : "s"} sin contar
                    </span>
                  )}
                </td>
                <td className="px-2 text-right font-mono text-xs font-medium text-ink whitespace-nowrap">
                  {totals.cop > 0 && <div>{formatCOP(totals.cop)}</div>}
                  {totals.usd > 0 && <div>{formatUSD(totals.usd)}</div>}
                </td>
                <td colSpan={4} />
                <td className="px-2 pr-5 text-right text-[11px] whitespace-nowrap text-moss/80">
                  {totals.units} artículo{totals.units === 1 ? "" : "s"}
                </td>
              </tr>
            )}
          </tfoot>
        </table>
        {!isLoading && filtered.length > 0 && (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 border-t border-border px-3 py-4 text-xs md:hidden">
            <div className="min-w-0 text-muted-foreground">
              <p>{totals.sales} venta{totals.sales === 1 ? "" : "s"}</p>
              {totals.cancelled > 0 && <p className="mt-1">{totals.cancelled} canceladas sin contar</p>}
              <p className="mt-1">{totals.units} artículos</p>
            </div>
            <div className="shrink-0 text-right font-mono text-foreground">
              {totals.cop > 0 && <p>{formatCOP(totals.cop)}</p>}
              {totals.usd > 0 && <p>{formatUSD(totals.usd)}</p>}
            </div>
          </div>
        )}
        {filtered.length > limit && (
          <button onClick={() => setLimit((l) => l + 50)}
            className="w-full py-3 text-xs uppercase tracking-widest text-moss hover:text-ink border-t border-ink/10">
            Mostrar más ({filtered.length - limit} restantes)
          </button>
        )}
      </div>
      {itemsFor && <OrderItemsModal order={itemsFor} onClose={() => setItemsFor(null)} />}
      <Dialog open={rangeOpen} onOpenChange={setRangeOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Exportar pedidos por rango de fechas</DialogTitle>
            <DialogDescription>Incluye todos los canales: Web, POS Eventos, B2B y pedidos manuales.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-3">
            <label className="flex flex-1 flex-col text-[10px] uppercase tracking-widest text-moss/70">Desde
              <input type="date" value={expFrom} max={expTo} onChange={(e) => e.target.value && setExpFrom(e.target.value)}
                className="mt-1 border border-ink/10 rounded-full px-4 py-2 text-sm text-ink" />
            </label>
            <label className="flex flex-1 flex-col text-[10px] uppercase tracking-widest text-moss/70">Hasta
              <input type="date" value={expTo} min={expFrom} onChange={(e) => e.target.value && setExpTo(e.target.value)}
                className="mt-1 border border-ink/10 rounded-full px-4 py-2 text-sm text-ink" />
            </label>
          </div>
          <button disabled={exporting} onClick={() => void exportRange()}
            className="mt-2 inline-flex items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-xs uppercase tracking-widest text-ivory disabled:opacity-50">
            <Download className="size-3.5" /> {exporting ? "Preparando…" : "Descargar Excel"}
          </button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ======================= Modal de artículos del pedido =======================

type OrderItemRow = {
  product_name: string | null;
  variant_label: string | null;
  qty: number;
  unit_price_cop: number;
  product_variants: { size: string | null; color: string | null; products: { hero_image_url: string | null; product_images: { url: string }[] } | null } | null;
};

function itemPhoto(item: OrderItemRow): string | null {
  const product = item.product_variants?.products;
  return product?.hero_image_url || product?.product_images?.[0]?.url || null;
}

function OrderItemsModal({ order, onClose }: { order: OrderRow; onClose: () => void }) {
  const { data: items, isLoading } = useQuery({
    queryKey: ["admin", "order-items", order.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("product_name, variant_label, qty, unit_price_cop, product_variants(size, color, products(hero_image_url, product_images(url, position)))")
        .eq("order_id", order.id)
        .order("product_name");
      if (error) throw error;
      return (data ?? []) as unknown as OrderItemRow[];
    },
  });

  const usdFactor = order.currency === "USD" && Number(order.subtotal_cop) > 0 && order.total_usd != null
    ? Number(order.total_usd) / Number(order.subtotal_cop)
    : null;
  const money = (cop: number) => (usdFactor != null ? formatUSD(cop * usdFactor) : formatCOP(cop));
  const totalUnits = (items ?? []).reduce((a, i) => a + i.qty, 0);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl bg-background p-5 sm:p-7">
        <DialogHeader className="text-left">
          <DialogTitle className="font-nm text-2xl font-normal">Pedido #{order.number}</DialogTitle>
          <DialogDescription>
            Productos del pedido · {totalUnits} {totalUnits === 1 ? "unidad" : "unidades"}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="py-8 text-center text-sm text-moss/60">Cargando productos…</p>
        ) : (items?.length ?? 0) === 0 ? (
          <p className="py-8 text-center text-sm text-moss/60">Este pedido no tiene productos registrados.</p>
        ) : (
          <div className="divide-y divide-ink/5">
            {items!.map((item, idx) => {
              const photo = itemPhoto(item);
              const variant = item.variant_label || [item.product_variants?.size, item.product_variants?.color].filter(Boolean).join(" · ") || null;
              return (
                <div key={idx} className="flex items-center gap-4 py-3">
                  <div className="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-muted">
                    {photo
                      ? <img src={photo} alt={item.product_name ?? "Prenda del pedido"} loading="lazy" className="h-full w-full object-cover" />
                      : <Package className="size-5 text-moss/40" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink">{item.product_name ?? "Prenda"}</p>
                    {variant && <p className="text-xs text-moss/60">{variant}</p>}
                    <p className="text-xs text-moss/60">Cantidad: {item.qty}</p>
                  </div>
                  <span className="shrink-0 text-sm text-ink">{money((item.unit_price_cop ?? 0) * item.qty)}</span>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ======================= Análisis =======================

const MONTHS_ES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
const MON_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];

/** Ventas por canal en columnas semanales (semana que termina en domingo) con subtotal por mes y total. */
async function exportChannelReport(
  kind: "xlsx" | "pdf", rows: OrderRow[], from: string, to: string,
  amt: (o: OrderRow) => number, fmt: (v: number) => string,
) {
  const sundayOf = (d: Date) => { const x = new Date(d); x.setHours(12, 0, 0, 0); x.setDate(x.getDate() + ((7 - x.getDay()) % 7)); return x; };
  const key = (d: Date) => d.toISOString().slice(0, 10);
  type Col = { label: string; weeks: string[]; month?: boolean };
  const cols: Col[] = [];
  const start = new Date(`${from}T12:00:00`), end = new Date(`${to}T12:00:00`);
  const last = sundayOf(end);
  let curMonth = -1; let monthWeeks: string[] = [];
  for (let w = sundayOf(start); w <= last; w = new Date(w.getTime() + 7 * 86400000)) {
    const m = w.getMonth();
    if (curMonth !== -1 && m !== curMonth) { cols.push({ label: MONTHS_ES[curMonth], weeks: monthWeeks, month: true }); monthWeeks = []; }
    curMonth = m;
    cols.push({ label: `${w.getDate()}-${MON_SHORT[m]}`, weeks: [key(w)] });
    monthWeeks.push(key(w));
  }
  if (monthWeeks.length) cols.push({ label: MONTHS_ES[curMonth], weeks: monthWeeks, month: true });
  const allWeeks = cols.filter((c) => !c.month).flatMap((c) => c.weeks);
  cols.push({ label: "TOTAL", weeks: allWeeks, month: true });

  /** Tabla semanal por canal + métricas de un conjunto de pedidos (sin cancelados). */
  const buildSection = (srows: OrderRow[], samt: (o: OrderRow) => number) => {
    const live = srows.filter((o) => o.status !== "cancelled");
    const sums = new Map<string, Map<string, number>>();
    for (const o of live) {
      const ch = CHANNELS.find((c) => c.key === channelOf(o))?.label ?? String(channelOf(o));
      const wk = key(sundayOf(new Date(o.created_at)));
      const m = sums.get(ch) ?? new Map<string, number>();
      m.set(wk, (m.get(wk) ?? 0) + samt(o));
      sums.set(ch, m);
    }
    const channels = [...sums.keys()].sort((a, b) => CHANNELS.findIndex((c) => c.label === a) - CHANNELS.findIndex((c) => c.label === b));
    const val = (ch: string | null, c: Col) => c.weeks.reduce((s, w) => s + (ch ? (sums.get(ch)?.get(w) ?? 0) : channels.reduce((a, x) => a + (sums.get(x)?.get(w) ?? 0), 0)), 0);
    const body = [...channels.map((ch) => [ch, ...cols.map((c) => val(ch, c))]), ["Total", ...cols.map((c) => val(null, c))]] as (string | number)[][];
    const revenue = live.reduce((s, o) => s + samt(o), 0);
    const orders = live.length;
    const units = live.reduce((s, o) => s + (o.order_items ?? []).reduce((a, i) => a + i.qty, 0), 0);
    return { body, revenue, orders, units };
  };
  const head = ["Semana finalizada", ...cols.map((c) => c.label)];
  const name = `ventas-por-canal_${from}_${to}`;

  if (kind === "xlsx") {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const addSheet = (title: string, srows: OrderRow[], samt: (o: OrderRow) => number, iva: number) => {
      const { body, revenue, orders, units } = buildSection(srows, samt);
      if (!orders) return;
      const ticket = title === "Internacional" ? Math.round(revenue / orders * 100) / 100 : Math.round(revenue / orders);
      const kpis: (string | number)[][] = [
        ["Ingresos totales", revenue],
        ["Ingresos sin IVA", revenue - iva],
        ["Valor IVA", iva],
        ["Número de pedidos", orders],
        ["Piezas vendidas", units],
        ["Ticket promedio", ticket],
        ["Promedio prenda", units ? (title === "Internacional" ? Math.round(revenue / units * 100) / 100 : Math.round(revenue / units)) : 0],
      ];
      const ws = XLSX.utils.aoa_to_sheet([[`Ventas por canal · ${title} · ${from} a ${to}`], [], ...kpis, [], head, ...body]);
      ws["!cols"] = [{ wch: 22 }, ...cols.map(() => ({ wch: 14 }))];
      const headRow = 2 + kpis.length + 1;
      for (let r = 2; r < 2 + kpis.length; r++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c: 1 })]; if (cell) cell.z = title === "Internacional" && ![5, 6].includes(r) ? "#,##0.00" : "#,##0";
      }
      for (let r = headRow + 1; r <= headRow + body.length; r++) for (let c = 1; c <= cols.length; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })]; if (cell) cell.z = title === "Internacional" ? "#,##0.00" : "#,##0";
      }
      XLSX.utils.book_append_sheet(wb, ws, title);
    };
    const nacRows = rows.filter((o) => !isInternational(o));
    const intRows = rows.filter((o) => isInternational(o));
    addSheet("Nacional", nacRows, (o) => o.total_cop ?? 0, sumOrderIva(nacRows.filter((o) => o.status !== "cancelled")));
    addSheet("Internacional", intRows, (o) => o.total_usd ?? 0, 0);
    if (!wb.SheetNames.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["Sin ventas en el rango elegido."]]), "Ventas");
    XLSX.writeFile(wb, `${name}.xlsx`);
    return;
  }
  const esc = (s: string) => s.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[ch]!));
  const th = head.map((h, i) => `<th class="${i && cols[i - 1].month ? "m" : ""}">${esc(h)}</th>`).join("");
  const sectionHtml = (title: string, srows: OrderRow[], samt: (o: OrderRow) => number, sfmt: (v: number) => string, iva: number) => {
    const { body, revenue, orders, units } = buildSection(srows, samt);
    if (!orders) return "";
    const tr = body.map((r, ri) => `<tr class="${ri === body.length - 1 ? "t" : ""}">${r.map((v, i) => i === 0 ? `<td class="l">${esc(String(v))}</td>` : `<td class="${cols[i - 1].month ? "m" : ""}">${Number(v) ? esc(sfmt(Number(v))) : ""}</td>`).join("")}</tr>`).join("");
    const ticket = title.startsWith("Internacional") ? Math.round(revenue / orders * 100) / 100 : Math.round(revenue / orders);
    const m = (l: string, v: string) => `<div class="kpi"><span>${l}</span><b>${esc(v)}</b></div>`;
    return `<h2>${esc(title)}</h2><div class="kpis">${m("Ingresos totales", sfmt(revenue))}${m("Ingresos sin IVA", sfmt(revenue - iva))}${m("Valor IVA", sfmt(iva))}${m("Número de pedidos", String(orders))}${m("Piezas vendidas", String(units))}${m("Ticket promedio", sfmt(ticket))}${m("Promedio prenda", sfmt(units ? (title.startsWith("Internacional") ? Math.round(revenue / units * 100) / 100 : Math.round(revenue / units)) : 0))}</div><table><thead><tr>${th}</tr></thead><tbody>${tr}</tbody></table>`;
  };
  const nacRows = rows.filter((o) => !isInternational(o));
  const intRows = rows.filter((o) => isInternational(o));
  const nacLive = nacRows.filter((o) => o.status !== "cancelled");
  const sections = [
    sectionHtml("Nacional (COP)", nacRows, (o) => o.total_cop ?? 0, (v) => formatCOP(v), sumOrderIva(nacLive)),
    sectionHtml("Internacional (US$)", intRows, (o) => o.total_usd ?? 0, (v) => formatUSD(v), 0),
  ].filter(Boolean).join("");
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<html><head><title>${name}</title><style>@page{size:A4 landscape;margin:10mm}body{font-family:Arial,sans-serif;font-size:9px;color:#1a1a1a;-webkit-print-color-adjust:exact;print-color-adjust:exact}h1{font-size:14px;margin:0 0 4px}h2{font-size:12px;margin:14px 0 6px;background:#3d4a2a;color:#fff;padding:4px 8px}p{margin:0 0 10px;color:#555}.kpis{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}.kpi{border:1px solid #ddd;border-radius:4px;padding:4px 8px;min-width:110px}.kpi span{display:block;font-size:7.5px;text-transform:uppercase;letter-spacing:.05em;color:#555}.kpi b{font-size:11px}table{border-collapse:collapse;width:100%;margin-bottom:6px}th{background:#3d4a2a;color:#fff;padding:5px 4px;font-size:8.5px}th.m{background:#2a331d}td{border-bottom:1px solid #ddd;padding:4px;text-align:right;white-space:nowrap}td.l{text-align:left;font-weight:bold}td.m{background:#f1efe6;font-weight:bold}tr.t td{border-top:2px solid #1a1a1a;font-weight:bold}</style></head><body><h1>TU MARCA · Ventas por canal</h1><p>${from} a ${to} · sin pedidos cancelados</p>${sections || "<p>Sin ventas en el rango elegido.</p>"}<script>window.onload=()=>window.print()<\/script></body></html>`);
  w.document.close();
}

function OrdersAnalytics({ dest }: { dest: Dest }) {
  const [from, setFrom] = usePersistedState("pedidos.from", todayISO(-29));
  const [to, setTo] = usePersistedState("pedidos.to", todayISO(0));
  const [store, setStore] = usePersistedState("pedidos.astore", "all");
  useReadyPageContext({ page_type: "orders_analysis", analysis: { from, to, destination: dest, store } });
  const range = useMemo(() => calendarSalesRange(from, to), [from, to]);
  const spanDays = range.days;
  const prevFrom = colombiaClock(new Date(range.previousFrom)).date;
  const dayOf = (iso: string) => colombiaClock(new Date(iso)).date;

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "orders-analytics", "invoiced-b2b", range.previousFrom, range.to],
    queryFn: async () => {
      // Incluye el período anterior de igual duración para comparar en las gráficas.
      const data = await fetchAll((offsetFrom, offsetTo) => supabase
        .from("orders")
        .select(`${ORDER_SELECT}, invoices(status, number)`)
        .gte("created_at", range.previousFrom)
        .lt("created_at", range.to)
        .order("created_at", { ascending: false }).order("id")
        .range(offsetFrom, offsetTo));
      return data as unknown as OrderRow[];
    },
  });


  // Las cifras no cuentan pedidos cancelados (igual que las exportaciones).
  const scoped = useMemo(() => {
    if (!data) return [];
    let rows = data.filter((o) => analysisIncludes(o, dest));
    if (store !== "all") rows = rows.filter((o) => storeOf(o) === store);
    return rows;
  }, [data, store, dest]);
  const previous = useMemo(() => scoped.filter((o) => inSalesRange(o.created_at, range.previousFrom, range.from)), [scoped, range]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return scoped.filter((o) => inSalesRange(o.created_at, range.from, range.to));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, scoped, range]);

  // El PDF separa Nacional e Internacional, así que usa los pedidos sin filtrar por destino.
  const exportRows = useMemo(
    () => (data ?? []).filter((o) => analysisBillingIncludes(o) && inSalesRange(o.created_at, range.from, range.to) && (store === "all" || storeOf(o) === store)),
    [data, store, range],
  );

  const usdMode = dest === "internacional";
  const amt = (o: OrderRow) => analysisAmount(o, dest);
  const fmtMoney = (v: number) => (usdMode ? formatUSD(v) : formatCOP(v));

  const kpis = useMemo(() => analysisTotals(filtered, dest), [filtered, dest]);

  const byStore = useMemo(() => {
    const map = new Map<string, { orders: number; revenue: number; units: number }>();
    for (const o of filtered) {
      const code = storeOf(o);
      const cur = map.get(code) ?? { orders: 0, revenue: 0, units: 0 };
      cur.orders += 1;
      cur.revenue += amt(o);
      cur.units += (o.order_items ?? []).reduce((a, i) => a + i.qty, 0);
      map.set(code, cur);
    }
    return Array.from(map.entries()).map(([code, v]) => ({
      code,
      label: STORE_OPTIONS.find((s) => s.value === code)?.label ?? code,
      ...v,
    })).sort((a, b) => b.revenue - a.revenue);
  }, [filtered]);

  const byChannel = useMemo(() => {
    const map = new Map<ChannelKey, { revenue: number; orders: number; units: number }>();
    for (const o of filtered) {
      const key = channelOf(o);
      const cur = map.get(key) ?? { revenue: 0, orders: 0, units: 0 };
      cur.revenue += amt(o);
      cur.orders += 1;
      cur.units += (o.order_items ?? []).reduce((a, i) => a + i.qty, 0);
      map.set(key, cur);
    }
    return CHANNELS
      .map((c) => ({ ...c, ...(map.get(c.key) ?? { revenue: 0, orders: 0, units: 0 }) }))
      .filter((c) => c.revenue > 0 || c.orders > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, usdMode]);

  const prevRevenue = previous.reduce((s, o) => s + amt(o), 0);
  const trend = useMemo(() => {
    const sum = (rows: OrderRow[], start: string) => {
      const out: { rev: number; n: number }[] = Array.from({ length: spanDays }, () => ({ rev: 0, n: 0 }));
      const base = new Date(`${start}T12:00:00`).getTime();
      for (const o of rows) {
        const i = Math.round((new Date(`${dayOf(o.created_at)}T12:00:00`).getTime() - base) / 86400000);
        if (i >= 0 && i < spanDays) { out[i].rev += amt(o); out[i].n += 1; }
      }
      return out;
    };
    const c = sum(filtered, from), p = sum(previous, prevFrom);
    const label = (i: number) => { const d = new Date(`${from}T12:00:00`); d.setDate(d.getDate() + i); return d.toISOString().slice(5, 10); };
    return {
      revenue: c.map((x, i) => ({ label: label(i), current: x.rev, previous: p[i].rev })) as TrendPoint[],
      orders: c.map((x, i) => ({ label: label(i), current: x.n, previous: p[i].n })) as TrendPoint[],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, previous, from, prevFrom, spanDays, usdMode]);

  const channelTotal = byChannel.reduce((s, c) => s + c.revenue, 0);
  const shares = sharesOf(byChannel.map((c) => c.revenue), channelTotal);

  const topProducts = useMemo(() => {
    const map = new Map<string, { units: number; revenue: number }>();
    for (const o of filtered) {
      for (const it of o.order_items ?? []) {
        const name = it.product_name ?? "—";
        const cur = map.get(name) ?? { units: 0, revenue: 0 };
        cur.units += it.qty;
        map.set(name, cur);
      }
    }
    return Array.from(map.entries()).map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.units - a.units).slice(0, 8);
  }, [filtered]);

  return (
    <div>
      <div className="md:hidden mb-5 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Popover>
            <PopoverTrigger className="flex items-center justify-center gap-1.5 min-w-0 rounded-full border border-ink/15 bg-white px-3 py-2.5 text-sm">
              <CalendarDays className="size-4 shrink-0" /><span className="truncate">{shortRange(from, to)}</span><ChevronDown className="size-3.5 shrink-0" />
            </PopoverTrigger>
            <PopoverContent align="start" className="w-72 space-y-3">
              <label className="flex flex-col text-[10px] uppercase tracking-widest text-moss/70">Desde
                <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} className="mt-1 border border-ink/10 rounded-full px-4 py-2 text-sm text-ink" />
              </label>
              <label className="flex flex-col text-[10px] uppercase tracking-widest text-moss/70">Hasta
                <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} className="mt-1 border border-ink/10 rounded-full px-4 py-2 text-sm text-ink" />
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {[{ l: "Hoy", d: 0 }, { l: "7d", d: -6 }, { l: "30d", d: -29 }, { l: "90d", d: -89 }].map((p) => (
                  <button key={p.l} onClick={() => { setFrom(todayISO(p.d)); setTo(todayISO(0)); }} className="py-2 rounded-full border border-ink/10 text-xs uppercase tracking-widest text-moss">{p.l}</button>
                ))}
              </div>
            </PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center justify-center gap-1.5 min-w-0 rounded-full border border-ink/15 bg-white px-3 py-2.5 text-sm">
              <Store className="size-4 shrink-0" /><span className="truncate">{store === "all" ? "Todas las tiendas" : STORE_OPTIONS.find((s) => s.value === store)?.label}</span><ChevronDown className="size-3.5 shrink-0" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {STORE_OPTIONS.map((s) => <DropdownMenuItem key={s.value} onClick={() => setStore(s.value)}>{s.label}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1.5 text-sm text-ink"><Download className="size-4" /> Exportar <ChevronDown className="size-3.5" /></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => exportChannelReport("xlsx", exportRows, from, to, amt, fmtMoney)}>Excel</DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportChannelReport("pdf", exportRows, from, to, amt, fmtMoney)}>PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="border-t border-ink/10" />
      </div>
      <div className="hidden md:flex flex-wrap items-end gap-3 mb-8">
        <label className="flex flex-col text-[10px] uppercase tracking-widest text-moss/70">
          Desde
          <input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)}
            className="mt-1 bg-white border border-ink/10 rounded-full px-4 py-2 text-sm text-ink" />
        </label>
        <label className="flex flex-col text-[10px] uppercase tracking-widest text-moss/70">
          Hasta
          <input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)}
            className="mt-1 bg-white border border-ink/10 rounded-full px-4 py-2 text-sm text-ink" />
        </label>
        <label className="flex flex-col text-[10px] uppercase tracking-widest text-moss/70">
          Tienda
          <select value={store} onChange={(e) => setStore(e.target.value)}
            className="mt-1 bg-white border border-ink/10 rounded-full px-4 py-2 text-sm text-ink">
            {STORE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <div className="flex gap-2">
          <button onClick={() => exportChannelReport("xlsx", exportRows, from, to, amt, fmtMoney)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-ink text-ivory text-xs">
            <Download className="size-3.5" /> Excel
          </button>
          <button onClick={() => exportChannelReport("pdf", exportRows, from, to, amt, fmtMoney)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-ink/15 bg-white text-xs">
            <Download className="size-3.5" /> PDF
          </button>
        </div>
        <div className="flex gap-2 ml-auto">
          {[
            { l: "Hoy", d: 0 },
            { l: "7d", d: -6 },
            { l: "30d", d: -29 },
            { l: "90d", d: -89 },
          ].map((p) => (
            <button key={p.l} onClick={() => { setFrom(todayISO(p.d)); setTo(todayISO(0)); }}
              className="px-3 py-2 rounded-full border border-ink/10 bg-white text-xs uppercase tracking-widest text-moss hover:bg-ink hover:text-white">
              {p.l}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 mb-8">
        {[
          { label: "Ingresos totales", value: fmtMoney(kpis.revenue), o: "" },
          { label: "Ingresos sin IVA", o: "max-md:order-3", value: fmtMoney(kpis.net) },
          { label: "Valor IVA", value: fmtMoney(kpis.iva), o: "max-md:order-4" },
          { label: "Pedidos", value: kpis.orders.toString(), o: "max-md:order-2" },
          { label: "Piezas vendidas", value: kpis.units.toString(), o: "max-md:order-5" },
          { label: "Ticket promedio", value: fmtMoney(kpis.aov), o: "max-md:order-6" },
          { label: "Promedio prenda", o: "max-md:order-7", value: fmtMoney(kpis.units ? (usdMode ? Math.round(kpis.revenue / kpis.units * 100) / 100 : Math.round(kpis.revenue / kpis.units)) : 0) },
        ].map((k) => (
          <div key={k.label} className={"bg-white border border-ink/10 rounded-2xl p-4 min-w-0 " + (k.o ?? "")}>
            <p className="text-[10px] uppercase tracking-widest text-moss/70 leading-tight">{k.label}</p>
            <p className="font-serif text-lg xl:text-xl mt-2 tabular-nums whitespace-nowrap truncate" title={k.value}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-6">
        <TrendChart title="Ventas a lo largo del tiempo" value={fmtMoney(kpis.revenue)} change={changePct(kpis.revenue, prevRevenue)} data={trend.revenue}
          formatter={usdMode ? (v) => formatUSD(v) : (v) => v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)} M` : `$${Math.round(v / 1000)} k`} />
        <TrendChart title="Pedidos a lo largo del tiempo" value={kpis.orders.toLocaleString("es-CO")} change={changePct(kpis.orders, previous.length)} data={trend.orders} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <div className="lg:col-span-2 bg-white border border-ink/10 rounded-2xl p-6">
          <p className="text-[10px] uppercase tracking-widest text-moss/70 mb-4">Ingresos por canal</p>
          {byChannel.length === 0 ? (
            <p className="text-sm text-moss/60 py-10 text-center">Sin datos en el rango seleccionado.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
              <div className="relative h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={byChannel} dataKey="revenue" nameKey="label" innerRadius="72%" outerRadius="88%"
                      paddingAngle={2} stroke="none" cornerRadius={3} isAnimationActive={false}>
                      {byChannel.map((c) => <Cell key={c.key} fill={c.color} />)}
                    </Pie>
                    <ChartTooltip formatter={(v) => fmtMoney(Number(v))}
                      contentStyle={{ borderRadius: 10, borderColor: "var(--border)", background: "var(--card)", fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                  <p className="text-[10px] uppercase tracking-widest text-moss/60">Total</p>
                  <p className="font-serif text-lg leading-none whitespace-nowrap">{fmtMoney(channelTotal)}</p>
                </div>
              </div>
              <ul className="space-y-3">
                {byChannel.map((c, i) => (
                  <li key={c.key} className="flex items-center gap-3 text-sm">
                    <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                    <span className="min-w-0 flex-1 truncate text-ink">{c.label}</span>
                    <span className="text-xs text-moss/60 tabular-nums">{shares[i]}%</span>
                    <span className="font-mono text-xs whitespace-nowrap">{fmtMoney(c.revenue)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-between mt-4 text-[10px] text-moss/60">
            <span>{from}</span>
            <span>{to}</span>
          </div>
        </div>

        <div className="bg-white border border-ink/10 rounded-2xl p-6">
          <p className="text-[10px] uppercase tracking-widest text-moss/70 mb-4">Por tienda</p>
          <ul className="space-y-3">
            {byStore.length === 0 && <li className="text-sm text-moss/60">Sin datos.</li>}
            {byStore.map((s) => (
              <li key={s.code} className="flex items-center justify-between text-sm">
                <div>
                  <p className="text-ink">{s.label}</p>
                  <p className="text-xs text-moss/60">{s.orders} pedidos · {s.units} piezas</p>
                </div>
                <p className="font-mono text-xs">{fmtMoney(s.revenue)}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="bg-white border border-ink/10 rounded-2xl p-6">
        <p className="text-[10px] uppercase tracking-widest text-moss/70 mb-4">Productos más vendidos</p>
        {topProducts.length === 0 ? (
          <p className="text-sm text-moss/60 py-6 text-center">
            {isLoading ? "Cargando…" : "Sin pedidos en el rango."}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-moss/70">
              <tr>
                <th className="text-left py-2">Producto</th>
                <th className="text-right">Piezas</th>
              </tr>
            </thead>
            <tbody>
              {topProducts.map((p) => (
                <tr key={p.name} className="border-t border-ink/5">
                  <td className="py-2">{p.name}</td>
                  <td className="text-right font-mono text-xs">{p.units}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
