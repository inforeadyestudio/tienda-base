import { normalizeRCountSettings, RCOUNT_SETTINGS_KEY } from "@/lib/rcount";

async function cfg() {
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const { data } = await sb.from("app_settings").select("value").eq("key", RCOUNT_SETTINGS_KEY).maybeSingle();
  const s = normalizeRCountSettings(data?.value);
  if (!s.co.enabled || !s.co.url) throw new Error("R-Count Colombia no está activo");
  return { sb, url: s.co.url.replace(/\/+$/, ""), key: process.env["RWEAR_API_KEY"] ?? "" };
}

async function getJson(url: string, key: string) {
  const res = await fetch(url, { headers: { "x-rwear-key": key } });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* */ }
  if (!res.ok) throw new Error(body?.error ?? body?.message ?? `R-Count respondió ${res.status}`);
  return body;
}

export type RcLine = { sku: string; name: string; quantity: number; returnable: number; returned: number; unit_price: number };
export type RcInvoice = { number: string; external_id: string | null; date: string | null; customer: string | null; total: number; has_cufe: boolean; lines: RcLine[] };

function pick(o: any, ...k: string[]) { for (const x of k) if (o?.[x] != null) return o[x]; return null; }

export async function searchInvoice(q: string): Promise<RcInvoice[]> {
  const { url, key } = await cfg();
  const body = await getJson(`${url}/facturas/buscar?q=${encodeURIComponent(q)}`, key);
  const list: any[] = Array.isArray(body) ? body : body?.data ?? body?.facturas ?? body?.invoices ?? body?.results ?? [];
  return list.map((f) => ({
    number: String(pick(f, "numero_dian", "number", "numero", "invoice_number") ?? ""),
    external_id: pick(f, "external_id", "consecutive", "consecutivo") != null ? String(pick(f, "external_id", "consecutive", "consecutivo")) : null,
    date: pick(f, "issue_date", "fecha", "date"),
    customer: pick(f, "customer_name", "cliente", "customer"),
    total: Number(pick(f, "total", "total_cop") ?? 0),
    has_cufe: !!pick(f, "cufe"),
    lines: ((pick(f, "lines", "lineas", "items") ?? []) as any[]).map((l) => ({
      sku: String(pick(l, "sku") ?? ""),
      name: String(pick(l, "description", "name", "descripcion", "product_name") ?? pick(l, "sku") ?? ""),
      quantity: Number(pick(l, "quantity", "cantidad") ?? 0),
      returnable: Number(pick(l, "returnable_quantity") ?? 0),
      returned: Number(pick(l, "returned_quantity") ?? 0),
      unit_price: Number(pick(l, "unit_price", "precio_unitario", "price") ?? 0),
    })),
  }));
}

function applyResult(r: any) {
  const status = String(pick(r, "status", "estado") ?? "");
  return {
    status: status === "emitida_dian" ? "issued" : status === "error_dian" ? "error" : status === "duplicada" ? "duplicate" : status === "borrador" || status === "creada" ? "draft" : status || "error",
    numero_dian: pick(r, "numero_dian", "number"),
    cude: pick(r, "cude"),
    public_url: pick(r, "public_url", "pdf_url"),
    total: pick(r, "total"),
    error: pick(r, "error_dian", "error", "reason", "message"),
  };
}

