import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type ShopifyCustomerRow = {
  shopifyId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  address1?: string;
  address2?: string;
  city?: string;
  provinceCode?: string;
  countryCode?: string;
  zip?: string;
  totalSpent?: number;
  ordersCount?: number;
  tags?: string;
  note?: string;
  acceptsEmailMarketing?: boolean;
};

type Input = { rows: ShopifyCustomerRow[]; passwordMode: "temp" | "random"; tempPassword?: string };

function randomPassword() {
  const b = new Uint8Array(18);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(36).padStart(2, "0")).join("") + "A1%";
}

export const importShopifyCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: Input) => {
    if (!Array.isArray(input?.rows) || input.rows.length > 200) throw new Error("Lote inválido");
    if (input.passwordMode === "temp" && (!input.tempPassword || input.tempPassword.length < 8))
      throw new Error("La clave temporal debe tener al menos 8 caracteres");
    return input;
  })
  .handler(async ({ data, context }) => {
    const [{ data: s }, { data: a }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "superadmin" }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin_ecommerce" }),
    ]);
    if (!s && !a) throw new Error("No autorizado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let existingMap: Map<string, string> | null = null;
    const findExisting = async (email: string) => {
      if (!existingMap) {
        existingMap = new Map();
        for (let page = 1; page < 50; page++) {
          const { data: l, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
          if (error) break;
          for (const u of l.users) if (u.email) existingMap.set(u.email.toLowerCase(), u.id);
          if (l.users.length < 1000) break;
        }
      }
      return existingMap.get(email) ?? null;
    };

    let created = 0, existing = 0, noEmail = 0;
    const errors: { shopifyId: string; email?: string; error: string }[] = [];

    for (const r of data.rows) {
      const email = r.email?.trim().toLowerCase() || null;
      const fullName = [r.firstName, r.lastName].filter(Boolean).join(" ").trim() || null;
      let userId: string | null = null;
      try {
        if (email) {
          const { data: c, error } = await supabaseAdmin.auth.admin.createUser({
            email,
            password: data.passwordMode === "temp" ? data.tempPassword! : randomPassword(),
            email_confirm: true,
            user_metadata: {
              full_name: fullName,
              phone: r.phone ?? null,
              must_change_password: data.passwordMode === "temp",
              imported_from: "shopify",
            },
          });
          if (c?.user) {
            userId = c.user.id;
            created++;
            await supabaseAdmin.from("profiles").upsert({ id: userId, full_name: fullName, phone: r.phone || null });
            if (r.address1 && r.city) {
              await supabaseAdmin.from("addresses").insert({
                user_id: userId,
                recipient: fullName ?? email,
                line1: r.address1,
                line2: r.address2 || null,
                city: r.city,
                department: r.provinceCode || null,
                postal_code: r.zip || null,
                phone: r.phone || null,
                is_default: true,
                label: "Principal",
              });
            }
          } else if (error && /already|registered|exists/i.test(error.message)) {
            userId = await findExisting(email);
            existing++;
            if (userId) {
              const { data: p } = await supabaseAdmin.from("profiles").select("full_name, phone").eq("id", userId).maybeSingle();
              const patch: { full_name?: string; phone?: string } = {};
              if (!p?.full_name && fullName) patch.full_name = fullName;
              if (!p?.phone && r.phone) patch.phone = r.phone;
              if (Object.keys(patch).length) await supabaseAdmin.from("profiles").update(patch).eq("id", userId);
            }
          } else if (error) {
            throw error;
          }
        } else {
          noEmail++;
        }

        const { error: sErr } = await supabaseAdmin.from("shopify_customers").upsert(
          {
            shopify_id: r.shopifyId,
            first_name: r.firstName || null,
            last_name: r.lastName || null,
            email,
            phone: r.phone || null,
            company: r.company || null,
            address1: r.address1 || null,
            address2: r.address2 || null,
            city: r.city || null,
            province_code: r.provinceCode || null,
            country_code: r.countryCode || null,
            zip: r.zip || null,
            total_spent: r.totalSpent ?? 0,
            orders_count: r.ordersCount ?? 0,
            tags: r.tags || null,
            note: r.note || null,
            accepts_email_marketing: !!r.acceptsEmailMarketing,
            ...(userId ? { user_id: userId } : {}),
          },
          { onConflict: "shopify_id" },
        );
        if (sErr) throw sErr;
      } catch (e) {
        errors.push({ shopifyId: r.shopifyId, email: email ?? undefined, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { created, existing, noEmail, errors };
  });
