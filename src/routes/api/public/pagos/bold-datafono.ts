import { createFileRoute } from "@tanstack/react-router";

async function hmacHex(secret: string, msg: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function toBase64(s: string) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Webhook de Bold: confirma o rechaza cobros enviados al datáfono desde el POS.
export const Route = createFileRoute("/api/public/pagos/bold-datafono")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const raw = await request.text();
        const secret = process.env["BOLD_TERMINAL_SECRET_KEY"] ?? "";
        const sig = (request.headers.get("x-bold-signature") ?? "").toLowerCase();
        const expected = await hmacHex(secret, toBase64(raw));
        if (!sig || !safeEq(sig, expected)) return new Response("Invalid signature", { status: 401 });
        let evt: any = null;
        try { evt = JSON.parse(raw); } catch { return new Response("Bad request", { status: 400 }); }
        const reference = String(evt?.data?.metadata?.reference ?? "");
        const type = String(evt?.type ?? "");
        if (!UUID.test(reference) || !["SALE_APPROVED", "SALE_REJECTED"].includes(type)) return new Response("ok");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row } = await supabaseAdmin.from("pos_terminal_payments").select("id, status, amount_cop").eq("id", reference).maybeSingle();
        if (!row || row.status === "approved") return new Response("ok");
        const paid = Number(evt?.data?.amount?.total ?? evt?.data?.amount?.total_amount ?? row.amount_cop);
        const approved = type === "SALE_APPROVED" && Math.round(paid) >= Math.round(Number(row.amount_cop));
        await supabaseAdmin.from("pos_terminal_payments").update({
          status: approved ? "approved" : "rejected",
          bold_payment_id: String(evt?.data?.payment_id ?? evt?.subject ?? ""),
          error: approved ? null : type === "SALE_APPROVED" ? "Monto distinto al cobrado" : "Pago rechazado en el datáfono",
          raw: evt, updated_at: new Date().toISOString(),
        }).eq("id", row.id);
        return new Response("ok");
      },
    },
  },
});
