import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

type AppRole = Database["public"]["Enums"]["app_role"];

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data: isSuper } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "superadmin",
  });
  const { data: isAdminEcom } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin_ecommerce",
  });
  if (!isSuper && !isAdminEcom) throw new Error("No autorizado");
}

export type CreateUserInput = {
  email: string;
  password: string;
  fullName?: string;
  phone?: string;
  isStaff?: boolean;
  posPin?: string;
  documentId?: string;
  address?: string;
  roles?: AppRole[];
};

export const createUserInputSchema = z.object({
  email: z.string().trim().email("Email inválido").max(255),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres").max(72),
  fullName: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  isStaff: z.boolean().optional(),
  posPin: z.string().trim().max(20).optional(),
  documentId: z.string().trim().min(3, "La identificación es obligatoria").max(60).optional(),
  address: z.string().trim().max(300).optional(),
  roles: z.array(z.custom<AppRole>()).optional(),
});

export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: CreateUserInput) => createUserInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email.trim().toLowerCase(),
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName ?? null, phone: data.phone ?? null },
    });
    if (error || !created.user) throw new Error(error?.message ?? "No se pudo crear el usuario");

    const userId = created.user.id;

    const { error: pErr } = await supabaseAdmin.from("profiles").upsert({
      id: userId,
      full_name: data.fullName || null,
      phone: data.phone || null,
      is_staff: !!data.isStaff,
      pos_pin: data.posPin || null,
      document_id: data.documentId || null,
      address: data.address || null,
    });
    if (pErr) throw new Error(pErr.message);

    const roles = data.roles ?? [];
    if (roles.length > 0) {
      const { error: rErr } = await supabaseAdmin
        .from("user_roles")
        .insert(roles.map((role) => ({ user_id: userId, role })));
      if (rErr) throw new Error(rErr.message);
    }

    return { userId, email: created.user.email };
  });

export type UpdateUserInput = {
  userId: string;
  fullName?: string | null;
  phone?: string | null;
  posPin?: string | null;
  isStaff: boolean;
  roles: AppRole[];
};

export const adminUpdateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: UpdateUserInput) => {
    if (!input?.userId) throw new Error("Usuario requerido");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: pErr } = await supabaseAdmin
      .from("profiles")
      .update({
        full_name: data.fullName || null,
        phone: data.phone || null,
        pos_pin: data.posPin || null,
        is_staff: !!data.isStaff,
      })
      .eq("id", data.userId);
    if (pErr) throw new Error(pErr.message);

    const { data: current, error: cErr } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.userId);
    if (cErr) throw new Error(cErr.message);

    const existing = (current ?? []).map((r) => r.role as AppRole);
    const next = data.roles ?? [];
    const toRemove = existing.filter((r) => !next.includes(r));
    const toAdd = next.filter((r) => !existing.includes(r));

    if (toRemove.length > 0) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .in("role", toRemove);
      if (error) throw new Error(error.message);
    }
    if (toAdd.length > 0) {
      const { error } = await supabaseAdmin
        .from("user_roles")
        .insert(toAdd.map((role) => ({ user_id: data.userId, role })));
      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });

export const adminSetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string; password: string }) => {
    if (!input?.userId) throw new Error("Usuario requerido");
    if (!input?.password || input.password.length < 8)
      throw new Error("La contraseña debe tener al menos 8 caracteres");
    return input;
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error) throw new Error(error.message);
    return data.users.map((u) => ({ id: u.id, email: u.email ?? null }));
  });
