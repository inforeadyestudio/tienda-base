import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (!data) throw new Error("No autorizado");
}

const accountSchema = z.object({
  email: z.string().trim().email("Correo inválido").max(255),
  fullName: z.string().trim().min(1, "Nombre requerido").max(120),
  company: z.string().trim().min(1, "Empresa requerida").max(160),
  password: z.string().min(8, "La clave debe tener al menos 8 caracteres").max(72),
  phone: z.string().trim().max(40).optional(),
  country: z.string().trim().max(80).optional(),
  city: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
  address: z.string().trim().max(300).optional(),
  postalCode: z.string().trim().max(20).optional(),
  documentId: z.string().trim().min(3, "La identificación es obligatoria").max(60),
});

export const createB2BAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => accountSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.toLowerCase();

    let userId: string | null = null;
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName, phone: data.phone ?? null, company: data.company },
    });
    if (created?.user) userId = created.user.id;
    else {
      // Si ya existe, reutilizamos la cuenta y actualizamos su clave.
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const found = list?.users.find((u) => u.email?.toLowerCase() === email);
      if (!found) throw new Error(error?.message ?? "No se pudo crear la cuenta");
      userId = found.id;
      await supabaseAdmin.auth.admin.updateUserById(userId, { password: data.password });
    }

    const { error: pErr } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      full_name: data.fullName,
      phone: data.phone || null,
      company_name: data.company,
      document_id: data.documentId,
    } as any);
    if (pErr) throw new Error(pErr.message);

    const { data: has } = await supabaseAdmin
      .from("user_roles").select("id").eq("user_id", userId).eq("role", "b2b").maybeSingle();
    if (!has) {
      const { error: rErr } = await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "b2b" });
      if (rErr) throw new Error(rErr.message);
    }
    if (data.address && data.city) {
      await supabaseAdmin.from("addresses").update({ is_default: false } as any).eq("user_id", userId);
      const { error: aErr } = await supabaseAdmin.from("addresses").insert({
        user_id: userId,
        label: "Principal",
        recipient: data.company || data.fullName,
        phone: data.phone || null,
        line1: data.address,
        city: data.city,
        department: data.department || null,
        postal_code: data.postalCode || null,
        country: data.country || null,
        is_default: true,
      } as any);
      if (aErr) throw new Error(aErr.message);
    }
    return { userId, existed: !created?.user };
  });

// Dar acceso B2B a una cuenta ya registrada (desde el CRM).
export const grantB2BAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      userId: z.string().uuid(),
      company: z.string().trim().max(160).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: has } = await supabaseAdmin
      .from("user_roles").select("id").eq("user_id", data.userId).eq("role", "b2b").maybeSingle();
    if (has) return { userId: data.userId, already: true };

    const { error: rErr } = await supabaseAdmin
      .from("user_roles").insert({ user_id: data.userId, role: "b2b" });
    if (rErr) throw new Error(rErr.message);

    if (data.company) {
      await supabaseAdmin.from("profiles").update({ company_name: data.company } as any).eq("id", data.userId);
    }
    return { userId: data.userId, already: false };
  });

const orderSchema = z.object({
  customerId: z.string().uuid(),
  currency: z.enum(["USD", "COP"]),
  notes: z.string().max(1000).optional(),
  mode: z.enum(["direct", "consignment"]).default("direct"),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        qty: z.number().int().min(1).max(10000),
        unitPrice: z.number().min(0),
        priceCop: z.number().min(0),
        productName: z.string().max(200),
        variantLabel: z.string().max(200).nullable(),
        source: z.enum(["restock", "preventa"]),
        locationId: z.string().uuid(),
      }),
    )
    .min(1, "Agrega al menos una referencia"),
});

