import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/rwear/cut-curve")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const api = await import("@/lib/rwear/api.server");
        const denied = api.authorize(request);
        if (denied) return denied;

        let body: unknown;
        try {
          body = await request.json();
        } catch {
          return api.json({ error: "Invalid JSON body" }, 400);
        }

        const logRejection = async (error: string, payload: unknown) => {
          try {
            const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
            const ev = (payload && typeof payload === "object" ? (payload as any).event_id : null) ?? null;
            await supabaseAdmin.from("rwear_rejections").insert({ event_id: typeof ev === "string" ? ev.slice(0, 120) : null, kind: "cut.curve", payload: payload as any, error: error.slice(0, 2000) });
          } catch (e) { console.error("[rwear/cut-curve] log failed", e); }
        };

        const parsed = api.cutCurveSchema.safeParse(body);
        if (!parsed.success) {
          await logRejection("Validation failed: " + JSON.stringify(parsed.error.issues), body);
          return api.json({ error: "Validation failed", issues: parsed.error.issues }, 422);
        }

        try {
          const result = await api.applyCutCurve(parsed.data);
          return api.json({ ok: true, ...result as object });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unexpected error";
          console.error("[rwear/cut-curve]", message);
          await logRejection(message, body);
          if (/Unknown SKU|not active Quality A|Invalid cut curve|Duplicate SKU|different event type/i.test(message)) {
            return api.json({ error: message }, 422);
          }
          return api.json({ error: "Could not apply cut curve" }, 500);
        }
      },
    },
  },
});