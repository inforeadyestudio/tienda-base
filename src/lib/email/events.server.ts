import { formatUSD } from "@/lib/format";
import { withCustomContent, type EmailProduct } from "./custom-content";

import { SITE, cop, esc, getSetting, itemsTable, layout, p, sendOnce, type EmailEvent } from "./resend.server";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function adminClient(): Promise<Admin> {
  return (await import("@/integrations/supabase/client.server")).supabaseAdmin;
}

async function loadOrder(admin: Admin, id: string) {
  const { data: o } = await admin.from("orders").select("*").eq("id", id).maybeSingle();
  if (!o) return null;
  const { data: items } = await admin.from("order_items").select("product_name,variant_label,qty,unit_price_cop,unit_price_usd,variant_id").eq("order_id", id);
  let email = o.contact_email || o.invoice_email || null;
  if (!email && o.customer_id) {
    const { data: u } = await admin.auth.admin.getUserById(o.customer_id).catch(() => ({ data: null as any }));
    email = u?.user?.email ?? null;
  }
  const isB2B = o.source === "assisted" && !!o.customer_id && (await admin.rpc("is_b2b", { _user_id: o.customer_id } as any)).data === true;
  return {
    o: { ...o, total_usd: o.total_usd_exact ?? o.total_usd }, email, isB2B, variantIds: (items ?? []).map((i: any) => i.variant_id).filter(Boolean) as string[],
    lines: (items ?? []).map((i) => ({ name: i.product_name, label: i.variant_label, qty: i.qty, price: Number(i.unit_price_cop), priceUsd: i.unit_price_usd != null ? Number(i.unit_price_usd) : null })),
  };
}

type OrderLine = { name: string; label?: string | null; qty: number; price: number; priceUsd?: number | null };

/** Tabla de artículos del correo. En pedidos USD muestra los precios en dólares
 *  guardados en cada línea; si alguna línea no tiene precio USD, muestra solo
 *  cantidades y el total USD del pedido, sin mezclar monedas. */
function orderTable(o: { currency?: string | null; total_cop?: number | null; total_usd?: number | null }, lines: OrderLine[]): string {
  const usd = o.currency === "USD" && Number(o.total_usd) > 0;
  if (!usd) return itemsTable(lines, Number(o.total_cop));
  const totalUsd = Number(o.total_usd) || 0;
  if (lines.every((l) => l.priceUsd != null)) {
    return itemsTable(lines.map((l) => ({ ...l, price: l.priceUsd ?? 0 })), totalUsd, "USD");
  }
  return itemsTable(lines.map((line) => ({ ...line, price: 0 })), undefined).replace(/<td style="padding:8px 0;border-bottom:1px solid #eee;font-size:13px;text-align:right">\$0<\/td>/g, '<td style="padding:8px 0;border-bottom:1px solid #eee;font-size:13px;text-align:right"></td>') + p(`Total: <strong>${formatUSD(totalUsd)}</strong>`);
}

async function customer(admin: Admin, event: EmailEvent, key: string, to: string | null, subject: string, html: string | ((c: import("./custom-content").EmailContent) => string | Promise<string>)) {
  const s = await getSetting(admin, event);
  if (!s.enabled) return;
  const body = typeof html === "function" ? await html(s.content) : html;
  await sendOnce(admin, { dedupeKey: key, event, to: [to], subject, html: body });
}

