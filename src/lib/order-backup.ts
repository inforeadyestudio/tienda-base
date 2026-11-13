import { channelOf } from "./order-channel";

export type BackupItem = {
  qty: number;
  product_name: string | null;
  variant_label: string | null;
  unit_price_cop: number;
  unit_price_usd: number | null;
  product_variants: { size: string | null; color: string | null; sku: string } | null;
};

type BackupOrder = {
  id: string; number: string; status: string; source: string; is_manual: boolean;
  b2b_mode: string | null; payment_status: string | null;
  payment_method: string | null; b2b_payment_method: string | null;
  created_at: string; contact_name: string | null; contact_email: string | null;
  contact_phone: string | null; currency: string | null; total_cop: number;
  total_usd: number | null; order_items: BackupItem[]; pos_sales?: unknown[];
};

export function backupPaymentState(o: Pick<BackupOrder, "status" | "payment_status" | "payment_method" | "b2b_payment_method">) {
  if (o.status === "refunded" || o.payment_status === "refunded") return "Reembolsado";
  if (o.payment_status === "paid") return "Pagado";
  const credit = [o.b2b_payment_method, o.payment_method].find((m) => m?.startsWith("credito"));
  if (credit) return `Crédito · ${Number(credit.replace(/\D/g, "")) || 15} días`;
  if (o.status === "cancelled") return "Cancelado";
  if (o.payment_status === "review") return "Pendiente de verificación";
  return "Pendiente de pago";
}

export function backupDeliveryState(o: Pick<BackupOrder, "status" | "source" | "number" | "is_manual" | "b2b_mode" | "pos_sales">) {
  if (o.status === "cancelled") return "Cancelado";
  if (o.status === "refunded") return "Reembolsado";
  if (o.status === "delivered" || channelOf(o) === "pos") return "Entregado";
  if (o.status === "shipped") return "Enviado · pendiente de entrega";
  if (o.status === "preparing") return "Pendiente de envío · en preparación";
  return "Pendiente de envío";
}

/** Stored order snapshots take precedence over the current product catalogue. */
export function orderBackupRows(orders: BackupOrder[], channelLabel: (o: BackupOrder) => string, gatewayLabel: (o: BackupOrder) => string) {
  const summary = orders.map((o) => ({
    "ID pedido": o.id, Pedido: o.number,
    "Fecha (Colombia)": new Date(o.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota" }),
    Cliente: o.contact_name ?? "", Correo: o.contact_email ?? "", Teléfono: o.contact_phone ?? "",
    Canal: channelLabel(o), Pasarela: gatewayLabel(o), Moneda: o.currency ?? "COP",
    "Total COP": o.total_cop, "Total US$": o.total_usd,
    "Estado pago": backupPaymentState(o), "Estado envío": backupDeliveryState(o),
    "Estado original": o.status,
    Artículos: (o.order_items ?? []).reduce((sum, i) => sum + i.qty, 0),
    "Productos y tallas": (o.order_items ?? []).map((i) => `${i.product_name ?? "Producto sin nombre"} · ${i.variant_label || i.product_variants?.size || "Talla no registrada"} · ${i.qty} unidad(es)`).join("\n"),
  }));
  const items = orders.flatMap((o) => (o.order_items ?? []).map((i) => ({
    "ID pedido": o.id, Pedido: o.number, Producto: i.product_name ?? "Producto sin nombre",
    "Talla / variante": i.variant_label || i.product_variants?.size || "Talla no registrada",
    Color: i.product_variants?.color ?? "", SKU: i.product_variants?.sku ?? "",
    Cantidad: i.qty, "Precio unitario COP": i.unit_price_cop,
    "Precio unitario US$": i.unit_price_usd, "Estado pago": backupPaymentState(o),
    "Estado envío": backupDeliveryState(o),
  })));
  return { summary, items };
}