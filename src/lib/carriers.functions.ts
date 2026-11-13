import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { skydropxPostal } from "@/lib/co-postal";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { normalizeCarrierSettings, type SkydropxSettings } from "@/lib/carriers";
import { assertShipper } from "@/lib/shipping-access";
import { shippingOriginLocation } from "@/lib/shipping-origin";

const SECRET_KEY = "skydropx_client_secret";

const HOSTS = {
  sandbox: "https://sb-pro.skydropx.com",
  live: "https://pro.skydropx.com",
} as const;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (!isAdmin) throw new Error("Solo administradores.");
}

async function loadConfig(): Promise<{ settings: SkydropxSettings; secret: string }> {
  const db = await admin();
  const [{ data: setting }, { data: secret }] = await Promise.all([
    db.from("app_settings").select("value").eq("key", "carrier_settings").maybeSingle(),
    db.from("integration_secrets").select("value").eq("key", SECRET_KEY).maybeSingle(),
  ]);
  return {
    settings: normalizeCarrierSettings(setting?.value).skydropx,
    secret: String((secret as any)?.value ?? "").trim(),
  };
}

/** Token OAuth2 (client_credentials) de Skydropx Pro. */
async function skydropxToken(settings: SkydropxSettings, secret: string) {
  const host = HOSTS[settings.mode];
  const response = await fetch(`${host}/api/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: settings.clientId.trim(),
      client_secret: secret,
    }),
  });
  const json = (await response.json().catch(() => ({}))) as { access_token?: string; error_description?: string; error?: string };
  if (!response.ok || !json.access_token) {
    throw new Error(json.error_description ?? json.error ?? "Skydropx rechazó las credenciales.");
  }
  return { token: json.access_token, host };
}

/** Guarda o borra el Client Secret de Skydropx. */
export const saveCarrierSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ secret: z.string().max(600) }).parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context as any);
    const db = await admin();
    const value = data.secret.trim();
    if (!value) {
      await db.from("integration_secrets").delete().eq("key", SECRET_KEY);
      return { ok: true };
    }
    const { error } = await db
      .from("integration_secrets")
      .upsert({ key: SECRET_KEY, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error("No pudimos guardar la credencial.");
    return { ok: true };
  });

/** Indica si el Client Secret ya está guardado. */
export const carrierSecretStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ saved: boolean }> => {
    await assertAdmin(context as any);
    const db = await admin();
    const { data } = await db.from("integration_secrets").select("key").eq("key", SECRET_KEY).maybeSingle();
    return { saved: Boolean(data) };
  });

/** Verifica las credenciales pidiendo un token a Skydropx. */
export const testCarrierConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ ok: boolean; message: string }> => {
    await assertAdmin(context as any);
    const { settings, secret } = await loadConfig();
    if (!settings.clientId.trim() || !secret) return { ok: false, message: "Falta el Client ID o el Client Secret." };
    try {
      await skydropxToken(settings, secret);
      return { ok: true, message: `Conexión correcta en ${settings.mode === "live" ? "producción" : "pruebas"}.` };
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : "No pudimos conectar con Skydropx." };
    }
  });

export type SkydropxRate = {
  id: string;
  carrier: string;
  service: string;
  amount: number;
  /** Flete sin seguro, si Skydropx lo informa. */
  freight: number | null;
  /** Seguro / manejo sobre el valor declarado, si Skydropx lo informa. */
  insurance: number | null;
  /** Cargos adicionales no identificados (total − flete − seguro). */
  other: number | null;
  currency: string;
  days: number | null;
};

function mapRates(json: any): SkydropxRate[] {
  const raw: any[] = Array.isArray(json?.rates) ? json.rates : [];
  return raw
    .filter((rate) => rate?.success !== false && Number(rate?.total ?? rate?.amount ?? 0) > 0)
    .map((rate: any) => {
      const amount = Number(rate.total ?? rate.amount ?? 0);
      const freight = Number.isFinite(Number(rate.amount)) && rate.total != null ? Number(rate.amount) : null;
      const insRaw = rate.insurance ?? rate.insurance_amount ?? rate.insured_amount ?? rate.insurance_cost;
      const insurance = insRaw != null && Number.isFinite(Number(insRaw)) && Number(insRaw) > 0 ? Number(insRaw) : null;
      const diff = freight != null ? Math.round(amount - freight - (insurance ?? 0)) : 0;
      return {
        id: String(rate.id ?? ""),
        carrier: String(rate.provider_display_name ?? rate.provider_name ?? "—"),
        service: String(rate.provider_service_name ?? rate.provider_service_code ?? ""),
        amount, freight, insurance,
        other: diff > 0 ? diff : null,
        currency: String(rate.currency_code ?? "COP"),
        days: Number.isFinite(Number(rate.days)) ? Number(rate.days) : null,
      };
    })
    .sort((a, b) => a.amount - b.amount);
}

/** Cotiza el envío con Skydropx (formato nacional Colombia) y devuelve las tarifas. */
export const quoteSkydropx = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      zipTo: z.string().min(3).max(12),
      cityTo: z.string().min(2).max(80),
      provinceTo: z.string().min(2).max(80),
      countryTo: z.string().min(2).max(2).optional(),
      weightKg: z.number().positive().max(70).optional(),
      declaredAmount: z.number().min(0).max(100_000_000).optional(),
    }).parse(data),
  )
  .handler(async ({ data }): Promise<{ rates: SkydropxRate[]; completed: boolean }> => {
    const { settings, secret } = await loadConfig();
    if (!settings.enabled) throw new Error("Skydropx no está activo.");
    if (!settings.clientId.trim() || !secret) throw new Error("Skydropx no está configurado.");
    const o = settings.origin;
    if (!o.zip || !o.city || !o.province) throw new Error("Completa ciudad, departamento y código postal de origen.");
    const { token, host } = await skydropxToken(settings, secret);

    const carriers = settings.carriers.split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
    const body = {
      quotation: {
        address_from: { country_code: o.country, postal_code: skydropxPostal(o.country, o.city, o.zip), area_level1: o.province, area_level2: o.city },
        address_to: { country_code: (data.countryTo ?? "CO").toUpperCase(), postal_code: skydropxPostal(data.countryTo, data.cityTo, data.zipTo), area_level1: data.provinceTo, area_level2: data.cityTo },
        parcels: [{
          length: Math.max(1, Math.round(settings.parcel.lengthCm)),
          width: Math.max(1, Math.round(settings.parcel.widthCm)),
          height: Math.max(1, Math.round(settings.parcel.heightCm)),
          weight: Math.max(1, data.weightKg ?? settings.parcel.weightKg),
          declared_amount: Math.round(data.declaredAmount ?? (settings.insure ? 100_000 : settings.minDeclaredCop)),
        }],
        ...(carriers.length ? { requested_carriers: carriers } : {}),
      },
    };

    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const response = await fetch(`${host}/api/v1/quotations`, { method: "POST", headers, body: JSON.stringify(body) });
    let json = (await response.json().catch(() => ({}))) as any;
    if (!response.ok) {
      const detail = json?.message ?? json?.error ?? JSON.stringify(json?.errors ?? json).slice(0, 300);
      throw new Error(`Skydropx no pudo cotizar [${response.status}]: ${detail}`);
    }

    // La cotización se completa en segundo plano: se consulta hasta que termine (máx. ~10 s).
    for (let i = 0; i < 5 && json?.is_completed === false && json?.id; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const poll = await fetch(`${host}/api/v1/quotations/${json.id}`, { headers });
      if (!poll.ok) break;
      json = await poll.json().catch(() => json);
    }
    return { rates: mapRates(json), completed: json?.is_completed !== false };
  });

// ======================= Guías por pedido =======================

type ShipTo = Record<string, any>;

async function loadOrderShipping(orderId: string) {
  const db = await admin();
  const { data: order, error } = await db
    .from("orders")
    .select("id, number, status, payment_status, is_manual, total_cop, contact_name, contact_email, contact_phone, ship_to, tracking_number, dispatch_location_id, order_items(qty, fulfill_location_id)")
    .eq("id", orderId)
    .maybeSingle();
  if (error || !order) throw new Error("Pedido no encontrado.");
  const ship = ((order as any).ship_to ?? {}) as ShipTo;
  const { suggestPostalCode } = await import("@/lib/co-postal");
  const zip = String(ship.postal_code || ship.zip || suggestPostalCode(ship.city) || "").trim();
  const city = String(ship.city ?? "").trim();
  const province = String(ship.department ?? ship.province ?? ship.state ?? "").trim();
  if (!city || !province) throw new Error("El pedido no tiene ciudad y departamento de envío.");
  if (!zip) throw new Error("El pedido no tiene código postal; agrégalo antes de generar la guía.");
  return { order: order as any, ship, zip, city, province, country: String(ship.country ?? "CO").toUpperCase().slice(0, 2) };
}

async function readyConfig() {
  const { settings, secret } = await loadConfig();
  if (!settings.enabled) throw new Error("Skydropx no está activo.");
  if (!settings.clientId.trim() || !secret) throw new Error("Skydropx no está configurado.");
  const o = settings.origin;
  if (!o.zip || !o.city || !o.province || !o.street1) throw new Error("Completa la dirección de origen en Configuración → Skydropx.");
  return { settings, secret };
}

function skydropxError(json: any, status: number, what: string) {
  const detail = json?.message ?? json?.error ?? JSON.stringify(json?.errors ?? json).slice(0, 300);
  return new Error(`Skydropx no pudo ${what} [${status}]: ${detail}`);
}

async function loadBox(orderId: string, boxId: string) {
  const db = await admin();
  const { data } = await (db as any).from("b2b_boxes").select("location_id, weight_kg, length_cm, width_cm, height_cm").eq("id", boxId).eq("order_id", orderId).maybeSingle();
  return (data ?? null) as { location_id: string | null; weight_kg: number | null; length_cm: number | null; width_cm: number | null; height_cm: number | null } | null;
}

/** Origen de la guía: dirección de la bodega si está configurada; si no, la general. */
async function resolveOrigin(settings: Awaited<ReturnType<typeof loadConfig>>["settings"], locationId: string | null) {
  const { originFor } = await import("@/lib/carriers");
  return originFor(settings, locationId);
}

/** Cotiza el envío de un pedido con su dirección real. */
export const quoteOrderShipping = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({
    orderId: z.string().uuid(),
    declaredAmount: z.number().min(0).max(100_000_000).optional(),
    insure: z.boolean().optional(),
    weightKg: z.number().positive().max(70).optional(),
    lengthCm: z.number().positive().max(200).optional(),
    widthCm: z.number().positive().max(200).optional(),
    heightCm: z.number().positive().max(200).optional(),
    locationId: z.string().uuid().optional(),
    boxId: z.string().uuid().optional(),
  }).parse(data))
  .handler(async ({ data, context }): Promise<{ quotationId: string; rates: SkydropxRate[]; declaredAmount: number; weightKg: number; insured: boolean; originLocationId: string; originAddress: string }> => {
    await assertShipper(context as any);
    const { settings, secret } = await readyConfig();
    const { order, zip, city, province, country } = await loadOrderShipping(data.orderId);
    const { token, host } = await skydropxToken(settings, secret);
    const box = data.boxId ? await loadBox(data.orderId, data.boxId) : null;
    if (data.boxId && !box) throw new Error("Caja no encontrada en este pedido.");
    const originLocationId = shippingOriginLocation(order, data.locationId, box);
    const o = await resolveOrigin(settings, originLocationId);
    const units = (order.order_items ?? []).reduce((a: number, i: any) => a + (i.qty ?? 0), 0) || 1;
    const carriers = settings.carriers.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    // Sin seguro salvo que se pida explícitamente: se declara el mínimo para pagar solo el flete.
    const insured = data.insure ?? false;
    const declaredAmount = insured
      ? Math.round(data.declaredAmount && data.declaredAmount > 0 ? data.declaredAmount : Number(order.total_cop) || settings.minDeclaredCop)
      : Math.round(settings.minDeclaredCop);
    const weightKg = Math.max(1, data.weightKg ?? (box?.weight_kg ? Number(box.weight_kg) : Math.ceil(settings.parcel.weightKg * Math.max(1, units / 3))));
    const dim = (v: number | undefined, b: unknown, d: number) => Math.max(1, Math.round(v ?? (Number(b) > 0 ? Number(b) : d)));
    const body = {
      quotation: {
        order_id: order.number,
        address_from: { country_code: o.country, postal_code: skydropxPostal(o.country, o.city, o.zip), area_level1: o.province, area_level2: o.city },
        address_to: { country_code: country, postal_code: skydropxPostal(country, city, zip), area_level1: province, area_level2: city },
        parcels: [{
          length: dim(data.lengthCm, box?.length_cm, settings.parcel.lengthCm),
          width: dim(data.widthCm, box?.width_cm, settings.parcel.widthCm),
          height: dim(data.heightCm, box?.height_cm, settings.parcel.heightCm),
          weight: weightKg,
          declared_amount: declaredAmount,
        }],
        ...(carriers.length ? { requested_carriers: carriers } : {}),
      },
    };
    const res = await fetch(`${host}/api/v1/quotations`, { method: "POST", headers, body: JSON.stringify(body) });
    let json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw skydropxError(json, res.status, "cotizar");
    for (let i = 0; i < 5 && json?.is_completed === false && json?.id; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const poll = await fetch(`${host}/api/v1/quotations/${json.id}`, { headers });
      if (!poll.ok) break;
      json = await poll.json().catch(() => json);
    }
    try { console.log("[skydropx] rate sample", JSON.stringify((json?.rates ?? [])[0] ?? {}).slice(0, 1500)); } catch { /* noop */ }
    return { quotationId: String(json?.id ?? ""), rates: mapRates(json), declaredAmount, weightKg, insured, originLocationId, originAddress: [o.street1, o.street2, o.city].filter(Boolean).join(" · ") };
  });

function extractLabel(json: any) {
  const attrs = json?.data?.attributes ?? json?.attributes ?? json ?? {};
  const included: any[] = Array.isArray(json?.included) ? json.included : [];
  const pkg = included.find((i) => i?.type === "package")?.attributes ?? attrs?.packages?.[0] ?? {};
  return {
    id: String(json?.data?.id ?? json?.id ?? ""),
    status: String(attrs.workflow_status ?? attrs.status ?? ""),
    carrier: String(attrs.carrier_name ?? attrs.provider_name ?? ""),
    tracking: String(pkg.tracking_number ?? attrs.master_tracking_number ?? "") || null,
    label: String(pkg.label_url ?? attrs.label_url ?? "") || null,
  };
}

/** Compra la guía con la tarifa elegida y la guarda en el pedido. */
export const createOrderLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ orderId: z.string().uuid(), rateId: z.string().min(1).max(120), carrier: z.string().max(80).optional(), note: z.string().max(120).optional(), boxId: z.string().uuid().optional(), locationId: z.string().uuid().optional(), quotedOriginLocationId: z.string().uuid().optional() }).parse(data),
  )
  .handler(async ({ data, context }): Promise<{ tracking: string | null; label: string | null; pending: boolean }> => {
    await assertShipper(context as any);
    const { settings, secret } = await readyConfig();
    const { order, ship, zip, city, province, country } = await loadOrderShipping(data.orderId);
    if (order.is_manual && ["draft", "reserved"].includes(order.status)) throw new Error("El pedido manual aún no está listo para despachar: confirma cantidades, pago y recepción del traslado.");
    if (order.tracking_number && !data.boxId && !data.locationId) throw new Error("Este pedido ya tiene guía.");
    const { token, host } = await skydropxToken(settings, secret);
    const box = data.boxId ? await loadBox(data.orderId, data.boxId) : null;
    if (data.boxId && !box) throw new Error("Caja no encontrada en este pedido.");
    const originLocationId = shippingOriginLocation(order, data.locationId, box);
    if (data.quotedOriginLocationId && data.quotedOriginLocationId !== originLocationId) throw new Error("Cambió la bodega de salida; vuelve a cotizar antes de generar la guía.");
    const o = await resolveOrigin(settings, originLocationId);
    const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
    const phone = (v: unknown) => String(v ?? "").replace(/\D/g, "").slice(-10);
    const txt = (v: unknown, d: string) => String(v ?? "").trim() || d;
    // Contenido del paquete: productos del pedido (o de la caja / bodega).
    const dbc = await admin();
    let content = "Prendas de vestir";
    try {
      let items: Array<{ name: string; qty: number }> = [];
      if (data.boxId) {
        const { data: rows } = await (dbc as any).from("b2b_box_items").select("qty, order_items(product_name, variant_label)").eq("box_id", data.boxId);
        items = (rows ?? []).map((r: any) => ({ name: [r.order_items?.product_name, r.order_items?.variant_label].filter(Boolean).join(" "), qty: Number(r.qty ?? r.quantity ?? 0) }));
      } else {
        let q = (dbc as any).from("order_items").select("product_name, variant_label, qty, fulfill_location_id").eq("order_id", data.orderId);
        if (data.locationId) q = q.eq("fulfill_location_id", data.locationId);
        const { data: rows } = await q;
        items = (rows ?? []).map((r: any) => ({ name: [r.product_name, r.variant_label].filter(Boolean).join(" "), qty: Number(r.qty ?? 0) }));
      }
      const list = items.filter((i) => i.name && i.qty > 0).map((i) => `${i.qty} ${i.name}`).join(", ");
      if (list) content = list.length > 100 ? list.slice(0, 97) + "..." : list;
    } catch { /* usa contenido genérico */ }
    // Coordinadora y otras imprimen la referencia como «Observaciones»: incluimos los productos.
    const productsRef = content !== "Prendas de vestir" ? content : "";
    // Skydropx rechaza referencias de más de 40 caracteres (422).
    const ref = [data.note?.trim(), String(ship.line2 || ship.notes || "").trim(), productsRef].filter(Boolean).join(" · ").slice(0, 40);
    const body = {
      shipment: {
        rate_id: data.rateId,
        printing_format: "standard",
        address_from: {
          country_code: o.country, postal_code: skydropxPostal(o.country, o.city, o.zip), area_level1: o.province, area_level2: o.city, area_level3: o.city,
          street1: o.street1, name: o.name || o.company, company: o.company, phone: phone(o.phone),
          email: o.email, reference: txt(o.street2, "Bodega").slice(0, 40),
        },
        address_to: {
          country_code: country, postal_code: skydropxPostal(country, city, zip), area_level1: province, area_level2: city, area_level3: city,
          street1: txt(ship.line1 ?? ship.address, "Sin dirección"),
          name: txt(ship.recipient ?? order.contact_name, "Cliente"),
          company: txt(ship.recipient ?? order.contact_name, "Cliente"),
          phone: phone(ship.phone ?? order.contact_phone),
          email: txt(order.contact_email, o.email),
          reference: txt(ref, "Sin referencia"),
        },
        consignment_note: "53102400",
        package_type: "4G",
        packages: [{ package_number: "1", package_content: content, consignment_note: "53102400", package_type: "4G" }],
      },
    };
    const res = await fetch(`${host}/api/v1/shipments`, { method: "POST", headers, body: JSON.stringify(body) });
    let json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw skydropxError(json, res.status, "crear la guía");
    let info = extractLabel(json);
    for (let i = 0; i < 6 && info.id && !info.label; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const poll = await fetch(`${host}/api/v1/shipments/${info.id}`, { headers });
      if (!poll.ok) break;
      json = await poll.json().catch(() => json);
      info = extractLabel(json);
    }
    const db = await admin();
    if (data.boxId) {
      // Guía de una caja B2B: se guarda en la caja, no en el pedido.
      await (db as any).from("b2b_boxes").update({
        carrier: info.carrier || data.carrier || null, tracking: info.tracking, label_url: info.label,
        skydropx_shipment_id: info.id || null,
      }).eq("id", data.boxId).eq("order_id", data.orderId);
      return { tracking: info.tracking, label: info.label, pending: !info.label };
    }
    if (data.locationId) {
      // «Cada bodega despacha»: la guía queda en esa bodega; el pedido pasa a enviado con la última.
      const { error } = await (context as any).supabase.rpc("record_order_shipment", {
        _order_id: data.orderId, _location_id: data.locationId, _carrier: info.carrier || data.carrier || "Skydropx",
        _tracking: info.tracking ?? info.id, _label_url: info.label, _skydropx_id: info.id || null,
      });
      if (error) throw new Error(error.message);
      return { tracking: info.tracking, label: info.label, pending: !info.label };
    }
    // Al generar la guía el pedido online/manual queda Entregado de una vez.
    // Pago aprobado pero sin confirmar (reservado): confirmar primero para consumir la reserva una sola vez.
    if (!order.is_manual && order.status === "reserved" && (order as any).payment_status === "paid") {
      const { error: confErr } = await db.rpc("confirm_order", { _order_id: data.orderId, _idempotency_key: null } as any);
      if (confErr) throw new Error(confErr.message);
      order.status = "paid";
    }
    const markShipped = ["paid", "preparing"].includes(String(order.status));
    const { error: updErr } = await db.from("orders").update({
      skydropx_shipment_id: info.id || null,
      shipping_carrier: info.carrier || data.carrier || null,
      tracking_number: info.tracking,
      shipping_label_url: info.label,
      ...(markShipped ? { status: "delivered" } : {}),
    } as any).eq("id", data.orderId);
    if (updErr) throw new Error(updErr.message);
    void zip; void city; void province; void country;
    return { tracking: info.tracking, label: info.label, pending: !info.label };
  });

/** Consulta de nuevo una guía cuya etiqueta aún no estaba lista. */
export const refreshOrderLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ orderId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ tracking: string | null; label: string | null }> => {
    await assertShipper(context as any);
    const db = await admin();
    const { data: row } = await db.from("orders").select("skydropx_shipment_id").eq("id", data.orderId).maybeSingle();
    const id = (row as any)?.skydropx_shipment_id;
    if (!id) throw new Error("El pedido no tiene envío en Skydropx.");
    const { settings, secret } = await readyConfig();
    const { token, host } = await skydropxToken(settings, secret);
    const res = await fetch(`${host}/api/v1/shipments/${id}`, { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) throw skydropxError(json, res.status, "consultar la guía");
    const info = extractLabel(json);
    try { console.log("[skydropx] refresh", JSON.stringify(json).slice(0, 2000)); } catch { /* noop */ }
    if (!info.label) {
      const attrs = json?.data?.attributes ?? {};
      const st = String(attrs.workflow_status ?? attrs.status ?? "").toLowerCase();
      const errs = attrs.error_messages ?? attrs.errors ?? json?.errors;
      if (/fail|error|cancel/.test(st) || (errs && JSON.stringify(errs) !== "[]" && JSON.stringify(errs) !== "{}")) {
        throw new Error(`Skydropx no generó la etiqueta (estado: ${st || "desconocido"}). ${errs ? JSON.stringify(errs).slice(0, 300) : ""} Quita la guía y genera una nueva, quizá con otra transportadora.`);
      }
    }
    await db.from("orders").update({
      tracking_number: info.tracking, shipping_label_url: info.label,
      ...(info.carrier ? { shipping_carrier: info.carrier } : {}),
    } as any).eq("id", data.orderId);
    return { tracking: info.tracking, label: info.label };
  });

/** Recupera la etiqueta Skydropx (PDF) de una caja B2B para reimprimirla. */
export const refreshBoxLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ boxId: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ label: string | null }> => {
    await assertShipper(context as any);
    const db = await admin();
    const { data: box } = await (db as any).from("b2b_boxes").select("tracking, skydropx_shipment_id, label_url").eq("id", data.boxId).maybeSingle();
    if (!box) throw new Error("Caja no encontrada.");
    if (box.label_url) return { label: box.label_url };
    const { settings, secret } = await readyConfig();
    const { token, host } = await skydropxToken(settings, secret);
    const headers = { Authorization: `Bearer ${token}` };
    let info: ReturnType<typeof extractLabel> | null = null;
    if (box.skydropx_shipment_id) {
      const res = await fetch(`${host}/api/v1/shipments/${box.skydropx_shipment_id}`, { headers });
      if (res.ok) info = extractLabel(await res.json().catch(() => ({})));
    }
    // Cajas antiguas sin id: busca el envío por número de guía en los envíos recientes.
    if (!info?.label && box.tracking) {
      for (let page = 1; page <= 10 && !info?.label; page++) {
        const res = await fetch(`${host}/api/v1/shipments?page=${page}`, { headers });
        if (!res.ok) break;
        const json = (await res.json().catch(() => ({}))) as any;
        const list: any[] = Array.isArray(json?.data) ? json.data : [];
        if (!list.length) break;
        const included: any[] = Array.isArray(json?.included) ? json.included : [];
        let found = false;
        for (const s of list) {
          const a = s?.attributes ?? {};
          const pkgIds = (s?.relationships?.packages?.data ?? []).map((p: any) => p.id);
          const pkgs = included.filter((i) => i?.type === "package" && pkgIds.includes(i.id));
          const hit = String(a.master_tracking_number ?? "") === box.tracking || pkgs.some((p) => String(p.attributes?.tracking_number ?? "") === box.tracking);
          if (!hit) continue;
          found = true;
          const r = await fetch(`${host}/api/v1/shipments/${s.id}`, { headers });
          if (r.ok) info = extractLabel(await r.json().catch(() => ({})));
          if (!info?.label) info = { ...extractLabel(s), id: String(s.id), label: String(pkgs[0]?.attributes?.label_url ?? a.label_url ?? "") || null };
          break;
        }
        if (found) break;
      }
    }
    if (info?.label || info?.id) {
      await (db as any).from("b2b_boxes").update({ label_url: info.label, skydropx_shipment_id: info.id || box.skydropx_shipment_id }).eq("id", data.boxId);
    }
    return { label: info?.label ?? null };
  });

/** Guía Skydropx con el número y el contenido escritos abajo, para imprimir. */
export const stampShippingLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ orderId: z.string().uuid(), boxId: z.string().uuid().nullish(), url: z.string().url() }).parse(data))
  .handler(async ({ data, context }): Promise<{ pdf: string }> => {
    await assertShipper(context as any);
    const db = await admin();
    const { data: order } = await (db as any).from("orders").select("number").eq("id", data.orderId).maybeSingle();
    let ref = String(order?.number ?? "");
    let items: { qty: number; name: string }[] = [];
    if (data.boxId) {
      const { data: box } = await (db as any).from("b2b_boxes").select("box_number").eq("id", data.boxId).maybeSingle();
      if (box) ref += ` · Caja ${box.box_number}`;
      const { data: rows } = await (db as any).from("b2b_box_items").select("qty, order_items(product_name, variant_label)").eq("box_id", data.boxId);
      items = (rows ?? []).map((r: any) => ({ qty: r.qty, name: [r.order_items?.product_name, r.order_items?.variant_label].filter(Boolean).join(" ") }));
    } else {
      const { data: rows } = await (db as any).from("order_items").select("qty, product_name, variant_label").eq("order_id", data.orderId);
      items = (rows ?? []).map((r: any) => ({ qty: r.qty, name: [r.product_name, r.variant_label].filter(Boolean).join(" ") }));
    }
    items = items.filter((i) => i.qty > 0).sort((a, b) => a.name.localeCompare(b.name, "es"));
    const res = await fetch(data.url);
    if (!res.ok) throw new Error("No se pudo descargar la guía.");
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const pdf = await PDFDocument.load(await res.arrayBuffer(), { ignoreEncryption: true });
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const clean = (s: string) => s.replace(/[^\x20-\x7E\u00A0-\u00FF]/g, "");
    const page = pdf.getPage(0);
    const { width, height } = page.getSize();
    const margin = Math.max(6, width * 0.03);
    const size = Math.max(6, Math.min(9, width / 60));
    const maxW = width - margin * 6;
    const wrap = (text: string, f = font, s = size) => {
      const words = clean(text).split(" "); const lines: string[] = []; let line = "";
      for (const w of words) { const t = line ? `${line} ${w}` : w; if (f.widthOfTextAtSize(t, s) > maxW && line) { lines.push(line); line = w; } else line = t; }
      if (line) lines.push(line); return lines;
    };
    // Hojas carta (la guía ocupa la mitad de arriba): se escribe justo debajo, sin tapar nada.
    // Etiquetas pequeñas: no hay espacio libre, se agrega una hoja con el contenido.
    const big = height > 600;
    const all = wrap(`Contenido: ${items.map((i) => `${i.qty} ${i.name}`).join(" · ")}`);
    let fits = false;
    if (big) {
      let y = height * 0.5;
      const maxLines = Math.floor((y - margin * 3) / (size + 3));
      fits = all.length <= maxLines;
      const lines = fits ? all : [...all.slice(0, maxLines - 1), "... Ver hoja 2"];
      page.drawText(clean(ref), { x: margin * 3, y, size: size + 1, font: bold, color: rgb(0, 0, 0) });
      for (const l of lines) { y -= size + 3; page.drawText(l, { x: margin * 3, y, size, font, color: rgb(0, 0, 0) }); }
    }
    if (!fits) {
      let p = pdf.addPage([width, height]); let yy = height - margin - size;
      p.drawText(clean(`${ref} · Contenido`), { x: margin, y: yy, size: size + 1, font: bold });
      for (const i of items) for (const l of wrap(`${i.qty}  ${i.name}`)) {
        yy -= size + 3;
        if (yy < margin) { p = pdf.addPage([width, height]); yy = height - margin - size; }
        p.drawText(l, { x: margin, y: yy, size, font });
      }
    }
    const bytes = await pdf.save();
    let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return { pdf: btoa(bin) };
  });