/** Productos recomendados: relacionados de lo comprado y, si faltan, los más recientes publicados. */
export async function recommendProducts(admin: Admin, variantIds: string[], limit = 4): Promise<EmailProduct[]> {
  let bought: string[] = [];
  if (variantIds.length) {
    const { data } = await admin.from("product_variants").select("product_id").in("id", variantIds);
    bought = [...new Set((data ?? []).map((v: any) => v.product_id))];
  }
  let ids: string[] = [];
  if (bought.length) {
    const { data } = await admin.from("product_related").select("related_id").in("product_id", bought).order("position");
    ids = [...new Set((data ?? []).map((r: any) => r.related_id))].filter((id) => !bought.includes(id));
  }
  let q = admin.from("products").select("id,name,slug,list_price_cop,hero_image_url").eq("status", "published");
  const { data: rel } = ids.length ? await q.in("id", ids) : { data: [] as any[] };
  let list = (rel ?? []) as any[];
  if (list.length < limit) {
    const { data: more } = await admin.from("products").select("id,name,slug,list_price_cop,hero_image_url").eq("status", "published").order("created_at", { ascending: false }).limit(20);
    for (const m of (more ?? []) as any[]) if (!bought.includes(m.id) && !list.some((x) => x.id === m.id)) list.push(m);
  }
  list = list.slice(0, limit);
  const missing = list.filter((x) => !x.hero_image_url).map((x) => x.id);
  const imgs = new Map<string, string>();
  if (missing.length) {
    const { data } = await admin.from("product_images").select("product_id,url,position").in("product_id", missing).order("position");
    for (const i of (data ?? []) as any[]) if (!imgs.has(i.product_id)) imgs.set(i.product_id, i.url);
  }
  return list.map((x) => ({ name: x.name, slug: x.slug, price: Number(x.list_price_cop) || 0, image: x.hero_image_url || imgs.get(x.id) || null }));
}
async function team(admin: Admin, event: EmailEvent, key: string, subject: string, html: string) {
  const s = await getSetting(admin, event);
  if (!s.enabled || !s.recipients.length) return;
  await sendOnce(admin, { dedupeKey: key, event, to: s.recipients, subject, html });
}

