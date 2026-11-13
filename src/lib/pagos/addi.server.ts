// Integración con Addi (compra ahora, paga después) según la guía oficial de Custom Integrations:
// 1) config pública por ally slug (topes), 2) token OAuth nuevo por transacción,
// 3) POST /v1/online-applications que responde 301 con Location, 4) callback con Basic Auth
// que Addi envía con el estado final y al que se responde 200 con el mismo JSON.
import type { SupabaseClient } from "@supabase/supabase-js";

export type AddiSettings = { enabled: boolean; mode: "sandbox" | "live"; allyId: string; clientId: string; callbackUser: string };

export async function addiSettings(db: SupabaseClient): Promise<AddiSettings> {
  const { data: setting } = await db.from("app_settings").select("value").eq("key", "payment_settings").maybeSingle();
  const raw = ((setting?.value ?? {}) as { addi?: Record<string, unknown> }).addi ?? {};
  return {
    enabled: raw.enabled === true,
    mode: raw.mode === "live" ? "live" : "sandbox",
    allyId: String(raw.allyId ?? "").trim(),
    clientId: String(raw.clientId ?? "").trim(),
    callbackUser: String(raw.callbackUser ?? "").trim(),
  };
}

async function secret(db: SupabaseClient, key: string): Promise<string> {
  const { readSecret } = await import("../secrets.server");
  return readSecret(db, key);
}

function addiBase(mode: AddiSettings["mode"]) {
  return mode === "live"
    ? { api: "https://api.addi.com", auth: "https://auth.addi.com", audience: "https://api.addi.com" }
    : { api: "https://api.addi-staging.com", auth: "https://auth.addi-staging.com", audience: "https://api.staging.addi.com" };
}

/** Topes de monto del aliado (endpoint público de Addi). */
export async function addiConfig(allySlug: string, amountCop: number): Promise<{ minAmount: number; maxAmount: number; discount: number } | null> {
  try {
    const response = await fetch(
      `https://channels-public-api.addi.com/allies/${encodeURIComponent(allySlug)}/config?requestedamount=${Math.round(amountCop)}`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) return null;
    const json = (await response.json()) as any;
    return { minAmount: Number(json?.minAmount ?? 0), maxAmount: Number(json?.maxAmount ?? 0), discount: Number(json?.policy?.discount ?? json?.discount ?? 0) };
  } catch {
    return null;
  }
}

/** Addi recomienda un token nuevo por cada intento de transacción. */
async function addiToken(db: SupabaseClient, settings: AddiSettings): Promise<string> {
  const { auth, audience } = addiBase(settings.mode);
  const clientSecret = await secret(db, "addi_client_secret");
  if (!settings.clientId || !clientSecret) throw new Error("Addi aún no está configurado.");
  const response = await fetch(`${auth}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ audience, grant_type: "client_credentials", client_id: settings.clientId, client_secret: clientSecret }),
  });
  const json = (await response.json().catch(() => ({}))) as { access_token?: string };
  if (!response.ok || !json.access_token) throw new Error("No pudimos conectar con Addi.");
  return json.access_token;
}

export type AddiItem = { sku: string; name: string; quantity: number; unitPrice: number; pictureUrl?: string };

export type AddiApplicationInput = {
  reference: string;
  amountCop: number;
  shippingCop: number;
  origin: string;
  email: string;
  phone: string;
  firstName: string;
  lastName: string;
  documentId: string;
  address: string;
  city: string;
  items: AddiItem[];
};

const money = (value: number) => `${Math.round(value)}.0`;

/** Crea la solicitud en Addi y devuelve la URL (header Location del 301) para llevar a la clienta. */
export async function createAddiApplication(db: SupabaseClient, input: AddiApplicationInput): Promise<{ url: string }> {
  const settings = await addiSettings(db);
  if (!settings.enabled || !settings.allyId) throw new Error("Addi aún no está configurado.");
  const { api } = addiBase(settings.mode);
  const token = await addiToken(db, settings);
  const cellphone = input.phone.replace(/\D/g, "").replace(/^57(?=\d{10}$)/, "");
  const address = { lineOne: input.address || "N/A", city: input.city || "Bogotá D.C", country: "CO" };

  const response = await fetch(`${api}/v1/online-applications`, {
    method: "POST",
    redirect: "manual",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      orderId: input.reference,
      totalAmount: money(input.amountCop),
      shippingAmount: money(input.shippingCop),
      currency: "COP",
      items: input.items.map((item) => ({
        sku: item.sku.slice(0, 50),
        name: item.name.slice(0, 120),
        quantity: String(item.quantity),
        unitPrice: String(Math.round(item.unitPrice)),
        ...(item.pictureUrl ? { pictureUrl: item.pictureUrl } : {}),
        brand: "Tu Marca",
      })),
      client: {
        idType: "CC",
        idNumber: input.documentId.replace(/\D/g, ""),
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        cellphone,
        cellphoneCountryCode: "+57",
        address,
      },
      shippingAddress: address,
      allyUrlRedirection: {
        callbackUrl: `${input.origin}/api/public/pagos/addi-eventos`,
        redirectionUrl: `${input.origin}/api/public/pagos/addi?ref=${encodeURIComponent(input.reference)}`,
      },
    }),
  });
  const location = response.headers.get("location") ?? "";
  if ((response.status === 301 || response.status === 302) && location) return { url: location };
  const json = (await response.json().catch(() => ({}))) as { message?: string };
  if (response.status >= 400 && response.status < 500) {
    const { rejectGatewayAttempt } = await import("../payment-guards.server");
    await rejectGatewayAttempt(db, input.reference);
  }
  if (response.status === 409) throw new Error("Ya tienes un crédito activo en Addi; elige otro método de pago.");
  throw new Error(json.message ?? "No pudimos iniciar el pago con Addi.");
}

/** Verifica el Basic Auth que Addi envía en el callback (credenciales de notificación del portal de aliados). */
export async function verifyAddiCallback(db: SupabaseClient, header: string | null): Promise<boolean> {
  const settings = await addiSettings(db);
  const password = await secret(db, "addi_callback_password");
  if (!settings.callbackUser || !password || !header?.startsWith("Basic ")) return false;
  let decoded = "";
  try {
    decoded = atob(header.slice(6).trim());
  } catch {
    return false;
  }
  const expected = `${settings.callbackUser}:${password}`;
  if (decoded.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= decoded.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * Aplica el resultado del callback: pagado solo si el estado es APPROVED y el monto aprobado
 * coincide con el intento. PENDING no cambia nada; los demás estados marcan el intento fallido.
 */
export async function applyAddiCallback(db: SupabaseClient, event: any): Promise<void> {
  const reference = String(event?.orderId ?? "");
  if (!reference) return;
  const { data: attempt } = await db.from("payment_attempts").select("amount, status, provider").eq("reference", reference).maybeSingle();
  if (!attempt || attempt.provider !== "addi" || attempt.status === "paid") return;
  const status = String(event?.status ?? "").toUpperCase();
  if (status === "PENDING") return;
  const approved = Number(event?.approvedAmount ?? 0);
  const paid = status === "APPROVED" && Math.abs(approved - Number(attempt.amount)) <= 1;
  await db
    .from("payment_attempts")
    .update({ status: paid ? "paid" : "failed", external_id: String(event?.applicationId ?? ""), payload: event as never })
    .eq("reference", reference);
}
