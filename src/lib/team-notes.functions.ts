import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertTeam(supabase: any, userId: string) {
  const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  if (!((data ?? []) as any[]).some((r) => r.role !== "b2b")) throw new Error("Solo para el equipo");
}

/** Miembros del equipo (usuarios con rol distinto a B2B) para mencionar con @. */
export const listTeamMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertTeam(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const ids = Array.from(new Set(((roles ?? []) as any[]).filter((r) => r.role !== "b2b").map((r) => r.user_id as string)));
    if (!ids.length) return [];
    const { data: profs } = await supabaseAdmin.from("profiles").select("id, full_name").in("id", ids);
    const names = new Map(((profs ?? []) as any[]).map((p) => [p.id, p.full_name]));
    const out: { id: string; name: string; email: string }[] = [];
    for (const id of ids) {
      const { data } = await supabaseAdmin.auth.admin.getUserById(id);
      const email = data.user?.email ?? "";
      out.push({ id, name: (names.get(id) as string) || email.split("@")[0] || "Usuario", email });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  });

/** Guarda la nota y avisa por correo a cada persona mencionada. */
export const addTeamNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    entityType: z.string().min(1).max(40),
    entityId: z.string().min(1).max(100),
    body: z.string().trim().min(1).max(4000),
    mentions: z.array(z.string().uuid()).max(20),
    label: z.string().max(200).optional(),
    path: z.string().max(300).regex(/^\/[^\s]*$/).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertTeam(context.supabase, context.userId);
    const { data: note, error } = await (context.supabase as any).from("team_notes")
      .insert({ entity_type: data.entityType, entity_id: data.entityId, body: data.body, mentions: data.mentions, author_id: context.userId })
      .select("id").single();
    if (error) throw new Error(error.message);
    let notified = 0;
    if (data.mentions.length) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { sendOnce, layout, p, esc, SITE } = await import("@/lib/email/resend.server");
      const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role").in("user_id", data.mentions);
      const team = new Set(((roles ?? []) as any[]).filter((r) => r.role !== "b2b").map((r) => r.user_id));
      const { data: me } = await supabaseAdmin.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
      const author = (me as any)?.full_name || "Alguien del equipo";
      const where = data.label || "una nota";
      for (const uid of data.mentions.filter((m) => team.has(m) && m !== context.userId)) {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
        if (!u.user?.email) continue;
        const html = layout("Te mencionaron en una nota",
          p(`<strong>${esc(author)}</strong> te mencionó en ${esc(where)}:`) +
          `<blockquote style="margin:12px 0;padding:12px 16px;background:#f9f4e6;border-left:3px solid #17191a;font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(data.body)}</blockquote>`,
          data.path ? { label: "Ver nota", href: `${SITE}${data.path}` } : undefined);
        const ok = await sendOnce(supabaseAdmin as any, { dedupeKey: `team-note-${note.id}-${uid}`, event: "team_note_mention" as any, to: [u.user.email], subject: `${author} te mencionó · ${where}`, html });
        if (ok) notified++;
      }
    }
    return { id: note.id as string, notified };
  });
