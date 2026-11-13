import { adjustmentMeta, withAdjustmentMeta } from "./rcount-adjustment-meta";
import { createHmac } from "crypto";
import { buildCadInvoice, destinationCountry, splitPaymentsUsd, validateUsdInvoice, payMethodKey, resolvePayKey, centerLabel, entityForCurrency, isColombia, normalizeRCountSettings, rcountDocumentType, RCOUNT_SETTINGS_KEY, type RCountCenterKey, type RCountSettings } from "@/lib/rcount";

type Trigger = "paid" | "dispatch" | "manual";

function pickField(value: any, ...keys: string[]) {
  for (const key of keys) if (value?.[key] != null) return value[key];
  return null;
}

/** Reconciles pending local invoices with the final DIAN state held by R-Count. */
export async function reconcileRCountInvoices(orderIds: string[]) {
  const ids = [...new Set(orderIds)].slice(0, 200);
  if (!ids.length) return [];
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const [{ data: pending }, { data: setting }, { data: logs }] = await Promise.all([
    // Error invoices with an R-Count draft may later be issued manually in R-Count.
    sb.from("invoices").select("id, order_id, external_id, status, total_amount").in("order_id", ids).eq("provider", "rcount_co").in("status", ["pending", "error"]).not("external_id", "is", null),
    sb.from("app_settings").select("value").eq("key", RCOUNT_SETTINGS_KEY).maybeSingle(),
    sb.from("rcount_sync_log").select("order_id, response, created_at").in("order_id", ids).eq("status", "sent").order("created_at", { ascending: false }),
  ]);
  const settings = normalizeRCountSettings(setting?.value);
  const url = settings.co.url?.replace(/\/+$/, "");
  const key = process.env["RWEAR_API_KEY"] ?? "";
  if (url && key) {
    await Promise.all((pending ?? []).map(async (invoice: any) => {
      if (!invoice.external_id) return;
      // A draft shared by several local invoices only belongs to one; never mark it issued twice.
      const { count: dupes } = await sb.from("invoices").select("id", { count: "exact", head: true })
        .eq("provider", "rcount_co").eq("external_id", invoice.external_id).neq("id", invoice.id);
      try {
        const log = (logs ?? []).find((entry: any) => entry.order_id === invoice.order_id) as any;
        let sentNumber: string | null = null;
        try {
          const sentBody = typeof log?.response?.body === "string" ? JSON.parse(log.response.body) : log?.response?.body;
          sentNumber = pickField(sentBody?.invoices?.[0], "numero_dian", "numero_factura", "number", "invoice_number");
        } catch { /* malformed historical response */ }
        let rows: any[] = [];
        for (const term of [invoice.external_id, sentNumber].filter(Boolean)) {
          const res = await fetch(`${url}/facturas/buscar?q=${encodeURIComponent(String(term))}`, { headers: { "x-rwear-key": key } });
          if (!res.ok) continue;
          const body: any = await res.json().catch(() => null);
          rows = Array.isArray(body) ? body : body?.data ?? body?.facturas ?? body?.invoices ?? body?.results ?? [];
          if (rows.length) break;
        }
        const remote = rows.find((row) => String(pickField(row, "external_id", "externalId") ?? "") === invoice.external_id) ?? rows[0];
        const status = String(pickField(remote, "status", "estado") ?? "").toLowerCase();
        const number = pickField(remote, "numero_dian", "numero_factura", "number", "invoice_number");
        const cufe = pickField(remote, "cufe", "CUFE");
        if (!remote || !number || (!cufe && !["emitida_dian", "emitida", "issued", "sent"].includes(status))) return;
        if (dupes) {
          const remoteTotal = Number(pickField(remote, "total", "valor_total", "total_amount", "monto_total"));
          if (!Number.isFinite(remoteTotal) || Math.abs(remoteTotal - Number(invoice.total_amount)) > 1) return;
        }
        const pdfUrl = pickField(remote, "pdf_url", "public_url", "url_pdf");
        await sb.from("invoices").update({
          status: "issued",
          number: String(number),
          cufe: cufe ? String(cufe) : null,
          pdf_url: pdfUrl ? String(pdfUrl) : null,
          issued_at: pickField(remote, "issued_at", "fecha_emision") ?? new Date().toISOString(),
          error: null,
          response: remote,
          updated_at: new Date().toISOString(),
        }).eq("id", invoice.id).eq("status", invoice.status);
      } catch {
        // Preserve the last known state while R-Count is unavailable.
      }
    }));
  }
  const { data } = await sb.from("invoices")
    .select("order_id, status, number, pdf_url, created_at")
    .in("order_id", ids)
    .order("created_at", { ascending: false });
  return data ?? [];
}

const PAYMENT_CODE: Record<string, string> = {
  credito_15: "1", credito_30: "1", credito_60: "1", efectivo: "10", datafono: "48", tarjeta: "48", link_pago: "48", wompi: "48", bold: "48", transferencia: "42", addi: "48", paguelofacil: "48", paypal: "48",
};
const DANE: Record<string, string> = { bogota: "11001", "bogotá": "11001", cali: "76001", medellin: "05001", "medellín": "05001" };

/** Enruta un pedido a R-Count (COP → Colombia, USD o B2B extranjero → Panamá).
 *  Si la entidad no está activa, factura directo con Factus / eFactura. */