export const createManualB2BOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => orderSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: isB2B } = await supabaseAdmin
      .from("user_roles").select("id").eq("user_id", data.customerId).eq("role", "b2b").maybeSingle();
    if (!isB2B) throw new Error("La cuenta no tiene acceso B2B");

    const [{ data: profile }, { data: authUser }, { data: defaultAddress }] = await Promise.all([
      supabaseAdmin.from("profiles").select("full_name, company_name, phone, document_id").eq("id", data.customerId).maybeSingle(),
      supabaseAdmin.auth.admin.getUserById(data.customerId),
      supabaseAdmin.from("addresses").select("recipient, phone, line1, line2, city, department, postal_code, country").eq("user_id", data.customerId).order("is_default", { ascending: false }).limit(1).maybeSingle(),
    ]);

    // Validar existencias de Restock ANTES de crear el pedido: así un faltante no
    // deja pedidos a medio crear, correos enviados ni unidades apartadas.
    const restock = data.items.filter((i) => i.source === "restock");
    if (restock.length) {
      const { data: levels } = await supabaseAdmin.from("inventory_levels")
        .select("variant_id, location_id, on_hand, reserved")
        .in("variant_id", restock.map((i) => i.variantId));
      const need = new Map<string, { qty: number; name: string }>();
      for (const i of restock) {
        const k = `${i.variantId}:${i.locationId}`;
        need.set(k, { qty: (need.get(k)?.qty ?? 0) + i.qty, name: [i.productName, i.variantLabel].filter(Boolean).join(" ") });
      }
      const missing: string[] = [];
      for (const [k, n] of need) {
        const [variantId, locationId] = k.split(":");
        const l: any = (levels ?? []).find((x: any) => x.variant_id === variantId && x.location_id === locationId);
        const available = Math.max(0, Number(l?.on_hand ?? 0) - Number(l?.reserved ?? 0));
        if (available < n.qty) missing.push(`${n.name} (pides ${n.qty}, hay ${available})`);
      }
      if (missing.length) throw new Error(`Sin unidades suficientes en la bodega: ${missing.join(", ")}`);
    }

    const totalCop = data.items.reduce((s, i) => s + i.priceCop * i.qty, 0);
    const total = data.items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
    const number = `B2B-${Date.now().toString(36).toUpperCase()}`;
    const p = profile as any;

    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .insert({
        number,
        customer_id: data.customerId,
        contact_name: p?.company_name || p?.full_name || null,
        contact_email: authUser?.user?.email ?? null,
         contact_phone: p?.phone ?? defaultAddress?.phone ?? null,
         ship_to: {
           recipient: defaultAddress?.recipient || p?.company_name || p?.full_name || null,
           phone: defaultAddress?.phone || p?.phone || null,
           email: authUser?.user?.email ?? null,
           identification: p?.document_id ?? null,
           line1: defaultAddress?.line1 ?? null,
           line2: defaultAddress?.line2 ?? null,
           city: defaultAddress?.city ?? null,
           department: defaultAddress?.department ?? null,
           postal_code: defaultAddress?.postal_code ?? null,
           country: defaultAddress?.country ?? null,
         },
        subtotal_cop: 0,
        shipping_cop: 0,
        discount_cop: 0,
        total_cop: 0,
        total_usd: data.currency === "USD" ? Math.round(total) : null,
        currency: data.currency,
        status: "draft",
        source: "assisted",
        b2b_mode: data.mode,
        notes: (data.mode === "consignment" ? "[CONSIGNACIÓN] " : "") + (data.notes ? `Pedido manual · ${data.notes}` : "Pedido manual"),
      } as any)
      .select("id, number")
      .single();
    if (error || !order) throw new Error(error?.message ?? "No se pudo crear el pedido");

    try {
      for (const item of data.items) {
        const { data: itemId, error: itemError } = await context.supabase.rpc("add_b2b_order_item", {
          _order_id: order.id,
          _variant_id: item.variantId,
          _location_id: item.locationId,
          _qty: item.qty,
          _source: item.source,
        });
        if (itemError || !itemId) throw new Error(itemError?.message ?? "No se pudo asignar el origen de una referencia");
        const { error: priceError } = await supabaseAdmin.from("order_items").update({
          unit_price_cop: item.priceCop,
          product_name: item.productName,
          variant_label: item.variantLabel,
        } as any).eq("id", itemId).eq("order_id", order.id);
        if (priceError) throw new Error(priceError.message);
      }
      const { error: totalError } = await supabaseAdmin.from("orders").update({
        subtotal_cop: totalCop,
        total_cop: totalCop,
        total_usd: data.currency === "USD" ? Math.round(total) : null,
      } as any).eq("id", order.id);
      if (totalError) throw new Error(totalError.message);
    } catch (allocationError) {
      // Devolver lo que alcanzó a apartarse antes de borrar el pedido.
      const { data: held } = await supabaseAdmin.from("reservations")
        .select("variant_id, location_id, qty").eq("order_id", order.id).eq("status", "active");
      for (const r of held ?? []) {
        const { data: lvl } = await supabaseAdmin.from("inventory_levels").select("reserved")
          .eq("variant_id", r.variant_id).eq("location_id", r.location_id).maybeSingle();
        if (lvl) await supabaseAdmin.from("inventory_levels")
          .update({ reserved: Math.max(0, Number(lvl.reserved) - Number(r.qty)) })
          .eq("variant_id", r.variant_id).eq("location_id", r.location_id);
      }
      await supabaseAdmin.from("reservations").delete().eq("order_id", order.id);
      await supabaseAdmin.from("orders").delete().eq("id", order.id);
      throw allocationError;
    }
    return { id: order.id, number: order.number, warning: null };
  });
