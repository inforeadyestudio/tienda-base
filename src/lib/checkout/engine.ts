import { holdToken } from "@/lib/checkout/stock-hold";
import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { CartItem } from "@/lib/cart";
import type { ShippingItem, ShippingSettings, TaxSettings } from "@/lib/store-settings";
import { includedTax, quoteShipping } from "@/lib/store-settings";
import { type IntlSettings } from "@/lib/international";
import type { PaymentDraft } from "./payment-draft";
import type { PreparedPayment } from "./prepared-payment";

export type ShipTo = {
  recipient: string;
  document_id?: string;
  phone: string;
  email: string;
  country: string;
  line1: string;
  line2: string;
  city: string;
  department: string;
  postal_code: string;
  notes: string;
};

export const EMPTY_SHIP_TO: ShipTo = {
  recipient: "", document_id: "", phone: "", email: "", country: "Colombia", line1: "", line2: "",
  city: "", department: "", postal_code: "", notes: "",
};

export type Delivery =
  | { kind: "ship"; label: string; eta: string; cost: number }
  | { kind: "pickup"; label: string; eta: string; cost: number; locationName: string };

export function shipDelivery(subtotal: number, settings?: ShippingSettings, items: (CartItem | ShippingItem)[] = [], country = "Colombia", region = "", signedIn = true): Delivery {
  const quote = settings ? quoteShipping(settings, subtotal, items.map((item) => ({ productId: item.productId, qty: item.qty, weightGrams: "weightGrams" in item ? item.weightGrams : undefined, collectionIds: "collectionIds" in item ? item.collectionIds : undefined })), country, region, { signedIn }) : { matched: true, free: subtotal >= 350_000, cost: subtotal >= 350_000 ? 0 : 18_000, label: "Envío estándar" };
  return {
    kind: "ship",
    label: quote.free ? `${quote.label} · Gratis` : quote.label,
    eta: quote.matched ? "Tarifa calculada según tu destino" : "Confirmaremos la tarifa antes del pago",
    cost: quote.cost,
  };
}

export function pickupDelivery(locationName: string): Delivery {
  return {
    kind: "pickup",
    label: `Recoger en ${locationName}`,
    eta: "Lista en 24 horas",
    cost: 0,
    locationName,
  };
}

export function computeTotals(items: CartItem[], delivery: Delivery | null) {
  const subtotal = items.reduce((s, i) => s + i.priceCop * i.qty, 0);
  const shipping = delivery?.cost ?? 0;
  return { subtotal, shipping, total: subtotal + shipping };
}

export function isShipToComplete(s: ShipTo) {
  return !!(s.recipient.trim() && s.phone.trim() && s.line1.trim() && s.city.trim());
}

/** Serialized preparation retains one order, its points and its reservation on retries. */
export async function prepareHostedOrder(opts: Parameters<typeof placeOrder>[0], draft: PaymentDraft, provider: string, reference: string, amount: number, currency: "COP" | "USD"): Promise<PreparedPayment> {
  const totals = computeTotals(opts.items, opts.delivery);
  const quote = opts.payment?.currency !== "USD" && opts.delivery.kind !== "pickup" && opts.shippingSettings ? quoteShipping(opts.shippingSettings, totals.subtotal, opts.shippingItems ?? opts.items, opts.shipTo.country, opts.shipTo.department) : null;
  if (quote && !quote.matched) throw new Error("No hay una tarifa de envío disponible para este destino.");
  const tax = opts.taxSettings ? includedTax(opts.taxSettings, totals.subtotal, opts.shipTo.country) : null;
  const lines = opts.items.map(i => ({ variant_id: i.variantId, product_name: i.productName, variant_label: i.variantLabel, qty: i.qty, unit_price_cop: i.priceCop, unit_price_usd: opts.payment?.currency === "USD" ? i.priceUsd : null })).sort((a, b) => a.variant_id.localeCompare(b.variant_id));
  const order = { subtotal_cop: totals.subtotal, shipping_cop: totals.shipping, total_cop: totals.total, currency: draft.currency, total_usd: opts.payment?.totalUsd ?? null, buyer_country: opts.shipTo.country, ship_to: { ...opts.shipTo, delivery_kind: opts.delivery.kind, delivery_label: opts.delivery.label }, contact_email: opts.shipTo.email, contact_name: opts.shipTo.recipient, contact_phone: opts.shipTo.phone, shipping_rule: quote ? { id: quote.rateId, label: quote.label, country: opts.shipTo.country, region: opts.shipTo.department } : { id: null, label: opts.delivery.label }, shipping_weight_kg: quote?.weightKg ?? 0, tax_included_cop: tax?.includedCop ?? 0, tax_rate: tax?.ratePct ?? 0, tax_scope: tax?.applies ? tax.scope : null };
  // Analytics session is not a purchase term and may change between tabs.
  const { analyticsSessionId: _session, ...terms } = draft;
  const snapshot = { draft: terms, order, items: lines, points: opts.pointsToUse ?? 0 };
  const { data, error } = await supabase.rpc("prepare_checkout_retry", { _token: draft.holdToken, _snapshot: snapshot as any, _order: order as any, _items: lines as any, _points: opts.pointsToUse ?? 0, _provider: provider, _reference: reference, _amount: amount, _currency: currency });
  if (error) throw new Error(error.message);
  const result = data as unknown as PreparedPayment & { paidOrderId?: string; paidReference?: string };
  if (result.paidOrderId || result.paidReference) throw new Error("Este pedido ya tiene un pago aprobado. Revisa tus pedidos antes de pagar otra vez.");
  if (!result.reference || !result.draft) throw new Error("No pudimos preparar tu pedido.");
  return result;
}

