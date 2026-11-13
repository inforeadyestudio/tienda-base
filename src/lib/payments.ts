import { readAppSetting } from "@/lib/public-settings";
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { currencyForCountry, isColombia } from "@/lib/locale";
import type { IntlSettings } from "@/lib/international";

export const PAYMENT_SETTINGS_KEY = "payment_settings";

export type PaymentMode = "sandbox" | "live";
export type PaymentMethodId = "wompi" | "addi" | "transfer" | "paguelofacil" | "paypal" | "bold";

export type PaymentsSettings = {
  bold: { enabled: boolean; internationalEnabled: boolean };
  wompi: { enabled: boolean; mode: PaymentMode; publicKey: string };
  addi: { enabled: boolean; mode: PaymentMode; allyId: string; clientId: string; callbackUser: string };
  paypal: { enabled: boolean; mode: PaymentMode; clientId: string };
  transfer: {
    enabled: boolean;
    bankName: string;
    accountType: string;
    accountNumber: string;
    holder: string;
    documentId: string;
    instructions: string;
  };
};

export const DEFAULT_PAYMENTS_SETTINGS: PaymentsSettings = {
  bold: { enabled: false, internationalEnabled: false },
  wompi: { enabled: false, mode: "sandbox", publicKey: "" },
  addi: { enabled: false, mode: "sandbox", allyId: "", clientId: "", callbackUser: "" },
  paypal: { enabled: false, mode: "sandbox", clientId: "" },
  transfer: {
    enabled: false,
    bankName: "",
    accountType: "Ahorros",
    accountNumber: "",
    holder: "",
    documentId: "",
    instructions: "Envía el comprobante para confirmar tu pedido. Lo verificamos en horario hábil.",
  },
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function mode(value: unknown): PaymentMode {
  return value === "live" ? "live" : "sandbox";
}

export function normalizePaymentsSettings(raw: any): PaymentsSettings {
  const base = DEFAULT_PAYMENTS_SETTINGS;
  if (!raw || typeof raw !== "object") return base;
  return {
    bold: { enabled: raw.bold?.enabled === true, internationalEnabled: raw.bold?.internationalEnabled === true },
    wompi: { enabled: raw.wompi?.enabled === true, mode: mode(raw.wompi?.mode), publicKey: text(raw.wompi?.publicKey) },
    addi: { enabled: raw.addi?.enabled === true, mode: mode(raw.addi?.mode), allyId: text(raw.addi?.allyId), clientId: text(raw.addi?.clientId), callbackUser: text(raw.addi?.callbackUser) },
    paypal: { enabled: raw.paypal?.enabled === true, mode: mode(raw.paypal?.mode), clientId: text(raw.paypal?.clientId) },
    transfer: {
      enabled: raw.transfer?.enabled === true,
      bankName: text(raw.transfer?.bankName),
      accountType: text(raw.transfer?.accountType, base.transfer.accountType),
      accountNumber: text(raw.transfer?.accountNumber),
      holder: text(raw.transfer?.holder),
      documentId: text(raw.transfer?.documentId),
      instructions: text(raw.transfer?.instructions, base.transfer.instructions),
    },
  };
}

export const paymentsSettingsQuery = () =>
  queryOptions({
    queryKey: ["store-settings", "payments"],
    staleTime: 60_000,
    queryFn: async () => {
      const data = { value: await readAppSetting(PAYMENT_SETTINGS_KEY) };
      return normalizePaymentsSettings(data?.value);
    },
  });

export async function savePaymentsSettings(value: PaymentsSettings) {
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: PAYMENT_SETTINGS_KEY, value: value as any }, { onConflict: "key" });
  if (error) throw error;
}

export type PaymentOptionView = { id: PaymentMethodId; title: string; detail: string };

/** Métodos disponibles según el país de entrega y lo activado en el panel. */
export function paymentMethodsFor(country: string, payments?: PaymentsSettings, intl?: IntlSettings, allowLocal = true): PaymentOptionView[] {
  const settings = payments ?? DEFAULT_PAYMENTS_SETTINGS;
  const options: PaymentOptionView[] = [];
  if (allowLocal && isColombia(country)) {
    if (settings.bold.enabled) options.push({ id: "bold", title: "Bold", detail: "Tarjeta, PSE y medios locales" });
    if (settings.wompi.enabled) options.push({ id: "wompi", title: "Tarjeta, PSE o Nequi", detail: "Pago seguro con Wompi" });
    if (settings.addi.enabled) options.push({ id: "addi", title: "Addi", detail: "Paga después o a cuotas" });
    if (settings.transfer.enabled) options.push({ id: "transfer", title: "Transferencia bancaria", detail: "Subes el comprobante y confirmamos tu pago" });
    if (!options.length) options.push({ id: "wompi", title: "Tarjeta, PSE o Nequi", detail: "Pago seguro con Wompi" });
    return options;
  }
  if (allowLocal && currencyForCountry(country) === "COP") {
    if (settings.bold.enabled) options.push({ id: "bold", title: "Bold", detail: "Tarjeta en pesos colombianos" });
    if (settings.wompi.enabled) options.push({ id: "wompi", title: "Tarjeta", detail: "Pago seguro en pesos colombianos con Wompi" });
    return options;
  }
  if (settings.paypal.enabled) options.push({ id: "paypal", title: "PayPal", detail: "Pay with your PayPal balance or card" });
  if (settings.bold.enabled && settings.bold.internationalEnabled) options.push({ id: "bold", title: "Bold", detail: "Tarjeta internacional · precio en US$" });
  if (intl?.paguelofacil?.enabled === true) options.push({ id: "paguelofacil", title: "Páguelo Fácil", detail: "International card payment" });
  if (!options.length) options.push({ id: "paguelofacil", title: "Páguelo Fácil", detail: "International card payment" });
  return options;
}
