import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/rwear/ping")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const api = await import("@/lib/rwear/api.server");
        const denied = api.authorize(request);
        if (denied) return denied;
        return api.json({ ok: true, warehouse: "Wild House", ts: new Date().toISOString() });
      },
    },
  },
});
