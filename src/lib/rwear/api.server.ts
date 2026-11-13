import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { publicCopySchema, productCopy } from "./product-copy";

export const WILD_HOUSE_CODE = "bodega";

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

/** Constant-time-ish comparison of the shared API key. */
export function authorize(request: Request): Response | null {
  const expected = process.env["RWEAR_API_KEY"];
  if (!expected) return json({ error: "Integration not configured" }, 503);

  const header = request.headers.get("x-api-key") ?? "";
  const bearer = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const provided = header || bearer;

  if (provided.length !== expected.length) return json({ error: "Unauthorized" }, 401);
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return json({ error: "Unauthorized" }, 401);
  return null;
}

export const variantSchema = z.object({
  external_ref: z.string().min(1).max(120).optional(),
  sku: z.string().min(1).max(80),
  size: z.string().max(40).optional().nullable(),
  quality: z.string().max(60).optional().nullable(),
  color: z.string().max(60).optional().nullable(),
  color_hex: z.string().max(16).optional().nullable(),
  price_cop: z.number().int().min(0),
  compare_at_cop: z.number().int().min(0).optional().nullable(),
  cost_cop: z.number().int().min(0).optional().nullable(),
  barcode: z.string().max(80).optional().nullable(),
  weight_grams: z.number().int().min(0).optional().nullable(),
  active: z.boolean().optional(),
});

export const productSchema = publicCopySchema.extend({
  event_id: z.string().min(1).max(120).optional(),
  external_ref: z.string().min(1).max(120),
  name: z.string().min(1).max(200),
  materials: z.string().max(2000).optional().nullable(),
  care: z.string().max(2000).optional().nullable(),
  product_type: z.string().max(80).optional().nullable(),
  reference_code: z.string().max(80).optional().nullable(),
  tags: z.array(z.string().max(40)).max(30).optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  hero_image_url: z.string().url().max(500).optional().nullable(),
  images: z.array(z.string().url().max(500)).max(20).optional(),
  variants: z.array(variantSchema).min(1).max(200),
});

export const dispatchSchema = z.object({
  event_id: z.string().min(1).max(120),
  reference: z.string().max(120).optional(),
  note: z.string().max(500).optional(),
  items: z
    .array(
      z.object({
        sku: z.string().max(80).optional(),
        variant_external_ref: z.string().max(120).optional(),
        qty: z.number().int().min(1).max(100000),
      }),
    )
    .min(1)
    .max(500),
});

/** R Wear sends the complete real cut quantities for the listed Quality A SKUs. */
export const cutCurveSchema = z.object({
  event_id: z.string().trim().min(1).max(120),
  reference: z.string().trim().min(1).max(120),
  items: z.array(z.object({
    sku: z.string().trim().min(1).max(80),
    qty: z.number().int().min(0).max(100000),
  }).strict()).min(1).max(500),
}).strict().superRefine((data, context) => {
  const seen = new Set<string>();
  for (const [index, item] of data.items.entries()) {
    if (seen.has(item.sku)) {
      context.addIssue({ code: "custom", path: ["items", index, "sku"], message: "Duplicate SKU" });
    }
    seen.add(item.sku);
  }
});

export async function applyCutCurve(payload: z.infer<typeof cutCurveSchema>) {
  const { data, error } = await supabaseAdmin.rpc("apply_rwear_cut_curve", {
    _event_id: payload.event_id,
    _reference: payload.reference,
    _items: payload.items,
  });
  if (error) throw new Error(error.message);
  return data;
}

export type ProductPayload = z.infer<typeof productSchema>;
export type DispatchPayload = z.infer<typeof dispatchSchema>;

function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Returns a previously stored result when the same event was already processed. */
export async function findEvent(eventId: string) {
  const { data } = await supabaseAdmin
    .from("rwear_events")
    .select("result")
    .eq("event_id", eventId)
    .maybeSingle();
  return data?.result ?? null;
}

export async function recordEvent(eventId: string, kind: string, payload: unknown, result: unknown) {
  await supabaseAdmin
    .from("rwear_events")
    .insert({ event_id: eventId, kind, payload: payload as never, result: result as never });
}

export async function getWildHouseId() {
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select("id")
    .eq("code", WILD_HOUSE_CODE)
    .maybeSingle();
  if (error || !data) throw new Error("Bodega Central warehouse not found");
  return data.id;
}