export async function handleOrderEvents(orderId: string, events: string[]) {
  const admin = await adminClient();
  const d = await loadOrder(admin, orderId);
  if (!d) return;
  const { o, email, lines, isB2B, variantIds } = d;
  const name = esc((o.contact_name || "").split(" ")[0] || "");
  const hi = name ? `Hola ${name},` : "Hola,";
  const usdB2B = o.currency === "USD" && Number(o.total_usd) > 0;
  const money = usdB2B ? formatUSD(Number(o.total_usd) || 0) : cop(Number(o.total_cop));
  const table = orderTable(o, lines);
  const n = esc(o.number);

  if (events.includes("paid")) {
    try {
      const { attributePurchase } = await import("./campaigns.server");
      await attributePurchase(admin, { id: o.id, contact_email: email, total_cop: Number(o.total_cop), paid_at: o.paid_at, created_at: o.created_at });
    } catch (e) { console.error("campaign attribution failed", e); }
    if (o.source === "ecom" && !(o as { is_manual?: boolean }).is_manual) {
      await sendOnceMark(admin, o.id, email);
      await customer(admin, "customer_online_confirmed", `online-${o.id}`, email, `Confirmamos tu compra #${o.number}`,
        async (c) => layout("Gracias por tu compra", withCustomContent(p(hi) + p(`Recibimos el pago de tu pedido <strong>#${n}</strong>. Te avisaremos cuando salga hacia ti.`) + table, c, c.showProducts ? await recommendProducts(admin, variantIds) : [], usdB2B ? "USD" : "COP"), { label: "Ver mi pedido", href: `${SITE}/gracias/${o.id}` }));
      const ship = (o.ship_to ?? {}) as Record<string, string>;
      await team(admin, "team_online_sale", `team-online-${o.id}`, `Nueva venta online #${o.number} · ${money}`,
        layout(`Venta online #${o.number}`, p(`Cliente: ${esc(o.contact_name)} · ${esc(email)} · ${esc(o.contact_phone)}`) + p(`Destino: ${esc([ship.city, ship.department, ship.country].filter(Boolean).join(", "))}`) + p(`Pago: ${esc(o.payment_method)}`) + table, { label: "Abrir pedido", href: `${SITE}/admin/pedido/${o.id}` }));
    } else if (o.source === "pos") {
      await customer(admin, "customer_pos_receipt", `pos-${o.id}`, email, `Gracias por tu compra en Tu Marca #${o.number}`,
        layout("Gracias por visitarnos", p(hi) + p(`Este es el resumen de tu compra en tienda <strong>#${n}</strong>. Tu factura electrónica llegará por separado desde la DIAN.`) + table));
    } else if ((o.source === "assisted" || (o as { is_manual?: boolean }).is_manual) && !isB2B) {
      await customer(admin, "customer_manual_order", `manual-${o.id}`, email, `Tu pedido #${o.number} está confirmado`,
        layout("Pedido confirmado", p(hi) + p(`Confirmamos tu pedido <strong>#${n}</strong>. Te avisaremos cuando salga hacia ti.`) + table));
      const ship = (o.ship_to ?? {}) as Record<string, string>;
      await team(admin, "team_online_sale", `team-manual-${o.id}`, `Nueva venta manual #${o.number} · ${money}`,
        layout(`Venta manual #${o.number}`, p(`Cliente: ${esc(o.contact_name)} · ${esc(email)} · ${esc(o.contact_phone)}`) + p(`Destino: ${esc([ship.city, ship.department, ship.country].filter(Boolean).join(", "))}`) + p(`Pago: ${esc(o.payment_method)}`) + table, { label: "Abrir pedido", href: `${SITE}/admin/pedido/${o.id}` }));
    }
  }

  if (events.includes("created") && o.source === "assisted") {
    if (isB2B) {
      await customer(admin, "customer_b2b_order", `b2b-${o.id}`, email, `Recibimos tu pedido mayorista #${o.number}`,
        layout("Pedido recibido", p(hi) + p(`Recibimos tu pedido <strong>#${n}</strong>. Nuestro equipo lo revisará y te confirmará la fecha de despacho${o.b2b_ship_eta ? ` (estimada: ${esc(new Date(o.b2b_ship_eta).toLocaleDateString("es-CO"))})` : ""}.`) + table, { label: "Ver mis pedidos", href: `${SITE}/b2b/pedidos` }));
      await team(admin, "team_b2b_preorder", `team-b2b-${o.id}`, `Nuevo pedido preventa B2B #${o.number} · ${money}`,
        layout(`Preventa B2B #${o.number}`, p(`Cliente: ${esc(o.contact_name)} · ${esc(email)}`) + p(`Modalidad: ${esc(o.b2b_mode)}`) + table, { label: "Abrir pedido", href: `${SITE}/admin/pedido/${o.id}` }));
    } else if (o.payment_status !== "paid") {
      await customer(admin, "customer_manual_order", `manual-${o.id}`, email, `Tu pedido #${o.number} fue registrado`,
        layout("Pedido registrado", p(hi) + p(`Registramos tu pedido <strong>#${n}</strong>.`) + table));
    }
  }

  if (isB2B && events.includes("b2b_confirmed")) {
    await customer(admin, "customer_b2b_confirmed", `b2b-confirmed-${o.id}`, email, `Confirmamos tu pedido mayorista #${o.number}`,
      layout("Pedido confirmado", p(hi) + p(`Confirmamos tu pedido <strong>#${n}</strong> y preparamos la lista de empaque. Te avisaremos cuando generemos la guía de envío.`) + table, { label: "Ver mis pedidos", href: `${SITE}/b2b/pedidos` }));
  }
  if (isB2B && events.includes("b2b_shipped")) {
    const shipment = await admin.from("b2b_shipments").select("carrier,tracking").eq("order_id", o.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const carrier = shipment.data?.carrier ?? o.shipping_carrier;
    const tracking = shipment.data?.tracking ?? o.tracking_number;
    await customer(admin, "customer_b2b_shipped", `b2b-shipped-${o.id}`, email, `Enviamos tu pedido mayorista #${o.number}`,
      layout("Pedido enviado", p(hi) + p(`Tu pedido <strong>#${n}</strong> salió hacia ti.`) + (tracking ? p(`Transportadora: <strong>${esc(carrier ?? "—")}</strong><br>Número de guía: <strong>${esc(tracking)}</strong>`) : "") + p("Te avisaremos cuando se confirme la entrega."), { label: "Ver mis pedidos", href: `${SITE}/b2b/pedidos` }));
  }
  if (isB2B && events.includes("b2b_delivered")) {
    await customer(admin, "customer_b2b_delivered", `b2b-delivered-${o.id}`, email, `Tu pedido mayorista #${o.number} fue entregado`,
      layout("Pedido entregado", p(hi) + p(`Confirmamos la entrega de tu pedido <strong>#${n}</strong>. Gracias por confiar en Tu Marca.`), { label: "Ver mis pedidos", href: `${SITE}/b2b/pedidos` }));
  }
  if (events.includes("label") && o.tracking_number && !isB2B) {
    await customer(admin, "customer_shipping_label", `label-${o.id}-${o.tracking_number}`, email, `Tu pedido #${o.number} va en camino`,
      layout("Tu pedido va en camino", p(hi) + p(`Generamos la guía de envío de tu pedido <strong>#${n}</strong>.`) + p(`Transportadora: <strong>${esc(o.shipping_carrier ?? "—")}</strong><br>Número de guía: <strong>${esc(o.tracking_number)}</strong>`) + p("Puedes rastrearlo en la página de la transportadora con ese número.")));
  }
}

// Reenvío manual del correo de confirmación de compra desde el admin.
// Usa una dedupeKey nueva en cada intento para que siempre se intente enviar,
// y quede registrado en email_send_log con su estado (sent/error).
export async function resendOrderConfirmationEmail(orderId: string): Promise<{ sent: boolean; email: string | null; error?: string }> {
  const admin = await adminClient();
  const d = await loadOrder(admin, orderId);
  if (!d) return { sent: false, email: null, error: "Pedido no encontrado" };
  const { o, email, lines, isB2B } = d;
  if (!email) return { sent: false, email: null, error: "El pedido no tiene correo de contacto" };
  const name = esc((o.contact_name || "").split(" ")[0] || "");
  const hi = name ? `Hola ${name},` : "Hola,";
  const table = orderTable(o, lines);
  const n = esc(o.number);
  const key = `resend-${o.id}-${Date.now()}`;
  let event: EmailEvent = "customer_online_confirmed";
  let subject = `Confirmamos tu compra #${o.number}`;
  let html = layout("Gracias por tu compra", p(hi) + p(`Recibimos el pago de tu pedido <strong>#${n}</strong>. Te avisaremos cuando salga hacia ti.`) + table, { label: "Ver mi pedido", href: `${SITE}/gracias/${o.id}` });
  if (o.source === "pos") {
    event = "customer_pos_receipt";
    subject = `Gracias por tu compra en Tu Marca #${o.number}`;
    html = layout("Gracias por visitarnos", p(hi) + p(`Este es el resumen de tu compra en tienda <strong>#${n}</strong>. Tu factura electrónica llegará por separado desde la DIAN.`) + table);
  } else if (o.source === "assisted" && isB2B) {
    event = "customer_b2b_confirmed";
    subject = `Confirmamos tu pedido mayorista #${o.number}`;
    html = layout("Pedido confirmado", p(hi) + p(`Confirmamos tu pedido <strong>#${n}</strong> y preparamos la lista de empaque. Te avisaremos cuando generemos la guía de envío.`) + table, { label: "Ver mis pedidos", href: `${SITE}/b2b/pedidos` });
  } else if (o.source === "assisted") {
    event = "customer_manual_order";
    subject = `Tu pedido #${o.number} está confirmado`;
    html = layout("Pedido confirmado", p(hi) + p(`Confirmamos tu pedido <strong>#${n}</strong>. Te avisaremos cuando salga hacia ti.`) + table);
  }
  const sent = await sendOnce(admin, { dedupeKey: key, event, to: [email], subject, html });
  if (!sent) {
    const { data: log } = await admin.from("email_send_log" as any).select("error").eq("dedupe_key", key).maybeSingle();
    return { sent: false, email, error: (log as any)?.error ?? "No se pudo enviar" };
  }
  return { sent: true, email };
}

// Bienvenida al crear cuenta por primera vez (una sola vez por usuario).
export async function handleWelcome(userId: string) {
  const admin = await adminClient();
  const { data: u } = await admin.auth.admin.getUserById(userId).catch(() => ({ data: null as any }));
  const email = u?.user?.email ?? null;
  if (!email) return;
  const name = esc(((u?.user?.user_metadata?.full_name as string) || "").split(" ")[0] || "");
  await customer(admin, "customer_welcome", `welcome-${userId}`, email, "Bienvenida a Tu Marca",
    (c) => layout("Bienvenida a Tu Marca", withCustomContent(welcomeBody(name), c),
      { label: "Explorar la tienda", href: `${SITE}/tienda` }));
}

export function welcomeBody(name: string) {
  return p(name ? `Hola ${name},` : "Hola,") +
      p("Tu cuenta ya está lista. Desde ahora puedes comprar más rápido, guardar tus prendas favoritas, seguir tus pedidos y acumular puntos Wild Circle en cada compra.") +
      p("Gracias por hacer parte de nuestra manada.");
}

// Marca carritos abandonados como convertidos al pagar.
async function sendOnceMark(admin: Admin, orderId: string, email: string | null) {
  if (!email) return;
  await admin.from("checkout_leads" as any).update({ order_id: orderId }).ilike("email", email.trim()).is("order_id", null);
}

export async function handlePosClosing(sessionId: string) {
  const admin = await adminClient();
  const { data: s } = await admin.from("pos_sessions").select("*").eq("id", sessionId).maybeSingle();
  if (!s) return;
  const { data: loc } = await admin.from("locations").select("name").eq("id", s.location_id).maybeSingle();
  // Las ventas de la caja se registran en pos_sales (un pago por línea; un pedido puede tener varios pagos).
  const { data: sales } = await admin.from("pos_sales").select("order_id,method,amount_cop").eq("session_id", sessionId);
  const paid = [...new Set((sales ?? []).map((x) => x.order_id ?? x.method))];
  const LABEL: Record<string, string> = { efectivo: "Efectivo", datafono: "Datáfono", transferencia: "Transferencia", link_pago: "Link de pago", wompi: "Wompi", tarjeta: "Tarjeta", credito_15: "Crédito a 15 días" };
  const byMethod = new Map<string, number>();
  for (const x of sales ?? []) { const m = LABEL[x.method] ?? x.method; byMethod.set(m, (byMethod.get(m) ?? 0) + Number(x.amount_cop)); }
  const total = (sales ?? []).reduce((a, x) => a + Number(x.amount_cop), 0);
  const cash = byMethod.get("Efectivo") ?? 0;
  const expected = Number(s.opening_cash_cop ?? 0) + cash;
  const diff = Number(s.closing_cash_cop ?? 0) - expected;
  const rows = [...byMethod].map(([m, v]) => `<tr><td style="padding:6px 0;font-size:13px">${esc(m)}</td><td style="text-align:right;font-size:13px">${cop(v)}</td></tr>`).join("");
  const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("es-CO", { timeZone: "America/Bogota" }) : "—");
  await team(admin, "team_pos_closing", `closing-${sessionId}`, `Cierre de caja ${loc?.name ?? ""} · ${cop(total)}`,
    layout(`Cierre de caja · ${esc(loc?.name ?? "")}`,
      p(`Apertura: ${fmt(s.opened_at)}<br>Cierre: ${fmt(s.closed_at)}`) +
      p(`Ventas: <strong>${paid.length}</strong> · Total vendido: <strong>${cop(total)}</strong>`) +
      `<table style="width:100%;border-collapse:collapse;margin:8px 0 16px">${rows}</table>` +
      p(`Base inicial: ${cop(Number(s.opening_cash_cop ?? 0))}<br>Efectivo esperado: ${cop(expected)}<br>Efectivo contado: ${cop(Number(s.closing_cash_cop ?? 0))}<br>Diferencia: <strong>${cop(diff)}</strong>`) +
      (s.notes ? p(`Notas: ${esc(s.notes)}`) : "")));
}

