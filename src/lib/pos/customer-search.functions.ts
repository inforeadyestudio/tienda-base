import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PosCustomerHit = {
  id: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  document: string | null;
  source: "online" | "shopify" | "order";
};

async function assertStaff(context: any) {
  const { data } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (!data) throw new Error("Forbidden");
}

/** Busca clientas para asignar ventas del POS: perfiles, cuentas por correo, Shopify y pedidos. */
export const searchPosCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().trim().min(2).max(120) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const q = data.q.replace(/[,()%]/g, " ").trim();
    const like = `%${q}%`;
    const isEmail = q.includes("@");

    const [profiles, shop, orders] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, full_name, phone, document_id, is_staff")
        .or(`full_name.ilike.${like},phone.ilike.${like},document_id.ilike.${like}`).limit(20),
      supabaseAdmin.from("shopify_customers").select("user_id, first_name, last_name, email, phone")
        .or(`email.ilike.${like},phone.ilike.${like},first_name.ilike.${like},last_name.ilike.${like}`).limit(20),
      supabaseAdmin.from("orders").select("customer_id, contact_name, contact_email, contact_phone, invoice_document")
        .or(`contact_name.ilike.${like},contact_email.ilike.${like},contact_phone.ilike.${like},invoice_document.ilike.${like}`)
        .order("created_at", { ascending: false }).limit(30),
    ]);

    // Correos de cuentas registradas (búsqueda directa, una sola consulta)
    const emailById = new Map<string, string>();
    const accountHits: string[] = [];
    if (isEmail) {
      const { data: hits } = await (supabaseAdmin.rpc as any)("pos_user_emails", { _q: q, _ids: [] });
      for (const x of (hits ?? []) as { id: string; email: string }[]) { emailById.set(x.id, x.email); accountHits.push(x.id); }
    }

    const ids = new Set<string>([...accountHits]);
    // Una persona del equipo también puede comprar como clienta y acumular puntos.
    // Conservamos su id de cuenta para que el POS consulte el saldo correcto.
    (profiles.data ?? []).forEach((p) => ids.add(p.id));
    (shop.data ?? []).forEach((s) => s.user_id && ids.add(s.user_id));
    (orders.data ?? []).forEach((o) => o.customer_id && ids.add(o.customer_id));

    const profMap = new Map<string, any>();
    if (ids.size) {
      const idList = Array.from(ids);
      const [{ data: ps }, { data: em }] = await Promise.all([
        supabaseAdmin.from("profiles").select("id, full_name, phone, document_id, is_staff").in("id", idList),
        (supabaseAdmin.rpc as any)("pos_user_emails", { _q: null, _ids: idList.filter((id) => !emailById.has(id)) }),
      ]);
      (ps ?? []).forEach((p) => profMap.set(p.id, p));
      for (const x of (em ?? []) as { id: string; email: string }[]) emailById.set(x.id, x.email);
    }

    const out: PosCustomerHit[] = [];
    const seen = new Set<string>();
    const push = (h: PosCustomerHit) => {
      const key = (h.id ?? h.email ?? h.phone ?? h.name).toLowerCase();
      if (seen.has(key) || (h.email && seen.has(h.email.toLowerCase()))) return;
      seen.add(key); if (h.email) seen.add(h.email.toLowerCase());
      out.push(h);
    };
    for (const [id, p] of profMap) {
      push({ id, name: p.full_name ?? "Sin nombre", email: emailById.get(id) ?? null, phone: p.phone, document: p.document_id, source: "online" });
    }
    // Solo enlazamos ids de cuentas reales; filas Shopify/pedidos huérfanas rompen orders_customer_id_fkey.
    const realId = (id: string | null) => (id && (profMap.has(id) || emailById.has(id)) ? id : null);
    for (const s of shop.data ?? []) {
      if (s.user_id && profMap.has(s.user_id)) continue;
      push({ id: realId(s.user_id), name: [s.first_name, s.last_name].filter(Boolean).join(" ") || "Sin nombre", email: s.email, phone: s.phone, document: null, source: "shopify" });
    }
    for (const o of orders.data ?? []) {
      if (o.customer_id && profMap.has(o.customer_id)) continue;
      push({ id: realId(o.customer_id), name: o.contact_name ?? "—", email: o.contact_email, phone: o.contact_phone, document: o.invoice_document, source: "order" });
    }
    return out.slice(0, 30);
  });

