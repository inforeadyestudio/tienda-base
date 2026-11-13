import { getRequestHeader } from "@tanstack/react-start/server";

/** Devuelve el id del usuario si la llamada trae sesión; null para invitados. */
export async function optionalUserId(): Promise<string | null> {
  const auth = getRequestHeader("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}