export async function handleAbandoned() {
  const admin = await adminClient();
  const s = await getSetting(admin, "customer_abandoned_cart");
  const cutoff = new Date(Date.now() - 4 * 3600_000).toISOString();
  const floor = new Date(Date.now() - 3 * 86400_000).toISOString();
  const { data } = await admin.from("checkout_leads" as any).select("*").is("order_id", null).is("reminder_sent_at", null).lt("created_at", cutoff).gt("created_at", floor).limit(100);
  for (const lead of (data ?? []) as any[]) {
    await admin.from("checkout_leads" as any).update({ reminder_sent_at: new Date().toISOString() }).eq("id", lead.id);
    if (!s.enabled) continue;
    // ¿Compró después con el mismo correo?
    const { count } = await admin.from("orders").select("id", { count: "exact", head: true }).ilike("contact_email", lead.email).gte("created_at", lead.created_at).eq("payment_status", "paid");
    if (count) continue;
    const items = (lead.items ?? []) as { name: string; label?: string; qty: number; price: number; image?: string }[];
    const name = esc((lead.name || "").split(" ")[0] || "");
    const imgs = items.slice(0, 3).filter((i) => i.image).map((i) => `<img src="${esc(i.image)}" alt="" width="160" style="width:32%;margin-right:1%;object-fit:cover">`).join("");
    await sendOnce(admin, {
      dedupeKey: `abandoned-${lead.id}`, event: "customer_abandoned_cart", to: [lead.email],
      subject: "Tus prendas te siguen esperando",
      html: layout("Dejaste algo en tu carrito", withCustomContent(p(name ? `Hola ${name},` : "Hola,") + p("Guardamos tus prendas por un tiempo. Termina tu compra antes de que se agoten.") + (imgs ? `<div style="margin:12px 0">${imgs}</div>` : "") + itemsTable(items, Number(lead.subtotal_cop)), s.content), { label: "Volver a mi carrito", href: `${SITE}/carrito` }),
    });
  }
}

