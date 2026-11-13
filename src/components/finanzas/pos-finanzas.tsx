import { useMemo, useState } from "react";
import { PosReturnModal } from "./pos-return-modal";
import { refreshPosCreditNotes } from "@/lib/returns/pos-credit.functions";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { X, Eye, Store, TrendingUp, TrendingDown, Search, Printer } from "lucide-react";
import { printPosReceipt, type PosReceiptSale, type Invoice } from "@/components/pos/pos-receipt-modal";
import { supabase } from "@/integrations/supabase/client";
import { useB2BOrders } from "@/lib/b2b/admin";
import { formatCOP, formatDate } from "@/lib/format";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { resendOrderBilling, getReconciledOrderInvoices } from "@/lib/rcount.functions";
import { fetchAll } from "@/lib/fetch-all";
import { usePaged } from "@/components/ui/use-paged";

const METHOD_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  datafono: "Datáfono",
  transferencia: "Transferencia",
  wompi: "Wompi",
  tarjeta: "Tarjeta",
  link_pago: "Link de pago",
  credito_15: "Crédito a 15 días",
};

function methodLabel(method: string | null | undefined) {
  if (!method) return "";
  return METHOD_LABELS[method] ?? method;
}

function normalizeSearch(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ");
}

function ResendButton({ orderId }: { orderId: string }) {
  const fn = useServerFn(resendOrderBilling);
  const [busy, setBusy] = useState(false);
  return (
    <button disabled={busy} className="text-[11px] font-normal underline text-ink/60 disabled:opacity-50"
      onClick={async () => {
        setBusy(true);
        try {
          const r: any = await fn({ data: { orderId } });
          r?.ok === false ? toast.error(r?.message ?? "R-Count rechazó la factura") : toast.success(r?.message ?? "Enviado a R-Count");
        } catch (e: any) { toast.error(e?.message ?? "No se pudo reenviar"); }
        setBusy(false);
      }}>{busy ? "Enviando…" : "Reenviar a R-Count"}</button>
  );
}

type Tab = "cierres" | "ingresos" | "ventas" | "b2b";

const TAB_LABEL: Record<Tab, string> = {
  cierres: "Cierres de caja",
  ingresos: "Ingresos",
  ventas: "Ventas POS",
  b2b: "Ventas B2B",
};

