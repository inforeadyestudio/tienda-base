import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/rwear/dispatch")({
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

        const parsed = api.dispatchSchema.safeParse(body);
        if (!parsed.success) {
          return api.json({ error: "Validation failed", issues: parsed.error.issues }, 422);
        }
        const payload = parsed.data;

        try {
          const previous = await api.findEvent(payload.event_id);
          if (previous) return api.json({ ok: true, idempotent: true, ...(previous as object) });

          const result = await api.applyDispatch(payload);
          await api.recordEvent(payload.event_id, "shipment.dispatched", payload, result);
          return api.json({ ok: true, ...result });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unexpected error";
          console.error("[rwear/dispatch]", message);
          return api.json({ error: "Internal error" }, 500);
        }
      },
    },
  },
});