/** Resumen diario al equipo: pedidos manuales a crédito por vencer (≤3 días) o vencidos sin pago. */
export async function handleCreditReminders() {
  const admin = await adminClient();
  const s = await getSetting(admin, "team_credit_reminder");
  if (!s.enabled || !s.recipients.length) return;
  const limit = new Date(Date.now() + 3 * 86400_000).toISOString();
  const { data } = await admin.from("orders").select("id,number,contact_name,total_cop,total_usd:total_usd_exact,currency,credit_due_at" as any)
    .eq("is_manual", true).like("payment_method", "credito%").neq("payment_status", "paid")
    .not("status", "in", "(cancelled,refunded)").lte("credit_due_at" as any, limit).order("credit_due_at" as any).limit(200);
  const list = (data ?? []) as any[];
  if (!list.length) return;
  const today = new Date().toISOString().slice(0, 10);
  const rows = list.map((o) => {
    const days = Math.ceil((new Date(o.credit_due_at).getTime() - Date.now()) / 86400_000);
    const when = days < 0 ? `<span style="color:#b91c1c">Vencido hace ${-days} días</span>` : days === 0 ? "Vence hoy" : `Vence en ${days} días`;
    const money = o.currency === "USD" && Number(o.total_usd) > 0 ? formatUSD(Number(o.total_usd)) : cop(Number(o.total_cop));
    return `<tr><td style="padding:6px 0;border-bottom:1px solid #eee"><a href="${SITE}/admin/pedido/${o.id}">#${esc(String(o.number))}</a> · ${esc(o.contact_name ?? "")}</td><td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right">${money}<br><small>${when}</small></td></tr>`;
  }).join("");
  await sendOnce(admin, {
    dedupeKey: `credit-reminder-${today}`, event: "team_credit_reminder", to: s.recipients,
    subject: `Cobros a crédito pendientes · ${list.length} pedido${list.length === 1 ? "" : "s"}`,
    html: layout("Cobros a crédito pendientes", p("Estos pedidos manuales a crédito están por vencer o ya vencieron sin pago registrado:") + `<table style="width:100%;border-collapse:collapse;margin:8px 0 16px">${rows}</table>`, { label: "Ver pedidos", href: `${SITE}/admin/pedidos` }),
  });
}