export async function syncOrderBilling(orderId: string, trigger: Trigger, actorId: string | null, boxId: string | null = null, billingValueMode: "total" | "customs" = "total") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, number, currency, status, source, payment_method, payment_reference, payment_status, total_cop, total_usd:total_usd_exact, subtotal_cop, discount_cop, shipping_cop, tax_included_cop, tax_rate, contact_name, contact_email, contact_phone, ship_to, buyer_country, customer_id, b2b_mode, b2b_payment_method, notes, created_at, paid_at, sold_by_location_id, pos_session_id, invoice_requested, invoice_name, invoice_document, invoice_email, return_credit_cop, return_id, billing_currency, fx_cop_per_cad, shipping_cad, total_cad, order_items(qty, unit_price_cop, unit_price_cad, list_price_cop, product_name, variant_label, product_variants(sku))")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) throw new Error("Pedido no encontrado");
  const o = order as any;
  // Factura por caja (B2B): solo las prendas de la caja, descuento proporcional, sin envío.
  if (boxId) {
    const { data: box, error: boxError } = await supabaseAdmin.from("b2b_boxes").select("id, order_id, box_number, billing_value_mode, discount_pct").eq("id", boxId).eq("order_id", orderId).maybeSingle();
    if (boxError || !box) throw new Error("Caja no encontrada en este pedido");
    if (o.b2b_mode === "consignment") return { ok: false, message: "Las cajas en consignación no generan factura de venta." };
    if (o.billing_currency === "CAD") return { ok: false, message: "Los pedidos en CAD se facturan completos, no por caja." };
    const { data: already, error: invoiceError } = await supabaseAdmin.from("invoices").select("id, status, external_id").eq("box_id", boxId).maybeSingle();
    if (invoiceError) throw new Error("No se pudo consultar la factura de esta caja");
    if (already?.external_id) {
      await reconcileRCountInvoices([orderId]);
      return { ok: true, message: "Esta caja ya fue enviada a R-Count; se consultó su factura sin duplicar el envío." };
    }
    const { data: bis, error: itemsError } = await (supabaseAdmin as any).from("b2b_box_items")
      .select("qty, location_id, customs_invoice_value, order_items(unit_price_cop, list_price_cop, product_name, variant_label, product_variants(sku))").eq("box_id", boxId);
    if (itemsError || !bis?.length) throw new Error("No se pudieron consultar las prendas de la caja");
    const fullGross = (o.order_items ?? []).reduce((s: number, i: any) => s + i.qty * Number(i.unit_price_cop), 0);
    o.order_items = (bis ?? []).map((b: any) => ({ ...b.order_items, qty: b.qty, fulfill_location_id: b.location_id }));
    const boxGross = o.order_items.reduce((s: number, i: any) => s + i.qty * Number(i.unit_price_cop), 0);
    const boxF = 1 - Math.min(90, Math.max(0, Number((box as any).discount_pct ?? 0))) / 100;
    const orderDisc = fullGross > 0 ? Number(o.discount_cop ?? 0) * boxGross / fullGross : 0;
    o.discount_cop = Math.round(boxGross - (boxGross - orderDisc) * boxF);
    o.total_usd = fullGross > 0 ? Number(o.total_usd ?? 0) * boxGross / fullGross * boxF : 0;
    o.subtotal_cop = boxGross;
    o.shipping_cop = 0;
    o.total_cop = boxGross - o.discount_cop;
    o.__box_id = boxId;
    o.__box_number = box.box_number;
    o.__commercial_total_cop = o.total_cop;
    o.__billing_value_mode = billingValueMode;
    if (billingValueMode === "customs") {
      if ((bis ?? []).some((item: any) => item.customs_invoice_value == null)) throw new Error("Completa el valor de aduanas de todos los productos de la caja");
      const commercialCurrencyTotal = String(o.currency).toUpperCase() === "USD" ? Number(o.total_usd ?? 0) : Number(o.total_cop ?? 0);
      const customsCurrencyTotal = (bis ?? []).reduce((sum: number, item: any) => sum + Number(item.customs_invoice_value ?? 0), 0);
      if (customsCurrencyTotal < 0 || customsCurrencyTotal > commercialCurrencyTotal + 0.01) throw new Error("El valor de aduanas debe estar entre cero y el valor total de la caja");
      const customsCopTotal = String(o.currency).toUpperCase() === "USD" && commercialCurrencyTotal > 0
        ? Math.round(customsCurrencyTotal * Number(o.total_cop ?? 0) / commercialCurrencyTotal)
        : Math.round(customsCurrencyTotal);
      const rawCustomsTotal = customsCurrencyTotal || 1;
      let assignedCop = 0;
      o.order_items = o.order_items.map((item: any, index: number) => {
        const raw = Number((bis ?? [])[index]?.customs_invoice_value ?? 0);
        const targetCop = index === o.order_items.length - 1 ? customsCopTotal - assignedCop : Math.round(customsCopTotal * raw / rawCustomsTotal);
        assignedCop += targetCop;
        return { ...item, __customs_total_cop: targetCop };
      });
      o.discount_cop = 0;
      o.subtotal_cop = customsCopTotal;
      o.total_cop = customsCopTotal;
      o.total_usd = String(o.currency).toUpperCase() === "USD" ? customsCurrencyTotal : o.total_usd;
    }
    await supabaseAdmin.from("b2b_boxes").update({ billing_value_mode: billingValueMode }).eq("id", boxId);
  }
  // Un reenvío manual nunca debe duplicar una factura ya creada en R-Count.
  if (trigger === "manual") {
    const { data: already } = await supabaseAdmin
      .from("rcount_sync_log")
      .select("id")
      .eq("order_id", orderId)
      .eq("status", "sent")
      .limit(1)
      .maybeSingle();
    if (already) {
      const invoices = await reconcileRCountInvoices([orderId]);
      const issued = invoices.find((invoice) => invoice.order_id === orderId && invoice.status === "issued");
      return { ok: true, message: issued?.number ? `Factura ${issued.number} sincronizada desde R-Count.` : "Este pedido ya tiene factura en R-Count; no se reenvió para evitar duplicados." };
    }
  }
  // Una venta de caja (POS) nunca es B2B, aunque tenga clienta asociada.
  // Los pedidos web y POS nunca son B2B (b2b_mode trae 'direct' por defecto en todos los pedidos).
  const isB2B = o.source === "assisted" && !!(o.customer_id && o.b2b_mode);
  const country = o.buyer_country ?? o.ship_to?.country ?? null;
  const { data: setting } = await supabaseAdmin.from("app_settings").select("value").eq("key", RCOUNT_SETTINGS_KEY).maybeSingle();
  const settings = normalizeRCountSettings(setting?.value);
  // Todo entra por R-Count Colombia con destination_country; R-Count decide si
  // factura a la clienta o a la sociedad de Panamá. Panamá solo es respaldo.
  const entity = settings.co.enabled && settings.co.url
    ? "co"
    : isB2B ? (isColombia(country) && (o.currency ?? "COP").toUpperCase() !== "USD" ? "co" : "pa") : entityForCurrency(o.currency);
  const { data: keyRow } = await supabaseAdmin.from("integration_secrets").select("value").eq("key", `rcount_${entity}_key`).maybeSingle();
  const cfg = settings[entity];
  if (boxId && (entity !== "co" || !cfg.enabled || !cfg.url)) {
    return { ok: false, message: "Configura R-Count Colombia para facturar esta caja; no se enviará la factura del pedido completo." };
  }

  if (!cfg.enabled || !cfg.url) {
    const { issueInvoiceCore } = await import("@/lib/billing/issue.server");
    let res: { ok: boolean; message: string };
    try { res = await issueInvoiceCore(orderId, actorId); } catch (e) { res = { ok: false, message: e instanceof Error ? e.message : "Error" }; }
    await supabaseAdmin.from("rcount_sync_log").insert({
      order_id: orderId, entity, trigger, target: "direct", status: res.ok ? "sent" : "skipped",
      response: res as any, created_by: actorId,
    } as any);
    return { ok: res.ok, message: res.message };
  }

  if (entity === "co") {
    // Un solo envío a la vez por pedido/caja: el envío al pagar y el reintento
    // automático corrían en paralelo y R-Count emitía dos facturas DIAN.
    const lockKey = `${orderId}:${boxId ?? "order"}`;
    const { data: claimed } = await (supabaseAdmin as any).rpc("claim_rcount_send", { _key: lockKey });
    if (!claimed) return { ok: true, message: "Este pedido ya se está enviando a R-Count; no se reenvió para evitar duplicados." };
    try {
      if (!boxId) {
        const { data: sentRows } = await supabaseAdmin.from("rcount_sync_log").select("request").eq("order_id", orderId).eq("status", "sent").limit(20);
        const already = (sentRows ?? []).some((r: any) => !String(r.request?.batch_id ?? "").endsWith("-caja"));
        if (already) return { ok: true, message: "Este pedido ya tiene factura en R-Count; no se reenvió para evitar duplicados." };
        // Toda factura debe llevar todas las prendas del pedido (más el envío):
        // al marcarse pagado, las prendas pueden no verse aún y se facturaba solo el envío.
        const itemSel = "qty, unit_price_cop, unit_price_usd, unit_price_cad, list_price_cop, product_name, variant_label, fulfill_location_id, product_variants(sku)";
        let fresh: any[] = [];
        for (let i = 0; i < 3; i++) {
          const { data: rows } = await (supabaseAdmin as any).from("order_items").select(itemSel).eq("order_id", orderId);
          fresh = rows ?? [];
          if (fresh.length) break;
          await new Promise((r) => setTimeout(r, 2500));
        }
        const gross = fresh.reduce((s, i) => s + Number(i.qty) * Number(i.unit_price_cop), 0);
        const expected = gross - Number(o.discount_cop ?? 0) + Number(o.shipping_cop ?? 0);
        const noSku = fresh.some((i) => !i.product_variants?.sku);
        const totalOff = o.billing_currency !== "CAD" && String(o.currency ?? "COP").toUpperCase() !== "USD" && !o.return_id && Math.abs(expected - Number(o.total_cop ?? 0)) > 1;
        if (!fresh.length || noSku || totalOff) {
          const msg = !fresh.length ? "Factura incompleta: el pedido aún no tiene prendas" : noSku ? "Factura incompleta: hay prendas sin SKU" : "Factura incompleta: las prendas más el envío no suman el total pagado";
          await supabaseAdmin.from("rcount_sync_log").insert({ order_id: orderId, entity: "co", trigger, target: "rcount", status: "skipped", response: { error: msg }, created_by: actorId } as any);
          return { ok: false, message: `${msg}; no se envió a R-Count.` };
        }
        o.order_items = fresh;
      }
      return await sendColombia(supabaseAdmin, o, isB2B, settings, cfg.url, trigger, actorId);
    } finally {
      await (supabaseAdmin as any).from("rcount_send_locks").delete().eq("lock_key", lockKey);
    }
  }

  const payload = {
    event: trigger === "dispatch" ? "order.dispatched" : "order.paid",
    entity,
    order: {
      id: o.id,
      number: o.number,
      channel: isB2B ? (o.source === "assisted" ? "b2b" : o.source) : o.source,
      b2b_mode: o.b2b_mode,
      currency: entity === "pa" ? "USD" : "COP",
      total: entity === "pa" ? o.total_usd : o.total_cop,
      total_cop: o.total_cop,
      shipping_cop: o.shipping_cop,
      tax_included_cop: o.tax_included_cop,
      tax_rate: o.tax_rate,
      taxes_included: true,
      payment: { method: o.payment_method, reference: o.payment_reference, status: o.payment_status, paid_at: o.paid_at },
      customer: { name: o.contact_name, email: o.contact_email, phone: o.contact_phone, country: o.buyer_country, ship_to: o.ship_to },
      lines: (o.order_items ?? []).map((i: any) => ({
        sku: i.product_variants?.sku ?? null,
        name: i.product_name,
        variant: i.variant_label,
        qty: i.qty,
        unit_price_cop: i.unit_price_cop,
      })),
      created_at: o.created_at,
    },
  };
  const body = JSON.stringify(payload);
  const key = String(keyRow?.value ?? "");
  const signature = key ? createHmac("sha256", key).update(body).digest("hex") : "";

  let status = "error";
  let response: any = null;
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}`, "X-Signature": signature } : {}),
        "Idempotency-Key": `${o.id}:${trigger}`,
      },
      body,
    });
    const text = await res.text();
    response = { status: res.status, body: text.slice(0, 4000) };
    status = res.ok ? "sent" : "error";
  } catch (e) {
    response = { error: e instanceof Error ? e.message : String(e) };
  }
  await supabaseAdmin.from("rcount_sync_log").insert({
    order_id: orderId, entity, trigger, target: "rcount", status, request: payload as any, response, created_by: actorId,
  } as any);
  return { ok: status === "sent", message: status === "sent" ? "Enviado a R-Count" : "R-Count respondió con error" };
}

async function sendColombia(sb: any, o: any, isB2B: boolean, settings: RCountSettings, url: string, trigger: Trigger, actorId: string | null) {
  let locationId: string | null = o.sold_by_location_id ?? null;
  if (!locationId && o.pos_session_id) {
    const { data: s } = await sb.from("pos_sessions").select("location_id").eq("id", o.pos_session_id).maybeSingle();
    locationId = s?.location_id ?? null;
  }
  if (!locationId && o.source === "pos") {
    const { data: fi } = await sb.from("order_items").select("fulfill_location_id").eq("order_id", o.id).not("fulfill_location_id", "is", null).limit(1).maybeSingle();
    locationId = (fi as any)?.fulfill_location_id ?? null;
  }
  let locCode: string | null = null;
  let locCenter: string | null = null;
  if (locationId) {
    const { data: l } = await sb.from("locations").select("code, rcount_center").eq("id", locationId).maybeSingle();
    locCode = l?.code ?? null;
    locCenter = (l as any)?.rcount_center ?? null;
  }
  const centerKey = isB2B ? "b2b" : o.source === "pos" ? (locCode === "bogota" ? "bogota" : locCode === "cali" ? "cali" : "web") : o.source === "assisted" ? "assisted" : "web";
  // Si la bodega tiene centro propio configurado, manda sobre el del canal.
  const center = locCenter || settings.centers[centerKey as keyof typeof settings.centers];

  // Regla: toda factura a R-Count usa la información de facturación guardada
  // de la clienta (perfil + dirección de facturación). Si falta, no se envía.
  // Única excepción: venta POS sin clienta asociada → Consumidor Final.
  const destCountry = destinationCountry(o);
  let customer: any;
  let docClean = "";
  // POS «Con datos / NIT»: aunque la clienta aún no esté vinculada al pedido
  // (se vincula después del cobro), la factura usa los datos digitados.
  const posWithData = o.source === "pos" && o.invoice_requested && String(o.invoice_document ?? "").trim();
  if (o.customer_id || o.source !== "pos" || posWithData) {
    // Prioridad: facturación guardada en el pedido → dirección de facturación de
    // la clienta → otra dirección guardada → datos capturados en el checkout.
    const [{ data: p }, { data: billRow }, { data: anyRow }] = o.customer_id
      ? await Promise.all([
          sb.from("profiles").select("full_name, document_id, phone").eq("id", o.customer_id).maybeSingle(),
          sb.from("addresses").select("recipient, line1, line2, city, department, country, postal_code, email, phone").eq("user_id", o.customer_id).eq("purpose", "billing").order("is_default", { ascending: false }).limit(1).maybeSingle(),
          sb.from("addresses").select("recipient, line1, line2, city, department, country, postal_code, email, phone").eq("user_id", o.customer_id).order("is_default", { ascending: false }).limit(1).maybeSingle(),
        ])
      : [{ data: null }, { data: null }, { data: null }] as any[];
    const st: any = o.ship_to ?? {};
    const snap: any = st.billing ?? null;
    const pick = (...vals: any[]) => vals.map((v) => String(v ?? "").trim()).find(Boolean) ?? "";
    const addrSrc: any = [snap, billRow, anyRow, st].find((a: any) => a && pick(a.line1) && pick(a.city)) ?? snap ?? billRow ?? anyRow ?? st;
    let bill: any = {
      recipient: pick(snap?.recipient, snap?.name, billRow?.recipient, p?.full_name, o.contact_name, st.recipient),
      line1: pick(addrSrc?.line1),
      line2: pick(addrSrc?.line2) || null,
      city: pick(addrSrc?.city),
      department: pick(addrSrc?.department),
      country: pick(addrSrc?.country, st.country, o.buyer_country),
      postal_code: pick(addrSrc?.postal_code),
      email: pick(snap?.email, billRow?.email, o.contact_email, st.email, anyRow?.email),
      phone: pick(snap?.phone, billRow?.phone, p?.phone, o.contact_phone, st.phone),
    };
    // POS: si la clienta no tiene dirección, se usa la de la tienda.
    if (o.source === "pos" && (!bill.line1 || !bill.city)) {
      const { data: sp } = locationId ? await sb.from("store_profiles").select("address, city").eq("location_id", locationId).maybeSingle() : { data: null };
      bill = { ...bill, line1: sp?.address ?? "Tienda Tu Marca", line2: null, city: sp?.city ?? (locCode === "cali" ? "Cali" : "Bogotá"), country: bill.country || "Colombia" };
    }
    // Los pedidos manuales guardan el documento en ship_to.identification.
    docClean = pick(snap?.document_id, p?.document_id, o.invoice_document, st.document_id, st.identification).replace(/[^0-9A-Za-z]/g, "");
    const missing = [
      !docClean && "documento",
      !bill.recipient && "nombre",
      !bill.email && o.source !== "pos" && "correo",
      !bill.line1 && "dirección",
      !bill.city && "ciudad",
      !bill.country && "país",
    ].filter(Boolean);
    if (missing.length) {
      const msg = `Falta información de facturación (${missing.join(", ")})`;
      await sb.from("rcount_sync_log").insert({ order_id: o.id, entity: "co", trigger, target: "rcount", status: "skipped", response: { error: msg }, created_by: actorId });
      return { ok: false, message: `${msg}; complétala en la tarjeta del cliente del pedido → Facturación y reenvía.` };
    }
    const dane = DANE[String(bill.city).toLowerCase().trim()] ?? "11001";
    customer = {
      // R-Count espera PP para pasaporte y lo convierte a DIAN 41 (PA es país Panamá).
      document_type: rcountDocumentType(docClean, Boolean(isB2B || o.invoice_requested)),
      document_number: docClean,
      name: bill.recipient,
      email: bill.email,
      dane_city_code: dane,
      phone: bill.phone,
      address: [bill.line1, bill.line2].filter(Boolean).join(" "),
      city: bill.city,
      department: bill.department ?? "",
      postal_code: bill.postal_code ?? "",
      country: bill.country,
    };
  } else {
    let city: string | null = locCode === "bogota" || locCode === "cali" ? locCode : null;
    const dane = DANE[(city ?? "").toLowerCase().trim()] ?? "11001";
    customer = { document_type: "CC", document_number: "222222222222", name: "Consumidor Final", email: o.contact_email ?? "", dane_city_code: dane, phone: o.contact_phone ?? "", address: "", city: city ?? "", country: "Colombia" };
  }

  // El precio de la factura es SIEMPRE el que el Hub cobró (unit_price_cop del
  // pedido), nunca el precio que el ítem tenga registrado en R-Count. Los
  // puntos y las ofertas viajan como discount_rate (%): unit_price sale con el
  // precio base (con IVA, antes del descuento) y el % por línea deja el neto
  // exactamente en lo que el Hub cobró.
  // Bodega real de salida por línea: R-Count no ve traslados internos, así que
  // cada línea le dice de dónde salió la unidad para descontarla y costearla.
  const fulfillIds = [...new Set((o.order_items ?? []).map((i: any) => i.fulfill_location_id).filter(Boolean))] as string[];
  const bodegaById = new Map<string, string>();
  if (fulfillIds.length) {
    const { data: ls } = await sb.from("locations").select("id, code").in("id", fulfillIds);
    for (const l of ls ?? []) bodegaById.set(l.id, l.code);
  }
  // Internacional = destino fuera de Colombia, incluida Panamá: también cobra
  // en dólares y R-Count crea al cliente como Tercero Extranjero con
  // identificación, país y ciudad.
  const norm = (v: string | null | undefined) => String(v ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const isInternational = !!destCountry && !["colombia", "co"].includes(norm(destCountry));
  if (isInternational) {
    const missing = [!docClean && "identificación", !destCountry && "país", !String(o.ship_to?.city ?? "").trim() && "ciudad"].filter(Boolean);
    if (missing.length) {
      const msg = `Pedido internacional sin ${missing.join(", ")} del cliente`;
      await sb.from("rcount_sync_log").insert({ order_id: o.id, entity: "co", trigger, target: "rcount", status: "skipped", response: { error: msg }, created_by: actorId });
      return { ok: false, message: `${msg}; complétalo en «Editar cliente» y reenvía.` };
    }
  }
  const items: any[] = (o.order_items ?? []).map((i: any) => ({
    sku: i.product_variants?.sku ?? "",
    description: [i.product_name, i.variant_label].filter(Boolean).join(" "),
    quantity: i.qty,
    unit_price: o.__billing_value_mode === "customs" ? Number(i.__customs_total_cop ?? 0) / (Number(i.qty) || 1) : i.unit_price_cop,
    discount_rate: 0,
    tax_rate: 19,
    bodega_codigo: (i.fulfill_location_id && bodegaById.get(i.fulfill_location_id)) || locCode || null,
  }));
  const gross = items.reduce((s, i) => s + i.quantity * i.unit_price, 0);
  const discount = Number(o.discount_cop ?? 0);
  // Puntos y descuentos generales se reparten por igual sobre las líneas.
  // La DIAN solo acepta % por línea, así que el valor fijo en pesos se
  // convierte a % con 4 decimales y la última línea absorbe el redondeo:
  // la suma de las líneas queda exactamente igual a lo que el Hub cobró.
  const ptsRate = gross > 0 && discount > 0 ? Math.min(1, discount / gross) : 0;
  const targetTotal = Math.round(gross - Math.min(discount, gross));
  let accTotal = 0;
  for (let k = 0; k < items.length; k++) {
    const src = o.order_items[k];
    if (o.__billing_value_mode === "customs") {
      items[k].discount_rate = 0;
      continue;
    }
    const base = Number(src.list_price_cop ?? 0) > Number(src.unit_price_cop) ? Number(src.list_price_cop) : Number(src.unit_price_cop);
    items[k].unit_price = base;
    const qty = Number(src.qty ?? 1) || 1;
    const isLast = k === items.length - 1;
    const net = isLast
      ? Math.round((targetTotal - accTotal) / qty)
      : Math.round(Number(src.unit_price_cop) * (1 - ptsRate));
    accTotal += net * qty;
    items[k].discount_rate = base > 0 && net < base ? Math.min(100, Math.max(0, Math.round((1 - net / base) * 1e6) / 1e4)) : 0;
  }
  if (Number(o.shipping_cop ?? 0) > 0) items.push({ sku: "ENVIO", description: "Envío", quantity: 1, unit_price: Number(o.shipping_cop), discount_rate: 0, tax_rate: 19 });

  // Ventas en dólares: R-Count recibe la factura en US$ tal cual se cobró.
  // Cada línea usa su propio precio en dólares (unit_price_usd); si no lo
  // tiene, se usa la tasa del pedido (total_usd / total_cop). Los % de
  // descuento no cambian con la moneda.
  // Ventas al exterior (incluida Panamá) van SIEMPRE en dólares: R-Count aplica la TRM.
  // Pedidos B2B en dólares canadienses: precios digitados en CAD, sin convertir; R-Count aplica la tasa.
  const isCad = o.billing_currency === "CAD";
  let cadTotal = 0;
  if (isCad) {
    const cad = buildCadInvoice((o.order_items ?? []).map((i: any, k: number) => ({ sku: items[k]?.sku ?? "", description: items[k]?.description, quantity: Number(i.qty), unit_price_cad: i.unit_price_cad, bodega_codigo: items[k]?.bodega_codigo })), Number(o.shipping_cad ?? 0), o.fx_cop_per_cad);
    const totalErr = !cad.error && o.total_cad != null && Math.abs(Number(o.total_cad) - cad.total) > 0.01 ? `Las líneas más el envío suman CA$${cad.total.toFixed(2)} y el pedido es de CA$${Number(o.total_cad).toFixed(2)}` : null;
    const err = cad.error ?? totalErr;
    if (err) {
      await sb.from("rcount_sync_log").insert({ order_id: o.id, entity: "co", trigger, target: "rcount", status: "skipped", response: { error: err }, created_by: actorId });
      return { ok: false, message: `${err}. No se envió a R-Count; corrígelo en «Moneda CAD» del pedido.` };
    }
    items.splice(0, items.length, ...cad.items);
    cadTotal = cad.total;
  }
  const isUsd = !isCad && (isInternational || String(o.currency ?? "COP").toUpperCase() === "USD");
  const orderRate = Number(o.total_cop ?? 0) > 0 && Number(o.total_usd ?? 0) > 0 ? Number(o.total_usd) / Number(o.total_cop) : 0;
  if (isUsd) {
    if (!orderRate) {
      await sb.from("rcount_sync_log").insert({ order_id: o.id, entity: "co", trigger, target: "rcount", status: "skipped", response: { error: "Pedido al exterior sin total en dólares" }, created_by: actorId });
      return { ok: false, message: "Pedido al exterior sin total en dólares; revísalo antes de facturar." };
    }
    for (let k = 0; k < items.length; k++) {
      const src = o.order_items?.[k];
      const lineRate = src && o.__billing_value_mode !== "customs" && Number(src.unit_price_usd) > 0 && Number(src.unit_price_cop) > 0
        ? Number(src.unit_price_usd) / Number(src.unit_price_cop)
        : orderRate;
      items[k].unit_price = Math.round(Number(items[k].unit_price) * lineRate * 100) / 100;
    }
    // El envío en dólares es lo cobrado menos las prendas (la tarifa US$ no sale de convertir pesos).
    const ship = items.find((i) => i.sku === "ENVIO");
    if (ship && o.__billing_value_mode !== "customs") {
      const rest = items.filter((i) => i !== ship).reduce((s, i) => s + i.quantity * i.unit_price * (1 - (i.discount_rate ?? 0) / 100), 0);
      const usdShip = Math.round((Number(o.total_usd) - rest) * 100) / 100;
      if (usdShip > 0) ship.unit_price = usdShip;
    }
  }

  // Consecutivo real de facturación, uno por centro: el mismo número que se
  // envía a R-Count es el que Factus/DIAN devuelve. Se configura aquí (Ajustes
  // → R-Count) con el rango que cada centro tenga allá, y avanza solo cuando
  // el envío sale bien.
  const cKey = centerKey as RCountCenterKey;
  const label = centerLabel(cKey);
  let next = settings.co.consecutive[cKey];
  if (!next) {
    await sb.from("rcount_sync_log").insert({ order_id: o.id, entity: "co", trigger, target: "rcount", status: "skipped", response: { error: `Falta configurar el consecutivo de ${label}` }, created_by: actorId });
    return { ok: false, message: `Configura el consecutivo de ${label} en Ajustes → R-Count` };
  }
  // Cajas de un mismo pedido se despachan casi a la vez: cada una reserva su
  // propio consecutivo de forma atómica antes de enviar, para no repetir número.
  if (o.__box_id) {
    const { data: reserved }: { data: unknown } = await (sb as any).rpc("reserve_rcount_consecutive", { _center: cKey, _min: next });
    if (Number.isFinite(Number(reserved)) && Number(reserved) >= Number(next)) next = Number(reserved);
  }
  // El ID externo debe ser único entre centros: cada centro tiene su propio
  // rango y dos tiendas pueden llegar al mismo número (Cali 14 y Bogotá 14).
  // Si se repite, R-Count devuelve la factura de la otra tienda como duplicada.
  let externalId = `${String(center ?? "1").trim()}-${next}`;
  // R-Count trabaja con una sola bodega (Bodega Global 01) para todo el
  // inventario; sus centros de operación usan los códigos literales 1–5.
  // El centro define la resolución DIAN, el municipio y la cuenta de pago.
  const opCode = String(center ?? "1").trim();
  // Mayoristas: el medio de pago elegido en el pedido define la cuenta, igual que POS/online.
  // Online: "card" no dice la pasarela; se toma la real (Addi, PayPal, Bold) del intento de pago.
  let gateway: string | null = null;
  if (!isB2B && o.payment_reference) {
    const { data: pa } = await sb.from("payment_attempts").select("provider").eq("reference", o.payment_reference).maybeSingle();
    gateway = (pa as any)?.provider ?? null;
  }
  const payKey = resolvePayKey((isB2B && o.b2b_payment_method) || o.payment_method, gateway);
  const creditDays = payKey === "credito_15" ? 15 : payKey === "credito_30" ? 30 : payKey === "credito_60" ? 60 : 0;
  const issueDate = String(o.paid_at ?? o.created_at ?? new Date().toISOString()).slice(0, 10);
  // Pago mixto en POS (2 medios en una misma venta): el reparto queda en
  // pos_sales (una fila por medio). R-Count recibe el arreglo `payments` con
  // método, valor y cuenta de caja/banco de cada uno; ante la DIAN envía el
  // de mayor valor y en contabilidad debita cada cuenta por su valor exacto.
  // La suma debe ser igual al total de la factura o R-Count la rechaza.
  let mixedPayments: { method: string; amount: number; account: string | null }[] | null = null;
  if (o.source === "pos" && !creditDays) {
    const { data: pays } = await sb.from("pos_sales").select("method, amount_cop").eq("order_id", o.id);
    const rows = (pays ?? []).filter((r: any) => r.method && Number(r.amount_cop) > 0);
    const distinct = new Set(rows.map((r: any) => payMethodKey(r.method)));
    if (rows.length > 1 && distinct.size > 1) {
      mixedPayments = rows.map((r: any) => {
        const mk = payMethodKey(r.method);
        return { method: mk, amount: Number(r.amount_cop), account: settings.accounts[`${center}:${mk}`] || null };
      });
    }
  }
  if (isUsd && mixedPayments) mixedPayments = splitPaymentsUsd(mixedPayments, Number(o.total_usd));
  if (isUsd) {
    const usdError = validateUsdInvoice(items, mixedPayments, Number(o.total_usd));
    if (usdError) {
      await sb.from("rcount_sync_log").insert({ order_id: o.id, entity: "co", trigger, target: "rcount", status: "skipped", response: { error: usdError }, created_by: actorId });
      return { ok: false, message: `${usdError}. No se envió a R-Count; corrige los precios en dólares y reenvía.` };
    }
  }
  const paymentFields = {
    payment_form: creditDays ? "2" : "1",
    payment_method_code: PAYMENT_CODE[payKey] ?? "1",
    ...(creditDays ? { credit_days: creditDays, payment_due_date: new Date(new Date(issueDate + "T12:00:00").getTime() + creditDays * 86400000).toISOString().slice(0, 10) } : {}),
    // Cuenta de caja/banco/cartera a la que R-Count lleva el pago (centro + método).
    metodo_pago: payKey && payKey !== "otro" ? payKey : null,
    cuenta_pago: (payKey && settings.accounts[`${center}:${payKey}`]) || null,
    ...(mixedPayments ? { payments: mixedPayments } : {}),
  };
  const invoice = {
    external_id: externalId,
    // Número de pedido del Hub (TM-WEB-…, B2B-…) siempre, para cruzar la factura con el pedido.
    // R-Count descarta como duplicada otra factura con el mismo número de pedido:
    // cada caja a partir de la 2 se identifica como B2B-16-C2, B2B-16-C3…
    order_number: o.__box_id && Number(o.__box_number) > 1 ? `${o.number}-C${o.__box_number}` : o.number,
    numero_pedido: o.__box_id && Number(o.__box_number) > 1 ? `${o.number}-C${o.__box_number}` : o.number,
    ...(o.__box_id ? { box_id: o.__box_id, box_number: o.__box_number, order_currency: o.currency, box_total_usd: o.total_usd, box_total_cop: o.total_cop, billing_value_mode: o.__billing_value_mode ?? "total", commercial_total_cop: o.__commercial_total_cop ?? o.total_cop } : {}),
    consecutive: next,
    // R-Count solo acepta pos, online o manual; mayoristas y asistidos van como manual.
    channel: o.source === "pos" ? "pos" : o.source === "ecom" ? "online" : "manual",
    operation_center_code: opCode,
    warehouse_code: "Bodega Global 01",
    centro_operacion_codigo: center,
    destination_country: destCountry,
    currency: isCad ? "CAD" : isUsd ? "USD" : "COP",
    moneda: isCad ? "CAD" : isUsd ? "USD" : "COP",
    ...(isCad ? { trm: Number(o.fx_cop_per_cad), exchange_rate: Number(o.fx_cop_per_cad), total_cad: cadTotal, total: cadTotal } : {}),
    ...(isUsd ? { exchange_rate: Math.round((1 / orderRate) * 100) / 100, trm: Math.round((1 / orderRate) * 100) / 100, total_usd: Number(o.total_usd) } : {}),
    ...(isInternational || isCad ? { incoterm: isB2B ? "FOB" : "DDP" } : {}),
    issue_date: String(o.paid_at ?? o.created_at ?? new Date().toISOString()).slice(0, 10),
    ...paymentFields,
    // Cambio por devolución: se paga con el saldo a favor y se cruza con la
    // nota crédito (mismo external_id de la devolución); el excedente, con metodo_pago.
    ...(o.return_id ? {
      payment_channel: "saldo_favor",
      credit_note_external_id: returnExternalId(o.return_id),
      saldo_a_favor_cop: Number(o.return_credit_cop ?? 0) || 0,
    } : {}),
    customer,
    items,
  };
  const payload = { type: "facturas_venta", batch_id: `hub-${externalId.toLowerCase()}-${trigger}${o.__box_id ? "-caja" : ""}`, data: { invoices: [invoice] } };
  const key = process.env["RWEAR_API_KEY"] ?? "";

  let status = "error";
  let response: any = null;
  let message = "R-Count respondió con error";
  // Envíos simultáneos pueden tomar el mismo consecutivo: si R-Count lo
  // rechaza por duplicado, se toma el siguiente libre y se reintenta (máx. 4).
  for (let attempt = 0; attempt < 4; attempt++) {
  status = "error"; message = "R-Count respondió con error";
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-rwear-key": key }, body: JSON.stringify(payload) });
    const text = await res.text();
    response = { status: res.status, body: text.slice(0, 4000) };
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* texto plano */ }
    const rejected = parsed?.rejected ?? parsed?.errors ?? parsed?.data?.rejected;
    const firstReject = Array.isArray(rejected) && rejected.length ? rejected[0] : null;
    const inv0 = parsed?.invoices?.[0];
    const dup = parsed?.idempotent_replay === true || inv0?.status === "duplicada" || (inv0?.external_id && String(inv0.external_id) !== externalId);
    if (res.ok && !firstReject && dup) { message = "R-Count tomó esta factura como repetida de otra; no quedó creada."; response.error = message; }
    else if (res.ok && !firstReject) { status = "sent"; message = "Enviado a R-Count"; }
    else if (firstReject) {
      message = `R-Count rechazó la factura: ${firstReject.reason ?? firstReject.error ?? firstReject.message ?? JSON.stringify(firstReject)}`;
      response.error = message;
    }
  } catch (e) {
    response = { error: e instanceof Error ? e.message : String(e) };
  }
  if (status === "sent" || !/duplicate key|facturas_electronicas_source_external_uidx/i.test(message)) break;
  await sb.from("rcount_sync_log").insert({ order_id: o.id, entity: "co", trigger, target: "rcount", status, request: payload, response, created_by: actorId });
  const { data: bumped }: { data: unknown } = await (sb as any).rpc("advance_rcount_consecutive", { _center: cKey, _used: next });
  const fresh: number = Number(bumped);
  if (!Number.isFinite(fresh) || fresh <= Number(next)) break;
  next = fresh;
  externalId = `${String(center ?? "1").trim()}-${next}`;
  (invoice as any).external_id = externalId;
  (invoice as any).consecutive = next;
  (payload as any).batch_id = `hub-${externalId.toLowerCase()}-${trigger}${o.__box_id ? "-caja" : ""}`;
  }
  await sb.from("rcount_sync_log").insert({ order_id: o.id, entity: "co", trigger, target: "rcount", status, request: payload, response, created_by: actorId });

  if (status === "sent") {
    // Avanza el consecutivo solo si la factura salió bien, de forma atómica y nunca hacia atrás.
    await (sb as any).rpc("advance_rcount_consecutive", { _center: cKey, _used: next });
    // R-Count puede crear la factura y aun así fallar el envío a la DIAN (lo avisa en warnings).
    let dianError: string | null = null;
    let issued: { number: string; cufe: string | null; pdf_url: string | null } | null = null;
    try {
      const body = JSON.parse(response?.body ?? "{}");
      const inv0 = body?.invoices?.[0];
      // Solo se acepta si la factura devuelta es la de este pedido (mismo ID externo).
      const sameInvoice = !inv0?.external_id || String(inv0.external_id) === externalId;
      if (inv0?.status === "emitida_dian" && inv0?.numero_dian && sameInvoice) {
        const cufe = inv0.cufe ? String(inv0.cufe) : null;
        issued = {
          number: String(inv0.numero_dian),
          cufe,
          pdf_url: inv0.pdf_url ?? inv0.public_url ?? (cufe ? `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${cufe}` : null),
        };
      }
      if (inv0?.envio_dian === "fallo") {
        const w = (body?.warnings ?? []).find((x: string) => /DIAN/i.test(String(x)));
        dianError = w ? String(w).replace(/^Factura \d+ \([^)]*\):\s*/, "") : "R-Count no pudo enviar la factura a la DIAN";
      }
    } catch { /* sin detalle */ }
    if (dianError) message = `Enviado a R-Count, pero no a la DIAN: ${dianError}`;
    let exQ = sb.from("invoices").select("id, status").eq("order_id", o.id).eq("provider", "rcount_co");
    exQ = o.__box_id ? exQ.eq("box_id", o.__box_id) : exQ.is("box_id", null);
    const { data: existing } = await exQ.maybeSingle();
    const boxCol = o.__box_id ? { box_id: o.__box_id } : {};
    if (issued && !dianError) {
      const row = { external_id: externalId, payload, error: null, status: "issued", number: issued.number, cufe: issued.cufe, pdf_url: issued.pdf_url, issued_at: new Date().toISOString() };
      if (!existing) await sb.from("invoices").insert({ ...row, ...boxCol, order_id: o.id, provider: "rcount_co", currency: "COP", total_amount: o.total_cop ?? 0, commercial_total_amount: o.__commercial_total_cop ?? o.total_cop ?? 0, billing_value_mode: o.__billing_value_mode ?? null, created_by: actorId, environment: "live" });
      else if (existing.status !== "issued") await sb.from("invoices").update(row).eq("id", existing.id);
    } else if (!existing) {
      await sb.from("invoices").insert({ ...boxCol, order_id: o.id, provider: "rcount_co", currency: "COP", status: dianError ? "error" : "pending", error: dianError, external_id: externalId, total_amount: o.total_cop ?? 0, commercial_total_amount: o.__commercial_total_cop ?? o.total_cop ?? 0, billing_value_mode: o.__billing_value_mode ?? null, payload, created_by: actorId, environment: "live" });
    } else if (existing.status !== "issued") {
      await sb.from("invoices").update({ external_id: externalId, payload, error: dianError, status: dianError ? "error" : "pending" }).eq("id", existing.id);
    }
  }
  return { ok: status === "sent", message };
}

/** ID externo de una devolución en R-Count (único; cruza la nota con la factura del cambio). */
export function returnExternalId(returnId: string) {
  return `DEV-${String(returnId).slice(0, 8).toUpperCase()}`;
}

const REASON_MAP: Record<string, string> = { talla: "talla", decision: "decision_propia", defecto: "defecto" };
const baseSize = (s: string | null) => String(s ?? "").replace(/\s*[-–—·|]\s*Calidad\s+\S+\s*$/i, "").trim().toLowerCase();

/** Nota crédito (`notas_credito`) de una devolución. `withPayable` = resolución
 *  «reembolso» (R-Count registra la CxP a la clienta); si no, «cambio». */
export async function sendReturnCreditNote(returnId: string, withPayable: boolean, actorId: string | null) {
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const { data: r } = await (sb as any).from("returns")
    .select("id, order_id, location_id, items, reason, notes, orders(number, sold_by_location_id), locations(code, rcount_center)")
    .eq("id", returnId).maybeSingle();
  if (!r) throw new Error("Devolución no encontrada");
  const { data: setting } = await sb.from("app_settings").select("value").eq("key", RCOUNT_SETTINGS_KEY).maybeSingle();
  const settings = normalizeRCountSettings(setting?.value);
  if (!settings.co.enabled || !settings.co.url) return { ok: false, message: "R-Count Colombia no está activo" };
  const { data: inv } = await sb.from("invoices").select("number, external_id").eq("order_id", r.order_id).eq("provider", "rcount_co").maybeSingle();

  // Centro: el de la factura original (la nota se emite contra ella).
  let center: string | null = null;
  const locId = r.orders?.sold_by_location_id ?? null;
  if (locId) {
    const { data: l } = await (sb as any).from("locations").select("code, rcount_center").eq("id", locId).maybeSingle();
    center = l?.rcount_center || (l?.code === "cali" ? settings.centers.cali : l?.code === "bogota" ? settings.centers.bogota : null);
  }
  center = center || settings.centers.web || "1";

  const items = (r.items ?? []) as any[];
  const variantIds = items.map((i) => i.variant_id).filter(Boolean);
  const { data: vars } = variantIds.length
    ? await (sb as any).from("product_variants").select("id, sku, size, color, product_id").in("id", variantIds)
    : { data: [] };
  const byId = new Map<string, any>((vars ?? []).map((v: any) => [v.id, v]));
  const productIds = [...new Set((vars ?? []).map((v: any) => v.product_id))];
  const { data: cVars } = productIds.length
    ? await (sb as any).from("product_variants").select("sku, size, color, product_id").eq("quality", "Calidad C").in("product_id", productIds)
    : { data: [] };

  const lines = items.map((i) => {
    const v = byId.get(i.variant_id);
    const defect = i.condition === "defect";
    const c = defect && v ? (cVars ?? []).find((x: any) => x.product_id === v.product_id && (x.color ?? null) === (v.color ?? null) && baseSize(x.size) === baseSize(v.size)) : null;
    return {
      sku: v?.sku ?? i.sku ?? null,
      quantity: Number(i.qty),
      unit_price: Number(i.unit_price_cop),
      discount_rate: 0,
      reason: REASON_MAP[i.reason_code] ?? "decision_propia",
      condition: defect ? "defectuosa" : "buena",
      ...(defect ? { return_sku: c?.sku ?? null } : {}),
    };
  });

  const externalId = returnExternalId(r.id);
  const note: Record<string, unknown> = {
    external_id: externalId,
    // Cruce contra la factura original: el consecutivo que el Hub envió a
    // R-Count (invoices.external_id); el pedido solo como respaldo si aún no
    // existe factura.
    invoice_external_id: inv?.external_id ? String(inv.external_id) : r.orders?.number ?? null,
    ...(inv?.number ? { invoice_number: inv.number } : {}),
    operation_center_code: String(center).trim(),
    issue_date: new Date().toISOString().slice(0, 10),
    resolution: withPayable ? "reembolso" : "cambio",
    notes: [r.reason, r.notes, r.orders?.number ? `Pedido ${r.orders.number}` : null].filter(Boolean).join(" · "),
    lines,
  };
  const payload = { type: "notas_credito", batch_id: `nc-${externalId.toLowerCase()}`, data: { credit_notes: [note] } };
  let status = "error"; let response: any = null; let message = "R-Count no recibió la nota crédito";
  try {
    const res = await fetch(settings.co.url, { method: "POST", headers: { "Content-Type": "application/json", "x-rwear-key": process.env["RWEAR_API_KEY"] ?? "" }, body: JSON.stringify(payload) });
    const text = await res.text();
    response = { status: res.status, body: text.slice(0, 4000) };
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* texto plano */ }
    const rejected = parsed?.rejected ?? parsed?.errors ?? parsed?.data?.rejected;
    const first = Array.isArray(rejected) && rejected.length ? rejected[0] : null;
    if (res.ok && !first) { status = "sent"; message = "Nota crédito enviada a R-Count"; }
    else if (first) message = `R-Count rechazó la nota crédito: ${first.reason ?? first.error ?? first.message ?? JSON.stringify(first)}`;
  } catch (e) { response = { error: e instanceof Error ? e.message : String(e) }; }
  await sb.from("rcount_sync_log").insert({ order_id: r.order_id, entity: "co", trigger: "manual", target: "rcount", status, request: payload as any, response, created_by: actorId } as any);
  // Registrar la nota para que reste de las ventas en estadísticas (como las del POS).
  if (status === "sent") {
    const total = lines.reduce((a, l) => a + (Number(l.unit_price) || 0) * (Number(l.quantity) || 0), 0);
    await (sb as any).from("pos_credit_notes").upsert({
      order_id: r.order_id, external_id: externalId, invoice_number: inv?.number ?? r.orders?.number ?? null,
      resolution: withPayable ? "reembolso" : "cambio", lines: lines.map((l) => ({ sku: l.sku, quantity: l.quantity, reason: l.reason, condition: l.condition })),
      status: "issued", total, return_id: r.id, created_by: actorId,
    }, { onConflict: "external_id" });
  }
  return { ok: status === "sent", message };
}

/** Entrada manual o ajuste de inventario (`ajustes_inventario`). R-Count lo deja
 *  pendiente en «Ajustes Hub» hasta que contabilidad lo apruebe (crea el AJI). */
export async function sendInventoryAdjustment(input: { kind: "entrada_manual" | "ajuste"; reason: string; items: { variant_id: string; qty: number }[]; location_id?: string | null }, actorId?: string | null) {
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const ids = [...new Set(input.items.map((i) => i.variant_id))];
  const { data: vars } = await sb.from("product_variants").select("id, sku").in("id", ids);
  const skuById = new Map((vars ?? []).map((v: any) => [v.id, v.sku]));
  let bodega: string | null = null;
  let loc: any = null;
  if (input.location_id) { loc = (await sb.from("locations").select("code, name").eq("id", input.location_id).maybeSingle()).data; bodega = loc?.code ?? null; }
  const qtyBySku = new Map<string, number>();
  for (const i of input.items) {
    const sku = skuById.get(i.variant_id);
    if (!sku || !i.qty) continue;
    qtyBySku.set(sku, (qtyBySku.get(sku) ?? 0) + i.qty);
  }
  const items = [...qtyBySku].filter(([, q]) => q !== 0).map(([code, quantity]) => ({ code, quantity, ...(bodega ? { bodega_codigo: bodega } : {}) }));
  if (!items.length) return { ok: false, message: "Sin referencias con SKU para enviar" };
  const kind = input.kind === "entrada_manual" && items.some((i) => i.quantity < 0) ? "ajuste" : input.kind;
  const externalId = `AJ-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const basePayload = {
    type: "ajustes_inventario",
    batch_id: `aj-hub-${externalId.toLowerCase()}`,
    data: { external_id: externalId, adjustment_type: kind, date: new Date().toISOString().slice(0, 10), reason: input.reason.slice(0, 300), ...(bodega ? { bodega_codigo: bodega } : {}), items },
  };
  const payload = withAdjustmentMeta(basePayload, adjustmentMeta(await adjustmentActor(actorId), loc));
  const { data: log } = await (sb as any).from("rcount_adjustment_log").insert({ external_id: externalId, location_id: input.location_id ?? null, request: payload, created_by: actorId ?? null }).select("id").single();
  return postAdjustment(payload, log?.id ?? null);
}

