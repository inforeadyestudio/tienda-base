import { readAppSetting } from "@/lib/public-settings";
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isColombia, matchCountry } from "@/lib/locale";

export const INTERNATIONAL_SETTINGS_KEY = "international_settings";

export type IntlZone = {
  id: string;
  /** Nombre visible de la zona (Américas, Europa, Resto del mundo…). */
  name: string;
  /** Países que cubre. Vacío = cualquier país fuera de Colombia. */
  countries: string[];
  /** Tarifa de envío en USD. */
  priceUsd: number;
  enabled: boolean;
};

export type IntlWeightTier = { id: string; maxKg: number | null; priceUsd: number };
/** Tarifa por país en COP para 0,5 / 1 / 1,5 / 2 kg. */
export type IntlCountryWeightRate = { country: string; cop: [number, number, number, number] };

/** Promedios FedEx por país (COP), calculados de la tabla de tarifas de octubre 2026. */
export const FEDEX_AVG_RATES: IntlCountryWeightRate[] = [
  { country: "United States", cop: [141000, 163000, 190000, 219000] },
  { country: "Dominican Republic", cop: [148000, 184000, 215000, 258000] },
  { country: "Panama", cop: [144000, 175000, 198000, 225000] },
  { country: "Honduras", cop: [146000, 147000, 200000, 235000] },
  { country: "Spain", cop: [185000, 239000, 289000, 338000] },
  { country: "Costa Rica", cop: [146000, 174000, 198000, 225000] },
  { country: "Mexico", cop: [139000, 159000, 185000, 215000] },
  { country: "Peru", cop: [145000, 162000, 192000, 227000] },
  { country: "Canada", cop: [133000, 158000, 181000, 217000] },
  { country: "Puerto Rico", cop: [139000, 164000, 186000, 220000] },
  { country: "Guatemala", cop: [146000, 171000, 192000, 234000] },
  { country: "Ecuador", cop: [146000, 171000, 192000, 224000] },
  { country: "Brazil", cop: [156000, 182000, 219000, 241000] },
  { country: "Chile", cop: [156000, 182000, 219000, 241000] },
];
export const FEDEX_AVG_FALLBACK: [number, number, number, number] = [148000, 174000, 204000, 237000];

export type IntlSettings = {
  /** Muestra la versión internacional (inglés + USD) fuera de Colombia. */
  enabled: boolean;
  /** Tasa de referencia COP por 1 USD, usada solo si una variante no tiene precio en USD. */
  usdRate: number;
  shipping: {
    /** Tarifa base en USD cuando ninguna zona coincide. */
    defaultUsd: number;
    /** Envío gratis internacional desde este monto en USD. 0 = desactivado. */
    freeFromUsd: number;
    zones: IntlZone[];
    /** Envío mínimo en USD: ninguna tarifa cobra menos. */
    minUsd: number;
    /** Tarifas por peso total del pedido (se usan solo si está activo). */
    byWeight: { enabled: boolean; tiers: IntlWeightTier[]; countries: IntlCountryWeightRate[]; fallbackCop: [number, number, number, number] };
  };
  paguelofacil: {
    enabled: boolean;
    /** "sandbox" = pruebas, "live" = real. */
    mode: "sandbox" | "live";
    /** CCLW: código de comercio de Páguelo Fácil (no es secreto). */
    cclw: string;
  };
  /** Segunda pasarela internacional, aún por definir. */
  secondary: {
    enabled: boolean;
    name: string;
    /** Identificador público / merchant id, si aplica. */
    publicKey: string;
  };
};

export const DEFAULT_INTL_SETTINGS: IntlSettings = {
  enabled: true,
  usdRate: 4000,
  shipping: {
    defaultUsd: 45,
    freeFromUsd: 0,
    minUsd: 30,
    byWeight: { enabled: false, tiers: [], countries: FEDEX_AVG_RATES, fallbackCop: FEDEX_AVG_FALLBACK },
    zones: [
      { id: "americas", name: "Américas", countries: ["United States", "Mexico", "Canada", "Chile", "Peru", "Ecuador", "Argentina", "Brazil", "Panama"], priceUsd: 35, enabled: true },
      { id: "europe", name: "Europa", countries: ["Spain", "France", "Italy", "Germany", "Portugal", "United Kingdom", "Netherlands"], priceUsd: 55, enabled: true },
      { id: "rest", name: "Resto del mundo", countries: [], priceUsd: 70, enabled: true },
    ],
  },
  paguelofacil: { enabled: false, mode: "sandbox", cclw: "" },
  secondary: { enabled: false, name: "", publicKey: "" },
};

const num = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

const four = (value: unknown, fallback: [number, number, number, number]): [number, number, number, number] =>
  Array.isArray(value) ? (fallback.map((f, i) => num(value[i], f)) as [number, number, number, number]) : fallback;

/** Costo COP por peso: escalones de 0,5 kg; sobre 2 kg suma el incremento 1,5→2 kg por cada 0,5 kg extra. */
export function weightRateCop(settings: IntlSettings, country: string, weightKg: number) {
  const bw = settings.shipping.byWeight;
  const normalized = matchCountry(country).trim().toLocaleLowerCase();
  const row = bw.countries.find((c) => matchCountry(c.country).trim().toLocaleLowerCase() === normalized);
  const cop = row?.cop ?? bw.fallbackCop;
  const steps = Math.max(1, Math.ceil(Math.max(weightKg, 0.01) / 0.5));
  if (steps <= 4) return cop[steps - 1];
  return cop[3] + (steps - 4) * Math.max(0, cop[3] - cop[2]);
}

