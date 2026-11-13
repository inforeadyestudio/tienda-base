import { createFileRoute } from "@tanstack/react-router";

const page = (msg: string) => new Response(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tu Marca</title></head><body style="font-family:Helvetica,Arial,sans-serif;background:#f9f4e6;color:#17191a;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0"><div style="max-width:420px;padding:32px;text-align:center"><p style="letter-spacing:.35em;text-transform:uppercase;font-size:13px">Tu Marca</p><p style="font-size:16px;line-height:1.6">${msg}</p><a href="https://www.tumarca.com" style="color:#17191a;font-size:13px">Volver a la tienda</a></div></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });

async function unsubscribe(request: Request) {
  const u = new URL(request.url);
  const email = (u.searchParams.get("e") ?? "").trim().toLowerCase();
  const token = u.searchParams.get("t") ?? "";
  if (!email || !token) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { verifyUnsubscribe } = await import("@/lib/email/campaigns.server");
  if (!(await verifyUnsubscribe(supabaseAdmin, email, token))) return null;
  await supabaseAdmin.from("email_unsubscribes" as any).upsert({ email }, { onConflict: "email", ignoreDuplicates: true });
  return email;
}

export const Route = createFileRoute("/api/public/email/baja")({
  server: {
    handlers: {
      GET: async ({ request }) => ((await unsubscribe(request)) ? page("Listo. Ya no recibirás nuestras campañas. Seguirás recibiendo los correos de tus pedidos.") : page("El enlace no es válido.")),
      POST: async ({ request }) => ((await unsubscribe(request)) ? new Response("ok") : new Response("Bad request", { status: 400 })),
    },
  },
});
