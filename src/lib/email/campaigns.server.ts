import { SITE_ORIGIN } from "@/lib/site";
// Utilidades de campañas solo para servidor.
type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function hmacKey(admin: Admin) {
  const { data } = await admin.from("integration_secrets").select("value").eq("key", "rcount_hook_token").maybeSingle();
  if (!data?.value) throw new Error("Falta la clave interna");
  return data.value as string;
}

async function hmacHex(key: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function unsubscribeToken(admin: Admin, email: string) {
  return (await hmacHex(await hmacKey(admin), `unsub:${email.toLowerCase()}`)).slice(0, 32);
}

export async function unsubscribeUrl(admin: Admin, email: string) {
  const t = await unsubscribeToken(admin, email);
  return `${SITE_ORIGIN}/api/public/email/baja?e=${encodeURIComponent(email.toLowerCase())}&t=${t}`;
}

export async function verifyUnsubscribe(admin: Admin, email: string, token: string) {
  const expected = await unsubscribeToken(admin, email);
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

/** Atribuye una compra pagada a la última campaña en la que la clienta hizo clic (7 días). */
export async function attributePurchase(admin: Admin, order: { id: string; contact_email: string | null; total_cop: number; paid_at?: string | null; created_at: string }) {
  const email = order.contact_email?.trim().toLowerCase();
  if (!email) return;
  const at = order.paid_at ?? order.created_at;
  const since = new Date(new Date(at).getTime() - 7 * 86400_000).toISOString();
  const { data } = await admin.from("email_campaign_recipients" as any)
    .select("id").ilike("email", email).is("order_id", null).not("clicked_at", "is", null)
    .gte("clicked_at", since).lte("clicked_at", at).order("clicked_at", { ascending: false }).limit(1);
  const row = (data as { id: string }[] | null)?.[0];
  if (!row) return;
  await admin.from("email_campaign_recipients" as any).update({ order_id: order.id, order_total_cop: order.total_cop, purchased_at: at }).eq("id", row.id);
}
