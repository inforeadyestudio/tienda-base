import { redirect, createFileRoute, useNavigate } from "@tanstack/react-router";
import { isAwaitingGateway, AWAITING_KEY } from "@/lib/admin/awaiting-gateway";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Search, Download, ChevronDown, ChevronUp, Plus, X, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { adminCreateUser } from "@/lib/admin/users.functions";
import { formatCOP, formatUSD } from "@/lib/format";
import { fetchAll } from "@/lib/fetch-all";
import { normSearch } from "@/lib/search-text";
import { intlSettingsQuery } from "@/lib/international";

import { MobileOrderList } from "@/components/admin/mobile-order-list";

export const Route = createFileRoute("/_authenticated/admin/tienda/pedidos")({
  beforeLoad: () => { throw redirect({ to: "/admin/pedidos" }); },
  head: () => ({ meta: [
    { title: "Pedidos de Tienda Online | Tu Marca" },
    { name: "description", content: "Pedidos nacionales e internacionales de la tienda online Tu Marca." },
    { property: "og:title", content: "Pedidos de Tienda Online | Tu Marca" },
    { property: "og:description", content: "Pedidos nacionales e internacionales de la tienda online Tu Marca." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: TiendaPedidos,
});

/* ───────────────────────── tipos y helpers ───────────────────────── */

type OrderRow = {
  id: string;
  number: string;
  status: string;
  source: string;
  is_manual: boolean;
  total_cop: number;
  currency: string | null;
  total_usd: number | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  ship_to: any;
  notes: string | null;
  paid_at: string | null;
  payment_status?: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  created_at: string;
  order_items: { qty: number; product_name: string | null }[];
  order_fulfillments: { locations: { code: string; name: string } | null }[];
};

const ORDER_SELECT =
  "id, number, status, source, is_manual, total_cop, currency, total_usd:total_usd_exact, contact_name, contact_email, contact_phone, ship_to, notes, paid_at, payment_status, payment_method, payment_reference, created_at, order_items(qty, product_name), order_fulfillments(locations(code, name))";

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador",
  reserved: "Reservado",
  paid: "Pagado",
  preparing: "Preparando",
  shipped: "Enviado",
  delivered: "Entregado",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};

const PAYMENT_METHODS = [
  { id: "link_pago", label: "Link de pago" },
  { id: "transferencia", label: "Transferencia" },
  { id: "datafono", label: "Datáfono" },
  { id: "efectivo", label: "Efectivo" },
] as const;
type PayMethod = (typeof PAYMENT_METHODS)[number]["id"];
const NEEDS_PROOF: PayMethod[] = ["link_pago", "transferencia"];

function marketOf(o: OrderRow): "nacional" | "internacional" {
  const st = o.ship_to ?? {};
  if (typeof st?.market === "string") return st.market === "internacional" ? "internacional" : "nacional";
  const code = o.order_fulfillments?.[0]?.locations?.code;
  if (code === "ecom_intl") return "internacional";
  const country = String(st?.country ?? "").trim();
  if (country && !/colombia|^co$/i.test(country)) return "internacional";
  return "nacional";
}

const METHOD_LABEL: Record<string, string> = {
  link_pago: "Link de pago",
  transferencia: "Transferencia",
  transfer: "Transferencia",
  datafono: "Datáfono",
  efectivo: "Efectivo",
};

const GATEWAY_LABEL: Record<string, string> = {
  wompi: "Wompi", addi: "Addi", paguelofacil: "Páguelo Fácil", paguelo_facil: "Páguelo Fácil",
  paypal: "PayPal", tarjeta: "Tarjeta", card: "Tarjeta",
};

function paymentMethodLabel(o: OrderRow, providers: Map<string, string> | undefined) {
  if (o.is_manual) return METHOD_LABEL[(o.payment_method ?? "").toLowerCase()] ?? (o.payment_method || "—");
  const m = (o.payment_method ?? "").toLowerCase();
  if (o.payment_reference) {
    const provider = providers?.get(o.payment_reference)?.toLowerCase();
    if (provider) return GATEWAY_LABEL[provider] ?? provider;
  }
  if (m === "card") return providers ? "Pasarela no disponible" : "Consultando pasarela…";
  return GATEWAY_LABEL[m] ?? METHOD_LABEL[m] ?? (m || "—");
}

function paymentBadge(o: OrderRow) {
  if (o.paid_at || o.payment_status === "paid") return { label: "Pagado", cls: "bg-ink/5 text-ink" };
  if (o.status === "cancelled") return { label: "Cancelado", cls: "bg-red-50 text-red-600" };
  if (o.status === "refunded") return { label: "Reembolsado", cls: "bg-ink/5 text-moss" };
  return { label: "Pendiente", cls: "bg-amber-50 text-amber-700" };
}

function fulfillmentBadge(o: OrderRow) {
  if (o.status === "shipped" || o.status === "delivered") return { label: "Preparado", cls: "bg-ink/5 text-ink" };
  if (o.status === "cancelled" || o.status === "refunded") return { label: "—", cls: "bg-ink/5 text-moss/50" };
  if (o.status === "preparing") return { label: "Preparando", cls: "bg-amber-50 text-amber-700" };
  return { label: "No preparado", cls: "bg-yellow-100 text-yellow-800" };
}

function relativeDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(d)) / 86400000);
  const time = d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
  if (diffDays === 0) return `Hoy a las ${time}`;
  if (diffDays === 1) return `Ayer a las ${time}`;
  if (diffDays < 7) return `${d.toLocaleDateString("es-CO", { weekday: "long" })} a las ${time}`;
  return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" }) + ` · ${time}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/* ───────────────────────── pantalla ───────────────────────── */

function TiendaPedidos() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [fMarket, setFMarket] = useState<"all" | "nacional" | "internacional">("all");
  const [fStatus, setFStatus] = useState("all");
  const [sortDesc, setSortDesc] = useState(true);
  const [limit, setLimit] = useState(50);

  const { data, isLoading } = useQuery({
    queryKey: ["tienda-pedidos"],
    queryFn: async () => {
      const data = await fetchAll((from, to) => supabase
        .from("orders")
        .select(ORDER_SELECT)
        .eq("source", "ecom")
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to));
      return data as unknown as OrderRow[];
    },
  });

  const references = (data ?? [])
    .filter((o: OrderRow) => !o.is_manual && o.payment_reference)
    .map((o: OrderRow) => o.payment_reference as string);
  const { data: providers } = useQuery({
    queryKey: ["tienda-pedidos-providers", references],
    enabled: references.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_attempts").select("reference, provider").in("reference", references);
      if (error) throw error;
      return new Map((data ?? []).map((row: { reference: string; provider: string }) => [row.reference, row.provider]));
    },
  });

  const filtered = useMemo(() => {
    let rows = data ?? [];
    if (fMarket !== "all") rows = rows.filter((o) => marketOf(o) === fMarket);
    if (fStatus === AWAITING_KEY) rows = rows.filter((o) => isAwaitingGateway(o));
    else {
      rows = rows.filter((o) => !isAwaitingGateway(o));
      if (fStatus !== "all") rows = rows.filter((o) => o.status === fStatus);
    }
    const q = normSearch(query);
    if (q) {
      if (/^\d+$/.test(q)) {
        // Solo dígitos: buscar por el consecutivo final del número de pedido
        rows = rows.filter((o) => normSearch(o.number).endsWith(q));
      } else {
        rows = rows.filter(
          (o) =>
            normSearch(o.number).includes(q) ||
            normSearch(o.contact_name).includes(q) ||
            normSearch(o.contact_email).includes(q) ||
            normSearch(o.contact_phone).includes(q),
        );
      }
    }
    if (!sortDesc) rows = [...rows].reverse();
    return rows;
  }, [data, fMarket, fStatus, query, sortDesc]);

  const visible = filtered.slice(0, limit);

  const exportCsv = () => {
    const header = "Pedido,Fecha,Cliente,Email,Mercado,Total,Medio de pago,Estado pago,Estado preparacion,Articulos\n";
    const lines = filtered
      .map((o) => {
        const units = (o.order_items ?? []).reduce((a, i) => a + i.qty, 0);
        return [
          o.number,
          new Date(o.created_at).toLocaleString("es-CO"),
          o.contact_name ?? "",
          o.contact_email ?? "",
          marketOf(o),
          o.total_cop,
          paymentMethodLabel(o, providers),
          paymentBadge(o).label,
          fulfillmentBadge(o).label,
          units,
        ]
          .map((v) => `"${String(typeof v === "string" && /^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`)
          .join(",");
      })
      .join("\n");
    const blob = new Blob([header + lines], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pedidos-web-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="w-full min-w-0 p-4 md:p-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-moss/70">Web</p>
          <h1 className="font-serif text-3xl md:text-4xl mt-1">Pedidos web</h1>
          <p className="text-sm text-moss/70 mt-2">Solo los pedidos de la tienda online, nacionales e internacionales.</p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <div className="relative w-full min-w-0 sm:flex-1 sm:min-w-64">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-moss/50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por número, cliente, email o teléfono…"
            className="w-full bg-white border border-ink/10 rounded-full pl-11 pr-4 py-2.5 text-sm text-ink placeholder:text-moss/40"
          />
        </div>
        <select
          value={fMarket}
          onChange={(e) => setFMarket(e.target.value as typeof fMarket)}
          className="pill-select bg-white border border-ink/10 rounded-full px-4 py-2.5 text-sm text-ink"
        >
          <option value="all">Nacional e internacional</option>
          <option value="nacional">Solo nacionales</option>
          <option value="internacional">Solo internacionales</option>
        </select>
        <select
          value={fStatus}
          onChange={(e) => setFStatus(e.target.value)}
          className="pill-select bg-white border border-ink/10 rounded-full px-4 py-2.5 text-sm text-ink"
        >
          <option value="all">Todos los estados</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
          <option value={AWAITING_KEY}>Esperando pago en pasarela</option>
        </select>
        <button
          onClick={exportCsv}
          className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white border border-ink/10 text-xs uppercase tracking-widest text-moss hover:text-ink"
        >
          <Download className="size-3.5" /> Exportar
        </button>
      </div>

      <div className="max-w-full bg-card border border-border rounded-2xl overflow-x-auto">
        <MobileOrderList orders={visible} loading={isLoading} />
        <table className="hidden w-full text-[13px] min-w-[840px] md:table">
          <thead className="text-[10px] uppercase tracking-widest text-moss/70 border-b border-ink/10">
            <tr>
              <th className="text-left py-3 pl-5 pr-2">Pedido</th>
              <th className="text-left px-2 cursor-pointer select-none" onClick={() => setSortDesc((s) => !s)}>
                <span className="inline-flex items-center gap-1">
                  Fecha {sortDesc ? <ChevronDown className="size-3" /> : <ChevronUp className="size-3" />}
                </span>
              </th>
              <th className="text-left px-2">Cliente</th>
              <th className="text-left px-2">Mercado</th>
              <th className="text-right px-2">Total</th>
              <th className="text-left px-2">Medio de pago</th>
              <th className="text-left px-2">Estado del pago</th>
              <th className="text-left px-2">Preparación</th>
              <th className="text-right px-2 pr-5">Artículos</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((o) => {
              const pay = paymentBadge(o);
              const ful = fulfillmentBadge(o);
              const units = (o.order_items ?? []).reduce((a, i) => a + i.qty, 0);
              return (
                <tr
                  key={o.id}
                  onClick={() => navigate({ to: "/admin/pedido/$id", params: { id: o.id } })}
                  className="border-t border-ink/5 hover:bg-ink/[0.02] transition-colors cursor-pointer"
                >
                  <td className="py-3 pl-5 pr-2">
                    <span className="font-medium text-ink">#{o.number}</span>
                    <span
                      className={
                        "ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest " +
                        (o.is_manual ? "bg-amber-50 text-amber-700" : "bg-ink/5 text-moss")
                      }
                    >
                      {o.is_manual ? "Pedido Manual" : "Online"}
                    </span>
                  </td>
                  <td className="px-2 text-moss">{relativeDate(o.created_at)}</td>
                  <td className="px-2">
                    <p className="text-ink">{o.contact_name ?? "—"}</p>
                    {o.contact_email && <p className="text-[11px] text-moss/60">{o.contact_email}</p>}
                  </td>
                  <td className="px-2 text-moss capitalize">{marketOf(o)}</td>
                  <td className="px-2 text-right font-mono text-xs whitespace-nowrap">{o.currency === "USD" ? formatUSD(o.total_usd) : formatCOP(o.total_cop)}</td>
                  <td className="px-2 text-moss">{paymentMethodLabel(o, providers)}</td>
                  <td className="px-2">
                    <span className={"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] " + pay.cls}>
                      <span className="size-1.5 rounded-full bg-current" /> {pay.label}
                    </span>
                  </td>
                  <td className="px-2">
                    <span className={"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] " + ful.cls}>
                      <span className="size-1.5 rounded-full bg-current" /> {ful.label}
                    </span>
                  </td>
                  <td className="px-2 pr-5 text-right text-moss">
                    {units} artículo{units === 1 ? "" : "s"}
                  </td>
                </tr>
              );
            })}
            {!isLoading && visible.length === 0 && (
              <tr>
                <td colSpan={9} className="py-14 text-center text-sm text-moss/60">
                  Sin pedidos que coincidan con la búsqueda.
                </td>
              </tr>
            )}
            {isLoading && (
              <tr>
                <td colSpan={9} className="py-14 text-center text-sm text-moss/60">
                  Cargando pedidos…
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {filtered.length > limit && (
          <button
            onClick={() => setLimit((l) => l + 50)}
            className="w-full py-3 text-xs uppercase tracking-widest text-moss hover:text-ink border-t border-ink/10"
          >
            Mostrar más ({filtered.length - limit} restantes)
          </button>
        )}
      </div>

    </div>
  );
}

