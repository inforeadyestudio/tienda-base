import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type OrderConfirmation = {
  id: string;
  number: string;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  currency: string;
  subtotalCop: number;
  shippingCop: number;
  totalCop: number;
  totalUsd: number | null;
  contactEmail: string | null;
  contactName: string | null;
  deliveryLabel: string | null;
  city: string | null;
  hasProof: boolean;
  items: { name: string; variant: string | null; qty: number; unitPriceCop: number }[];
};

/** Datos públicos del pedido para la página de gracias. El id (uuid) actúa como llave. */
export const orderConfirmation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }): Promise<OrderConfirmation> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, number, status, payment_status, payment_method, payment_proof_url, currency, subtotal_cop, shipping_cop, total_cop, total_usd:total_usd_exact, contact_email, contact_name, ship_to")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !order) throw new Error("No encontramos este pedido.");

    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("product_name, variant_label, qty, unit_price_cop")
      .eq("order_id", order.id);

    const shipTo = (order.ship_to ?? {}) as Record<string, string>;
    return {
      id: order.id,
      number: order.number,
      status: order.status,
      paymentStatus: order.payment_status ?? "pending",
      paymentMethod: order.payment_method ?? null,
      currency: order.currency ?? "COP",
      subtotalCop: order.subtotal_cop ?? 0,
      shippingCop: order.shipping_cop ?? 0,
      totalCop: order.total_cop ?? 0,
      totalUsd: order.total_usd ?? null,
      contactEmail: order.contact_email ?? null,
      contactName: order.contact_name ?? null,
      deliveryLabel: shipTo.delivery_label ?? null,
      city: shipTo.city ?? null,
      hasProof: Boolean(order.payment_proof_url),
      items: (items ?? []).map((item) => ({
        name: item.product_name,
        variant: item.variant_label,
        qty: item.qty,
        unitPriceCop: item.unit_price_cop,
      })),
    };
  });
