import { readAppSetting } from "@/lib/public-settings";
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { normalizeSaleSettings, type SaleSettings } from "@/lib/product-sale";

export const SHIPPING_SETTINGS_KEY = "shipping_settings";
export const TAX_SETTINGS_KEY = "tax_settings";

export type ShippingRate = {
  id: string;
  name: string;
  country: string;
  regions: string[];
  minWeightKg: number;
  maxWeightKg: number | null;
  priceCop: number;
  enabled: boolean;
};

export type ShippingSettings = {
  rates: ShippingRate[];
  freeShipping: {
    enabled: boolean;
    allProducts: boolean;
    minimumCop: number;
    productIds: string[];
    collectionIds: string[];
  };
};

export type TaxRule = {
  enabled: boolean;
  ratePct: number;
  countries: string[];
};

export type TaxSettings = {
  national: TaxRule;
  international: TaxRule;
};

export const DEFAULT_SHIPPING_SETTINGS: ShippingSettings = {
  rates: [{ id: "colombia-estandar", name: "Envío nacional", country: "Colombia", regions: [], minWeightKg: 0, maxWeightKg: null, priceCop: 18_000, enabled: true }],
  freeShipping: { enabled: true, allProducts: true, minimumCop: 350_000, productIds: [], collectionIds: [] },
};

export const DEFAULT_TAX_SETTINGS: TaxSettings = {
  national: { enabled: false, ratePct: 19, countries: ["Colombia"] },
  international: { enabled: false, ratePct: 0, countries: [] },
};

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export function normalizeShippingSettings(raw: any): ShippingSettings {
  if (!raw || typeof raw !== "object") return DEFAULT_SHIPPING_SETTINGS;
  const rates = Array.isArray(raw.rates) ? raw.rates.map((rate: any) => ({
    id: String(rate.id ?? crypto.randomUUID()),
    name: String(rate.name ?? "Tarifa"),
    country: String(rate.country ?? "Colombia"),
    regions: Array.isArray(rate.regions) ? rate.regions.map(String).filter(Boolean) : [],
    minWeightKg: number(rate.minWeightKg),
    maxWeightKg: rate.maxWeightKg === null || rate.maxWeightKg === "" || rate.maxWeightKg === undefined ? null : number(rate.maxWeightKg),
    priceCop: number(rate.priceCop),
    enabled: rate.enabled !== false,
  })) : DEFAULT_SHIPPING_SETTINGS.rates;
  return {
    rates,
    freeShipping: {
      enabled: raw.freeShipping?.enabled !== false,
      allProducts: raw.freeShipping?.allProducts !== false,
      minimumCop: number(raw.freeShipping?.minimumCop, 350_000),
      productIds: Array.isArray(raw.freeShipping?.productIds) ? raw.freeShipping.productIds.map(String) : [],
      collectionIds: Array.isArray(raw.freeShipping?.collectionIds) ? raw.freeShipping.collectionIds.map(String) : [],
    },
  };
}

export function normalizeTaxSettings(raw: any): TaxSettings {
  const normalize = (rule: any, fallback: TaxRule): TaxRule => ({
    enabled: rule?.enabled === true,
    ratePct: Math.min(100, number(rule?.ratePct, fallback.ratePct)),
    countries: Array.isArray(rule?.countries) ? rule.countries.map(String).filter(Boolean) : fallback.countries,
  });
  return {
    national: normalize(raw?.national, DEFAULT_TAX_SETTINGS.national),
    international: normalize(raw?.international, DEFAULT_TAX_SETTINGS.international),
  };
}

async function readSetting(key: string) {
  return (await readAppSetting(key)) ?? undefined;
}

export const shippingSettingsQuery = () => queryOptions({
  queryKey: ["store-settings", "shipping"],
  staleTime: 60_000,
  queryFn: async () => normalizeShippingSettings(await readSetting(SHIPPING_SETTINGS_KEY)),
});

export const taxSettingsQuery = () => queryOptions({
  queryKey: ["store-settings", "tax"],
  staleTime: 60_000,
  queryFn: async () => normalizeTaxSettings(await readSetting(TAX_SETTINGS_KEY)),
});

async function saveSetting(key: string, value: unknown) {
  const { error } = await supabase.from("app_settings").upsert({ key, value: value as any }, { onConflict: "key" });
  if (error) throw error;
}