export function reviewRequestBody(name: string, points = 10000) {
  return p(name ? `Hola ${name},` : "Hola,") +
    p("Esperamos que ya estés disfrutando tus prendas Tu Marca. Nos encantaría saber cómo te quedaron.") +
    p(`Déjanos una reseña desde tu perfil y te regalamos <strong>${points.toLocaleString("es-CO")} puntos</strong> Wild Circle en tu cuenta, que se asignan automáticamente al publicarla.`);
}

/** Invitación a reseñar: pedidos entregados hace 12+ días (ventana hasta 20), una vez por pedido, solo clientes con cuenta. */
export async function handleReviewRequests() {
  const admin = await adminClient();
  const s = await getSetting(admin, "customer_review_request");
  const from = new Date(Date.now() - 20 * 86400_000).toISOString();
  const to = new Date(Date.now() - 12 * 86400_000).toISOString();
  const { data } = await admin.from("orders").select("id,customer_id,contact_email,contact_name" as any)
    .eq("status", "delivered").is("review_request_sent_at" as any, null).not("customer_id", "is", null)
    .lt("delivered_at" as any, to).gt("delivered_at" as any, from).limit(100);
  const { data: cfg } = await admin.from("app_settings").select("value").eq("key", "loyalty").maybeSingle();
  const points = Number((cfg?.value as any)?.review_points ?? 10000);
  for (const o of (data ?? []) as any[]) {
    await admin.from("orders").update({ review_request_sent_at: new Date().toISOString() } as any).eq("id", o.id);
    if (!s.enabled) continue;
    const { count } = await admin.from("product_reviews").select("id", { count: "exact", head: true }).eq("order_id", o.id);
    if (count) continue;
    let email = o.contact_email as string | null;
    if (!email) {
      const { data: u } = await admin.auth.admin.getUserById(o.customer_id).catch(() => ({ data: null as any }));
      email = u?.user?.email ?? null;
    }
    if (!email) continue;
    const name = esc((o.contact_name || "").split(" ")[0] || "");
    await sendOnce(admin, {
      dedupeKey: `review-${o.id}`, event: "customer_review_request", to: [email],
      subject: `Cuéntanos cómo te quedó y gana ${points.toLocaleString("es-CO")} puntos`,
      html: layout("¿Cómo te quedaron tus prendas?", withCustomContent(reviewRequestBody(name, points), s.content),
        { label: "Dejar mi reseña", href: `${SITE}/cuenta/pedidos` }),
    });
  }
}

