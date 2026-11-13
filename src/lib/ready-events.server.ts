// Envío de eventos de venta a Ready (ingest-workspace-event).
// Llamado desde el hook /api/public/hooks/ready-events cuando un pedido queda pagado.

const READY_URL = "https://vwiytbcqypcxeifqbeew.supabase.co/functions/v1/ingest-workspace-event";

// b2b_mode vale 'direct' por defecto en todos los pedidos; B2B real = cliente con rol b2b.
function channelOf(order: { source: string; is_manual: boolean }, isB2B: boolean): string {
  if (isB2B) return "B2B";
  if (order.source === "pos" || order.source === "assisted") return "POS";
  if (order.is_manual) return "Manual";
  return "Online";
}

function moneyOf(order: { currency: string; total_cop: number; total_usd: number | null }): string {
  if (order.currency === "USD" && order.total_usd != null) {
    return `US$${Number(order.total_usd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `$${Math.round(order.total_cop).toLocaleString("es-CO")}`;
}

export async function handleReadySaleEvent(orderId: string): Promise<{ sent: boolean; reason?: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: base } = await supabaseAdmin.from("orders").select("customer_id").eq("id", orderId).maybeSingle();
  const isB2B = base?.customer_id
    ? (await supabaseAdmin.rpc("is_b2b", { _user_id: base.customer_id } as any)).data === true
    : false;

  // Conversions API de Meta (solo Online). Meta deduplica por event_id.
  try {
    const { data: o } = await supabaseAdmin
      .from("orders")
      .select("id, number, source, is_manual, b2b_mode, currency, total_cop, total_usd:total_usd_exact, contact_email, contact_phone, contact_name, buyer_country, paid_at, payment_status")
      .eq("id", orderId)
      .maybeSingle();
    if (o && o.payment_status === "paid") {
      const { sendMetaPurchase } = await import("./meta-capi.server");
      await sendMetaPurchase({ ...(o as any), is_b2b: isB2B });
    }
  } catch (e) {
    console.error("meta capi", e);
  }

  // Idempotencia: un pedido pagado solo se envía una vez.
  const { data: already } = await supabaseAdmin
    .from("ready_sync_log")
    .select("id")
    .eq("order_id", orderId)
    .eq("status", "sent")
    .maybeSingle();
  if (already) return { sent: false, reason: "already_sent" };

  const { data: order, error } = await supabaseAdmin
    .from("orders")
    .select("id, number, source, is_manual, b2b_mode, currency, total_cop, total_usd:total_usd_exact, contact_name, payment_status")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !order) return { sent: false, reason: "order_not_found" };
  if (order.payment_status !== "paid") return { sent: false, reason: "not_paid" };

  const key = process.env["READY_SYSTEM_KEY"];
  if (!key) {
    await supabaseAdmin.from("ready_sync_log").insert({
      order_id: orderId,
      status: "error",
      response: { error: "READY_SYSTEM_KEY no configurada" },
    });
    return { sent: false, reason: "missing_key" };
  }

  const channel = channelOf(order, isB2B);
  const value = moneyOf(order);
  const payload = {
    event_type: "venta_registrada",
    title: `Nueva venta · ${channel}`,
    detail: `${order.number} · ${order.contact_name ?? "Cliente"} · ${value}`,
    metadata: {
      orden: order.number,
      order_id: order.id,
      canal: channel,
      moneda: order.currency,
      total: order.currency === "USD" ? order.total_usd : order.total_cop,
    },
  };

  let status = "sent";
  let response: any = {};
  try {
    const res = await fetch(READY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ready-system-key": key },
      body: JSON.stringify(payload),
    });
    response = { status: res.status, body: await res.text().then((t) => t.slice(0, 500)) };
    if (!res.ok) status = "error";
  } catch (e) {
    status = "error";
    response = { error: e instanceof Error ? e.message : String(e) };
  }

  await supabaseAdmin.from("ready_sync_log").insert({
    order_id: orderId,
    status,
    request: payload,
    response,
  });
  return { sent: status === "sent", reason: status === "sent" ? undefined : "ready_error" };
}
