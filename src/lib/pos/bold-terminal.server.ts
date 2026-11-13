const BASE = "https://integrations.api.bold.co";
export const BOLD_SETTINGS_KEY = "bold_terminals";

export type BoldTerminal = { serial: string; model: string; name: string; location_id: string | null };
export type BoldSettings = { terminals: BoldTerminal[] };

function apiKey() {
  const k = process.env["BOLD_TERMINAL_API_KEY"];
  if (!k) throw new Error("Falta la llave de API datáfono de Bold");
  return k;
}

async function bold(path: string, init?: RequestInit) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `x-api-key ${apiKey()}`, ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch { /* */ }
  if (!res.ok) {
    const err = body?.errors?.[0];
    const msg = err?.message ?? err?.code ?? body?.message ?? `Bold respondió ${res.status}`;
    console.error("bold error", res.status, text.slice(0, 500));
    throw new Error(String(msg));
  }
  return body;
}

export async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export async function readSettings(): Promise<BoldSettings> {
  const sb = await admin();
  const { data } = await sb.from("app_settings").select("value").eq("key", BOLD_SETTINGS_KEY).maybeSingle();
  const v = (data?.value ?? {}) as any;
  return { terminals: Array.isArray(v.terminals) ? v.terminals : [] };
}

export async function saveSettings(s: BoldSettings) {
  const sb = await admin();
  const { error } = await sb.from("app_settings").upsert({ key: BOLD_SETTINGS_KEY, value: s as any } as any, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

export async function listBoundTerminals() {
  const body = await bold("/payments/binded-terminals");
  return ((body?.payload?.available_terminals ?? []) as any[]).map((t) => ({
    serial: String(t.terminal_serial ?? ""), model: String(t.terminal_model ?? ""), name: String(t.name ?? ""), status: String(t.status ?? ""),
  }));
}

export async function createCheckout(p: { amount: number; terminal: BoldTerminal; reference: string; sellerEmail: string; description: string; payer?: { email?: string | null; phone?: string | null; document?: string | null } }) {
  const payer: any = {};
  if (p.payer?.email) payer.email = p.payer.email;
  if (p.payer?.phone) payer.phone_number = p.payer.phone.replace(/\D/g, "").slice(-10);
  const doc = (p.payer?.document ?? "").replace(/\D/g, "");
  if (doc.length >= 4 && doc.length <= 15 && doc !== "222222222222") payer.document = { document_type: "CEDULA", document_number: doc };
  const iva = Math.round(p.amount - p.amount / 1.19);
  const body = await bold("/payments/app-checkout", {
    method: "POST",
    body: JSON.stringify({
      amount: { currency: "COP", taxes: [{ type: "VAT", value: iva }], tip_amount: 0, total_amount: Math.round(p.amount) },
      payment_method: "POS",
      terminal_model: p.terminal.model,
      terminal_serial: p.terminal.serial,
      reference: p.reference,
      user_email: p.sellerEmail,
      description: p.description.slice(0, 100),
      payer,
    }),
  });
  return String(body?.payload?.integration_id ?? "");
}
