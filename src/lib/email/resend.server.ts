// Envío de correos con Resend (API directa, llave RESEND_API_KEY). Solo servidor.
import { formatUSD } from "@/lib/format";
import { BRAND } from "@/config/brand";

/** Remitente: EMAIL_FROM en el servidor o el de la configuración de marca. */
export const EMAIL_FROM = process.env["EMAIL_FROM"] || BRAND.emailFrom;
export const SITE = BRAND.siteOrigin;
export const RESEND_API = "https://api.resend.com";
export const EMAIL_LOGO = `${SITE}/email-logo.png`;

export const EMAIL_EVENTS = {
  customer_online_confirmed: "Cliente · Confirmación de compra online",
  customer_pos_receipt: "Cliente · Compra en tienda (POS)",
  customer_b2b_order: "Cliente · Pedido B2B / preventa recibido",
  customer_b2b_confirmed: "Cliente · Pedido B2B confirmado",
  customer_b2b_shipped: "Cliente · Pedido B2B enviado",
  customer_b2b_delivered: "Cliente · Pedido B2B entregado",
  customer_manual_order: "Cliente · Pedido manual confirmado",
  customer_abandoned_cart: "Cliente · Carrito abandonado (4 horas)",
  customer_welcome: "Cliente · Bienvenida al crear cuenta",
  customer_shipping_label: "Cliente · Guía de envío generada",
  customer_review_request: "Cliente · Invitación a reseñar (12 días después de entregado)",
  team_online_sale: "Equipo · Venta online confirmada",
  team_b2b_preorder: "Equipo · Nuevo pedido preventa B2B",
  team_pos_closing: "Equipo · Cierre de caja POS",
  team_inventory_backup: "Equipo · Copia de seguridad cada 2 días",
  team_credit_reminder: "Equipo · Recordatorio de cobro a crédito",
  team_note_mention: "Equipo · Mención (@) en una nota",
  team_transfer_bodega: "Equipo · Traslado hacia Bodega Central",
  team_transfer_bogota: "Equipo · Traslado hacia Bogotá",
  team_transfer_cali: "Equipo · Traslado hacia Cali",
  team_store_web_cali: "Equipo · Pedido web para despachar desde Cali",
  team_store_web_bogota: "Equipo · Pedido web para despachar desde Bogotá",
} as const;
export type EmailEvent = keyof typeof EMAIL_EVENTS;

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

export async function getSetting(admin: Admin, event: EmailEvent) {
  const { data } = await admin.from("email_notification_settings" as any).select("enabled,recipients,content").eq("event", event).maybeSingle();
  const row = data as { enabled: boolean; recipients: string[]; content: any } | null;
  return { enabled: row?.enabled ?? true, recipients: row?.recipients ?? [], content: (row?.content ?? {}) as import("./custom-content").EmailContent };
}

const isEmail = (s: string | null | undefined): s is string => !!s && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** Envía una sola vez por dedupeKey. Devuelve true si se envió. */
export async function sendOnce(admin: Admin, opts: { dedupeKey: string; event: EmailEvent; to: (string | null | undefined)[]; subject: string; html: string; attachments?: { filename: string; content: string }[] }) {
  const to = Array.from(new Set(opts.to.filter(isEmail).map((e) => e.trim().toLowerCase())));
  if (!to.length) return false;
  const { error: dupErr } = await admin.from("email_send_log" as any).insert({ dedupe_key: opts.dedupeKey, event: opts.event, recipients: to, status: "sending" });
  if (dupErr) return false; // ya enviado
  const resendKey = process.env["RESEND_API_KEY"];
  let status = "sent"; let error: string | null = null;
  try {
    if (!resendKey) throw new Error("Falta RESEND_API_KEY");
    const res = await fetch(`${RESEND_API}/emails`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${resendKey}` },
      body: JSON.stringify({ from: EMAIL_FROM, to, subject: opts.subject, html: opts.html, ...(opts.attachments ? { attachments: opts.attachments } : {}) }),
    });
    if (!res.ok) throw new Error(`Resend [${res.status}]: ${(await res.text()).slice(0, 500)}`);
  } catch (e) {
    status = "error"; error = e instanceof Error ? e.message : String(e);
    console.error("email send failed", opts.event, error);
  }
  await admin.from("email_send_log" as any).update({ status, error }).eq("dedupe_key", opts.dedupeKey);
  return status === "sent";
}

// ---------- Plantillas ----------
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const cop = (n: number) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");

export function layout(title: string, body: string, cta?: { label: string; href: string }) {
  return `<!doctype html><html lang="es"><body style="margin:0;background:#ffffff;font-family:Helvetica,Arial,sans-serif;color:#17191a">
 <div style="max-width:560px;margin:0 auto;padding:32px 24px">
 <p style="margin:0 0 28px;text-align:center"><img src="${EMAIL_LOGO}" alt="Tu Marca" width="140" style="display:inline-block;width:140px;height:auto;border:0"></p>
 <h1 style="font-size:22px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin:0 0 16px">${esc(title)}</h1>
${body}
${cta ? `<p style="margin:28px 0"><a href="${esc(cta.href)}" style="background:#17191a;color:#f9f4e6;padding:14px 22px;text-decoration:none;font-size:12px;letter-spacing:.16em;text-transform:uppercase">${esc(cta.label)}</a></p>` : ""}
<p style="font-size:11px;color:#6b6f5a;margin-top:36px;border-top:1px solid #e5e0d2;padding-top:16px">Tu Marca SAS · tumarca.com</p>
</div></body></html>`;
}
export const p = (t: string) => `<p style="font-size:14px;line-height:1.6;margin:0 0 12px">${t}</p>`;
export { esc };

export function itemsTable(items: { name: string; label?: string | null; qty: number; price: number }[], total?: number, currency: "COP" | "USD" = "COP") {
  const money = (n: number) => currency === "USD" ? formatUSD(n) : cop(n);
  const rows = items.map((i) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee;font-size:13px">${esc(i.name)}${i.label ? `<br><span style="color:#6b6f5a;font-size:11px">${esc(i.label)}</span>` : ""}</td><td style="padding:8px 0;border-bottom:1px solid #eee;font-size:13px;text-align:center">×${i.qty}</td><td style="padding:8px 0;border-bottom:1px solid #eee;font-size:13px;text-align:right">${money(i.price * i.qty)}</td></tr>`).join("");
  return `<table style="width:100%;border-collapse:collapse;margin:16px 0">${rows}${total != null ? `<tr><td colspan="2" style="padding-top:12px;font-size:14px;font-weight:600">Total</td><td style="padding-top:12px;text-align:right;font-size:14px;font-weight:600">${money(total)}</td></tr>` : ""}</table>`;
}
