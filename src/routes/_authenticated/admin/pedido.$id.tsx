import { createFileRoute, Link, useNavigate, useParams, useLocation } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  ArrowLeft, PackageCheck, CreditCard, MapPin, User, Truck, Clock, Loader2,
  ChevronDown, Printer, FileText, Copy, Mail,
} from "lucide-react";
import { printOrderDocument } from "@/components/admin/order-print";
import { supabase } from "@/integrations/supabase/client";
import { formatCOP, formatUSD } from "@/lib/format";
import { countryFlag } from "@/lib/geo";
import { CountrySelect, CitySelect } from "@/components/admin/geo-select";
import { toast } from "sonner";
import { InvoicePanel } from "@/components/admin/invoice-panel";
import { B2BCadPanel } from "@/components/admin/b2b-cad-panel";
import { B2BOrderPanel } from "@/components/admin/b2b-order-panel";
import { ConversionSummary } from "@/components/admin/conversion-summary";
import { OrderAdTag } from "@/components/admin/order-ad-tag";
import { SkydropxLabelCard } from "@/components/admin/skydropx-label-card";
import { InternationalLabelCard, isInternationalShip } from "@/components/admin/international-label-card";
import { ManualOrderFlow } from "@/components/admin/manual-order-flow";
import { OrderWarehouseStep } from "@/components/admin/order-warehouse-step";
import { B2BOrderFlow, B2BBoxesPanel } from "@/components/admin/b2b-boxes-panel";
import { ReturnReceiveModal } from "@/components/pos/return-receive-modal";
import { useServerFn } from "@tanstack/react-start";
import { cancelOrderWithRefund } from "@/lib/pagos/refund.functions";
import { resendOrderConfirmation } from "@/lib/email/order-email.functions";
import { TeamNotes } from "@/components/admin/team-notes";
import { EditManualOrderModal } from "@/components/admin/edit-manual-order-modal";
import { ChangeItemLocationModal } from "@/components/admin/change-item-location-modal";
import { orderCustomerDetails } from "@/lib/order-customer-details";