async function postAdjustment(payload: any, logId: string | null) {
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const finish = async (status: string, message: string, response: any) => {
    if (logId) await (sb as any).from("rcount_adjustment_log").update({ status, message, response, updated_at: new Date().toISOString() }).eq("id", logId);
    return { ok: status === "sent", message, response };
  };
  const { data: setting } = await sb.from("app_settings").select("value").eq("key", RCOUNT_SETTINGS_KEY).maybeSingle();
  const settings = normalizeRCountSettings(setting?.value);
  if (!settings.co.enabled || !settings.co.url) return finish("error", "R-Count Colombia no está activo", null);
  const externalId = payload.data.external_id;
  try {
    const res = await fetch(settings.co.url, { method: "POST", headers: { "Content-Type": "application/json", "x-rwear-key": process.env["RWEAR_API_KEY"] ?? "" }, body: JSON.stringify(payload) });
    const text = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* texto plano */ }
    const response = { status: res.status, body: parsed ?? text.slice(0, 4000) };
    const rejected = parsed?.rejected ?? parsed?.errors ?? parsed?.data?.rejected;
    const first = Array.isArray(rejected) && rejected.length ? rejected[0] : null;
    if (res.ok && !first && parsed?.success !== false) return finish("sent", `Enviado a R-Count (${externalId}), pendiente de aprobación`, response);
    console.error("R-Count ajuste rechazado", res.status, text.slice(0, 1000));
    return finish("error", `R-Count rechazó el ajuste: ${first ? (first.reason ?? first.error ?? first.message ?? JSON.stringify(first)) : parsed?.error ?? parsed?.message ?? `HTTP ${res.status}`}`, response);
  } catch (e) {
    return finish("error", `No se pudo conectar con R-Count: ${e instanceof Error ? e.message : String(e)}`, null);
  }
}

