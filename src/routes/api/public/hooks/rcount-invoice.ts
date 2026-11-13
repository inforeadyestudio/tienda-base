import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const schema = z.object({
  external_id: z.string().min(1).max(60),
  number: z.string().max(60).optional().nullable(),
  cufe: z.string().max(200).optional().nullable(),
  pdf_url: z.string().url().max(1000).optional().nullable(),
  issued_at: z.string().max(40).optional().nullable(),
  status: z.enum(["sent", "rejected"]),
  error: z.string().max(1000).optional().nullable(),
});

function safeEqual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// R-Count avisa aquí cuando la factura sale a la DIAN con su número oficial de Factus.
export const Route = createFileRoute("/api/public/hooks/rcount-invoice")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env["RWEAR_API_KEY"] ?? "";
        if (!expected) return Response.json({ error: "Integration not configured" }, { status: 503 });
        if (!safeEqual(request.headers.get("x-rwear-key") ?? "", expected)) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const parsed = schema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: "Bad request", issues: parsed.error.issues }, { status: 400 });
        const p = parsed.data;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // Cada centro tiene su propio rango, pero si dos compartieran el número
        // se actualiza la que siga pendiente (nunca una ya emitida).
        const { data: rows } = await supabaseAdmin.from("invoices").select("id, status").eq("provider", "rcount_co").eq("external_id", p.external_id).order("created_at", { ascending: false }).limit(10);
        const inv = rows?.find((r) => r.status !== "issued") ?? rows?.[0];
        if (!inv) return Response.json({ error: "Invoice not found" }, { status: 404 });
        if (inv.status === "issued") return Response.json({ ok: true, already: true });
        const update = p.status === "sent"
          ? { status: "issued", number: p.number ?? null, cufe: p.cufe ?? null, pdf_url: p.pdf_url ?? null, issued_at: p.issued_at ?? new Date().toISOString(), error: null }
          : { status: "error", error: p.error ?? "Rechazada por la DIAN" };
        const { error } = await supabaseAdmin.from("invoices").update({ ...update, updated_at: new Date().toISOString() }).eq("id", inv.id);
        if (error) return Response.json({ error: "Update failed" }, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