export const saveShippingSettings = (value: ShippingSettings) => saveSetting(SHIPPING_SETTINGS_KEY, value);
export const saveTaxSettings = (value: TaxSettings) => saveSetting(TAX_SETTINGS_KEY, value);
export const saleSettingsQuery = () => queryOptions({
  queryKey: ["store-settings", "sale"],
  staleTime: 60_000,
  queryFn: async () => normalizeSaleSettings(await readSetting("sale_settings")),
});
export const saveSaleSettings = (value: SaleSettings) => saveSetting("sale_settings", normalizeSaleSettings(value));

export type ShippingItem = { productId: string; qty: number; weightGrams?: number | null; collectionIds?: string[] };

export const shippingItemsQuery = (items: { variantId: string; productId: string; qty: number }[]) => queryOptions({
  queryKey: ["store-settings", "shipping-items", items.map((item) => `${item.variantId}:${item.qty}`).sort().join(",")],
  enabled: items.length > 0,
  staleTime: 60_000,
  queryFn: async (): Promise<ShippingItem[]> => {
    const productIds = Array.from(new Set(items.map((item) => item.productId)));
    const [{ data: variants, error: variantError }, { data: memberships, error: collectionError }] = await Promise.all([
      supabase.from("product_variants").select("id, weight_grams").in("id", items.map((item) => item.variantId)),
      supabase.from("collection_products").select("product_id, collection_id").in("product_id", productIds),
    ]);
    if (variantError) throw variantError;
    if (collectionError) throw collectionError;
    return items.map((item) => ({
      productId: item.productId,
      qty: item.qty,
      weightGrams: variants?.find((variant) => variant.id === item.variantId)?.weight_grams ?? 0,
      collectionIds: (memberships ?? []).filter((row) => row.product_id === item.productId).map((row) => row.collection_id),
    }));
  },
});

/** Envío gratis solo para clientes con cuenta e inicio de sesión; invitados pagan la tarifa. */
export function quoteShipping(settings: ShippingSettings, subtotal: number, items: ShippingItem[], country: string, region: string, opts: { signedIn?: boolean } = {}) {
  const signedIn = opts.signedIn !== false;
  const normalizedCountry = country.trim().toLocaleLowerCase();
  const normalizedRegion = region.trim().toLocaleLowerCase();
  const free = settings.freeShipping;
  const everyItemEligible = free.allProducts || items.every((item) =>
    free.productIds.includes(item.productId) || (item.collectionIds ?? []).some((id) => free.collectionIds.includes(id)),
  );
  if (signedIn && free.enabled && subtotal >= free.minimumCop && everyItemEligible) {
    return { matched: true, free: true, cost: 0, label: "Envío gratis", rateId: null, weightKg: totalWeightKg(items) };
  }
  const weightKg = totalWeightKg(items);
  const rate = settings.rates.find((item) => {
    const countryMatches = item.country.trim().toLocaleLowerCase() === normalizedCountry;
    const regionMatches = item.regions.length === 0 || item.regions.some((value) => value.trim().toLocaleLowerCase() === normalizedRegion);
    const weightMatches = weightKg >= item.minWeightKg && (item.maxWeightKg === null || weightKg <= item.maxWeightKg);
    return item.enabled && countryMatches && regionMatches && weightMatches;
  });
  if (!rate) return { matched: false, free: false, cost: 0, label: "Envío por confirmar", rateId: null, weightKg };
  return { matched: true, free: rate.priceCop === 0, cost: rate.priceCop, label: rate.name, rateId: rate.id, weightKg };
}

export function includedTax(settings: TaxSettings, subtotal: number, country: string) {
  const isNational = country.trim().toLocaleLowerCase() === "colombia";
  const rule = isNational ? settings.national : settings.international;
  const countryAllowed = isNational || rule.countries.length === 0 || rule.countries.some((item) => item.trim().toLocaleLowerCase() === country.trim().toLocaleLowerCase());
  if (!rule.enabled || !countryAllowed || rule.ratePct <= 0) return { applies: false, ratePct: 0, includedCop: 0, scope: isNational ? "national" : "international" };
  return { applies: true, ratePct: rule.ratePct, includedCop: Math.round(subtotal - subtotal / (1 + rule.ratePct / 100)), scope: isNational ? "national" : "international" };
}

function totalWeightKg(items: ShippingItem[]) {
  return items.reduce((sum, item) => sum + Math.max(0, item.weightGrams ?? 0) * item.qty, 0) / 1000;
}