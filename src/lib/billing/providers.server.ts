import type { BillingProvider, BillingSettings, ProviderSettings } from "@/lib/billing";

/** Datos ya validados en el servidor que se envían al emisor. */
export type InvoiceDraft = {
  orderId: string;
  orderNumber: string;
  currency: "COP" | "USD";
  customer: { name: string; documentId: string; email: string; phone: string; address: string; city: string; country: string };
  lines: { name: string; qty: number; unitPrice: number; total: number }[];
  shipping: number;
  total: number;
  taxRate: number;
};

export type InvoiceResult = {
  ok: boolean;
  externalId?: string;
  number?: string;
  cufe?: string;
  pdfUrl?: string;
  error?: string;
  response: unknown;
};

const FACTUS_BASE = { sandbox: "https://api-sandbox.factus.com.co", live: "https://api.factus.com.co" };
const EFACTURA_BASE = { sandbox: "https://demo.efactura.com.pa/api", live: "https://api.efactura.com.pa/api" };

export function baseUrl(provider: BillingProvider, settings: ProviderSettings) {
  const custom = settings.apiBase.trim().replace(/\/$/, "");
  if (custom) return custom;
  return provider === "factus" ? FACTUS_BASE[settings.mode] : EFACTURA_BASE[settings.mode];
}

async function readJson(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text.slice(0, 2000) };
  }
}

/** Token OAuth de Factus (grant_type=password). */
async function factusToken(settings: ProviderSettings, secrets: { clientSecret: string; password: string }) {
  const response = await fetch(`${baseUrl("factus", settings)}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "password",
      client_id: settings.clientId,
      client_secret: secrets.clientSecret,
      username: settings.username,
      password: secrets.password,
    }),
  });
  const json = await readJson(response);
  if (!response.ok || !json?.access_token) {
    throw new Error(`Factus [${response.status}]: ${json?.message ?? json?.error_description ?? "credenciales rechazadas"}`);
  }
  return String(json.access_token);
}

/** Emite una factura electrónica en Factus (Colombia, pesos). */
export async function issueWithFactus(
  settings: ProviderSettings,
  secrets: { clientSecret: string; password: string },
  draft: InvoiceDraft,
): Promise<InvoiceResult> {
  try {
    const token = await factusToken(settings, secrets);
    const items = draft.lines.map((line) => ({
      code_reference: line.name.slice(0, 40),
      name: line.name.slice(0, 120),
      quantity: line.qty,
      price: line.unitPrice,
      tax_rate: String(draft.taxRate),
      unit_measure_id: 70,
      standard_code_id: 1,
      is_excluded: draft.taxRate === 0 ? 1 : 0,
      tribute_id: 1,
    }));
    if (draft.shipping > 0) {
      items.push({
        code_reference: "ENVIO",
        name: "Envío",
        quantity: 1,
        price: draft.shipping,
        tax_rate: String(draft.taxRate),
        unit_measure_id: 70,
        standard_code_id: 1,
        is_excluded: draft.taxRate === 0 ? 1 : 0,
        tribute_id: 1,
      });
    }
    const body = {
      numbering_range_id: Number(settings.numbering) || undefined,
      reference_code: draft.orderNumber,
      observation: `Pedido ${draft.orderNumber}`,
      payment_form: "1",
      payment_method_code: "10",
      customer: {
        identification: draft.customer.documentId || "222222222",
        names: draft.customer.name || "Consumidor final",
        email: draft.customer.email,
        phone: draft.customer.phone,
        address: draft.customer.address,
        legal_organization_id: "2",
        tribute_id: "21",
        identification_document_id: "3",
      },
      items,
    };
    const response = await fetch(`${baseUrl("factus", settings)}/v1/bills/validate`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const json = await readJson(response);
    if (!response.ok) return { ok: false, error: `Factus [${response.status}]: ${json?.message ?? "no aceptó la factura"}`, response: json };
    const bill = json?.data?.bill ?? json?.data ?? {};
    return {
      ok: true,
      externalId: String(bill.id ?? bill.number ?? draft.orderNumber),
      number: bill.number ?? bill.name ?? null,
      cufe: bill.cufe ?? null,
      pdfUrl: bill.public_url ?? bill.qr_image ?? null,
      response: json,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error con Factus", response: {} };
  }
}

/** Emite una factura electrónica en eFactura Panamá (dólares). */
export async function issueWithEfactura(
  settings: ProviderSettings,
  secrets: { apiKey: string },
  draft: InvoiceDraft,
): Promise<InvoiceResult> {
  try {
    const body = {
      branch: settings.numbering || "001",
      reference: draft.orderNumber,
      currency: "USD",
      issuer: {
        name: settings.issuer.legalName,
        ruc: settings.issuer.taxId,
        dv: settings.issuer.dv,
        address: settings.issuer.address,
        city: settings.issuer.city,
        email: settings.issuer.email,
      },
      customer: {
        name: draft.customer.name || "Consumidor final",
        tax_id: draft.customer.documentId,
        email: draft.customer.email,
        phone: draft.customer.phone,
        address: draft.customer.address,
        city: draft.customer.city,
        country: draft.customer.country,
      },
      items: draft.lines.map((line) => ({
        description: line.name.slice(0, 120),
        quantity: line.qty,
        unit_price: line.unitPrice,
        total: line.total,
        itbms_rate: draft.taxRate,
      })),
      shipping: draft.shipping,
      total: draft.total,
    };
    const response = await fetch(`${baseUrl("efactura_pa", settings)}/invoices`, {
      method: "POST",
      headers: { Authorization: `Bearer ${secrets.apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    const json = await readJson(response);
    if (!response.ok) return { ok: false, error: `eFactura [${response.status}]: ${json?.message ?? "no aceptó la factura"}`, response: json };
    return {
      ok: true,
      externalId: String(json?.id ?? json?.data?.id ?? draft.orderNumber),
      number: json?.number ?? json?.data?.number ?? null,
      cufe: json?.cufe ?? json?.data?.cufe ?? json?.data?.folio ?? null,
      pdfUrl: json?.pdf_url ?? json?.data?.pdf_url ?? null,
      response: json,
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error con eFactura Panamá", response: {} };
  }
}

/** Prueba de conexión: pide un token (Factus) o consulta el endpoint de salud (eFactura). */
export async function testProvider(
  provider: BillingProvider,
  settings: BillingSettings,
  secrets: { clientSecret: string; password: string; apiKey: string },
): Promise<{ ok: boolean; message: string }> {
  try {
    if (provider === "factus") {
      await factusToken(settings.factus, secrets);
      return { ok: true, message: "Factus respondió correctamente." };
    }
    const response = await fetch(`${baseUrl("efactura_pa", settings.efactura)}/ping`, {
      headers: { Authorization: `Bearer ${secrets.apiKey}`, Accept: "application/json" },
    });
    if (!response.ok) {
      const json = await readJson(response);
      return { ok: false, message: `eFactura [${response.status}]: ${json?.message ?? "sin respuesta válida"}` };
    }
    return { ok: true, message: "eFactura Panamá respondió correctamente." };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : "No pudimos conectar." };
  }
}