/** Guarda la cédula en el perfil si aún no tiene una. */
export const savePosCustomerDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid(), document: z.string().trim().min(4).max(30) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles").update({ document_id: data.document }).eq("id", data.userId).is("document_id", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Crea (o reutiliza) la cuenta de una clienta registrada desde el POS para que acumule puntos con su correo. */
export const ensurePosCustomerAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      name: z.string().trim().min(1).max(120),
      email: z.string().trim().toLowerCase().email().max(200),
      phone: z.string().trim().max(40).nullish(),
      document: z.string().trim().max(30).nullish(),
      city: z.string().trim().max(80).nullish(),
      country: z.string().trim().max(80).nullish(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let userId: string | null = null;
    let created = false;

    const b = new Uint8Array(18);
    crypto.getRandomValues(b);
    const password = Array.from(b, (x) => x.toString(36).padStart(2, "0")).join("") + "A1%";
    const { data: c, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: data.name, source: "pos" },
    });
    if (c?.user) { userId = c.user.id; created = true; }
    else {
      for (let page = 1; page < 50 && !userId; page++) {
        const { data: l, error: le } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
        if (le) break;
        userId = l.users.find((u) => u.email?.toLowerCase() === data.email)?.id ?? null;
        if (l.users.length < 1000) break;
      }
      if (!userId) throw new Error(error?.message ?? "No se pudo crear la cuenta");
    }

    const { data: prof } = await supabaseAdmin.from("profiles").select("full_name, phone, document_id, city, country").eq("id", userId).maybeSingle();
    const patch: { full_name?: string; phone?: string; document_id?: string; city?: string; country?: string } = {};
    if (!prof?.full_name) patch.full_name = data.name;
    if (!prof?.phone && data.phone) patch.phone = data.phone;
    if (!prof?.document_id && data.document) patch.document_id = data.document;
    if (!(prof as any)?.city && data.city) patch.city = data.city;
    if (!(prof as any)?.country && data.country) patch.country = data.country;
    if (prof && Object.keys(patch).length) await supabaseAdmin.from("profiles").update(patch).eq("id", userId);
    else if (!prof) await supabaseAdmin.from("profiles").upsert({ id: userId, full_name: data.name, phone: data.phone ?? null, document_id: data.document ?? null, city: data.city ?? null, country: data.country ?? null } as any);

    // Conecta compras anteriores hechas con ese correo sin cuenta.
    await supabaseAdmin.from("orders").update({ customer_id: userId }).is("customer_id", null).ilike("contact_email", data.email);

    return { id: userId, created };
  });

export type LastCustomerAddress = { line1: string; line2: string; department: string; postal_code: string; city: string; country: string; document: string | null; phone: string | null; email: string | null };

/** Últimos 10 dígitos del celular, para comparar con o sin +57, espacios o guiones. */
export function phoneTail(p: string | null | undefined): string | null {
  const d = String(p ?? "").replace(/\D/g, "");
  return d.length >= 7 ? d.slice(-10) : null;
}

/** Última dirección conocida de una clienta (pedidos anteriores con dirección o libreta de direcciones). */
export const getCustomerLastAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    userId: z.string().uuid().nullish(),
    email: z.string().trim().max(200).nullish(),
    phone: z.string().trim().max(40).nullish(),
  }).parse(d))
  .handler(async ({ data, context }): Promise<LastCustomerAddress | null> => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const filters: string[] = [];
    if (data.userId) filters.push(`customer_id.eq.${data.userId}`);
    const clean = (s: string) => s.replace(/[,()%*]/g, "");
    if (data.email) filters.push(`contact_email.ilike.${clean(data.email)}`);
    const tail = phoneTail(data.phone);
    if (tail) filters.push(`contact_phone.ilike.*${tail}`);
    let doc: string | null = null;
    let phone: string | null = null;
    let email: string | null = null;
    if (data.userId) {
      const { data: prof } = await supabaseAdmin.from("profiles").select("document_id, phone").eq("id", data.userId).maybeSingle();
      doc = (prof as any)?.document_id || null;
      phone = (prof as any)?.phone || null;
    }
    if (filters.length) {
      const { data: rows } = await supabaseAdmin.from("orders").select("ship_to, invoice_document, contact_phone, contact_email")
        .or(filters.join(",")).neq("status", "cancelled").not("ship_to->>line1", "is", null)
        .order("created_at", { ascending: false }).limit(10);
      for (const o of (rows ?? []) as any[]) {
        const s = o.ship_to ?? {};
        doc ??= o.invoice_document || s.document_id || s.identification || null;
        phone ??= o.contact_phone ?? null;
        email ??= o.contact_email ?? null;
        if (s.line1 && String(s.line1).trim()) {
          return { line1: String(s.line1), line2: String(s.line2 ?? ""), department: String(s.department ?? ""), postal_code: String(s.postal_code ?? ""),
            city: String(s.city ?? ""), country: String(s.country ?? "Colombia"), document: doc, phone, email };
        }
      }
      if (!doc) {
        const { data: d } = await supabaseAdmin.from("orders").select("invoice_document").or(filters.join(",")).not("invoice_document", "is", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
        doc = (d as any)?.invoice_document ?? null;
      }
    }
    if (data.userId) {
      const { data: a } = await supabaseAdmin.from("addresses").select("*")
        .eq("user_id", data.userId).order("is_default", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const ad = a as any;
      if (ad?.line1) return { line1: ad.line1, line2: ad.line2 ?? "", department: ad.department ?? ad.region ?? "", postal_code: ad.postal_code ?? "",
        city: ad.city ?? "", country: ad.country ?? "Colombia", document: doc, phone: ad.phone ?? phone, email };
    }
    return doc || phone || email ? { line1: "", line2: "", department: "", postal_code: "", city: "", country: "Colombia", document: doc, phone, email } : null;
  });
