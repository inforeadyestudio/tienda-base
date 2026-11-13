// Conversions API de Meta: reporta desde el servidor cada compra Online pagada.
// Usa el mismo event_id que el pixel (purchase-<order_id>) para que Meta deduplique.

import { META_GRAPH, metaToken } from "./meta-report.server";
import { SITE_ORIGIN } from "@/lib/site";

/** Pixel de la marca: META_PIXEL_ID (o el mismo VITE_META_PIXEL_ID del navegador). */
const pixelId = () => process.env["META_PIXEL_ID"] || process.env["VITE_META_PIXEL_ID"] || "";

async function sha256(v: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

type Order = {
  id: string;
  number: string;
  source: string;
  is_manual: boolean;
  b2b_mode: string | null;
  is_b2b?: boolean;
  currency: string;
  total_cop: number;
  total_usd: number | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  buyer_country: string | null;
  paid_at: string | null;
};

export async function sendMetaPurchase(order: Order): Promise<{ sent: boolean; reason?: string }> {
  // Solo ventas de la tienda online: POS, B2B y manuales no vienen de anuncios.
  if (order.is_b2b || order.is_manual || order.source !== "ecom") {
    return { sent: false, reason: "not_online" };
  }
  const metaKey = metaToken();
  const PIXEL_ID = pixelId();
  if (!metaKey || !PIXEL_ID) return { sent: false, reason: "missing_key" };

  const user_data: Record<string, string[]> = {};
  const email = order.contact_email?.trim().toLowerCase();
  if (email) user_data.em = [await sha256(email)];
  const phone = order.contact_phone?.replace(/\D/g, "");
  if (phone) user_data.ph = [await sha256(phone.length === 10 ? `57${phone}` : phone)];
  const [fn, ...rest] = (order.contact_name ?? "").trim().toLowerCase().split(/\s+/);
  if (fn) user_data.fn = [await sha256(fn)];
  if (rest.length) user_data.ln = [await sha256(rest.join(" "))];
  if (order.buyer_country) user_data.country = [await sha256(order.buyer_country.toLowerCase())];
  user_data.external_id = [await sha256(order.id)];

  const usd = order.currency === "USD" && order.total_usd != null;
  const body = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(new Date(order.paid_at ?? Date.now()).getTime() / 1000),
        event_id: `purchase-${order.id}`,
        action_source: "website",
        event_source_url: `${SITE_ORIGIN}/gracias/${order.id}`,
        user_data,
        custom_data: {
          currency: usd ? "USD" : "COP",
          value: usd ? Number(order.total_usd) : Number(order.total_cop),
          order_id: order.number,
        },
      },
    ],
  };

  try {
    const res = await fetch(`${META_GRAPH}/${PIXEL_ID}/events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${metaKey}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error(`Meta CAPI failed [${res.status}]: ${await res.text()}`);
      return { sent: false, reason: "meta_error" };
    }
    return { sent: true };
  } catch (e) {
    console.error("Meta CAPI error", e);
    return { sent: false, reason: "meta_error" };
  }
}
