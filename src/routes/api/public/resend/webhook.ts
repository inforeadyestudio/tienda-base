import { createFileRoute } from "@tanstack/react-router";

// Recibe eventos de Resend (entregado, abierto, clic, rebote) firmados con Svix.
async function verify(secret: string, id: string, ts: string, body: string, header: string) {
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 600) return false;
  const raw = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`));
  const expected = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return header.split(" ").some((p) => {
    const v = p.split(",")[1] ?? "";
    if (v.length !== expected.length) return false;
    let d = 0;
    for (let i = 0; i < v.length; i++) d |= v.charCodeAt(i) ^ expected.charCodeAt(i);
    return d === 0;
  });
}

export const Route = createFileRoute("/api/public/resend/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.text();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: sec } = await supabaseAdmin.from("integration_secrets").select("value").eq("key", "resend_webhook_secret").maybeSingle();
        const id = request.headers.get("svix-id") ?? "";
        const ts = request.headers.get("svix-timestamp") ?? "";
        const sig = request.headers.get("svix-signature") ?? "";
        if (!sec?.value || !id || !(await verify(sec.value, id, ts, body, sig))) return new Response("Unauthorized", { status: 401 });

        let evt: { type?: string; created_at?: string; data?: { email_id?: string } };
        try { evt = JSON.parse(body); } catch { return new Response("Bad request", { status: 400 }); }
        const emailId = evt.data?.email_id;
        if (!emailId || !evt.type) return new Response("ok");
        const { data: row } = await supabaseAdmin.from("email_campaign_recipients" as any)
          .select("id,opened_at,clicked_at,open_count,click_count").eq("resend_id", emailId).maybeSingle();
        const r = row as { id: string; opened_at: string | null; clicked_at: string | null; open_count: number; click_count: number } | null;
        if (!r) return new Response("ok");
        const at = evt.created_at ?? new Date().toISOString();
        const patch: Record<string, unknown> = {};
        if (evt.type === "email.delivered") patch.delivered_at = at;
        if (evt.type === "email.opened") { patch.open_count = r.open_count + 1; if (!r.opened_at) patch.opened_at = at; }
        if (evt.type === "email.clicked") {
          patch.click_count = r.click_count + 1; patch.clicked_at = at;
          if (!r.opened_at) { patch.opened_at = at; patch.open_count = Math.max(1, r.open_count); }
        }
        if (evt.type === "email.bounced") { patch.bounced_at = at; patch.status = "bounced"; }
        if (evt.type === "email.complained") {
          patch.status = "complained";
          const { data: e } = await supabaseAdmin.from("email_campaign_recipients" as any).select("email").eq("id", r.id).maybeSingle();
          if ((e as any)?.email) await supabaseAdmin.from("email_unsubscribes" as any).upsert({ email: (e as any).email }, { onConflict: "email", ignoreDuplicates: true });
        }
        if (Object.keys(patch).length) await supabaseAdmin.from("email_campaign_recipients" as any).update(patch).eq("id", r.id);
        return new Response("ok");
      },
    },
  },
});