export const Route = createFileRoute("/_authenticated/admin/pedido/$id")({
  head: () => ({ meta: [
    { title: "Detalle del pedido | Tu Marca" },
    { name: "description", content: "Gestión de pedidos y documentos de Tu Marca." },
    { property: "og:title", content: "Detalle del pedido | Tu Marca" },
    { property: "og:description", content: "Gestión de pedidos y documentos de Tu Marca." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: OrderDetail,
});

const ORDER_DETAIL_SELECT = `
  id, number, ad_source, ad_campaign, ad_tagged_at, status, source, is_manual, subtotal_cop, shipping_cop, discount_cop, total_cop, currency, total_usd:total_usd_exact,
  contact_name, contact_email, contact_phone, ship_to, notes, customer_id, b2b_mode, b2b_payment_method, b2b_ship_eta, b2b_reward,
  payment_method, payment_reference, credit_due_at, picked_up_at, payment_status, payment_proof_url, payment_proof_at,
  shipping_carrier, tracking_number, shipping_label_url, skydropx_shipment_id,
  reserved_at, paid_at, created_at, updated_at, stock_confirmed_at, dispatch_location_id, transfer_id,
  order_items(id, variant_id, qty, shipped_qty, fulfill_location_id, b2b_source, unit_price_cop, unit_price_usd, product_name, variant_label, hs_code,
    fulfill_location:locations!order_items_fulfill_location_id_fkey(name),
    product_variants(id, sku, size, color, price_cop, price_usd, tariff_code, products(name, product_type, hero_image_url))),
  order_fulfillments(id, status, created_at, locations(name, city)),
  invoices(id, status, number),
  pos_sales(id, method, amount_cop, created_at, pos_sessions(locations(name))),
  returns(id, kind, status, reason, refund_cop, created_at)
`;

const PAYMENT_LABEL: Record<string, string> = {
  wompi: "Wompi", addi: "Addi", transfer: "Transferencia bancaria",
  paypal: "PayPal", paguelofacil: "Páguelo Fácil", paguelo_facil: "Páguelo Fácil", card: "Tarjeta", cod: "Contra entrega",
};

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente", review: "Comprobante en revisión", paid: "Pagado", failed: "Fallido",
  refunded: "Reembolsado", refund_pending: "Devolución pendiente",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "Borrador", reserved: "Reservado", paid: "Pagado", preparing: "Preparando",
  shipped: "Enviado", delivered: "Entregado", cancelled: "Cancelado", refunded: "Reembolsado",
};

const NEXT_STATUS: Record<string, { to: string; label: string } | undefined> = {
  preparing: { to: "shipped", label: "Marcar como enviado" },
  shipped: { to: "delivered", label: "Marcar como entregado" },
};

const METHOD_LABEL: Record<string, string> = {
  efectivo: "Efectivo", datafono: "Datáfono", transferencia: "Transferencia",
  wompi: "Wompi", tarjeta: "Tarjeta",
};

function fullDate(iso: string) {
  return new Date(iso).toLocaleString("es-CO", {
    day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}
function shortTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
}

function Pill({ label, tone = "neutral" }: { label: string; tone?: "neutral" | "warn" | "ok" | "bad" }) {

  const cls =
    tone === "ok" ? "bg-ink/5 text-ink"
      : tone === "warn" ? "bg-amber-50 text-amber-700"
        : tone === "bad" ? "bg-red-50 text-red-600"
          : "bg-ink/5 text-moss";
  return (
    <span className={"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] " + cls}>
      <span className="size-1.5 rounded-full bg-current" />{label}
    </span>
  );
}

function Card({ title, icon, action, children }: {
  title?: string; icon?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="min-w-0 max-w-full bg-card border border-border rounded-2xl">
      {title && (
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-4 border-b border-border sm:flex sm:justify-between sm:px-5">
          <div className="flex min-w-0 items-center gap-2 text-ink">
            {icon}
            <h2 className="text-sm font-medium">{title}</h2>
          </div>
          {action && <div className="min-w-0 max-w-36 text-right sm:max-w-none">{action}</div>}
        </header>
      )}
      <div className="min-w-0 px-4 py-4 sm:px-5">{children}</div>
    </section>
  );
}

function MenuItem({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm text-ink hover:bg-ink/5">
      <span className="text-moss">{icon}</span>{label}
    </button>
  );
}

export function OrderDetail() {
  const { id } = useParams({ strict: false }) as { id: string };
  const fromB2B = useLocation({ select: (l) => l.pathname.startsWith("/admin/b2b") });
  const backTo = fromB2B ? "/admin/b2b/pedidos" : "/admin/pedidos";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const cancelFn = useServerFn(cancelOrderWithRefund);
  const resendEmailFn = useServerFn(resendOrderConfirmation);
  const [resending, setResending] = useState(false);
  const [menu, setMenu] = useState(false);
  const [editItems, setEditItems] = useState(false);
  const [askDeliveryPrint, setAskDeliveryPrint] = useState(false);
  const [printPhotos, setPrintPhotos] = useState(true);
  useEffect(() => { setPrintPhotos(localStorage.getItem("tb-print-photos") !== "0"); }, []);
  const [returnLoc, setReturnLoc] = useState<{ id: string; name: string } | null>(null);
  const [editingShip, setEditingShip] = useState(false);
  const [shipForm, setShipForm] = useState<Record<string, string>>({});
  // La devolución reingresa a la bodega que vendió (tienda) o a Ecommerce (online).
  const openReturn = async () => {
    const q = order?.sold_by_location_id
      ? supabase.from("locations").select("id, name").eq("id", order.sold_by_location_id)
      : supabase.from("locations").select("id, name").eq("kind", "ecom");
    const { data } = await q.limit(1).maybeSingle();
    if (!data) { toast.error("No se encontró la bodega para recibir la devolución"); return; }
    setReturnLoc(data);
  };

  const { data: order, isLoading } = useQuery({
    queryKey: ["admin", "order", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("orders").select(ORDER_DETAIL_SELECT).eq("id", id).single();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: gatewayProvider } = useQuery({
    queryKey: ["admin", "order-payment-provider", order?.payment_reference],
    enabled: order?.source === "ecom" && !order?.is_manual && !!order?.payment_reference,
    queryFn: async () => {
      const { data, error } = await supabase.from("payment_attempts")
        .select("provider").eq("reference", order.payment_reference).maybeSingle();
      if (error) throw error;
      return data?.provider ?? null;
    },
  });

  const [movingItem, setMovingItem] = useState<any>(null);
  const { data: events } = useQuery({
    queryKey: ["admin", "order-events", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("audit_log")
        .select("id, action, entity, created_at, diff, actor_id")
        .eq("entity", "orders").eq("entity_id", id)
        .order("created_at", { ascending: false }).limit(60);
      const rows = (data ?? []) as any[];
      const ids = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))];
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        const map = new Map((profs ?? []).map((p: any) => [p.id, p.full_name]));
        rows.forEach((r) => { r.actor_name = map.get(r.actor_id) ?? null; });
      }
      return rows;
    },
  });

  // Correos de confirmación de compra registrados para este pedido.
  const { data: emailLogs } = useQuery({
    queryKey: ["admin", "order-emails", id],
    queryFn: async () => {
      const { data } = await supabase
        .from("email_send_log" as any)
        .select("dedupe_key, event, recipients, status, error, created_at")
        .like("dedupe_key", `%-${id}%`)
        .order("created_at", { ascending: false }).limit(20);
      return (data ?? []) as any[];
    },
  });

  const { data: b2b, isLoading: b2bLoading } = useQuery({
    queryKey: ["admin", "order-b2b", order?.customer_id],
    enabled: !!order?.customer_id,
    queryFn: async () => {
      const [{ data: role }, { data: prof }] = await Promise.all([
        supabase.from("user_roles").select("id").eq("user_id", order.customer_id).eq("role", "b2b").maybeSingle(),
        supabase.from("profiles").select("company_name, document_id").eq("id", order.customer_id).maybeSingle(),
      ]);
      return { isB2B: !!role, company: (prof as any)?.company_name ?? null, documentId: (prof as any)?.document_id ?? null };
    },
  });

  const { data: customerAddresses = [] } = useQuery({
    queryKey: ["admin", "order-customer-addresses", order?.customer_id],
    enabled: Boolean(order?.customer_id),
    queryFn: async () => {
      const { data, error } = await supabase.from("addresses").select("*")
        .eq("user_id", order.customer_id)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading || (order?.customer_id && b2bLoading)) {
    return (
      <div className="p-6 md:p-10 animate-pulse">
        <div className="h-3 w-20 rounded bg-ink/10" />
        <div className="mt-4 h-10 w-72 rounded bg-ink/10" />
        <div className="mt-3 h-3 w-64 rounded bg-ink/5" />
        <div className="mt-8 h-28 rounded-2xl bg-ink/5" />
        <div className="mt-5 grid gap-5 md:grid-cols-[1fr_340px]">
          <div className="h-72 rounded-2xl bg-ink/5" />
          <div className="h-72 rounded-2xl bg-ink/5" />
        </div>
      </div>
    );
  }
  if (!order) {
    return (
      <div className="p-10">
        <p className="text-sm text-moss/70">Este pedido ya no existe.</p>
        <Link to={backTo as "/admin/pedidos"} className="text-sm underline mt-3 inline-block">Volver a pedidos</Link>
      </div>
    );
  }

  const items = [...(order.order_items ?? [])].sort((a: any, b: any) =>
    String(a.product_name ?? "").localeCompare(String(b.product_name ?? ""), "es", { sensitivity: "base", numeric: true }) ||
    String(a.variant_label ?? "").localeCompare(String(b.variant_label ?? ""), "es"));
  const ship = (order.ship_to ?? {}) as Record<string, any>;
  const customerDetails = orderCustomerDetails(ship, customerAddresses, b2b?.documentId);
  const shippingDisplay = customerDetails.shipping;
  const posLoc = order.pos_sales?.[0]?.pos_sessions?.locations?.name as string | undefined;
  const fulLoc = order.order_fulfillments?.[0]?.locations?.name as string | undefined;
  const channel = posLoc ?? (order.source === "ecom"
    ? ((order as any).is_manual ? "Pedido Manual" : "Online")
    : order.source === "pos"
      ? "POS"
      : order.b2b_mode
        ? "B2B"
        : "B2B");
  const paid = order.payment_status === "paid" || Boolean(order.paid_at);
  const paymentLabel = PAYMENT_STATUS_LABEL[order.payment_status ?? "pending"] ?? order.payment_status;
  const method = (gatewayProvider || order.payment_method || "").toLowerCase();
  const methodLabel = method === "card" && order.source === "ecom" && !order.is_manual
    ? gatewayProvider === undefined ? "pasarela en consulta" : "pasarela no disponible"
    : PAYMENT_LABEL[method] ?? method;
  const prepared = order.status === "shipped" || order.status === "delivered";
  const posOrder = order.source === "pos";
  const next = b2b?.isB2B ? undefined : NEXT_STATUS[order.status];
  const isUsd = order.currency === "USD" && Number(order.total_usd) > 0;
  const totalUsd = Number(order.total_usd ?? 0);
  const usdPerCop = order.total_cop > 0 ? totalUsd / order.total_cop : 0;
  const itemUsd = (item: any) => {
    const paidUsd = Number(item.unit_price_usd ?? 0);
    if (paidUsd > 0) return paidUsd;
    if (b2b?.isB2B && usdPerCop > 0) return Number(item.unit_price_cop ?? 0) * usdPerCop;
    const savedUsd = Number(item.product_variants?.price_usd ?? 0);
    return savedUsd > 0 ? savedUsd : Number(item.unit_price_cop ?? 0) * usdPerCop;
  };
  const subtotalUsd = items.reduce((sum: number, item: any) => sum + itemUsd(item) * item.qty, 0);
  const discountUsd = Number(order.discount_cop ?? 0) * usdPerCop;
  const shippingUsd = Math.max(0, totalUsd - subtotalUsd + discountUsd);
  const moneyValue = (usd: number, cop: number, strong = false) => isUsd ? (
    <span className="inline-flex flex-col items-end">
      <span>{formatUSD(usd)}</span>
      <span className={strong ? "text-[11px] font-normal text-moss/50" : "text-[10px] text-moss/50"}>{formatCOP(cop)}</span>
    </span>
  ) : formatCOP(cop);

  const setStatus = async (to: string) => {
    setBusy(true);
    const { error } = await supabase.from("orders").update({ status: to as any }).eq("id", id);
    setBusy(false);
    if (error) { toast.error("No se pudo actualizar el pedido"); return; }
    toast.success(`Pedido ${STATUS_LABEL[to]?.toLowerCase()}`);
    qc.invalidateQueries({ queryKey: ["admin", "order", id] });
    qc.invalidateQueries({ queryKey: ["admin", "orders-list"] });
    qc.invalidateQueries({ queryKey: ["admin", "pending-online-orders"] });
    qc.invalidateQueries({ queryKey: ["tienda-pedidos"] });
  };

  const cancelOrder = async () => {
    if (!window.confirm("¿Seguro que quieres cancelar este pedido?")) return;
    const hasDianInvoice = (order.invoices ?? []).some((i: any) => i.status === "issued");
    if (hasDianInvoice) {
      toast.warning(
        "Este pedido ya tiene factura emitida ante la DIAN. Solicita una nota de crédito a contabilidad para devolver el dinero.",
        { duration: 10000 }
      );
    }
    const refund = order.payment_status === "paid" && !hasDianInvoice
      && window.confirm("¿Devolver el dinero al cliente?\n\nAceptar = sí, devolver · Cancelar = no devolver");
    setBusy(true);
    try {
      const r = await cancelFn({ data: { orderId: id, refund } });
      if (r.status === "refunded") toast.success(`Pedido cancelado. ${r.message}`);
      else if (r.status === "refund_pending") toast.warning(`Pedido cancelado. ${r.message}`, { duration: 10000 });
      else toast.success("Pedido cancelado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo cancelar el pedido");
    }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["admin", "order", id] });
    qc.invalidateQueries({ queryKey: ["admin", "orders-list"] });
    qc.invalidateQueries({ queryKey: ["admin", "pending-online-orders"] });
    qc.invalidateQueries({ queryKey: ["tienda-pedidos"] });
  };

  const confirmPayment = async () => {
    setBusy(true);
    if ((order as any).is_manual && ["draft", "reserved"].includes(order.status)) {
      const { error } = await supabase.rpc("confirm_manual_order_payment" as any, { _order_id: id, _proof_url: null } as any);
      setBusy(false);
      if (error) { toast.error(error.message); return; }
      toast.success("Pago confirmado");
      qc.invalidateQueries();
      return;
    }
    const patch: Record<string, unknown> = { payment_status: "paid", paid_at: new Date().toISOString() };
    if (order.status === "reserved") patch.status = "paid";
    const { error } = await supabase
      .from("orders")
      .update(patch as any)
      .eq("id", id);
    setBusy(false);
    if (error) { toast.error("No se pudo confirmar el pago"); return; }
    toast.success("Pago confirmado");
    qc.invalidateQueries({ queryKey: ["admin", "order", id] });
    qc.invalidateQueries({ queryKey: ["admin", "orders-list"] });
    qc.invalidateQueries({ queryKey: ["admin", "pending-online-orders"] });
    qc.invalidateQueries({ queryKey: ["tienda-pedidos"] });
  };

  const resendConfirmation = async () => {
    setResending(true);
    try {
      const r = await resendEmailFn({ data: { orderId: id } });
      if (r.sent) toast.success(`Correo de confirmación reenviado a ${r.email}`);
      else toast.error(r.error ?? "No se pudo reenviar el correo", { duration: 8000 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo reenviar el correo");
    }
    setResending(false);
    qc.invalidateQueries({ queryKey: ["admin", "order-emails", id] });
  };

  const doPrint = (kind: "order" | "delivery", withPrices = false) => {
    setMenu(false);
    setAskDeliveryPrint(false);
    const ok = printOrderDocument(b2b?.isB2B
      ? { ...order, is_b2b: true, company_name: b2b.company, customer_document_id: b2b.documentId }
      : order, kind, { withPrices, withPhotos: printPhotos });
    if (!ok) toast.error("Permite las ventanas emergentes para imprimir");
  };

  const startEditShip = () => {
    const shippingAddress = customerAddresses.find((address) => address.purpose === "shipping") ?? customerAddresses[0];
    const billingAddress = customerAddresses.find((address) => address.purpose === "billing");
    const billing = (ship.billing ?? {}) as Record<string, string>;
    setShipForm({
      contact_name: order.contact_name ?? "",
      contact_phone: order.contact_phone ?? "",
      document_id: customerDetails.document,
      billing_email: billingAddress?.email ?? billing.email ?? order.contact_email ?? "",
      billing_recipient: billingAddress?.recipient ?? billing.recipient ?? order.contact_name ?? "",
      billing_line1: billingAddress?.line1 ?? billing.line1 ?? "",
      billing_line2: billingAddress?.line2 ?? billing.line2 ?? "",
      billing_city: billingAddress?.city ?? billing.city ?? "",
      billing_department: billingAddress?.department ?? billing.department ?? "",
      billing_postal_code: billingAddress?.postal_code ?? billing.postal_code ?? "",
      billing_country: billingAddress?.country ?? billing.country ?? "Colombia",
      shipping_email: shippingAddress?.email ?? ship.email ?? order.contact_email ?? "",
      recipient: shippingAddress?.recipient ?? ship.recipient ?? "",
      line1: shippingAddress?.line1 ?? ship.line1 ?? "",
      line2: shippingAddress?.line2 ?? ship.line2 ?? "",
      city: shippingAddress?.city ?? ship.city ?? "",
      department: shippingAddress?.department ?? ship.department ?? "",
      postal_code: shippingAddress?.postal_code ?? ship.postal_code ?? "",
      country: shippingAddress?.country ?? ship.country ?? "Colombia",
    });
    setEditingShip(true);
  };

  const saveShip = async () => {
    const t = (k: string) => (shipForm[k] ?? "").trim().slice(0, 200);
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (t("document_id").length < 3) return toast.error("Ingresa el documento o identificación para facturación");
    if (!validEmail.test(t("billing_email"))) return toast.error("Ingresa un correo válido para facturación");
    if (!validEmail.test(t("shipping_email"))) return toast.error("Ingresa un correo válido para despacho");
    if (!t("billing_line1") || !t("billing_city")) return toast.error("Completa la dirección y ciudad de facturación");
    if (!t("line1") || !t("city") || !t("postal_code")) return toast.error("Completa dirección, ciudad y código postal de despacho");
    setBusy(true);
    const billingSnapshot = {
      recipient: t("billing_recipient"), email: t("billing_email"), document_id: t("document_id"),
      line1: t("billing_line1"), line2: t("billing_line2"), city: t("billing_city"),
      department: t("billing_department"), postal_code: t("billing_postal_code"),
      country: t("billing_country") || "Colombia",
    };
    const { error } = await supabase.from("orders").update({
      contact_name: t("contact_name") || order.contact_name,
      contact_email: t("shipping_email"),
      contact_phone: t("contact_phone") || null,
      ship_to: {
        ...ship,
        recipient: t("recipient"), email: t("shipping_email"), line1: t("line1"), line2: t("line2"),
        city: t("city"), department: t("department"),
        postal_code: t("postal_code"), country: t("country") || "Colombia",
        billing: billingSnapshot,
      },
    } as any).eq("id", id);
    if (error) { setBusy(false); toast.error("No se pudo guardar la información"); return; }
    if (order.customer_id) {
      const { error: profileError } = await supabase.from("profiles").update({
        full_name: t("contact_name") || order.contact_name,
        phone: t("contact_phone") || null,
        document_id: t("document_id"),
      }).eq("id", order.customer_id);
      if (profileError) { setBusy(false); toast.error("El pedido se guardó, pero no se pudo actualizar el cliente"); return; }
      const saveAddress = async (purpose: "billing" | "shipping", values: Record<string, string>) => {
        const existing = customerAddresses.find((address) => address.purpose === purpose);
        const row: any = { ...values, purpose, is_default: true, label: purpose === "billing" ? "Facturación" : "Despacho" };
        return existing
          ? supabase.from("addresses").update(row).eq("id", existing.id)
          : supabase.from("addresses").insert({ ...row, user_id: order.customer_id });
      };
      const [billingResult, shippingResult] = await Promise.all([
        saveAddress("billing", { recipient: t("billing_recipient") || t("contact_name"), email: t("billing_email"), phone: t("contact_phone"), line1: t("billing_line1"), line2: t("billing_line2"), city: t("billing_city"), department: t("billing_department"), postal_code: t("billing_postal_code"), country: t("billing_country") || "Colombia" }),
        saveAddress("shipping", { recipient: t("recipient") || t("contact_name"), email: t("shipping_email"), phone: t("contact_phone"), line1: t("line1"), line2: t("line2"), city: t("city"), department: t("department"), postal_code: t("postal_code"), country: t("country") || "Colombia" }),
      ]);
      if (billingResult.error || shippingResult.error) { setBusy(false); toast.error("El pedido se guardó, pero no se pudieron guardar las direcciones del cliente"); return; }
    }
    setBusy(false);
    toast.success("Información del pedido actualizada");
    setEditingShip(false);
    qc.invalidateQueries({ queryKey: ["admin", "order", id] });
    qc.invalidateQueries({ queryKey: ["admin", "order-customer-addresses", order.customer_id] });
    qc.invalidateQueries({ queryKey: ["admin", "customer", order.customer_id] });
  };

  const orderSummaryCard = (
    <Card
      title={prepared ? "Preparado" : "Resumen del pedido"}
      icon={<PackageCheck className="size-4 text-moss" />}
      action={(b2b?.isB2B && order.status === "draft") || fulLoc ? (
        <span className="inline-flex items-center gap-3">
          {fulLoc && <span className="inline-flex items-center gap-1 text-[11px] text-moss/70"><MapPin className="size-3" />{fulLoc}</span>}
          {b2b?.isB2B && order.status === "draft" && (
            <button onClick={() => window.dispatchEvent(new Event("b2b-adjust-open"))}
              className="px-4 py-2 rounded-full bg-white border border-ink/10 text-xs text-ink hover:border-ink/25">Ajustar cantidades y referencias</button>
          )}
        </span>
      ) : undefined}
    >
      <div className="divide-y divide-ink/5 -my-1">
        {items.map((it: any) => {
          const img = it.product_variants?.products?.hero_image_url as string | undefined;
          const sku = it.product_variants?.sku;
          return (
            <div key={it.id} className="grid grid-cols-[3rem_minmax(0,1fr)] gap-x-3 gap-y-2 py-3 sm:flex sm:items-center sm:gap-4">
              <div className="row-span-2 size-12 rounded-lg bg-ink/5 overflow-hidden shrink-0">
                {img && <img src={img} alt={it.product_name ?? ""} className="size-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink break-words">{it.product_name}</p>
                <p className="text-[11px] text-moss/60 break-words">{[it.variant_label, sku, it.fulfill_location?.name ? `Sale de ${it.fulfill_location.name}` : null].filter(Boolean).join(" · ") || "—"}
                  {(order.status === "paid" || order.status === "reserved") && !(it.shipped_qty > 0) && (
                    <button type="button" onClick={() => setMovingItem(it)} className="ml-2 underline underline-offset-2 hover:text-ink">Cambiar bodega</button>
                  )}
                </p>
              </div>
              <div className="col-start-2 min-w-0 text-xs text-moss text-left sm:text-right">
                <p>{isUsd ? formatUSD(itemUsd(it)) : formatCOP(it.unit_price_cop)} × {it.qty}</p>
                {isUsd && <p className="text-[10px] text-moss/50">{formatCOP(it.unit_price_cop)} c/u</p>}
              </div>
              <div className="col-start-2 min-w-0 text-sm text-ink text-left sm:w-28 sm:shrink-0 sm:text-right">
                <p>{isUsd ? formatUSD(itemUsd(it) * it.qty) : formatCOP(it.unit_price_cop * it.qty)}</p>
                {isUsd && <p className="text-[10px] text-moss/50">{formatCOP(it.unit_price_cop * it.qty)}</p>}
              </div>
            </div>
          );
        })}
        {items.length === 0 && <p className="py-4 text-sm text-moss/60">Este pedido no tiene artículos.</p>}
      </div>
    </Card>
  );

  const customerCard = (
    <Card
      title="Cliente"
      icon={<User className="size-4 text-moss" />}
      action={!editingShip ? <button onClick={startEditShip} className="text-xs text-moss hover:text-ink underline">Editar</button> : undefined}
    >
      {editingShip ? (
        <div className="min-w-0 space-y-5">
          <ShipField label="Nombre" value={shipForm.contact_name} onChange={(v) => setShipForm({ ...shipForm, contact_name: v })} />
          <div className="grid gap-3 sm:grid-cols-2">
            <ShipField label="Teléfono" value={shipForm.contact_phone} onChange={(v) => setShipForm({ ...shipForm, contact_phone: v })} />
            <ShipField label="Documento / DNI / pasaporte" value={shipForm.document_id} onChange={(v) => setShipForm({ ...shipForm, document_id: v })} />
          </div>
          <AddressSection title="Información para facturación" prefix="billing_" form={shipForm} setForm={setShipForm} emailLabel="Correo de facturación" recipientLabel="Nombre o razón social" />
          <AddressSection title="Información para despacho" prefix="" form={shipForm} setForm={setShipForm} emailLabel="Correo de despacho" recipientLabel="Recibe" />
          <div className="flex justify-end gap-2 pt-1">
            <button onClick={() => setEditingShip(false)} className="rounded-full px-4 py-2 text-xs text-moss hover:text-ink">Cancelar</button>
            <button onClick={saveShip} disabled={busy} className="rounded-full bg-ink text-ivory px-5 py-2 text-xs disabled:opacity-50">{busy ? "Guardando…" : "Guardar"}</button>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            {order.customer_id ? <Link to="/admin/cliente/$id" params={{ id: order.customer_id }} className="text-sm text-ink underline decoration-ink/30 hover:decoration-ink">{order.contact_name ?? "Ver perfil de la clienta"}</Link> : <p className="text-sm text-ink">{order.contact_name ?? "Invitada"}</p>}
            {order.contact_email && <><p className="text-[11px] uppercase tracking-widest text-moss/60 mt-4 mb-1">Contacto</p><a href={`mailto:${order.contact_email}`} className="block text-sm text-ink underline decoration-ink/20 break-all">{order.contact_email}</a></>}
            {order.contact_phone && <p className="text-sm text-moss mt-1">{order.contact_phone}</p>}
            <p className="text-[11px] uppercase tracking-widest text-moss/60 mt-4 mb-1">Documento / DNI / pasaporte</p>
            <p className="text-sm text-ink break-words">{customerDetails.document || "Sin identificación registrada"}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-widest text-moss/60 mb-1">Dirección de envío</p>
            {(shippingDisplay.line1 || shippingDisplay.city) ? <address className="not-italic text-sm text-moss leading-relaxed">
              {shippingDisplay.recipient && <>{shippingDisplay.recipient}<br /></>}{shippingDisplay.line1 && <>{shippingDisplay.line1}<br /></>}{shippingDisplay.line2 && <>{shippingDisplay.line2}<br /></>}
              {[shippingDisplay.city, shippingDisplay.department].filter(Boolean).join(", ")}{shippingDisplay.postal_code ? ` ${shippingDisplay.postal_code}` : ""}
              {shippingDisplay.country && <><br />{countryFlag(shippingDisplay.country)} {shippingDisplay.country}</>}{shippingDisplay.phone && <><br />{shippingDisplay.phone}</>}
            </address> : <p className="text-sm text-moss/60">{posOrder ? "Sin dirección (venta en tienda)" : "Sin dirección registrada"}</p>}
          </div>
        </div>
      )}
    </Card>
  );

  const paymentSummaryCard = (
    <Card title="Resumen de pago" icon={<CreditCard className="size-4 text-moss" />}>
      <dl className="text-sm">
        <Row label="Subtotal" hint={`${items.reduce((a: number, i: any) => a + i.qty, 0)} artículos`} value={moneyValue(subtotalUsd, order.subtotal_cop)} />
        {order.discount_cop > 0 && <Row label="Descuento" value={isUsd ? moneyValue(-discountUsd, -order.discount_cop) : "− " + formatCOP(order.discount_cop)} />}
        <Row label="Envío" value={order.shipping_cop > 0 ? moneyValue(shippingUsd, order.shipping_cop) : "Gratis"} />
        <div className="border-t border-ink/10 mt-2 pt-2">
          <Row label="Total" value={moneyValue(totalUsd, order.total_cop, true)} strong />
        </div>
        {(order.pos_sales ?? []).map((s: any) => (
          <div key={s.id} className="border-t border-ink/5 mt-2 pt-2">
            <Row label={METHOD_LABEL[s.method] ?? s.method} value={formatCOP(s.amount_cop)} />
          </div>
        ))}
        {paid && (order.pos_sales ?? []).length === 0 && (
          <div className="border-t border-ink/5 mt-2 pt-2"><Row label={methodLabel ? `Pagado con ${methodLabel}` : "Pagado"} value={moneyValue(totalUsd, order.total_cop)} /></div>
        )}
      </dl>
    </Card>
  );

  const timelineCard = (
    <Card title="Cronología" icon={<Clock className="size-4 text-moss" />}
      action={(
        <button disabled={resending} onClick={resendConfirmation}
          className="inline-flex items-center gap-1.5 text-xs text-moss hover:text-ink underline disabled:opacity-50">
          {resending && <Loader2 className="size-3 animate-spin" />}
          Reenviar correo de confirmación
        </button>
      )}>
      <ol className="relative border-l border-ink/10 ml-1 space-y-4 py-1">
        {(emailLogs ?? []).map((m: any) => (
          <TimelineItem key={m.dedupe_key} time={shortTime(m.created_at)} date={new Date(m.created_at)}
            text={m.status === "sent"
              ? `Se envió el correo de confirmación de compra a ${(m.recipients ?? []).join(", ")}.`
              : m.status === "error"
                ? `Falló el correo de confirmación de compra a ${(m.recipients ?? []).join(", ")}${m.error ? `: ${m.error}` : ""}. Puedes reenviarlo desde el botón de arriba.`
                : `Enviando el correo de confirmación de compra a ${(m.recipients ?? []).join(", ")}…`} />
        ))}
        {paid && (emailLogs ?? []).length === 0 && (
          <TimelineItem time="" date={new Date(order.paid_at ?? order.created_at)}
            text="No hay registro del correo de confirmación de compra. Puedes reenviarlo desde el botón de arriba." />
        )}
        {(events ?? []).map((e: any) => (
          <TimelineItem key={e.id} time={shortTime(e.created_at)} date={new Date(e.created_at)}
            text={`${describeEvent(e)}${e.actor_name ? ` Por ${e.actor_name}.` : ""}`} />
        ))}
        {order.paid_at && <TimelineItem time={shortTime(order.paid_at)} date={new Date(order.paid_at)} text={`Se registró el pago de ${isUsd ? formatUSD(totalUsd) : formatCOP(order.total_cop)}.`} />}
        <TimelineItem time={shortTime(order.created_at)} date={new Date(order.created_at)}
          text={`${order.contact_name ?? "La clienta"} realizó este pedido en ${channel}.`} />
      </ol>
    </Card>
  );





  return (
    <div className="w-full min-w-0 max-w-6xl p-4 md:p-10">
      {/* Header */}
      <div className="grid min-w-0 grid-cols-1 gap-4 mb-6 sm:flex sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0">
          <button onClick={() => navigate({ to: backTo as "/admin/pedidos" })}
            className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-moss/70 hover:text-ink mb-2">
            <ArrowLeft className="size-3.5" /> Pedidos
          </button>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="min-w-0 max-w-full break-words font-serif text-2xl md:text-4xl text-ink">#{order.number}</h1>
            <Pill label={paymentLabel} tone={paid ? "ok" : "warn"} />
            <Pill label={posOrder ? "Entregado POS" : prepared ? "Preparado" : "No preparado"} tone={posOrder || prepared ? "ok" : "warn"} />
            {(() => {
              const statusText = b2b?.isB2B && order.status === "draft" ? "Borrador" : b2b?.isB2B && order.status === "preparing" ? "En proceso" : STATUS_LABEL[order.status] ?? order.status;
              const redundant = statusText === paymentLabel || (!posOrder && ["Preparado", "No preparado", "Preparando"].includes(statusText));
              return redundant ? null : <Pill label={statusText} />;
            })()}
          </div>
          <p className="text-xs text-moss/70 mt-2">{fullDate(order.created_at)} · desde {channel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {order.source === "pos" ? (
            <span className="px-4 py-2 rounded-full bg-moss/10 text-moss text-xs uppercase tracking-widest">Entregado POS</span>
          ) : next && (
            <button disabled={busy} onClick={() => setStatus(next.to)}
              className="px-4 py-2 rounded-full bg-ink text-ivory text-xs uppercase tracking-widest disabled:opacity-50">
              {next.label}
            </button>
          )}
          {["paid", "preparing", "shipped", "delivered"].includes(order.status) && (
            <button onClick={openReturn}
              className="px-4 py-2 rounded-full bg-white border border-ink/10 text-xs uppercase tracking-widest text-moss hover:text-ink">
              Devolución
            </button>
          )}
          {order.status !== "cancelled" && order.status !== "refunded" && (
            <button disabled={busy} onClick={() => setStatus("refunded")}
              className="px-4 py-2 rounded-full bg-white border border-ink/10 text-xs uppercase tracking-widest text-moss hover:text-ink disabled:opacity-50">
              Reembolsar
            </button>
          )}
          {(order as any).is_manual && order.payment_status !== "paid" && ["draft", "reserved"].includes(order.status) && (
            <button onClick={() => setEditItems(true)}
              className="px-4 py-2 rounded-full bg-white border border-ink/10 text-xs uppercase tracking-widest text-moss hover:text-ink">
              Editar pedido manual
            </button>
          )}
          {order.status !== "cancelled" && (
            <button disabled={busy} onClick={cancelOrder}
              className="px-4 py-2 rounded-full bg-white border border-ink/10 text-xs uppercase tracking-widest text-moss hover:text-red-600 disabled:opacity-50">
              Cancelar
            </button>
          )}
          <div className="relative">
            <button onClick={() => setMenu((v) => !v)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-white border border-ink/10 text-xs uppercase tracking-widest text-moss hover:text-ink">
              Más acciones <ChevronDown className="size-3.5" />
            </button>
            {menu && (
              <>
                <button aria-label="Cerrar" onClick={() => setMenu(false)} className="fixed inset-0 z-20 cursor-default" />
                <div className="absolute right-0 top-full mt-2 z-30 w-64 rounded-2xl border border-ink/10 bg-white shadow-xl overflow-hidden py-1.5">
                  <p className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-widest text-moss/50">Imprimir</p>
                  <MenuItem icon={<Printer className="size-4" />} label="Imprimir pedido (PDF)"
                    onClick={() => { setMenu(false); setAskDeliveryPrint(true); }} />
                  <div className="my-1.5 h-px bg-ink/5" />
                  <MenuItem icon={<Copy className="size-4" />} label="Copiar número del pedido"
                    onClick={() => { navigator.clipboard?.writeText(`#${order.number}`); toast.success("Número copiado"); setMenu(false); }} />
                  <MenuItem icon={<MapPin className="size-4" />} label="Copiar dirección de envío"
                    onClick={() => {
                      const s = (order.ship_to ?? {}) as Record<string, any>;
                      const txt = [s.name ?? order.contact_name, s.address ?? s.line1 ?? s.street, s.address2 ?? s.line2,
                        [s.city, s.state ?? s.province, s.country].filter(Boolean).join(", "), s.zip ?? s.postal_code,
                        order.contact_phone].filter(Boolean).join("\n");
                      navigator.clipboard?.writeText(txt);
                      toast.success("Dirección copiada");
                      setMenu(false);
                    }} />
                  <MenuItem icon={<Mail className="size-4" />} label="Escribir a la clienta"
                    onClick={() => { if (order.contact_email) window.location.href = `mailto:${order.contact_email}?subject=${encodeURIComponent(`Tu pedido #${order.number}`)}`; setMenu(false); }} />
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {editItems && <EditManualOrderModal order={order} onClose={() => setEditItems(false)} />}
      {askDeliveryPrint && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button aria-label="Cerrar" onClick={() => setAskDeliveryPrint(false)} className="absolute inset-0 bg-ink/40" />
          <div role="dialog" aria-modal="true" aria-label="Imprimir pedido"
            className="relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="font-nm text-lg">Imprimir pedido</h3>
            <p className="mt-1 text-sm text-moss/70">¿Cómo quieres que salga el documento?</p>
            <label className="mt-4 flex items-center justify-between gap-3 text-sm">
              Incluir fotos
              <input type="checkbox" checked={printPhotos} className="size-4 accent-ink"
                onChange={(e) => { setPrintPhotos(e.target.checked); localStorage.setItem("tb-print-photos", e.target.checked ? "1" : "0"); }} />
            </label>
            <div className="mt-5 grid gap-2">
              <button onClick={() => doPrint("order", true)}
                className="rounded-full bg-ink px-4 py-2.5 text-xs uppercase tracking-widest text-ivory hover:opacity-90">
                Con precios
              </button>
              <button onClick={() => doPrint("order", false)}
                className="rounded-full border border-ink/15 px-4 py-2.5 text-xs uppercase tracking-widest text-ink hover:bg-cream">
                Solo cantidades
              </button>
            </div>
          </div>
        </div>
      )}

      {b2b?.isB2B && order.status !== "cancelled" && (
        <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="min-w-0 space-y-5">
            <B2BOrderPanel order={order} companyName={b2b.company} documentId={b2b.documentId} />
            {order.status !== "cancelled" && <OrderWarehouseStep orderId={order.id} international={order.currency === "USD"} />}
            <B2BBoxesPanel order={order as any} ship={ship} companyName={b2b.company} documentId={b2b.documentId} />
            {paymentSummaryCard}
          </div>
          <div className="min-w-0 space-y-5">
            {customerCard}
            <B2BOrderFlow order={order as any} />
            <B2BCadPanel orderId={order.id} />
            <InvoicePanel orderId={order.id} currency={order.currency ?? "COP"} b2b />
          </div>
          <div className="lg:col-span-2">{timelineCard}</div>
          {order.notes && <div className="lg:col-span-2"><Card title="Notas"><p className="text-sm text-moss/70">{order.notes}</p></Card></div>}
          <div className="lg:col-span-2"><TeamNotes entityType="order" entityId={order.id} label={`el pedido ${order.number}`} /></div>
        </div>
      )}
      {b2b?.isB2B && order.status === "cancelled" && (
        <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
          <div className="min-w-0 space-y-5">
            <B2BOrderPanel order={order} companyName={b2b.company} documentId={b2b.documentId} />
            {order.status !== "cancelled" && <OrderWarehouseStep orderId={order.id} international={order.currency === "USD"} />}
            {paymentSummaryCard}
          </div>
          <div className="min-w-0 space-y-5">
            {customerCard}
            <InvoicePanel orderId={order.id} currency={order.currency ?? "COP"} b2b />
          </div>
          <div className="lg:col-span-2">{timelineCard}</div>
        </div>
      )}

      {!b2b?.isB2B && (
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-5 items-start">
        {/* ============ Columna izquierda ============ */}
        <div className="min-w-0 space-y-5">
          {orderSummaryCard}

          {paymentSummaryCard}

          <InvoicePanel orderId={order.id} currency={order.currency ?? "COP"} />

          {(order.returns ?? []).length > 0 && (
            <Card title="Cambios y devoluciones" icon={<Truck className="size-4 text-moss" />}>
              <ul className="space-y-2 text-sm">
                {order.returns.map((r: any) => (
                  <li key={r.id} className="flex items-center justify-between gap-3">
                    <span className="text-ink">{r.kind === "cambio" ? "Cambio" : "Devolución"} · <span className="text-moss/70">{r.reason}</span></span>
                    <span className="text-xs text-moss">{r.status} · {formatCOP(r.refund_cop)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {timelineCard}
        </div>

        {/* ============ Columna derecha ============ */}
        <div className="min-w-0 space-y-5">

          {customerCard}

          {(order as any).is_manual && order.status !== "cancelled" && (
            <ManualOrderFlow order={order as any} />
          )}
          {(order as any).is_manual && order.status !== "cancelled" && (
            <OrderWarehouseStep orderId={order.id} international={order.currency === "USD"} />
          )}

          {ship && (ship.line1 || ship.city) && !((order as any).is_manual && ["draft", "reserved"].includes(order.status)) && (
            isInternationalShip(ship) ? (
              <InternationalLabelCard order={order} ship={ship} />
            ) : (
              <SkydropxLabelCard orderId={order.id} carrier={(order as any).shipping_carrier} tracking={(order as any).tracking_number}
                labelUrl={(order as any).shipping_label_url} shipmentId={(order as any).skydropx_shipment_id} />
            )
          )}

          <Card title="Notas">
            <p className="text-sm text-moss/70">{order.notes || "No hay notas del cliente"}</p>
          </Card>
          <TeamNotes entityType="order" entityId={order.id} label={`el pedido ${order.number}`} />




          {(order as any).ad_tagged_at && (
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-[0.18em] text-ink/50">Origen de la venta</span>
              <OrderAdTag source={(order as any).ad_source} campaign={(order as any).ad_campaign} tagged={(order as any).ad_tagged_at} />
            </div>
          )}
          <ConversionSummary
            customerId={order.customer_id}
            orderCreatedAt={order.created_at}
            orderNumber={order.number}
            orderSessionId={(order as any).analytics_session_id}
          />

          <Card title="Resumen">
            <ul className="text-sm text-moss space-y-1.5">
              <li>Canal: <span className="text-ink">{channel}</span></li>
              <li>Origen: <span className="text-ink">{order.source}</span></li>
              <li>Estado: <span className="text-ink">{STATUS_LABEL[order.status] ?? order.status}</span></li>
              {order.reserved_at && <li>Reservado: <span className="text-ink">{fullDate(order.reserved_at)}</span></li>}
            </ul>
          </Card>

          <Card title="Pago">
            <ul className="text-sm text-moss space-y-1.5">
              <li>Método: <span className="text-ink">{PAYMENT_LABEL[order.payment_method ?? ""] ?? order.payment_method ?? "—"}</span></li>
              <li>Estado del pago: <span className="text-ink">{PAYMENT_STATUS_LABEL[order.payment_status ?? "pending"] ?? order.payment_status}</span></li>
              {order.payment_proof_at && <li>Comprobante: <span className="text-ink">{fullDate(order.payment_proof_at)}</span></li>}
            </ul>
            {order.payment_proof_url && (
              <a href={order.payment_proof_url} target="_blank" rel="noopener noreferrer"
                className="mt-3 inline-block text-xs uppercase tracking-widest text-ink underline underline-offset-4">
                Ver comprobante
              </a>
            )}
            {order.payment_status !== "paid" && (
              <button disabled={busy} onClick={confirmPayment}
                className="mt-3 block w-full rounded-full bg-ink px-4 py-2 text-xs uppercase tracking-widest text-ivory disabled:opacity-50">
                Confirmar pago recibido
              </button>
            )}
          </Card>
        </div>
      </div>
      )}
      {returnLoc && (
        <ReturnReceiveModal locationId={returnLoc.id} locationName={returnLoc.name} initialOrderNumber={order.number}
          onClose={() => { setReturnLoc(null); qc.invalidateQueries({ queryKey: ["admin", "order", id] }); }} />
      )}
      {movingItem && (
        <ChangeItemLocationModal item={movingItem} onClose={() => setMovingItem(null)}
          onDone={() => { setMovingItem(null); qc.invalidateQueries({ queryKey: ["admin", "order", id] }); qc.invalidateQueries({ queryKey: ["admin", "order-events", id] }); }} />
      )}
    </div>
  );
}

function ShipField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-widest text-moss/60">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} maxLength={200}
        className="mt-1 w-full rounded-lg border border-ink/15 bg-transparent px-3 py-2 text-sm text-ink outline-none focus:border-ink/40" />
    </label>
  );
}

function AddressSection({ title, prefix, form, setForm, emailLabel, recipientLabel }: {
  title: string;
  prefix: string;
  form: Record<string, string>;
  setForm: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  emailLabel: string;
  recipientLabel: string;
}) {
  const key = (name: string) => `${prefix}${name}`;
  const change = (name: string, value: string) => setForm((current) => ({ ...current, [key(name)]: value }));
  const country = form[key("country")] || "Colombia";
  return (
    <section className="space-y-3 border-t border-ink/10 pt-4">
      <p className="text-[11px] uppercase tracking-widest text-moss/70">{title}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <ShipField label={recipientLabel} value={form[key("recipient")] ?? ""} onChange={(value) => change("recipient", value)} />
        <ShipField label={emailLabel} value={form[prefix ? key("email") : "shipping_email"] ?? ""} onChange={(value) => setForm((current) => ({ ...current, [prefix ? key("email") : "shipping_email"]: value }))} />
      </div>
      <ShipField label="Dirección" value={form[key("line1")] ?? ""} onChange={(value) => change("line1", value)} />
      <ShipField label="Apto, torre, barrio" value={form[key("line2")] ?? ""} onChange={(value) => change("line2", value)} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col text-[10px] uppercase tracking-widest text-moss/70">
          País
          <CountrySelect value={country} onChange={(value) => setForm((current) => ({ ...current, [key("country")]: value, [key("city")]: "", [key("department")]: "" }))} />
        </label>
        <label className="flex flex-col text-[10px] uppercase tracking-widest text-moss/70">
          Ciudad
          <CitySelect country={country} value={form[key("city")] ?? ""} onChange={(value) => change("city", value)} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <ShipField label="Departamento / estado" value={form[key("department")] ?? ""} onChange={(value) => change("department", value)} />
        <ShipField label="Código postal" value={form[key("postal_code")] ?? ""} onChange={(value) => change("postal_code", value)} />
      </div>
    </section>
  );
}

function Row({ label, hint, value, strong }: { label: string; hint?: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <div className={"grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 py-1 sm:flex sm:gap-3 " + (strong ? "text-ink font-medium" : "text-moss")}>
      <span className="min-w-0 sm:w-28 sm:shrink-0">{label}</span>
      <span className="col-start-1 row-start-2 min-w-0 text-[12px] text-moss/60 sm:flex-1">{hint}</span>
      <span className={"col-start-2 row-start-1 shrink-0 text-right " + (strong ? "text-ink" : "text-ink/80")}>{value}</span>
    </div>
  );
}

function TimelineItem({ time, date, text }: { time: string; date: Date; text: string }) {
  return (
    <li className="ml-4">
      <span className="absolute -left-[5px] mt-1.5 size-2 rounded-full bg-ink/30" />
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 break-words text-sm text-ink/85">{text}</p>
        <span className="shrink-0 text-[11px] text-moss/60 whitespace-nowrap">{time}</span>
      </div>
      <p className="text-[10px] uppercase tracking-widest text-moss/40 mt-0.5">
        {date.toLocaleDateString("es-CO", { day: "numeric", month: "short" })}
      </p>
    </li>
  );
}

function describeEvent(e: any): string {
  switch (String(e.action).toLowerCase()) {
    case "insert": case "created": return "Se creó el pedido.";
    case "delete": return "Se eliminó el pedido.";
    case "stock_confirmed": return "Se confirmaron las cantidades disponibles.";
    case "payment_confirmed": return "Se confirmó el pago.";
    case "transfer_requested": return "Se solicitó un traslado entre bodegas.";
    case "transfer_in_transit": return "El traslado salió de la bodega de origen.";
    case "transfer_received": return "Se recibió el traslado en la bodega de despacho.";
    case "transfer_cancelled": return "Se canceló el traslado.";
    case "location_changed": return `Se cambió la bodega de ${e.diff?.product ?? "una prenda"}${e.diff?.variant ? ` (${e.diff.variant})` : ""}: de ${e.diff?.from ?? "—"} a ${e.diff?.to ?? "—"}.`;
    default: return describeDiff(e.diff);
  }
}

function describeDiff(diff: any): string {
  if (!diff || typeof diff !== "object") return "Se actualizó el pedido.";
  const keys = Object.keys(diff);
  if (keys.includes("status")) {
    const v = diff.status;
    const to = typeof v === "object" && v ? (v.new ?? v.to ?? v) : v;
    return `El pedido pasó a ${STATUS_LABEL[String(to)] ?? String(to)}.`;
  }
  return "Se actualizó el pedido.";
}
