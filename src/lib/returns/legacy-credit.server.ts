import { normalizeRCountSettings, RCOUNT_SETTINGS_KEY } from "@/lib/rcount";
import { legacyCreditPayload, legacyCreditResult, type LegacyCreditInput } from "./legacy-credit";

async function config() {
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const { data, error } = await sb.from("app_settings").select("value").eq("key", RCOUNT_SETTINGS_KEY).maybeSingle();
  if (error) throw error;
  const settings = normalizeRCountSettings(data?.value);
  if (!settings.co.enabled || !settings.co.url) throw new Error("R-Count Colombia no está activo");
  const key = process.env["RWEAR_API_KEY"];
  if (!key) throw new Error("La conexión con R-Count no está configurada");
  return { sb, settings, key };
}

async function applyInventory(sb: any, id: string) {
  const { error } = await sb.rpc("apply_legacy_credit_inventory", { _note_id: id });
  if (error) {
    await sb.from("pos_legacy_credit_notes").update({ error: `Nota aprobada; reingreso pendiente: ${error.message}` }).eq("id", id);
    return false;
  }
  return true;
}

export async function issueLegacyCredit(input: LegacyCreditInput, actorId: string) {
  const { sb, settings, key } = await config();
  const { data: locations, error: locError } = await sb.from("locations").select("id, code, rcount_center").eq("active", true).in("id", [input.locationId, input.destinationLocationId]);
  if (locError) throw locError;
  const store = locations?.find((l) => l.id === input.locationId);
  const dest = locations?.find((l) => l.id === input.destinationLocationId);
  if (!store || !["cali", "bogota"].includes(store.code)) throw new Error("Selecciona una tienda POS válida");
  if (!dest || (dest.id !== store.id && dest.code !== "bodega")) throw new Error("El destino debe ser la tienda o Bodega Central");
  const skus = input.lines.map((l) => l.sku);
  const { data: variants, error: varError } = await sb.from("product_variants").select("sku").in("sku", skus);
  if (varError) throw varError;
  if (skus.some((sku) => !variants?.some((v) => v.sku === sku))) throw new Error("Hay códigos que no existen en el catálogo del Hub");
  const configured = store.rcount_center || (store.code === "cali" ? settings.centers.cali : settings.centers.bogota);
  const center = /^\d+$/.test(configured) ? `CO ${configured.padStart(2, "0")}` : configured;
  const payload = legacyCreditPayload(input, center);
  const externalId = payload.data.credit_notes[0].external_id;
  const total = input.lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const { data: row, error: insertError } = await (sb as any).from("pos_legacy_credit_notes").insert({
    id: input.requestId, external_id: externalId, location_id: store.id, destination_location_id: dest.id,
    sale_month: input.saleMonth, legacy_invoice_number: input.legacyInvoiceNumber || null, resolution: input.resolution,
    payment_method: input.resolution === "reembolso" ? input.paymentMethod : null, customer: input.customer ?? null,
    lines: input.lines, notes: input.notes || null, total, created_by: actorId,
  }).select("id").single();
  // A repeated click must reconcile, never create a new external ID or resend altered lines.
  if (insertError?.code === "23505") return refreshLegacyCredit(input.requestId);
  if (insertError || !row) throw insertError ?? new Error("No se pudo guardar la nota");
  let result = { status: "pending", numero_dian: null, cude: null, public_url: null, error: "No se pudo confirmar la respuesta de R-Count. Consulta el estado antes de repetir." } as ReturnType<typeof legacyCreditResult>;
  try {
    const response = await fetch(settings.co.url, { method: "POST", headers: { "Content-Type": "application/json", "x-rwear-key": key }, body: JSON.stringify(payload) });
    const body = await response.json();
    result = legacyCreditResult(body);
    if (!response.ok) result = { ...result, status: "error", error: result.error ?? `R-Count respondió ${response.status}` };
  } catch { /* Keep pending: response may have been lost after acceptance. */ }
  const { error: updateError } = await (sb as any).from("pos_legacy_credit_notes").update(result).eq("id", row.id);
  if (updateError) throw new Error("La nota fue enviada; consulta su estado antes de repetir");
  const inventoryApplied = result.status === "issued" ? await applyInventory(sb, row.id) : false;
  return { ...result, id: row.id, inventoryApplied };
}

export async function refreshLegacyCredit(id: string) {
  const { sb, settings, key } = await config();
  const { data: row, error } = await (sb as any).from("pos_legacy_credit_notes").select("*").eq("id", id).single();
  if (error || !row) throw new Error("Nota no encontrada");
  if (row.status === "issued") return { ...row, inventoryApplied: await applyInventory(sb, id) };
  const response = await fetch(`${settings.co.url.replace(/\/+$/, "")}/notas-credito?external_id=${encodeURIComponent(row.external_id)}`, { headers: { "x-rwear-key": key } });
  if (!response.ok) throw new Error("No se pudo consultar R-Count");
  const body = await response.json() as any;
  const list = Array.isArray(body) ? body : body?.data ?? body?.notas ?? body?.credit_notes ?? body?.results ?? [];
  const found = Array.isArray(list) ? list.find((n: any) => n.external_id === row.external_id) : null;
  if (!found) return { ...row, inventoryApplied: false };
  const result = legacyCreditResult(found);
  const { error: updateError } = await (sb as any).from("pos_legacy_credit_notes").update(result).eq("id", id);
  if (updateError) throw updateError;
  return { ...result, id, inventoryApplied: result.status === "issued" ? await applyInventory(sb, id) : false };
}