export function PosFinanzas({ lockedSedeId }: { lockedSedeId?: string }) {
  const tabs: Tab[] = lockedSedeId ? ["cierres", "ventas"] : ["ingresos", "ventas", "b2b"];
  const [tab, setTab] = useState<Tab>(lockedSedeId ? "cierres" : "ingresos");
  const [sedeFilter, setSedeFilter] = useState<string>(lockedSedeId ?? "all");
  const [openSessionId, setOpenSessionId] = useState<string | null>(null);

  const { data: locations } = useQuery({
    queryKey: ["fin-locations"],
    enabled: !lockedSedeId,
    queryFn: async () =>
      (await supabase.from("locations").select("id, code, name, kind").in("kind", ["store", "warehouse"]).eq("active", true).order("priority")).data ?? [],
  });

  return (
    <div>
      <div className="flex items-center justify-between gap-4 mb-6 flex-wrap">
        <div className="flex gap-1 bg-white border border-ink/10 rounded-full p-1">
          {tabs.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={"px-5 py-2 rounded-full text-sm transition " + (tab === t ? "bg-ink text-ivory" : "text-ink/60 hover:text-ink")}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
        {!lockedSedeId && tab !== "b2b" && (
          <div className="flex gap-1 bg-white border border-ink/10 rounded-full p-1">
            <button onClick={() => setSedeFilter("all")} className={"px-4 py-1.5 rounded-full text-xs transition " + (sedeFilter === "all" ? "bg-ink text-ivory" : "text-ink/60")}>Todas</button>
            {locations?.map((l) => (
              <button key={l.id} onClick={() => setSedeFilter(l.id)} className={"px-4 py-1.5 rounded-full text-xs transition " + (sedeFilter === l.id ? "bg-ink text-ivory" : "text-ink/60")}>{l.name}</button>
            ))}
          </div>
        )}
      </div>

      {tab === "cierres" && <CierresList sedeFilter={sedeFilter} onOpen={setOpenSessionId} />}
      {tab === "ingresos" && <IngresosPanel sedeFilter={sedeFilter} />}
      {tab === "ventas" && <VentasList sedeFilter={sedeFilter} />}
      {tab === "b2b" && <B2BVentasList />}

      {openSessionId && (
        <SessionDetailModal sessionId={openSessionId} onClose={() => setOpenSessionId(null)} />
      )}
    </div>
  );
}

type IngresoRow = {
  id: string;
  number: string;
  date: string;
  origin: "Online" | "POS" | "B2B";
  detail: string | null;
  customer: string | null;
  total: number;
  locationId: string | null;
};

function IngresosPanel({ sedeFilter }: { sedeFilter: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["fin-ingresos"],
    queryFn: async (): Promise<IngresoRow[]> => {
      const [ordersRes, rolesRes] = await Promise.all([
        fetchAll((from, to) => supabase
          .from("orders")
          .select("id, number, source, total_cop, paid_at, created_at, contact_name, customer_id, pos_sales(pos_sessions(location_id, locations(name)))")
          .not("status", "in", "(draft,cancelled)")
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to)).then((data) => ({ data })),
        supabase.from("user_roles").select("user_id").eq("role", "b2b"),
      ]);
      const b2bIds = new Set((rolesRes.data ?? []).map((r) => r.user_id));
      return (ordersRes.data ?? []).map((o: any) => {
        const sale = (o.pos_sales ?? [])[0];
        const isB2B = o.customer_id && b2bIds.has(o.customer_id);
        const origin: IngresoRow["origin"] = isB2B ? "B2B" : o.source === "pos" ? "POS" : "Online";
        return {
          id: o.id,
          number: o.number,
          date: o.paid_at ?? o.created_at,
          origin,
          detail: sale?.pos_sessions?.locations?.name ?? null,
          customer: o.contact_name ?? null,
          total: o.total_cop ?? 0,
          locationId: sale?.pos_sessions?.location_id ?? null,
        };
      });
    },
  });

  const rows = useMemo(() => {
    const all = data ?? [];
    if (sedeFilter === "all") return all;
    return all.filter((r) => r.locationId === sedeFilter);
  }, [data, sedeFilter]);

  const { pageItems, pager } = usePaged(rows);

  const totals = useMemo(() => {
    const t = { Online: 0, POS: 0, B2B: 0, grand: 0 };
    for (const r of rows) { t[r.origin] += r.total; t.grand += r.total; }
    return t;
  }, [rows]);

  if (isLoading) return <p className="text-sm text-ink/50 py-10 text-center">Cargando…</p>;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Online" value={totals.Online} />
        <SummaryCard label="Punto de venta" value={totals.POS} />
        <SummaryCard label="Mayoristas" value={totals.B2B} />
        <SummaryCard label="Total" value={totals.grand} strong />
      </div>

      {!rows.length ? (
        <p className="text-sm text-ink/50 py-16 text-center">Sin ingresos registrados.</p>
      ) : (
        <div className="rounded-3xl bg-white border border-ink/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ivory/60 text-[10px] uppercase tracking-widest text-ink/50">
              <tr>
                <th className="text-left px-6 py-4">Fecha</th>
                <th className="text-left px-4 py-4">Pedido</th>
                <th className="text-left px-4 py-4">Origen</th>
                <th className="text-left px-4 py-4">Cliente</th>
                <th className="text-right px-6 py-4">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {pageItems.map((r) => (
                <tr key={r.id} className="hover:bg-ivory/30">
                  <td className="px-6 py-3.5">{formatDate(r.date)}</td>
                  <td className="px-4 py-3.5 font-mono text-xs">
                    <Link to="/admin/pedido/$id" params={{ id: r.id }} className="underline decoration-ink/20">{r.number}</Link>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-xs px-2.5 py-1 rounded-full bg-ivory/70 border border-ink/10">
                      {r.origin}{r.detail ? ` · ${r.detail}` : ""}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">{r.customer ?? "—"}</td>
                  <td className="px-6 py-3.5 text-right font-medium">{formatCOP(r.total)}<div><ResendButton orderId={r.id} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {pager}
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className={"rounded-2xl border border-ink/10 p-5 " + (strong ? "bg-ink text-ivory" : "bg-white")}>
      <div className={"text-[10px] uppercase tracking-widest " + (strong ? "text-ivory/60" : "text-ink/50")}>{label}</div>
      <div className="text-2xl mt-1.5">{formatCOP(value)}</div>
    </div>
  );
}

function B2BVentasList() {
  const { data, isLoading } = useB2BOrders();
  const rows = (data ?? []).filter((o: any) => o.status !== "draft" && o.status !== "cancelled");
  const total = rows.reduce((s: number, o: any) => s + (o.total_cop ?? 0), 0);
  const { pageItems, pager } = usePaged(rows);

  if (isLoading) return <p className="text-sm text-ink/50 py-10 text-center">Cargando…</p>;
  if (!rows.length) return <p className="text-sm text-ink/50 py-16 text-center">Sin ventas mayoristas registradas.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between px-6 py-4 rounded-2xl bg-white border border-ink/10">
        <span className="text-sm text-ink/60">{rows.length} pedidos mayoristas</span>
        <span className="text-2xl">{formatCOP(total)}</span>
      </div>
      <div className="rounded-3xl bg-white border border-ink/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ivory/60 text-[10px] uppercase tracking-widest text-ink/50">
            <tr>
              <th className="text-left px-6 py-4">Fecha</th>
              <th className="text-left px-4 py-4">Pedido</th>
              <th className="text-left px-4 py-4">Cuenta</th>
              <th className="text-left px-4 py-4">Unidades</th>
              <th className="text-left px-4 py-4">Estado</th>
              <th className="text-right px-6 py-4">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {pageItems.map((o: any) => (
              <tr key={o.id} className="hover:bg-ivory/30">
                <td className="px-6 py-3.5">{formatDate(o.created_at)}</td>
                <td className="px-4 py-3.5 font-mono text-xs">
                  <Link to="/admin/pedido/$id" params={{ id: o.id }} className="underline decoration-ink/20">{o.number}</Link>
                </td>
                <td className="px-4 py-3.5">{o.contact_name ?? "—"}</td>
                <td className="px-4 py-3.5">{(o.order_items ?? []).reduce((s: number, i: any) => s + i.qty, 0)}</td>
                <td className="px-4 py-3.5"><span className="text-[10px] uppercase tracking-widest bg-ink/5 px-2.5 py-1 rounded-full">{o.status}</span></td>
                <td className="px-6 py-3.5 text-right font-medium">{formatCOP(o.total_cop ?? 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {pager}
      </div>
    </div>
  );
}


function CierresList({ sedeFilter, onOpen }: { sedeFilter: string; onOpen: (id: string) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["fin-cierres", sedeFilter],
    queryFn: async () => {
      const rows = await fetchAll((from, to) => {
        let q = supabase
          .from("pos_sessions")
          .select("id, opened_at, closed_at, opening_cash_cop, closing_cash_cop, notes, location_id, opened_by, locations(name, code)")
          .not("closed_at", "is", null)
          .order("closed_at", { ascending: false })
          .order("id")
          .range(from, to);
        if (sedeFilter !== "all") q = q.eq("location_id", sedeFilter);
        return q;
      }) as any[];
      const userIds = [...new Set(rows.map((r) => r.opened_by).filter(Boolean))];
      const names = new Map<string, string>();
      if (userIds.length) {
        const { data: ps } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
        (ps ?? []).forEach((p: any) => names.set(p.id, p.full_name));
      }
      return rows.map((r) => ({ ...r, profiles: { full_name: names.get(r.opened_by) ?? null } }));
    },
  });

  const ids = useMemo(() => (data ?? []).map((s) => s.id), [data]);
  const { data: totals } = useQuery({
    queryKey: ["fin-cierres-totals", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const [salesRes, expRes] = await Promise.all([
        supabase.from("pos_sales").select("session_id, method, amount_cop").in("session_id", ids),
        supabase.from("pos_expenses").select("session_id, amount_cop, category").in("session_id", ids),
      ]);
      const map: Record<string, { total: number; efectivo: number; expenses: number }> = {};
      for (const id of ids) map[id] = { total: 0, efectivo: 0, expenses: 0 };
      for (const s of salesRes.data ?? []) {
        map[s.session_id].total += s.amount_cop;
        if (s.method === "efectivo") map[s.session_id].efectivo += s.amount_cop;
      }
      for (const e of expRes.data ?? []) map[e.session_id].expenses += String((e as any).category ?? "").startsWith("ingreso") ? -e.amount_cop : e.amount_cop;
      return map;
    },
  });

  const { pageItems: cierresPage, pager: cierresPager } = usePaged((data ?? []) as any[]);

  if (isLoading) return <p className="text-sm text-ink/50 py-10 text-center">Cargando…</p>;
  if (!data?.length) return <p className="text-sm text-ink/50 py-16 text-center">Sin cierres registrados.</p>;

  return (
    <div className="rounded-3xl bg-white border border-ink/10 overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-ivory/60 text-[10px] uppercase tracking-widest text-ink/50">
          <tr>
            <th className="text-left px-6 py-4">Fecha</th>
            <th className="text-left px-4 py-4">Sede</th>
            <th className="text-left px-4 py-4">Vendedora</th>
            <th className="text-right px-4 py-4">Base</th>
            <th className="text-right px-4 py-4">Ventas</th>
            <th className="text-right px-4 py-4">Egresos</th>
            <th className="text-right px-4 py-4">Contado</th>
            <th className="text-right px-4 py-4">Diferencia</th>
            <th className="px-4 py-4"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/5">
          {cierresPage.map((s: any) => {
            const t = totals?.[s.id] ?? { total: 0, efectivo: 0, expenses: 0 };
            const expected = s.opening_cash_cop + t.efectivo - t.expenses;
            const diff = (s.closing_cash_cop ?? 0) - expected;
            return (
              <tr key={s.id} className="hover:bg-ivory/30">
                <td className="px-6 py-4">
                  <div>{formatDate(s.closed_at)}</div>
                  <div className="text-xs text-ink/50">{new Date(s.closed_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</div>
                </td>
                <td className="px-4 py-4"><span className="inline-flex items-center gap-1.5 text-xs text-ink/70"><Store className="size-3" /> {s.locations?.name ?? "—"}</span></td>
                <td className="px-4 py-4">{s.profiles?.full_name ?? "—"}</td>
                <td className="px-4 py-4 text-right text-ink/60">{formatCOP(s.opening_cash_cop)}</td>
                <td className="px-4 py-4 text-right font-medium">{formatCOP(t.total)}</td>
                <td className="px-4 py-4 text-right text-clay">{t.expenses > 0 ? `− ${formatCOP(t.expenses)}` : "—"}</td>
                <td className="px-4 py-4 text-right">{formatCOP(s.closing_cash_cop ?? 0)}</td>
                <td className={"px-4 py-4 text-right font-medium " + (diff === 0 ? "text-moss" : diff > 0 ? "text-ink/70" : "text-clay")}>
                  <span className="inline-flex items-center gap-1">
                    {diff > 0 && <TrendingUp className="size-3" />}
                    {diff < 0 && <TrendingDown className="size-3" />}
                    {diff === 0 ? "0" : (diff > 0 ? "+" : "") + formatCOP(diff).replace("-", "")}
                  </span>
                </td>
                <td className="px-4 py-4 text-right">
                  <button onClick={() => onOpen(s.id)} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-ink text-ivory text-xs hover:bg-ink/85">
                    <Eye className="size-3" /> Ver
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {cierresPager}
    </div>
  );
}

function ReprintButton({ sale }: { sale: any }) {
  const [busy, setBusy] = useState(false);
  const reprint = async () => {
    if (!sale.order_id) return;
    setBusy(true);
    try {
      const [orderRes, invRes] = await Promise.all([
        supabase
          .from("orders")
          .select("number, created_at, contact_name, contact_phone, invoice_document, order_items(product_name, variant_label, qty, unit_price_cop)")
          .eq("id", sale.order_id)
          .maybeSingle(),
        supabase
          .from("invoices")
          .select("number, cufe, issued_at, status, error")
          .eq("order_id", sale.order_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      const o = orderRes.data as any;
      if (!o) throw new Error("No encontramos el pedido de esta venta.");
      const inv = (invRes.data as Invoice | null) ?? null;
      const receipt: PosReceiptSale = {
        orderId: sale.order_id,
        number: o.number,
        createdAt: o.created_at ?? sale.created_at,
        method: methodLabel(sale.method) || "—",
        customerName: o.contact_name ?? "Consumidor final",
        customerDoc: o.invoice_document ?? null,
        customerPhone: o.contact_phone ?? null,
        storeCode: sale.pos_sessions?.locations?.code ?? null,
        lines: (o.order_items ?? []).map((i: any) => ({ name: i.product_name, label: i.variant_label ?? "", qty: i.qty, price: i.unit_price_cop })),
        total: sale.amount_cop,
        received: sale.amount_cop,
      };
      await printPosReceipt(receipt, inv?.status === "issued" && inv.cufe ? inv : null);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo reimprimir");
    }
    setBusy(false);
  };
  return (
    <button onClick={reprint} disabled={busy} className="mt-1.5 inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-ink/15 hover:bg-ivory disabled:opacity-50">
      <Printer className="size-3" /> {busy ? "Preparando…" : "Reimprimir"}
    </button>
  );
}

function InvoiceCell({ invoices }: { invoices?: any[] | null }) {
  const list = [...(invoices ?? [])].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const inv = list.find((i) => i.status === "issued") ?? list[0];
  if (!inv) return <span className="text-xs text-ink/40">Sin factura</span>;
  if (inv.status !== "issued" || !inv.number) return <span className="text-xs px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800">{inv.status === "error" ? "Error DIAN" : "Pendiente DIAN"}</span>;
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs">{inv.number}</span>
      {inv.pdf_url && (
        <a href={inv.pdf_url} target="_blank" rel="noopener noreferrer" className="text-xs px-2.5 py-1 rounded-full bg-ink text-ivory hover:bg-ink/80">Ver PDF</a>
      )}
    </div>
  );
}

function CreditNotes({ orderId, notes }: { orderId: string; notes?: any[] | null }) {
  const refresh = useServerFn(refreshPosCreditNotes);
  const qc = useQueryClient();
  if (!notes?.length) return null;
  return (
    <div className="mt-1.5 space-y-1">
      {notes.map((n) => (
        <div key={n.external_id} className="flex items-center gap-2 text-[11px]">
          <span className="text-ink/50">NC</span>
          {n.status === "issued" ? (
            <>
              <span className="font-mono">{n.numero_dian ?? n.external_id}</span>
              {n.public_url && <a href={n.public_url} target="_blank" rel="noopener noreferrer" className="underline">Ver PDF</a>}
            </>
          ) : (
            <>
              <span className="text-destructive" title={n.error ?? ""}>{n.status === "error" ? "Error DIAN" : n.status === "draft" ? "Borrador" : "Pendiente"}</span>
              <button className="underline" onClick={async () => { const r: any = await refresh({ data: { orderId } }); if (!r.ok) toast.error(r.message); qc.invalidateQueries({ queryKey: ["fin-ventas"] }); }}>Consultar estado</button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}

type VentasRange = "hoy" | "ayer" | "7d" | "30d" | "custom" | "todo";
const VENTAS_RANGES: { id: VentasRange; label: string }[] = [
  { id: "hoy", label: "Hoy" },
  { id: "ayer", label: "Ayer" },
  { id: "7d", label: "7 días" },
  { id: "30d", label: "30 días" },
  { id: "custom", label: "Personalizado" },
  { id: "todo", label: "Todo" },
];
function rangeBounds(range: VentasRange, from: string, to: string): { start: Date | null; end: Date | null } {
  const now = new Date();
  const dayStart = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const dayEnd = (d: Date) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
  if (range === "hoy") return { start: dayStart(now), end: dayEnd(now) };
  if (range === "ayer") { const y = new Date(now); y.setDate(y.getDate() - 1); return { start: dayStart(y), end: dayEnd(y) }; }
  if (range === "7d" || range === "30d") { const s = new Date(now); s.setDate(s.getDate() - (range === "7d" ? 6 : 29)); return { start: dayStart(s), end: dayEnd(now) }; }
  if (range === "custom") {
    const start = from ? dayStart(new Date(from + "T00:00:00")) : null;
    const end = to ? dayEnd(new Date(to + "T00:00:00")) : null;
    return { start, end };
  }
  return { start: null, end: null };
}

function VentasList({ sedeFilter }: { sedeFilter: string }) {
  const [query, setQuery] = useState("");
  const reconcileInvoices = useServerFn(getReconciledOrderInvoices);
  const [range, setRange] = useState<VentasRange>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [returning, setReturning] = useState<{ orderId: string; number: string; invoice: string } | null>(null);
  const [viewing, setViewing] = useState<{ orderId: string; number: string } | null>(null);
  const { data, isLoading } = useQuery({
    queryKey: ["fin-ventas", sedeFilter],
    queryFn: async () => {
      const rows: any[] = await fetchAll((from, to) => {
        let q = supabase
          .from("pos_sales")
          .select("id, created_at, method, amount_cop, order_id, session_id, pos_sessions!inner(location_id, locations(name, code)), orders(number, contact_name, customer_id, invoices(number, status, pdf_url, created_at), pos_credit_notes(external_id, status, total, numero_dian, public_url, error, created_at))")
          .order("created_at", { ascending: false })
          .order("id");
        if (sedeFilter !== "all") q = q.eq("pos_sessions.location_id", sedeFilter);
        return q.range(from, to);
      });
      // Pull the final DIAN state from R-Count for invoices still pending or in error.
      const unresolved = [...new Set(rows.filter((r) => r.order_id && (r.orders?.invoices ?? []).length && !(r.orders.invoices as any[]).some((i) => i.status === "issued")).map((r) => r.order_id as string))].slice(0, 200);
      if (unresolved.length) {
        try {
          const fresh: any[] = await reconcileInvoices({ data: { orderIds: unresolved } });
          for (const r of rows) if (unresolved.includes(r.order_id) && r.orders) r.orders.invoices = fresh.filter((i) => i.order_id === r.order_id);
        } catch { /* keep last known state */ }
      }
      // Customer city/country live on the customer profile, not on the sale.
      const custIds = [...new Set(rows.map((r) => r.orders?.customer_id).filter(Boolean))] as string[];
      const places = new Map<string, string>();
      for (let i = 0; i < custIds.length; i += 200) {
        const { data: ps } = await supabase.from("profiles").select("id, city, country").in("id", custIds.slice(i, i + 200));
        for (const p of (ps ?? []) as any[]) {
          const txt = [p.city, p.country].filter(Boolean).join(", ");
          if (txt) places.set(p.id, txt);
        }
      }
      for (const r of rows) r.place = places.get(r.orders?.customer_id) ?? null;
      return rows;
    },
  });

  const dateFiltered = useMemo(() => {
    const all = (data ?? []) as any[];
    const { start, end } = rangeBounds(range, customFrom, customTo);
    if (!start && !end) return all;
    return all.filter((r) => {
      const d = new Date(r.created_at);
      if (start && d < start) return false;
      if (end && d > end) return false;
      return true;
    });
  }, [data, range, customFrom, customTo]);

  const rows = useMemo(() => {
    const all = dateFiltered;
    const q = normalizeSearch(query);
    if (!q) return all;
    const digits = q.replace(/\D/g, "");
    return all.filter((r) => {
      const haystack = normalizeSearch(
        [
          r.orders?.number,
          r.orders?.contact_name,
          r.place,
          r.pos_sessions?.locations?.name,
          methodLabel(r.method),
          String(r.amount_cop ?? ""),
        ]
          .filter(Boolean)
          .join(" "),
      );
      if (haystack.includes(q)) return true;
      return digits.length >= 2 && String(r.amount_cop ?? "").includes(digits);
    });
  }, [dateFiltered, query]);

  const refunded = useMemo(() => rows.reduce((s, r: any) => s + Math.min(r.amount_cop, (r.orders?.pos_credit_notes ?? []).filter((n: any) => n.status === "issued").reduce((a: number, n: any) => a + Number(n.total ?? 0), 0)), 0), [rows]);
  const total = useMemo(() => rows.reduce((s, r: any) => s + r.amount_cop, 0) - refunded, [rows, refunded]);
  const { pageItems: ventasPage, pager: ventasPager } = usePaged(rows);

  if (isLoading) return <p className="text-sm text-ink/50 py-10 text-center">Cargando…</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1 bg-white border border-ink/10 rounded-full p-1">
          {VENTAS_RANGES.map((r) => (
            <button key={r.id} onClick={() => setRange(r.id)}
              className={"px-3.5 py-1.5 rounded-full text-xs transition " + (range === r.id ? "bg-ink text-ivory" : "text-ink/60 hover:text-ink")}>
              {r.label}
            </button>
          ))}
        </div>
        {range === "custom" && (
          <div className="flex items-center gap-2 text-xs text-ink/60">
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)}
              className="bg-white border border-ink/10 rounded-full px-3 py-1.5 text-xs text-ink" aria-label="Desde" />
            <span>→</span>
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)}
              className="bg-white border border-ink/10 rounded-full px-3 py-1.5 text-xs text-ink" aria-label="Hasta" />
          </div>
        )}
      </div>
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-moss/50" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por número de pedido, cliente, sede, método o monto…"
          className="w-full bg-white border border-ink/10 rounded-full pl-11 pr-10 py-2.5 text-sm text-ink placeholder:text-moss/40"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            aria-label="Limpiar búsqueda"
            className="absolute right-3 top-1/2 -translate-y-1/2 size-6 rounded-full flex items-center justify-center hover:bg-ink/5"
          >
            <X className="size-3.5 text-ink/50" />
          </button>
        )}
      </div>
      <div className="flex items-center justify-between px-6 py-4 rounded-2xl bg-white border border-ink/10">
        <span className="text-sm text-ink/60">
          {rows.length} {rows.length === 1 ? "venta" : "ventas"}
          {query && rows.length !== (data?.length ?? 0) ? ` de ${data?.length ?? 0}` : ""}
        </span>
        <span className="text-right"><span className="text-2xl">{formatCOP(total)}</span>{refunded > 0 && <span className="block text-xs text-ink/50">Incluye −{formatCOP(refunded)} en notas crédito</span>}</span>
      </div>
      {!rows.length ? (
        <p className="text-sm text-ink/50 py-16 text-center rounded-3xl bg-white border border-ink/10">
          {query ? `Sin ventas que coincidan con «${query}».` : "Sin ventas registradas."}
        </p>
      ) : (
      <div className="rounded-3xl bg-white border border-ink/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ivory/60 text-[10px] uppercase tracking-widest text-ink/50">
            <tr>
              <th className="text-left px-6 py-4">Fecha</th>
              <th className="text-left px-4 py-4">Sede</th>
              <th className="text-left px-4 py-4">Cliente</th>
              <th className="text-left px-4 py-4">Método</th>
              <th className="text-left px-4 py-4">Factura DIAN</th>
              <th className="text-right px-2 py-4" aria-label="Ver pedido" />
              <th className="text-right px-6 py-4">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {ventasPage.map((r: any) => (
              <tr key={r.id} className="hover:bg-ivory/30">
                <td className="px-6 py-3.5">{new Date(r.created_at).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                <td className="px-4 py-3.5">{r.pos_sessions?.locations?.name ?? "—"}</td>
                <td className="px-4 py-3.5">
                  {r.orders?.contact_name ?? "—"}
                  {r.place ? <div className="text-[11px] text-ink/50">{r.place}</div> : null}
                </td>
                <td className="px-4 py-3.5 capitalize"><span className="text-xs px-2.5 py-1 rounded-full bg-ivory/70 border border-ink/10">{methodLabel(r.method)}</span></td>
                <td className="px-4 py-3.5">
                  <InvoiceCell invoices={r.orders?.invoices} />
                  {(() => { const inv = (r.orders?.invoices ?? []).find((i: any) => i.status === "issued" && i.number); return inv && r.order_id ? (
                    <button onClick={() => setReturning({ orderId: r.order_id, number: r.orders?.number ?? "", invoice: inv.number })} className="mt-1.5 text-[11px] px-2.5 py-1 rounded-full border border-ink/15 hover:bg-ivory">Devolver</button>
                  ) : null; })()}
                  {r.order_id && <CreditNotes orderId={r.order_id} notes={r.orders?.pos_credit_notes} />}
                  {r.order_id && <ReprintButton sale={r} />}
                </td>
                <td className="px-2 py-3.5 text-right">
                  {r.order_id && (
                    <button
                      onClick={() => setViewing({ orderId: r.order_id, number: r.orders?.number ?? "" })}
                      aria-label={`Ver pedido ${r.orders?.number ?? ""}`}
                      title="Ver pedido"
                      className="size-8 rounded-full border border-ink/10 inline-flex items-center justify-center text-ink/60 hover:bg-ivory hover:text-ink"
                    >
                      <Eye className="size-4" />
                    </button>
                  )}
                </td>
                <td className="px-6 py-3.5 text-right font-medium">{formatCOP(r.amount_cop)}{r.order_id && <div><ResendButton orderId={r.order_id} /></div>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      {ventasPager}
      {returning && <PosReturnModal orderId={returning.orderId} orderNumber={returning.number} invoiceNumber={returning.invoice} onClose={() => setReturning(null)} />}
      {viewing && <PosOrderDetailModal orderId={viewing.orderId} number={viewing.number} onClose={() => setViewing(null)} />}
    </div>
  );
}

function PosOrderDetailModal({ orderId, number, onClose }: { orderId: string; number: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["fin-pos-order", orderId],
    queryFn: async () => {
      const { data: o } = await supabase
        .from("orders")
        .select("id, number, status, created_at, contact_name, contact_email, contact_phone, payment_method, notes, subtotal_cop, discount_cop, shipping_cop, total_cop, order_items(id, qty, unit_price_cop, product_name, variant_label, product_variants(sku, products(hero_image_url)))")
        .eq("id", orderId)
        .maybeSingle();
      return o;
    },
  });

  const items = (data?.order_items ?? []) as any[];
  const pieces = items.reduce((s, i) => s + Number(i.qty ?? 0), 0);

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-auto p-8 relative" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 w-9 h-9 rounded-full hover:bg-ink/5 flex items-center justify-center"><X className="size-4" /></button>
        <p className="text-[10px] uppercase tracking-widest text-moss/70">Pedido POS</p>
        <h3 className="text-2xl mt-1">{number || data?.number || "—"}</h3>
        {isLoading ? (
          <p className="text-sm text-ink/50 py-10 text-center">Cargando…</p>
        ) : !data ? (
          <p className="text-sm text-ink/50 py-10 text-center">No se encontró el pedido.</p>
        ) : (
          <>
            <p className="text-sm text-ink/60 mt-1">
              {new Date(data.created_at).toLocaleString("es-CO")} · {data.contact_name ?? "Venta mostrador"}
              {data.contact_phone ? ` · ${data.contact_phone}` : ""}
            </p>
            <div className="mt-6 rounded-2xl border border-ink/10 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-ivory/60 text-[10px] uppercase tracking-widest text-ink/50">
                  <tr>
                    <th className="text-left px-4 py-3">Producto</th>
                    <th className="text-center px-3 py-3">Cant.</th>
                    <th className="text-right px-4 py-3">Precio</th>
                    <th className="text-right px-4 py-3">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {items.map((i) => (
                    <tr key={i.id}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {i.product_variants?.products?.hero_image_url && (
                            <img src={i.product_variants.products.hero_image_url} alt="" className="size-10 rounded-lg object-cover bg-ivory" />
                          )}
                          <div>
                            <div className="font-medium">{i.product_name ?? i.product_variants?.sku ?? "—"}</div>
                            {i.variant_label && <div className="text-xs text-ink/50">{i.variant_label}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 text-center">{i.qty}</td>
                      <td className="px-4 py-3 text-right">{formatCOP(Number(i.unit_price_cop ?? 0))}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCOP(Number(i.unit_price_cop ?? 0) * Number(i.qty ?? 0))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between text-ink/60"><span>Subtotal ({pieces} {pieces === 1 ? "prenda" : "prendas"})</span><span>{formatCOP(Number(data.subtotal_cop ?? 0))}</span></div>
              {Number(data.discount_cop ?? 0) > 0 && <div className="flex justify-between text-ink/60"><span>Descuento</span><span>−{formatCOP(Number(data.discount_cop))}</span></div>}
              {Number(data.shipping_cop ?? 0) > 0 && <div className="flex justify-between text-ink/60"><span>Envío</span><span>{formatCOP(Number(data.shipping_cop))}</span></div>}
              <div className="flex justify-between font-semibold text-base pt-1.5 border-t border-ink/10"><span>Total</span><span>{formatCOP(Number(data.total_cop ?? 0))}</span></div>
            </div>
            {data.notes && <p className="mt-4 text-xs text-ink/60 rounded-xl bg-ivory/60 border border-ink/10 px-4 py-3">Nota: {data.notes}</p>}
          </>
        )}
      </div>
    </div>
  );
}

function SessionDetailModal({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const { data } = useQuery({
    queryKey: ["fin-session-detail", sessionId],
    queryFn: async () => {
      const [sess, sales, expenses] = await Promise.all([
        supabase.from("pos_sessions").select("id, opened_at, closed_at, opening_cash_cop, closing_cash_cop, notes, opened_by, closing_receipt_path, locations(name)").eq("id", sessionId).maybeSingle(),
        supabase.from("pos_sales").select("id, created_at, method, amount_cop, orders(number, contact_name)").eq("session_id", sessionId).order("created_at"),
        supabase.from("pos_expenses").select("id, created_at, amount_cop, category, reason").eq("session_id", sessionId).order("created_at"),
      ]);
      let sellerName: string | null = null;
      if (sess.data?.opened_by) {
        const { data: p } = await supabase.from("profiles").select("full_name").eq("id", sess.data.opened_by).maybeSingle();
        sellerName = p?.full_name ?? null;
      }
      return { session: sess.data, sellerName, sales: sales.data ?? [], expenses: expenses.data ?? [] };
    },
  });

  const totals = useMemo(() => {
    const t: Record<string, number> = { efectivo: 0, tarjeta: 0, datafono: 0, transferencia: 0, wompi: 0, link_pago: 0, credito_15: 0 };
    let grand = 0;
    for (const s of data?.sales ?? []) { t[s.method] = (t[s.method] ?? 0) + s.amount_cop; grand += s.amount_cop; }
    const expensesTotal = (data?.expenses ?? []).reduce((sum, e) => sum + e.amount_cop, 0);
    return { byMethod: t, grand, expensesTotal };
  }, [data]);

  const s = data?.session;
  const expected = s ? (s.opening_cash_cop + totals.byMethod.efectivo - totals.expensesTotal) : 0;
  const diff = (s?.closing_cash_cop ?? 0) - expected;

  const { data: receiptUrl } = useQuery({
    queryKey: ["fin-session-receipt", s?.closing_receipt_path],
    enabled: !!s?.closing_receipt_path,
    queryFn: async () => {
      const { data: signed } = await supabase.storage.from("pos-receipts").createSignedUrl(s!.closing_receipt_path!, 3600);
      return signed?.signedUrl ?? null;
    },
  });

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-auto p-8 relative">
        <button onClick={onClose} className="absolute top-4 right-4 w-9 h-9 rounded-full hover:bg-ink/5 flex items-center justify-center"><X className="size-4" /></button>
        <p className="text-[10px] uppercase tracking-widest text-moss/70">Cierre de caja</p>
        <h3 className="text-2xl mt-1">{s?.locations?.name ?? "—"} · {data?.sellerName ?? "—"}</h3>
        <p className="text-sm text-ink/60 mt-1">Abierta {s?.opened_at ? new Date(s.opened_at).toLocaleString("es-CO") : "—"} · Cerrada {s?.closed_at ? new Date(s.closed_at).toLocaleString("es-CO") : "—"}</p>

        <div className="grid grid-cols-2 gap-3 mt-6">
          <div className="rounded-2xl bg-ivory/60 border border-ink/10 p-4 space-y-1.5 text-sm">
            <div className="text-[10px] uppercase tracking-widest text-ink/50 mb-2">Resumen efectivo</div>
            <Row label="Base inicial" value={s?.opening_cash_cop ?? 0} muted />
            <Row label="Efectivo ventas" value={totals.byMethod.efectivo} />
            {totals.expensesTotal > 0 && <Row label="Egresos" value={-totals.expensesTotal} />}
            <div className="border-t border-ink/10 pt-2 mt-2">
              <Row label="Esperado" value={expected} />
              <Row label="Contado" value={s?.closing_cash_cop ?? 0} />
              <div className={"flex justify-between font-medium " + (diff === 0 ? "text-moss" : diff > 0 ? "text-ink/70" : "text-clay")}>
                <span>Diferencia</span><span>{diff === 0 ? "0" : (diff > 0 ? "+" : "") + formatCOP(diff).replace("-", "")}</span>
              </div>
            </div>
          </div>
          <div className="rounded-2xl bg-ivory/60 border border-ink/10 p-4 space-y-1.5 text-sm">
            <div className="text-[10px] uppercase tracking-widest text-ink/50 mb-2">Ventas por método</div>
            <Row label="Efectivo" value={totals.byMethod.efectivo} />
            <Row label="Tarjeta" value={totals.byMethod.tarjeta} />
            <Row label="Datáfono" value={totals.byMethod.datafono} />
            <Row label="Transferencia" value={totals.byMethod.transferencia} />
            {totals.byMethod.link_pago > 0 && <Row label="Link de pago" value={totals.byMethod.link_pago} />}
            {totals.byMethod.wompi > 0 && <Row label="Wompi" value={totals.byMethod.wompi} />}
            <div className="border-t border-ink/10 pt-2 mt-2">
              <Row label="Total ventas" value={totals.grand} />
            </div>
          </div>
        </div>

        {receiptUrl && (
          <div className="mt-6">
            <div className="text-[10px] uppercase tracking-widest text-ink/50 mb-3">Tirilla del datáfono</div>
            <a href={receiptUrl} target="_blank" rel="noreferrer" className="block rounded-2xl overflow-hidden border border-ink/10 hover:border-ink/30 transition">
              <img src={receiptUrl} alt="Tirilla del datáfono" className="w-full max-h-80 object-contain bg-ivory/40" />
            </a>
          </div>
        )}

        <div className="mt-6">
          <div className="text-[10px] uppercase tracking-widest text-ink/50 mb-3">Ventas ({data?.sales.length ?? 0})</div>
          <div className="rounded-2xl border border-ink/10 overflow-hidden">
            {(data?.sales ?? []).length === 0 ? (
              <p className="p-6 text-sm text-ink/50 text-center">Sin ventas en esta sesión.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-ivory/60 text-[10px] uppercase tracking-widest text-ink/50">
                  <tr>
                    <th className="text-left px-4 py-2.5">Hora</th>
                    <th className="text-left px-4 py-2.5">Pedido</th>
                    <th className="text-left px-4 py-2.5">Cliente</th>
                    <th className="text-left px-4 py-2.5">Método</th>
                    <th className="text-right px-4 py-2.5">Monto</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {data?.sales.map((v: any) => (
                    <tr key={v.id}>
                      <td className="px-4 py-2.5">{new Date(v.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</td>
                      <td className="px-4 py-2.5 font-mono text-xs">{v.orders?.number ?? "—"}</td>
                      <td className="px-4 py-2.5">{v.orders?.contact_name ?? "—"}</td>
                      <td className="px-4 py-2.5 capitalize">{v.method}</td>
                      <td className="px-4 py-2.5 text-right font-medium">{formatCOP(v.amount_cop)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {(data?.expenses ?? []).length > 0 && (
          <div className="mt-6">
            <div className="text-[10px] uppercase tracking-widest text-ink/50 mb-3">Egresos ({data?.expenses.length})</div>
            <div className="rounded-2xl border border-ink/10 divide-y divide-ink/5">
              {data?.expenses.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between p-4 text-sm">
                  <div>
                    <div>{e.reason}</div>
                    <div className="text-xs text-ink/50 capitalize">{e.category} · {new Date(e.created_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                  <div className="text-clay font-medium">− {formatCOP(e.amount_cop)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {s?.notes && (
          <div className="mt-6 rounded-2xl bg-ivory/60 border border-ink/10 p-4">
            <div className="text-[10px] uppercase tracking-widest text-ink/50 mb-1">Notas</div>
            <p className="text-sm text-ink/80">{s.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={"flex justify-between " + (muted ? "text-ink/60" : "")}>
      <span>{label}</span><span className="font-medium">{formatCOP(value)}</span>
    </div>
  );
}