/** Crea el pedido, reserva stock y lo confirma. Único camino transaccional. */
export async function placeOrder(opts: {
  items: CartItem[];
  shipTo: ShipTo;
  delivery: Delivery;
  userId: string;
  email: string | null;
  shippingSettings?: ShippingSettings;
  taxSettings?: TaxSettings;
  shippingItems?: ShippingItem[];
  intlSettings?: IntlSettings;
  /** Puntos a redimir (excluye acumular en esta compra). */
  pointsToUse?: number;
  promotionCode?: string;
  /** Persist and reserve before leaving for the gateway; do not confirm unpaid orders. */
  deferConfirmation?: boolean;
  /** Compra internacional: moneda, total en dólares y pasarela usada. */
  payment?: { currency: "COP" | "USD"; totalUsd?: number | null; method?: string | null; reference?: string | null; status?: "pending" | "review" | "paid" };
}): Promise<{ number: string; id: string }> {
  const { subtotal, shipping, total } = computeTotals(opts.items, opts.delivery);
  const international = opts.payment?.currency === "USD";
  if (international && opts.items.some((i) => !(Number(i.priceUsd) > 0))) throw new Error("Una pieza no tiene precio en dólares todavía.");
  const quote = !international && opts.delivery.kind !== "pickup" && opts.shippingSettings ? quoteShipping(opts.shippingSettings, subtotal, opts.shippingItems ?? opts.items.map((item) => ({ productId: item.productId, qty: item.qty })), opts.shipTo.country, opts.shipTo.department) : null;
  if (quote && !quote.matched) throw new Error("No hay una tarifa de envío disponible para este destino.");
  const tax = opts.taxSettings ? includedTax(opts.taxSettings, subtotal, opts.shipTo.country) : null;

  const { data: order, error: e1 } = await supabase
    .from("orders")
    .insert({
      customer_id: opts.userId,
      hold_token: holdToken(),
      source: "ecom",
      status: "draft",
      subtotal_cop: subtotal,
      shipping_cop: shipping,
      total_cop: total,
      shipping_rule: quote
        ? { id: quote.rateId, label: quote.label, country: opts.shipTo.country, region: opts.shipTo.department }
        : { id: null, label: opts.delivery.label, country: opts.shipTo.country, region: opts.shipTo.department },
      currency: opts.payment?.currency ?? "COP",
      total_usd: opts.payment?.totalUsd ?? null,
      total_usd_exact: opts.payment?.totalUsd ?? null,
      buyer_country: opts.shipTo.country,
      payment_method: opts.payment?.method ?? null,
      payment_reference: opts.payment?.reference ?? null,
      payment_status: opts.payment?.status ?? (opts.payment?.reference ? "paid" : "pending"),
      shipping_weight_kg: quote?.weightKg ?? 0,
      tax_included_cop: tax?.includedCop ?? 0,
      tax_rate: tax?.ratePct ?? 0,
      tax_scope: tax?.applies ? tax.scope : null,
      ship_to: {
        ...opts.shipTo,
        delivery_kind: opts.delivery.kind,
        delivery_label: opts.delivery.label,
      } as unknown as Record<string, string>,
      contact_email: opts.shipTo.email || opts.email,
      contact_name: opts.shipTo.recipient,
      contact_phone: opts.shipTo.phone,
    })
    .select("id, number")
    .single();
  if (e1) throw e1;

  const { error: e2 } = await supabase.from("order_items").insert(
    opts.items.map((i) => ({
      order_id: order.id,
      variant_id: i.variantId,
      product_name: i.productName,
      variant_label: i.variantLabel,
      qty: i.qty,
      unit_price_cop: i.priceCop,
      unit_price_usd: international ? (i.priceUsd ?? null) : null,
    })) as any,
  );
  if (e2) throw e2;

  if (opts.promotionCode) {
    if (opts.pointsToUse) {
      const { data: allowed, error } = await supabase.rpc("can_combine_points_code", { _customer_id: opts.userId, _code: opts.promotionCode, _order_id: order.id });
      if (error || !allowed) throw new Error("Usa puntos o código, no ambos");
    }
    const { error } = await supabase.rpc("apply_order_usd_code", { _order_id: order.id, _code: opts.promotionCode });
    if (error) throw new Error(error.message);
  }
  if (opts.pointsToUse && opts.pointsToUse > 0) {
    const { error: ep } = await supabase.rpc("apply_order_points", { _order_id: order.id, _points: opts.pointsToUse });
    if (ep) throw new Error(ep.message);
  }

  const { error: e3 } = await supabase.rpc("reserve_stock", { _order_id: order.id, _minutes: 20, _channel: "online" });
  if (e3) {
    // Cobro ya capturado: nunca dejar el pedido en borrador; queda marcado para el equipo.
    if (!opts.payment?.reference) throw new Error("Sin stock suficiente para completar la reserva.");
    const { error: fb } = await (supabase.rpc as any)("reserve_stock_paid_fallback", { _order_id: order.id });
    if (fb) throw new Error(fb.message);
  }

  if (opts.deferConfirmation) return order;
  const { error: e4 } = await supabase.rpc("confirm_order", { _order_id: order.id });
  if (e4) throw e4;

  return order;
}

