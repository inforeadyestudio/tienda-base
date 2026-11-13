import { normalizeBillingSettings, providerForCurrency } from "@/lib/billing";

async function loadConfig() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: setting }, { data: secretRows }] = await Promise.all([
    supabaseAdmin.from("app_settings").select("value").eq("key", "billing_settings").maybeSingle(),
    supabaseAdmin.from("integration_secrets").select("key, value").in("key", ["factus_client_secret", "factus_password", "efactura_api_key"]),
  ]);
  const map = new Map((secretRows ?? []).map((row: any) => [row.key, String(row.value ?? "")]));
  return {
    settings: normalizeBillingSettings(setting?.value),
    secrets: {
      clientSecret: map.get("factus_client_secret") ?? "",
      password: map.get("factus_password") ?? "",
      apiKey: map.get("efactura_api_key") ?? "",
    },
  };
}

/** Emite factura directa (Factus / eFactura) para un pedido. */
export async function issueInvoiceCore(orderId: string, actorId: string | null): Promise<{ ok: boolean; message: string; invoiceId?: string; number?: string | null }> {
  const data = { orderId };
  const context = { userId: actorId };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: issued } = await supabaseAdmin
    .from("invoices")
    .select("id, number")
    .eq("order_id", data.orderId)
    .eq("status", "issued")
    .maybeSingle();
  if (issued) return { ok: true, message: "Este pedido ya tiene factura emitida.", invoiceId: issued.id, number: issued.number };

  const { data: order, error: orderError } = await supabaseAdmin
    .from("orders")
    .select("id, number, currency, total_cop, total_usd:total_usd_exact, shipping_cop, contact_name, contact_email, contact_phone, ship_to, invoice_requested, invoice_name, invoice_document, invoice_email, order_items(qty, unit_price_cop, product_name, variant_label)")
    .eq("id", data.orderId)
    .maybeSingle();
  if (orderError || !order) throw new Error("No encontramos el pedido.");

  const currency = (order.currency ?? "COP").toUpperCase() === "USD" ? "USD" : "COP";
  const provider = providerForCurrency(currency);
  const { settings, secrets } = await loadConfig();
  const providerSettings = provider === "factus" ? settings.factus : settings.efactura;
  if (!providerSettings.enabled) {
    return { ok: false, message: `${provider === "factus" ? "Factus" : "eFactura Panamá"} está desactivado en Configuraciones.` };
  }

  const totalCop = Number(order.total_cop ?? 0);
  const totalUsd = Number(order.total_usd ?? 0);
  const rate = currency === "USD" && totalCop > 0 && totalUsd > 0 ? totalUsd / totalCop : 1;
  const convert = (value: number) => (currency === "USD" ? Math.round(value * rate * 100) / 100 : Math.round(value));

  const items = (order.order_items ?? []) as any[];
  const lines = items.map((item) => ({
    name: [item.product_name, item.variant_label].filter(Boolean).join(" · "),
    qty: item.qty,
    unitPrice: convert(item.unit_price_cop),
    total: convert(item.unit_price_cop * item.qty),
  }));
  const shipTo = (order.ship_to ?? {}) as any;
  const draft = {
    orderId: order.id,
    orderNumber: order.number,
    currency: currency as "COP" | "USD",
    customer: {
      name: (order.invoice_requested ? order.invoice_name : null) ?? order.contact_name ?? shipTo.recipient ?? "",
      documentId: (order.invoice_requested ? order.invoice_document : null) ?? shipTo.document_id ?? "",
      email: (order.invoice_requested ? order.invoice_email : null) ?? order.contact_email ?? shipTo.email ?? "",
      phone: order.contact_phone ?? shipTo.phone ?? "",
      address: [shipTo.line1, shipTo.line2].filter(Boolean).join(" "),
      city: shipTo.city ?? "",
      country: shipTo.country ?? (currency === "USD" ? "" : "Colombia"),
    },
    lines,
    shipping: convert(Number(order.shipping_cop ?? 0)),
    total: currency === "USD" ? totalUsd : totalCop,
    taxRate: providerSettings.taxExempt ? 0 : providerSettings.taxRate,
  };

  const { issueWithEfactura, issueWithFactus } = await import("@/lib/billing/providers.server");
  const result =
    provider === "factus"
      ? await issueWithFactus(providerSettings, { clientSecret: secrets.clientSecret, password: secrets.password }, draft)
      : await issueWithEfactura(providerSettings, { apiKey: secrets.apiKey }, draft);

  const { data: saved, error: saveError } = await supabaseAdmin
    .from("invoices")
    .insert({
      order_id: order.id,
      provider,
      currency,
      environment: providerSettings.mode,
      status: result.ok ? "issued" : "error",
      external_id: result.externalId ?? null,
      number: result.number ?? null,
      cufe: result.cufe ?? null,
      pdf_url: result.pdfUrl ?? null,
      total_amount: draft.total,
      payload: draft as any,
      response: (result.response ?? {}) as any,
      error: result.ok ? null : (result.error ?? "No se pudo emitir."),
      issued_at: result.ok ? new Date().toISOString() : null,
      created_by: context.userId,
    })
    .select("id, number")
    .single();
  if (saveError) throw new Error("La factura se procesó pero no pudimos guardarla.");

  return {
    ok: result.ok,
    message: result.ok ? "Factura emitida." : (result.error ?? "No se pudo emitir la factura."),
    invoiceId: saved.id,
    number: saved.number,
  };
}