export async function issueCreditNote(input: {
  orderId: string; invoiceNumber: string; resolution: "reembolso" | "cambio"; notes?: string;
  lines: { sku: string; quantity: number; reason: "talla" | "decision_propia" | "defecto"; condition: "buena" | "defectuosa" }[];
}, actorId: string, userSb: any) {
  const { sb, url, key } = await cfg();
  const { data: externalId, error: seqErr } = await (sb as any).rpc("next_pos_credit_note_id");
  if (seqErr || !externalId) throw new Error("No se pudo numerar la devolución");
  const note = {
    external_id: externalId, invoice_number: input.invoiceNumber, numero_factura: input.invoiceNumber,
    resolution: input.resolution, channel: "pos",
    issue_date: new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10),
    notes: input.notes || undefined, lines: input.lines,
  };
  const { data: row } = await (sb as any).from("pos_credit_notes").insert({
    order_id: input.orderId, external_id: externalId, invoice_number: input.invoiceNumber,
    resolution: input.resolution, lines: input.lines, notes: input.notes ?? null, created_by: actorId,
  }).select("id").single();
  const payload = { type: "notas_credito", batch_id: `nc-${String(externalId).toLowerCase()}`, data: { credit_notes: [note] } };
  let result: ReturnType<typeof applyResult> = { status: "error", numero_dian: null, cude: null, public_url: null, total: null, error: "R-Count no respondió" };
  let response: any = null;
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "x-rwear-key": key }, body: JSON.stringify(payload) });
    const text = await res.text();
    response = { status: res.status, body: text.slice(0, 4000) };
    let parsed: any = null;
    try { parsed = JSON.parse(text); } catch { /* */ }
    const r = parsed?.results?.[0] ?? parsed?.credit_notes?.[0] ?? parsed?.data?.[0] ?? parsed?.data?.credit_notes?.[0] ?? parsed?.accepted?.[0] ?? parsed?.rejected?.[0] ?? parsed;
    result = applyResult(r ?? {});
    if (!res.ok && result.status !== "issued") result = { ...result, status: "error", error: result.error ?? `R-Count respondió ${res.status}` };
  } catch (e) { response = { error: e instanceof Error ? e.message : String(e) }; }
  await (sb as any).from("pos_credit_notes").update(result).eq("id", row.id);
  await sb.from("rcount_sync_log").insert({ order_id: input.orderId, entity: "co", trigger: "manual", target: "rcount", status: result.status === "issued" ? "sent" : "error", request: payload as any, response, created_by: actorId } as any);

  // Reflejar el reingreso en el inventario del Hub solo cuando R-Count respondió
  // (la nota existe allá, aunque la DIAN la haya rechazado). Si no hubo respuesta
  // no tocamos inventario: la devolución puede reintentarse sin duplicar unidades.
  const rcountResponded = response !== null && typeof response?.status === "number";
  if (rcountResponded && ["issued", "error", "draft"].includes(result.status)) {
    try {
      const { data: order } = await (sb as any).from("orders").select("sold_by_location_id, fulfill_location_id, order_items(variant_id, unit_price_cop, product_name, variant_label, fulfill_location_id, product_variants(sku))").eq("id", input.orderId).maybeSingle();
      let locationId: string | null = order?.sold_by_location_id ?? order?.fulfill_location_id ?? (order?.order_items ?? []).find((i: any) => i.fulfill_location_id)?.fulfill_location_id ?? null;
      if (!locationId) {
        const { data: sale } = await (sb as any).from("pos_sales").select("pos_sessions(location_id)").eq("order_id", input.orderId).limit(1).maybeSingle();
        locationId = sale?.pos_sessions?.location_id ?? null;
      }
      const items = input.lines.map((l) => {
        const oi = (order?.order_items ?? []).find((i: any) => i.product_variants?.sku === l.sku);
        return oi ? { variant_id: oi.variant_id, qty: l.quantity, reason_code: l.reason === "decision_propia" ? "decision" : l.reason, condition: l.condition === "defectuosa" ? "defect" : "ok", photo_path: l.condition === "defectuosa" ? "nota-credito" : null, unit_price_cop: oi.unit_price_cop, name: oi.product_name, variant_label: oi.variant_label, sku: l.sku } : null;
      }).filter(Boolean);
      if (!locationId || !items.length) throw new Error("No se encontró la tienda o las prendas del pedido");
      // Evitar doble reingreso: descontar lo que notas anteriores del mismo pedido ya devolvieron al inventario.
      const { data: prevNotes } = await (sb as any).from("pos_credit_notes").select("lines").eq("order_id", input.orderId).not("return_id", "is", null).neq("id", row.id);
      const alreadyReturned = new Map<string, number>();
      for (const n of prevNotes ?? []) for (const l of (n as any).lines ?? []) {
        if (l?.sku) alreadyReturned.set(l.sku, (alreadyReturned.get(l.sku) ?? 0) + (Number(l.quantity) || 0));
      }
      const pendingItems = items.map((it: any) => {
        const left = Math.max(0, it.qty - (alreadyReturned.get(it.sku) ?? 0));
        alreadyReturned.set(it.sku, Math.max(0, (alreadyReturned.get(it.sku) ?? 0) - it.qty));
        return left > 0 ? { ...it, qty: left } : null;
      }).filter(Boolean);
      if (!pendingItems.length) {
        await (sb as any).from("pos_credit_notes").update({ error: "Inventario ya devuelto por una nota anterior" }).eq("id", row.id);
        return { externalId, ...result };
      }
      const { data: ret, error: retErr } = await userSb.rpc("pos_receive_return", { _location_id: locationId, _order_id: input.orderId, _items: pendingItems, _note: `Nota crédito ${externalId}` });
      if (retErr) throw retErr;
      const retId = (ret as any)?.return_id ?? (ret as any)?.id ?? null;
      if (retId) await (sb as any).from("pos_credit_notes").update({ return_id: retId }).eq("id", row.id);
    } catch (e: any) {
      console.error("inventory return failed", e);
      await (sb as any).from("pos_credit_notes").update({ error: `Inventario no actualizado: ${e?.message ?? e}` }).eq("id", row.id);
    }
  }
  return { externalId, ...result };
}

export async function refreshCreditNotes(orderId: string) {
  const { sb, url, key } = await cfg();
  const { data: rows } = await (sb as any).from("pos_credit_notes").select("id, external_id").eq("order_id", orderId);
  if (!rows?.length) return { updated: 0 };
  const body = await getJson(`${url}/notas-credito?external_id=${encodeURIComponent(rows.map((r: any) => r.external_id).join(","))}`, key);
  const list: any[] = Array.isArray(body) ? body : body?.data ?? body?.notas ?? body?.credit_notes ?? [];
  let updated = 0;
  for (const n of list) {
    const row = rows.find((r: any) => r.external_id === n.external_id);
    if (!row) continue;
    await (sb as any).from("pos_credit_notes").update(applyResult(n)).eq("id", row.id);
    updated++;
  }
  return { updated };
}