/** Origen de despacho estimado (bodega/ecom vs tienda física). */
export async function dispatchOrigins(variantIds: string[]) {
  const ids = variantIds.filter((id) => !id.endsWith("-look"));
  if (!ids.length) return [] as string[];
  const { data, error } = await supabase
    .from("inventory_levels")
    .select("variant_id, on_hand, reserved, locations(name, kind, city)")
    .in("variant_id", ids);
  if (error) return [];
  const stores = new Set<string>();
  ids.forEach((vid) => {
    const levels = (data ?? []).filter((l: any) => l.variant_id === vid);
    const online = levels
      .filter((l: any) => l.locations?.kind === "ecom" || l.locations?.kind === "warehouse")
      .reduce((s: number, l: any) => s + (l.on_hand - l.reserved), 0);
    if (online > 0) return;
    const store = levels.find((l: any) => l.locations?.kind === "store" && l.on_hand - l.reserved > 0);
    if (store) stores.add((store as any).locations.name as string);
  });
  return Array.from(stores);
}

/* ────────────────── store global del panel ────────────────── */

type CheckoutState = { open: boolean; buyNow: CartItem | null };

let state: CheckoutState = { open: false, buyNow: null };
const listeners = new Set<() => void>();
const SERVER: CheckoutState = { open: false, buyNow: null };

function emit(next: CheckoutState) {
  state = next;
  listeners.forEach((l) => l());
}

/** Abre el panel de compra. Con `buyNow` compra solo esa pieza. */
export function openCheckout(buyNow?: CartItem | null) {
  emit({ open: true, buyNow: buyNow ?? null });
}

export function closeCheckout() {
  emit({ open: false, buyNow: null });
}

export function useCheckoutSheet() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => SERVER,
  );
}