const TRANSFER_EVENT: Record<string, EmailEvent> = { bodega: "team_transfer_bodega", bogota: "team_transfer_bogota", cali: "team_transfer_cali" };

/** Aviso al responsable de la bodega destino cuando se crea un traslado. */
export async function handleTransferCreated(transferId: string) {
  const admin = await adminClient();
  const { data: t } = await admin.from("transfers").select("id, note, created_at, created_by, requested_by, from_location_id, to_location_id").eq("id", transferId).maybeSingle();
  if (!t) return;
  const { data: locs } = await admin.from("locations").select("id, code, name").in("id", [t.from_location_id, t.to_location_id]);
  const to = locs?.find((l) => l.id === t.to_location_id);
  const from = locs?.find((l) => l.id === t.from_location_id);
  const event = to?.code ? TRANSFER_EVENT[to.code] : undefined;
  if (!event) return;
  const s = await getSetting(admin, event);
  if (!s.enabled || !s.recipients.length) return;
  const { data: items } = await admin.from("transfer_items").select("qty, product_variants(sku, size, color, products(name))").eq("transfer_id", transferId);
  const lines = ((items ?? []) as any[]).map((i) => ({ name: i.product_variants?.products?.name ?? i.product_variants?.sku ?? "Prenda", sku: i.product_variants?.sku ?? "", size: [i.product_variants?.color, i.product_variants?.size].filter(Boolean).join(" · "), qty: Number(i.qty) || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.size.localeCompare(b.size));
  const units = lines.reduce((n, l) => n + l.qty, 0);
  const actorId = t.created_by ?? t.requested_by;
  const actor = actorId ? ((await admin.from("profiles").select("full_name").eq("id", actorId).maybeSingle()).data as any)?.full_name : null;
  const date = new Date(t.created_at).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "long", timeStyle: "short" });
  const td = 'style="padding:6px 0;border-bottom:1px solid #eee;font-size:13px"';
  const rows = lines.map((l) => `<tr><td ${td}>${esc(l.name)}<br><span style="color:#6b6f5a;font-size:11px">${esc(l.sku)}</span></td><td ${td}>${esc(l.size)}</td><td ${td} align="right">${l.qty}</td></tr>`).join("");
  const body = p(`<strong>Origen:</strong> ${esc(from?.name ?? "")}<br><strong>Destino:</strong> ${esc(to?.name ?? "")}<br><strong>Creado por:</strong> ${esc(actor ?? "Sistema")}<br><strong>Fecha:</strong> ${esc(date)}${t.note ? `<br><strong>Nota:</strong> ${esc(t.note)}` : ""}`)
    + `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:12px"><tr><th align="left" style="font-size:11px;text-transform:uppercase;color:#6b6f5a;padding-bottom:6px">Prenda</th><th align="left" style="font-size:11px;text-transform:uppercase;color:#6b6f5a">Talla</th><th align="right" style="font-size:11px;text-transform:uppercase;color:#6b6f5a">Cant.</th></tr>${rows}</table>`
    + p(`Total: <strong>${units} ${units === 1 ? "prenda" : "prendas"}</strong>`);
  const href = to?.code === "bodega" ? `${SITE}/admin/traslados` : `${SITE}/pos/${to?.code}/traslados`;
  await sendOnce(admin, { dedupeKey: `transfer-created-${transferId}`, event, to: s.recipients, subject: `Nuevo traslado hacia ${to?.name} · ${units} ${units === 1 ? "prenda" : "prendas"}`, html: layout(`Nuevo traslado hacia ${to?.name}`, body, { label: "Ver traslado", href }) });
}

