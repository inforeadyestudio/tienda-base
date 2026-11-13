import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getRequestHeader } from "@tanstack/react-start/server";
import type { Database } from "@/integrations/supabase/types";

export type ActorType = "public" | "client" | "b2b" | "admin";

export type ReadyActor = {
  type: ActorType;
  userId: string | null;
  roles: string[];
  /** Ubicación a la que está limitado el actor (staff de tienda). */
  locationCode: "cali" | "bogota" | null;
  /** Portal desde donde se abrió el chat, validado contra los roles. */
  portal: import("./admin-tools.server").Portal;
  db: SupabaseClient<Database>;
};

function serverClient(accessToken?: string) {
  const url = process.env["SUPABASE_URL"]!;
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set("apikey", key);
        if (accessToken) h.set("Authorization", `Bearer ${accessToken}`);
        else if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

const STORE_ROLE: Record<string, "cali" | "bogota"> = {
  staff_cali: "cali",
  staff_bogota: "bogota",
};

/**
 * Resuelve quién es el usuario a partir de la sesión. Nunca a partir de datos
 * enviados por el navegador: el modelo jamás decide su propio contexto.
 */
export async function resolveActor(route?: unknown): Promise<ReadyActor> {
  const actor = await resolveBase();
  if (actor.type === "admin") {
    const { portalFromRoute, portalAllowed } = await import("./admin-tools.server");
    const p = portalFromRoute(route);
    actor.portal = portalAllowed(actor, p) ? p : "other";
  }
  return actor;
}

async function resolveBase(): Promise<ReadyActor> {
  const auth = getRequestHeader("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7) : "";
  if (!token) return { type: "public", userId: null, roles: [], locationCode: null, portal: "other", db: serverClient() };

  const db = serverClient(token);
  const { data, error } = await db.auth.getUser(token);
  const user = error ? null : data.user;
  if (!user) return { type: "public", userId: null, roles: [], locationCode: null, portal: "other", db: serverClient() };

  const { data: roleRows } = await db.from("user_roles").select("role").eq("user_id", user.id);
  const roles = (roleRows ?? []).map((r) => String(r.role));

  let type: ActorType = "client";
  if (roles.includes("b2b")) type = "b2b";
  if (roles.some((r) => r !== "b2b")) type = "admin";

  const storeRole = roles.find((r) => r in STORE_ROLE);
  return {
    type,
    userId: user.id,
    roles,
    locationCode: storeRole ? STORE_ROLE[storeRole]! : null,
    portal: "other",
    db,
  };
}

/** Cliente sin sesión, para catálogo público. */
export function publicDb() {
  return serverClient();
}