export async function upsertProduct(payload: ProductPayload) {
  const { data: existing } = await supabaseAdmin
    .from("products")
    .select("id, slug")
    .eq("external_ref", payload.external_ref)
    .maybeSingle();

  let slug = existing?.slug;
  if (!slug) {
    const base = slugify(payload.name) || `rwear-${payload.external_ref.slice(0, 12)}`;
    slug = base;
    for (let i = 2; i < 50; i++) {
      const { data: taken } = await supabaseAdmin.from("products").select("id").eq("slug", slug).maybeSingle();
      if (!taken) break;
      slug = `${base}-${i}`;
    }
  }

  const productRow = {
    external_ref: payload.external_ref,
    slug,
    name: payload.name,
    ...productCopy(payload),
    care: payload.care ?? null,
    product_type: payload.product_type ?? null,
    reference_code: payload.reference_code ?? payload.external_ref,
    tags: payload.tags ?? [],
    status: payload.status ?? "draft",
    hero_image_url: payload.hero_image_url ?? payload.images?.[0] ?? null,
    updated_at: new Date().toISOString(),
  };

  let productId: string;
  if (existing) {
    const { error } = await supabaseAdmin.from("products").update(productRow).eq("id", existing.id);
    if (error) throw new Error(error.message);
    productId = existing.id;
  } else {
    const { data, error } = await supabaseAdmin.from("products").insert(productRow).select("id").single();
    if (error) throw new Error(error.message);
    productId = data.id;
  }

  if (payload.images?.length) {
    await supabaseAdmin.from("product_images").delete().eq("product_id", productId);
    await supabaseAdmin.from("product_images").insert(
      payload.images.map((url, i) => ({ product_id: productId, url, position: i })),
    );
  }

  const variants: { id: string; sku: string }[] = [];
  for (const [i, v] of payload.variants.entries()) {
    const row = {
      product_id: productId,
      external_ref: v.external_ref ?? `${payload.external_ref}:${v.sku}`,
      sku: v.sku,
      size: v.size ?? null,
      quality: v.quality ?? null,
      color: v.color ?? null,
      color_hex: v.color_hex ?? null,
      price_cop: v.price_cop,
      compare_at_cop: v.compare_at_cop ?? null,
      cost_cop: v.cost_cop ?? null,
      barcode: v.barcode ?? v.sku,
      weight_grams: v.weight_grams ?? null,
      active: v.active ?? true,
      updated_at: new Date().toISOString(),
    };
    let { data: current } = await supabaseAdmin
      .from("product_variants")
      .select("id")
      .eq("external_ref", row.external_ref as string)
      .maybeSingle();
    if (!current) {
      ({ data: current } = await supabaseAdmin.from("product_variants").select("id").eq("sku", v.sku).maybeSingle());
    }

    if (current) {
      const { error } = await supabaseAdmin.from("product_variants").update(row).eq("id", current.id);
      if (error) throw new Error(`variant ${v.sku} (#${i}): ${error.message}`);
      variants.push({ id: current.id, sku: v.sku });
    } else {
      const { data, error } = await supabaseAdmin
        .from("product_variants")
        .insert(row)
        .select("id")
        .single();
      if (error) throw new Error(`variant ${v.sku} (#${i}): ${error.message}`);
      variants.push({ id: data.id, sku: v.sku });
    }
  }

  // Make sure every variant exists in Bodega Central with a level row (qty 0 until dispatch).
  const locationId = await getWildHouseId();
  await supabaseAdmin
    .from("inventory_levels")
    .upsert(
      variants.map((v) => ({ variant_id: v.id, location_id: locationId, on_hand: 0, reserved: 0 })),
      { onConflict: "variant_id,location_id", ignoreDuplicates: true },
    );

  return { product_id: productId, slug, variants };
}

export async function applyDispatch(payload: DispatchPayload) {
  const locationId = await getWildHouseId();
  const applied: { sku: string; variant_id: string; qty: number; on_hand: number }[] = [];

  for (const item of payload.items) {
    const query = supabaseAdmin.from("product_variants").select("id, sku");
    const { data: variant } = item.variant_external_ref
      ? await query.eq("external_ref", item.variant_external_ref).maybeSingle()
      : await query.eq("sku", item.sku ?? "").maybeSingle();

    if (!variant) throw new Error(`Variant not found: ${item.variant_external_ref ?? item.sku}`);

    const { data: level } = await supabaseAdmin
      .from("inventory_levels")
      .select("on_hand, reserved")
      .eq("variant_id", variant.id)
      .eq("location_id", locationId)
      .maybeSingle();

    const onHand = (level?.on_hand ?? 0) + item.qty;
    const { error: upErr } = await supabaseAdmin.from("inventory_levels").upsert(
      {
        variant_id: variant.id,
        location_id: locationId,
        on_hand: onHand,
        reserved: level?.reserved ?? 0,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "variant_id,location_id" },
    );
    if (upErr) throw new Error(upErr.message);

    const { error: movErr } = await supabaseAdmin.from("inventory_movements").insert({
      variant_id: variant.id,
      location_id: locationId,
      kind: "adjustment",
      qty: item.qty,
      ref_type: "rwear_dispatch",
      note: payload.note ?? `R Wear despacho ${payload.reference ?? payload.event_id}`,
    });
    if (movErr) throw new Error(movErr.message);

    applied.push({ sku: variant.sku, variant_id: variant.id, qty: item.qty, on_hand: onHand });
  }

  // R Wear sincroniza las OPs directamente con R-Count: no se envía ajuste.
  const rcount = { skipped: true, reason: "R Wear sincroniza OPs" };

  return { location: "Bodega Central", applied, rcount };
}
