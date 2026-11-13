import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { createRateLimiter, SERVER_MAX_BYTES, SERVER_MAX_EVENTS } from "@/lib/analytics-batch.js";

const EVENT_NAMES = [
  "page_view", "product_view", "color_selected", "size_selected", "fit_viewed", "ready_assisted",
  "look_opened", "cross_sell_selected", "selection_added", "lookbook_started", "lookbook_25",
  "lookbook_50", "lookbook_75", "lookbook_completed", "quick_buy_opened", "lookbook_gallery_interaction",
] as const;

const s = (max: number) => z.string().max(max).nullish();
const EventSchema = z.object({
  name: z.enum(EVENT_NAMES),
  session_id: z.string().min(1).max(64),
  path: s(500),
  payload: z.record(z.unknown()).nullish(),
  device: s(20),
  country: s(80),
  city: s(120),
  referrer: s(1000),
  referrer_host: s(255),
  utm_source: s(255),
  utm_medium: s(255),
  utm_campaign: s(255),
  created_at: z.string().datetime().nullish(),
});
const BodySchema = z.object({
  token: z.string().max(4000).nullish(),
  events: z.array(EventSchema).min(1).max(SERVER_MAX_EVENTS),
});

const allow = createRateLimiter();

export const Route = createFileRoute("/api/public/analytics/batch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
        if (!allow(ip)) return new Response(null, { status: 429 });

        const raw = await request.text();
        if (raw.length > SERVER_MAX_BYTES) return new Response(null, { status: 413 });
        let parsed;
        try {
          parsed = BodySchema.safeParse(JSON.parse(raw));
        } catch {
          return new Response(null, { status: 400 });
        }
        if (!parsed.success) return new Response(null, { status: 400 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        let userId: string | null = null;
        if (parsed.data.token) {
          const { data } = await supabaseAdmin.auth.getUser(parsed.data.token).catch(() => ({ data: { user: null } }) as any);
          userId = data?.user?.id ?? null;
        }
        const now = Date.now();
        const rows = parsed.data.events.map((e) => {
          // Fecha del navegador solo si es razonable (últimas 24 h); si no, la del servidor.
          const t = e.created_at ? Date.parse(e.created_at) : NaN;
          const created_at = Number.isFinite(t) && t <= now + 60_000 && now - t < 86_400_000 ? new Date(t).toISOString() : new Date(now).toISOString();
          return { ...e, payload: (e.payload ?? {}) as any, user_id: userId, created_at };
        });
        const { error } = await supabaseAdmin.from("analytics_events").insert(rows as any);
        if (error) return new Response(null, { status: 500 });
        return new Response(null, { status: 204 });
      },
    },
  },
});
