import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RESEND_API = "https://api.resend.com";
const from = async () => (await import("./resend.server")).EMAIL_FROM;

async function assertStaff(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("is_staff", { _user_id: ctx.userId });
  if (!data) throw new Error("Sin permiso");
}

function gatewayHeaders() {
  const rk = process.env["RESEND_API_KEY"];
  if (!rk) throw new Error("Resend no está conectado (falta RESEND_API_KEY)");
  return { "Content-Type": "application/json", Authorization: `Bearer ${rk}` };
}

async function loadCampaign(admin: any, id: string) {
  const { data, error } = await admin.from("email_campaigns").select("id,subject,preheader,blocks,status").eq("id", id).maybeSingle();
  if (error || !data) throw new Error("Campaña no encontrada");
  return data as { id: string; subject: string; preheader: string | null; blocks: any[]; status: string };
}

export const sendCampaignTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ campaignId: z.string().uuid(), to: z.string().trim().email() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { renderCampaignHtml } = await import("./campaign-render");
    const { unsubscribeUrl } = await import("./campaigns.server");
    const c = await loadCampaign(supabaseAdmin, data.campaignId);
    const { personalize } = await import("./campaign-render");
    const html = renderCampaignHtml({ campaignId: c.id, preheader: c.preheader, blocks: c.blocks, unsubscribeUrl: await unsubscribeUrl(supabaseAdmin, data.to), name: "María" });
    const res = await fetch(`${RESEND_API}/emails`, {
      method: "POST", headers: gatewayHeaders(),
      body: JSON.stringify({ from: await from(), to: [data.to], subject: `[Prueba] ${personalize(c.subject, "María")}`, html }),
    });
    if (!res.ok) throw new Error(`Resend [${res.status}]: ${(await res.text()).slice(0, 300)}`);
    return { ok: true };
  });

const Recipient = z.object({ email: z.string().trim().email().max(200), name: z.string().max(120).nullable().optional() });
const EMAIL_OK = z.string().trim().email().max(200);

/** Envía un bloque de hasta 100 destinatarias. El admin lo llama en serie hasta terminar. Correos mal escritos se omiten sin frenar el bloque. */
export const sendCampaignChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => {
    const raw = d as any;
    const recipients = (Array.isArray(raw?.recipients) ? raw.recipients : [])
      .map((r: any) => ({ email: String(r?.email ?? "").trim(), name: r?.name == null ? null : String(r.name).slice(0, 120) }))
      .filter((r: any) => EMAIL_OK.safeParse(r.email).success);
    return z.object({ campaignId: z.string().uuid(), recipients: z.array(Recipient).max(100), last: z.boolean() }).parse({ ...raw, recipients });
  })
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { renderCampaignHtml } = await import("./campaign-render");
    const { unsubscribeUrl } = await import("./campaigns.server");
    const c = await loadCampaign(supabaseAdmin, data.campaignId);

    const emails = Array.from(new Map(data.recipients.map((r) => [r.email.toLowerCase(), r])).values());
    const list = emails.map((r) => r.email.toLowerCase());
    const [{ data: unsubs }, { data: already }] = await Promise.all([
      supabaseAdmin.from("email_unsubscribes" as any).select("email").in("email", list),
      supabaseAdmin.from("email_campaign_recipients" as any).select("email").eq("campaign_id", c.id).in("email", list),
    ]);
    const skip = new Set([...(unsubs ?? []), ...(already ?? [])].map((r: any) => r.email.toLowerCase()));
    const todo = emails.filter((r) => !skip.has(r.email.toLowerCase()));

    let sent = 0, failed = 0;
    if (todo.length) {
      const { personalize } = await import("./campaign-render");
      const payload = await Promise.all(todo.map(async (r) => {
        const unsub = await unsubscribeUrl(supabaseAdmin, r.email);
        return {
          from: await from(), to: [r.email.toLowerCase()], subject: personalize(c.subject, r.name),
          html: renderCampaignHtml({ campaignId: c.id, preheader: c.preheader, blocks: c.blocks, unsubscribeUrl: unsub, name: r.name }),
          headers: { "List-Unsubscribe": `<${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
          tags: [{ name: "campaign_id", value: c.id }],
        };
      }));
      let ids: (string | null)[] = todo.map(() => null);
      for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(`${RESEND_API}/emails/batch`, { method: "POST", headers: gatewayHeaders(), body: JSON.stringify(payload) });
        if (res.status === 429) { await new Promise((r) => setTimeout(r, 1500 * (attempt + 1))); continue; }
        if (!res.ok) { console.error("campaign batch failed", res.status, await res.text()); break; }
        const j = (await res.json()) as { data?: { id: string }[] };
        ids = todo.map((_, i) => j.data?.[i]?.id ?? null);
        break;
      }
      const rows = todo.map((r, i) => ({ campaign_id: c.id, email: r.email.toLowerCase(), name: r.name ?? null, resend_id: ids[i], status: ids[i] ? "sent" : "failed" }));
      await supabaseAdmin.from("email_campaign_recipients" as any).upsert(rows, { onConflict: "campaign_id,email", ignoreDuplicates: true });
      sent = rows.filter((r) => r.status === "sent").length;
      failed = rows.length - sent;
    }
    const { data: cur } = await supabaseAdmin.from("email_campaigns").select("sent_count,failed_count").eq("id", c.id).maybeSingle();
    await supabaseAdmin.from("email_campaigns").update({
      sent_count: ((cur as any)?.sent_count ?? 0) + sent,
      failed_count: ((cur as any)?.failed_count ?? 0) + failed,
      status: data.last ? "sent" : "sending",
      ...(data.last ? { sent_at: new Date().toISOString() } : {}),
    } as any).eq("id", c.id);
    return { sent, failed, skipped: emails.length - todo.length };
  });
