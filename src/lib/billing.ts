import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const BILLING_SETTINGS_KEY = "billing_settings";

export type BillingProvider = "factus" | "efactura_pa";

export type Issuer = {
  /** Razón social del emisor. */
  legalName: string;
  /** NIT (Colombia) o RUC (Panamá). */
  taxId: string;
  /** Dígito de verificación / DV. */
  dv: string;
  address: string;
  city: string;
  phone: string;
  email: string;
};

export type ProviderSettings = {
  enabled: boolean;
  mode: "sandbox" | "live";
  /** Usuario o client id público de la API. */
  clientId: string;
  /** Usuario de acceso (Factus usa email + password además del client id). */
  username: string;
  /** Resolución / numeración autorizada (DIAN) o sucursal (Panamá). */
  numbering: string;
  /** Porcentaje de impuesto por defecto: 19 (IVA) o 7 (ITBMS). */
  taxRate: number;
  /** Marca las ventas como exentas de impuesto. */
  taxExempt: boolean;
  /** URL base de la API (déjala vacía para usar la oficial del proveedor). */
  apiBase: string;
  issuer: Issuer;
};

export type BillingSettings = {
  factus: ProviderSettings;
  efactura: ProviderSettings;
};

const emptyIssuer: Issuer = { legalName: "", taxId: "", dv: "", address: "", city: "", phone: "", email: "" };

export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  factus: { enabled: false, mode: "sandbox", clientId: "", username: "", numbering: "", taxRate: 19, taxExempt: false, apiBase: "", issuer: { ...emptyIssuer, city: "Cali" } },
  efactura: { enabled: false, mode: "sandbox", clientId: "", username: "", numbering: "", taxRate: 7, taxExempt: false, apiBase: "", issuer: { ...emptyIssuer, city: "Panamá" } },
};

const str = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

function normalizeProvider(raw: any, fallback: ProviderSettings): ProviderSettings {
  if (!raw || typeof raw !== "object") return fallback;
  const rate = Number(raw.taxRate);
  return {
    enabled: raw.enabled === true,
    mode: raw.mode === "live" ? "live" : "sandbox",
    clientId: str(raw.clientId),
    username: str(raw.username),
    numbering: str(raw.numbering),
    taxRate: Number.isFinite(rate) && rate >= 0 ? rate : fallback.taxRate,
    taxExempt: raw.taxExempt === true,
    apiBase: str(raw.apiBase),
    issuer: { ...fallback.issuer, ...(raw.issuer && typeof raw.issuer === "object" ? raw.issuer : {}) },
  };
}

export function normalizeBillingSettings(raw: any): BillingSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_BILLING_SETTINGS;
  return {
    factus: normalizeProvider(raw.factus, DEFAULT_BILLING_SETTINGS.factus),
    efactura: normalizeProvider(raw.efactura, DEFAULT_BILLING_SETTINGS.efactura),
  };
}

/** Emisor que corresponde a la moneda del pedido: pesos → Factus, dólares → eFactura Panamá. */
export function providerForCurrency(currency: string): BillingProvider {
  return currency?.toUpperCase() === "USD" ? "efactura_pa" : "factus";
}

export const PROVIDER_LABEL: Record<BillingProvider, string> = {
  factus: "R count (Colombia)",
  efactura_pa: "eFactura (Panamá)",
};

export const billingSettingsQuery = () =>
  queryOptions({
    queryKey: ["store-settings", "billing"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("app_settings").select("value").eq("key", BILLING_SETTINGS_KEY).maybeSingle();
      if (error) throw error;
      return normalizeBillingSettings(data?.value);
    },
  });

export async function saveBillingSettings(value: BillingSettings) {
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: BILLING_SETTINGS_KEY, value: value as any }, { onConflict: "key" });
  if (error) throw error;
}

export type InvoiceRow = {
  id: string;
  order_id: string;
  provider: string;
  external_id?: string | null;
  currency: string;
  status: string;
  environment: string;
  number: string | null;
  cufe: string | null;
  pdf_url: string | null;
  error: string | null;
  issued_at: string | null;
  created_at: string;
};

export const orderInvoicesQuery = (orderId: string) =>
  queryOptions({
    queryKey: ["invoices", orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, order_id, provider, currency, status, environment, number, cufe, pdf_url, error, issued_at, created_at, external_id, box_id")
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as InvoiceRow[];
    },
  });
