type RoleResult = { data: unknown; error: unknown };
type ShippingContext = {
  userId: string;
  supabase: { rpc: (name: string, args: Record<string, string>) => PromiseLike<RoleResult> };
};

/** Only shipping roles may operate labels; configuration remains admin-only. */
export async function assertShipper(context: ShippingContext): Promise<void> {
  const admin = await context.supabase.rpc("is_admin", { _user_id: context.userId });
  if (admin.error) throw new Error("No pudimos verificar tu permiso para generar guías.");
  if (admin.data === true) return;
  const roles = await Promise.all(["bodega", "jefe_tiendas"].map((_role) =>
    context.supabase.rpc("has_role", { _user_id: context.userId, _role }),
  ));
  if (roles.some((role) => role.error)) throw new Error("No pudimos verificar tu permiso para generar guías.");
  if (!roles.some((role) => role.data === true)) throw new Error("Solo administradores, bodega o jefatura de tiendas.");
}