export function normalizeIntlSettings(raw: any): IntlSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_INTL_SETTINGS;
  const zones = Array.isArray(raw.shipping?.zones)
    ? raw.shipping.zones.map((zone: any) => ({
        id: String(zone?.id ?? crypto.randomUUID()),
        name: String(zone?.name ?? "Zona"),
        countries: Array.isArray(zone?.countries) ? zone.countries.map(String).filter(Boolean) : [],
        priceUsd: num(zone?.priceUsd, 0),
        enabled: zone?.enabled !== false,
      }))
    : DEFAULT_INTL_SETTINGS.shipping.zones;
  return {
    enabled: raw.enabled !== false,
    usdRate: num(raw.usdRate, DEFAULT_INTL_SETTINGS.usdRate) || DEFAULT_INTL_SETTINGS.usdRate,
    shipping: {
      defaultUsd: num(raw.shipping?.defaultUsd, DEFAULT_INTL_SETTINGS.shipping.defaultUsd),
      freeFromUsd: num(raw.shipping?.freeFromUsd, 0),
      zones,
      minUsd: num(raw.shipping?.minUsd, 30),
      byWeight: {
        enabled: raw.shipping?.byWeight?.enabled === true,
        tiers: Array.isArray(raw.shipping?.byWeight?.tiers)
          ? raw.shipping.byWeight.tiers.map((t: any) => ({
              id: String(t?.id ?? crypto.randomUUID()),
              maxKg: t?.maxKg === null || t?.maxKg === "" || t?.maxKg === undefined ? null : num(t.maxKg, 0),
              priceUsd: num(t?.priceUsd, 0),
            }))
          : [],
        countries: Array.isArray(raw.shipping?.byWeight?.countries)
          ? raw.shipping.byWeight.countries.map((c: any) => ({ country: String(c?.country ?? ""), cop: four(c?.cop, FEDEX_AVG_FALLBACK) })).filter((c: IntlCountryWeightRate) => c.country.trim())
          : FEDEX_AVG_RATES,
        fallbackCop: four(raw.shipping?.byWeight?.fallbackCop, FEDEX_AVG_FALLBACK),
      },
    },
    paguelofacil: {
      enabled: raw.paguelofacil?.enabled === true,
      mode: raw.paguelofacil?.mode === "live" ? "live" : "sandbox",
      cclw: String(raw.paguelofacil?.cclw ?? ""),
    },
    secondary: {
      enabled: raw.secondary?.enabled === true,
      name: String(raw.secondary?.name ?? ""),
      publicKey: String(raw.secondary?.publicKey ?? ""),
    },
  };
}

export const intlSettingsQuery = () =>
  queryOptions({
    queryKey: ["store-settings", "international"],
    staleTime: 60_000,
    queryFn: async () => {
      const data = { value: await readAppSetting(INTERNATIONAL_SETTINGS_KEY) };
      return normalizeIntlSettings(data?.value);
    },
  });

export async function saveIntlSettings(value: IntlSettings) {
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: INTERNATIONAL_SETTINGS_KEY, value: value as any }, { onConflict: "key" });
  if (error) throw error;
}

/** Tarifa de envío internacional en USD para un país. */
export function intlShippingUsd(settings: IntlSettings, country: string, subtotalUsd: number, weightKg = 0) {
  if (settings.shipping.freeFromUsd > 0 && subtotalUsd >= settings.shipping.freeFromUsd) {
    return { costUsd: 0, label: "Free international shipping" };
  }
  const normalized = matchCountry(country).trim().toLocaleLowerCase();
  const zone =
    settings.shipping.zones.find((z) => z.enabled && z.countries.some((c) => c.trim().toLocaleLowerCase() === normalized)) ??
    settings.shipping.zones.find((z) => z.enabled && z.countries.length === 0);
  let costUsd = zone ? zone.priceUsd : settings.shipping.defaultUsd;
  if (settings.shipping.byWeight.enabled) {
    costUsd = Math.ceil(weightRateCop(settings, country, weightKg) / settings.usdRate);
  }
  costUsd = Math.max(costUsd, settings.shipping.minUsd);
  return { costUsd, label: zone ? zone.name : "International shipping" };
}

/** Panamá paga en COP, pero conserva su zona de envío internacional configurada. */
export function panamaShippingCop(settings: IntlSettings, subtotalCop: number, weightKg = 0) {
  const quote = intlShippingUsd(settings, "Panama", Math.ceil(subtotalCop / settings.usdRate), weightKg);
  return { cost: Math.round(quote.costUsd * settings.usdRate), label: "Envío a Panamá" };
}

export type GatewayId = "wompi" | "addi" | "paguelofacil" | "secondary";
export type Gateway = { id: GatewayId; title: string; detail: string };

const PAGUELO: Gateway = { id: "paguelofacil", title: "Páguelo Fácil", detail: "Pay securely with card" };

/** Métodos de pago disponibles según el país de compra. */
export function gatewaysFor(country: string, settings?: IntlSettings): Gateway[] {
  if (isColombia(country)) {
    return [
      { id: "wompi", title: "Wompi", detail: "Tarjeta, PSE, Nequi y más" },
      { id: "addi", title: "Addi", detail: "Paga a cuotas sin tarjeta" },
    ];
  }
  const list: Gateway[] = [];
  if (settings?.paguelofacil.enabled) list.push(PAGUELO);
  if (settings?.secondary.enabled && settings.secondary.name.trim()) {
    list.push({ id: "secondary", title: settings.secondary.name.trim(), detail: "International checkout" });
  }
  return list.length ? list : [PAGUELO];
}

/** Peso total en kg de una lista de ítems con gramos por unidad. */
export function itemsWeightKg(items: { qty: number; weightGrams?: number | null }[] | undefined) {
  return (items ?? []).reduce((sum, i) => sum + (Number(i.weightGrams) || 0) * i.qty, 0) / 1000;
}