const STORE_WEB_EVENT: Record<string, EmailEvent> = { cali: "team_store_web_cali", bogota: "team_store_web_bogota" };

/** Aviso a la tienda cuando un pedido web toma prendas de su inventario. */
export async function handleStoreWebOrder(fulfillmentId: string) {
  const admin = await adminClient();
  const { data: f } = await admin.from("order_fulfillments").select("id, order_id, location_id").eq("id", fulfillmentId).maybeSingle();
  if (!f) return;
  const { data: loc } = await admin.from("locations").select("code, name").eq("id", f.location_id).maybeSingle();
  const event = loc?.code ? STORE_WEB_EVENT[loc.code] : undefined;
  if (!event) return;
  const s = await getSetting(admin, event);
  if (!s.enabled || !s.recipients.length) return;
  const { data: o } = await admin.from("orders").select("number, contact_name, created_at, order_items(qty, product_name, variant_label, fulfill_location_id)").eq("id", f.order_id).maybeSingle();
  if (!o) return;
  const items = ((o as any).order_items ?? []).filter((i: any) => i.fulfill_location_id === f.location_id);
  const units = items.reduce((n: number, i: any) => n + (Number(i.qty) || 0), 0);
  const td = 'style="padding:6px 0;border-bottom:1px solid #eee;font-size:13px"';
  const rows = items.map((i: any) => `<tr><td ${td}>${esc(i.product_name ?? "Prenda")}</td><td ${td}>${esc(i.variant_label ?? "")}</td><td ${td} align="right">${i.qty}</td></tr>`).join("");
  const date = new Date((o as any).created_at).toLocaleString("es-CO", { timeZone: "America/Bogota", dateStyle: "long", timeStyle: "short" });
  const body = p(`Entró un pedido web que se despacha desde <strong>${esc(loc!.name)}</strong>. Retira las prendas del perchero y empácalas.<br><br><strong>Pedido:</strong> ${esc((o as any).number ?? "")}<br><strong>Cliente:</strong> ${esc((o as any).contact_name ?? "")}<br><strong>Fecha:</strong> ${esc(date)}`)
    + `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:12px">${rows}</table>`
    + p(`Total: <strong>${units} ${units === 1 ? "prenda" : "prendas"}</strong>`);
  await sendOnce(admin, { dedupeKey: `store-web-${fulfillmentId}`, event, to: s.recipients, subject: `Pedido web ${(o as any).number ?? ""} para despachar desde ${loc!.name}`, html: layout(`Nuevo pedido web · ${loc!.name}`, body, { label: "Ver pedidos web", href: `${SITE}/pos/${loc!.code}/pedidos` }) });
}
