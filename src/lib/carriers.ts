import { readAppSetting } from "@/lib/public-settings";
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const CARRIER_SETTINGS_KEY = "carrier_settings";

export type CarrierMode = "sandbox" | "live";

export type SkydropxSettings = {
  enabled: boolean;
  mode: CarrierMode;
  clientId: string;
  /** Solo se usa para cotizar; si está vacío, se cotizan todas las transportadoras. */
  carriers: string;
  /** Si es true, se declara el total del pedido (con seguro). Por defecto, sin seguro. */
  insure: boolean;
  /** Valor declarado mínimo cuando no se toma seguro. */
  minDeclaredCop: number;
  origin: {
    name: string;
    company: string;
    street1: string;
    street2: string;
    city: string;
    province: string;
    zip: string;
    country: string;
    phone: string;
    email: string;
  };
  parcel: { lengthCm: number; widthCm: number; heightCm: number; weightKg: number };
  /** Dirección de despacho por bodega (id de location); si falta, se usa `origin`. */
  origins: Record<string, SkydropxOrigin>;
};

export type SkydropxOrigin = SkydropxSettings["origin"];

/** Tamaños de paquete rápidos al cotizar (Coordinadora cobra por volumen). */
export const PARCEL_PRESETS = [
  { id: "bolsa", label: "Bolsa pequeña", lengthCm: 20, widthCm: 15, heightCm: 5 },
  { id: "mediana", label: "Caja mediana", lengthCm: 30, widthCm: 25, heightCm: 10 },
  { id: "grande", label: "Caja grande", lengthCm: 40, widthCm: 30, heightCm: 20 },
] as const;

/** Dirección de origen completa para la bodega, o la general. */
export function originFor(sky: SkydropxSettings, locationId?: string | null): SkydropxOrigin {
  const o = locationId ? sky.origins[locationId] : undefined;
  return o && o.street1 && o.city && o.province && o.zip ? o : sky.origin;
}

export type CarrierSettings = { skydropx: SkydropxSettings };

export const DEFAULT_CARRIER_SETTINGS: CarrierSettings = {
  skydropx: {
    enabled: false,
    mode: "sandbox",
    clientId: "",
    carriers: "",
    insure: false,
    minDeclaredCop: 10000,
    origin: {
      name: "",
      company: "Tu Marca",
      street1: "",
      street2: "",
      city: "",
      province: "",
      zip: "",
      country: "CO",
      phone: "",
      email: "",
    },
    parcel: { lengthCm: 30, widthCm: 25, heightCm: 10, weightKg: 1 },
    origins: {},
  },
};

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function num(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function normalizeCarrierSettings(raw: any): CarrierSettings {
  const base = DEFAULT_CARRIER_SETTINGS.skydropx;
  const sky = raw?.skydropx ?? {};
  const origin = sky.origin ?? {};
  const normOrigin = (o: any): SkydropxOrigin => ({
    name: text(o?.name), company: text(o?.company, base.origin.company), street1: text(o?.street1), street2: text(o?.street2),
    city: text(o?.city), province: text(o?.province), zip: text(o?.zip),
    country: text(o?.country, base.origin.country).toUpperCase().slice(0, 2), phone: text(o?.phone), email: text(o?.email),
  });
  const origins: Record<string, SkydropxOrigin> = {};
  Object.entries(sky.origins ?? {}).forEach(([k, v]) => { origins[k] = normOrigin(v); });
  const parcel = sky.parcel ?? {};
  return {
    skydropx: {
      enabled: sky.enabled === true,
      mode: sky.mode === "live" ? "live" : "sandbox",
      clientId: text(sky.clientId),
      carriers: text(sky.carriers),
      insure: sky.insure === true,
      minDeclaredCop: num(sky.minDeclaredCop, base.minDeclaredCop),
      origin: {
        name: text(origin.name),
        company: text(origin.company, base.origin.company),
        street1: text(origin.street1),
        street2: text(origin.street2),
        city: text(origin.city),
        province: text(origin.province),
        zip: text(origin.zip),
        country: text(origin.country, base.origin.country).toUpperCase().slice(0, 2),
        phone: text(origin.phone),
        email: text(origin.email),
      },
      parcel: {
        lengthCm: num(parcel.lengthCm, base.parcel.lengthCm),
        widthCm: num(parcel.widthCm, base.parcel.widthCm),
        heightCm: num(parcel.heightCm, base.parcel.heightCm),
        weightKg: num(parcel.weightKg, base.parcel.weightKg),
      },
      origins,
    },
  };
}

export const carrierSettingsQuery = () =>
  queryOptions({
    queryKey: ["store-settings", "carriers"],
    staleTime: 60_000,
    queryFn: async () => {
      const data = { value: await readAppSetting(CARRIER_SETTINGS_KEY) };
      return normalizeCarrierSettings(data?.value);
    },
  });

export async function saveCarrierSettings(value: CarrierSettings) {
  const { error } = await supabase
    .from("app_settings")
    .upsert({ key: CARRIER_SETTINGS_KEY, value: value as any }, { onConflict: "key" });
  if (error) throw error;
}