export async function resendInventoryAdjustment(logId: string) {
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const { data: log } = await (sb as any).from("rcount_adjustment_log").select("request, attempts, created_by, location_id").eq("id", logId).maybeSingle();
  if (!log?.request) return { ok: false, message: "Ajuste no encontrado" };
  const loc = log.location_id ? (await sb.from("locations").select("name").eq("id", log.location_id).maybeSingle()).data : null;
  const request = withAdjustmentMeta(log.request, adjustmentMeta(await adjustmentActor(log.created_by), loc));
  await (sb as any).from("rcount_adjustment_log").update({ attempts: (log.attempts ?? 1) + 1, request }).eq("id", logId);
  return postAdjustment(request, logId);
}

async function adjustmentActor(userId?: string | null) {
  if (!userId) return null;
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const [{ data: prof }, { data: u }] = await Promise.all([
    sb.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    sb.auth.admin.getUserById(userId).catch(() => ({ data: null as any })),
  ]);
  return { full_name: (prof as any)?.full_name ?? null, email: (u as any)?.user?.email ?? null };
}

export async function syncProductItems(productId: string) {
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const { data: setting } = await sb.from("app_settings").select("value").eq("key", RCOUNT_SETTINGS_KEY).maybeSingle();
  const settings = normalizeRCountSettings(setting?.value);
  if (!settings.co.enabled || !settings.co.url) return { ok: false, message: "R-Count Colombia no está activo; variantes guardadas solo en el Hub" };
  const { data: p } = await sb.from("products").select("id, name, product_type, composition, product_variants(sku, barcode, size, color, price_cop, cost_cop, price_usd, tariff_code, active)").eq("id", productId).maybeSingle();
  const items = ((p as any)?.product_variants ?? [])
    .filter((v: any) => v.sku)
    .map((v: any) => ({
      code: v.sku,
      barcode: v.barcode ?? v.sku,
      description: [(p as any).name, v.color, v.size].filter(Boolean).join(" "),
      reference: (p as any).name,
      size: v.size,
      color: v.color,
      category: (p as any).product_type,
      composition: (p as any).composition,
      tariff_code: v.tariff_code,
      unit_price: Number(v.price_cop ?? 0),
      unit_price_usd: v.price_usd == null ? null : Number(v.price_usd),
      cost: v.cost_cop == null ? null : Number(v.cost_cop),
      tax_rate: 19,
      active: !!v.active,
    }));
  if (!items.length) return { ok: false, message: "Sin variantes con SKU para enviar a R-Count" };
  const payload = { type: "items", batch_id: `items-${productId}-${Date.now().toString(36)}`, data: { mode: "upsert", items } };
  try {
    const res = await fetch(settings.co.url, { method: "POST", headers: { "Content-Type": "application/json", "x-rwear-key": process.env["RWEAR_API_KEY"] ?? "" }, body: JSON.stringify(payload) });
    const text = await res.text();
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* texto plano */ }
    const rejected = parsed?.rejected ?? parsed?.errors ?? parsed?.data?.rejected;
    const first = Array.isArray(rejected) && rejected.length ? rejected[0] : null;
    if (res.ok && !first) return { ok: true, message: `${items.length} variante(s) creadas o actualizadas en R-Count` };
    console.error("R-Count items rechazado", res.status, text.slice(0, 1000));
    return { ok: false, message: `R-Count rechazó las variantes: ${first ? (first.reason ?? first.error ?? first.message ?? JSON.stringify(first)) : parsed?.error ?? `HTTP ${res.status}`}` };
  } catch (e) {
    return { ok: false, message: `No se pudo conectar con R-Count: ${e instanceof Error ? e.message : String(e)}` };
  }
}
