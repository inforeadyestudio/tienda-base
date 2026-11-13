import { useSyncExternalStore } from "react";
import { translate, type Lang } from "@/lib/i18n";
import { useTrm } from "@/components/b2b/trm-badge";
import { formatUSD } from "@/lib/format";

export type Currency = "COP" | "USD";
export type LocaleState = { lang: Lang; currency: Currency; country: string; manual: boolean; langManual?: boolean };

const DEFAULT: LocaleState = { lang: "es", currency: "COP", country: "Colombia", manual: false, langManual: false };

/** Países ofrecidos en el selector del encabezado. */
export const COUNTRY_OPTIONS: { country: string; label: string; currency: Currency; lang: Lang; aliases?: string[] }[] = [
  { country: "Colombia", label: "Colombia (COP)", currency: "COP", lang: "es", aliases: ["co", "col", "republica de colombia", "república de colombia"] },
  { country: "United States", label: "United States (USD)", currency: "USD", lang: "en", aliases: ["usa", "us", "estados unidos", "eeuu", "ee.uu.", "united states of america"] },
  { country: "Mexico", label: "México (USD)", currency: "USD", lang: "en", aliases: ["méxico", "mx"] },
  { country: "Spain", label: "España (USD)", currency: "USD", lang: "en", aliases: ["españa", "espana", "es"] },
  { country: "Canada", label: "Canada (USD)", currency: "USD", lang: "en", aliases: ["canadá", "ca"] },
  { country: "United Kingdom", label: "United Kingdom (USD)", currency: "USD", lang: "en", aliases: ["uk", "reino unido", "inglaterra", "england", "great britain"] },
  { country: "Chile", label: "Chile (USD)", currency: "USD", lang: "en", aliases: ["cl"] },
  { country: "Peru", label: "Perú (USD)", currency: "USD", lang: "en", aliases: ["perú", "pe"] },
  { country: "Ecuador", label: "Ecuador (USD)", currency: "USD", lang: "en", aliases: ["ec"] },
  { country: "Panama", label: "Panamá (USD)", currency: "USD", lang: "es", aliases: ["panamá", "pa"] },
  { country: "Rest of world", label: "Rest of world (USD)", currency: "USD", lang: "en", aliases: ["otro", "otro país", "international", "internacional"] },
];

function norm(value: string) {
  return value.trim().toLocaleLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Reconoce Colombia aunque se escriba con acentos, siglas o variantes. */
export function isColombia(country: string) {
  const value = norm(country);
  return value === "colombia" || ["co", "col", "republica de colombia"].includes(value);
}

export function isPanama(country: string) {
  return ["panama", "pa"].includes(norm(country));
}

/** Convierte un país escrito a mano en la opción canónica más cercana. */
export function matchCountry(input: string): string {
  const value = norm(input);
  if (!value) return "Colombia";
  const option = COUNTRY_OPTIONS.find((item) =>
    norm(item.country) === value || (item.aliases ?? []).some((alias) => norm(alias) === value),
  );
  return option?.country ?? input.trim();
}

/** Moneda que corresponde a un país escrito a mano. */
export function currencyForCountry(country: string): Currency {
  return isColombia(country) ? "COP" : "USD";
}

let state: LocaleState = DEFAULT;
let hydrated = false;
const listeners = new Set<() => void>();

/** Detección automática por zona horaria e idioma del navegador. */
function detect(): LocaleState {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const lang = (navigator.language ?? "es").toLowerCase();
    if (tz === "America/Panama") return { lang: "es", currency: "USD", country: "Panama", manual: false };
    if (tz === "America/Bogota" || lang === "es-co") return { lang: "es", currency: "COP", country: "Colombia", manual: false };
    return { lang: "en", currency: "USD", country: "Rest of world", manual: false };
  } catch {
    return DEFAULT;
  }
}

function read(): LocaleState {
  if (typeof window === "undefined") return DEFAULT;
  if (!hydrated) {
    hydrated = true;
    state = detect();
    try {
      const saved = window.localStorage.getItem("tb-lang");
      if (saved === "es" || saved === "en") state = { ...state, lang: saved, langManual: true };
    } catch { /* sin almacenamiento */ }
    void import("@/lib/analytics.functions")
      .then(({ getVisitorGeo }) => getVisitorGeo())
      .then(({ country }) => {
        const code = (country || "").toUpperCase();
        if (!code || code === "XX" || code === "T1") return;
        if (state.manual) return;
        const countryName = code === "CO" ? "Colombia" : code === "PA" ? "Panama" : "Rest of world";
        const next: LocaleState = { lang: countryName === "Rest of world" ? "en" : "es", currency: currencyForCountry(countryName), country: countryName, manual: false };
        if (state.langManual) { next.lang = state.lang; next.langManual = true; }
        if (next.country !== state.country || next.currency !== state.currency || next.lang !== state.lang) {
          state = next;
          listeners.forEach((l) => l());
        }
      })
      .catch(() => {});
  }
  return state;
}

function write(next: LocaleState) {
  state = next;
  hydrated = true;
  listeners.forEach((l) => l());
}

export function setCountry(countryInput: string) {
  const country = matchCountry(countryInput);
  const option = COUNTRY_OPTIONS.find((o) => o.country === country);
  const current = read();
  const currency = option?.currency ?? currencyForCountry(country);
  const lang = current.langManual ? current.lang : (option?.lang ?? (currency === "USD" ? "en" : "es"));
  if (current.country === country && current.currency === currency && current.lang === lang && current.manual) return;
  write({ ...current, country, currency, lang, manual: true });
}

export function setLang(lang: Lang) {
  try { window.localStorage.setItem("tb-lang", lang); } catch { /* sin almacenamiento */ }
  write({ ...read(), lang, langManual: true });
}

/** Comparte la geolocalización de acceso con la tienda, sin depender de que un control llame a read(). */
export function applyVisitorCountry(code: string) {
  try { if (code && code.toUpperCase() !== "XX") window.localStorage.setItem("tb-geo", code.toUpperCase()); } catch { /* sin almacenamiento */ }
  const current = read();
  if (current.manual) return;
  const country = code.toUpperCase() === "CO" ? "Colombia" : code.toUpperCase() === "PA" ? "Panama" : "Rest of world";
  const currency = currencyForCountry(country);
  const lang = current.langManual ? current.lang : country === "Rest of world" ? "en" : "es";
  if (country !== current.country || currency !== current.currency || lang !== current.lang) {
    write({ ...current, country, currency, lang, manual: false });
  }
}

export function readLocale(): LocaleState {
  return read();
}

export function useLocale() {
  const locale = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    read,
    () => DEFAULT,
  );
  return {
    ...locale,
    isInternational: locale.currency === "USD",
    t: (key: string) => translate(key, locale.lang),
    setCountry,
    setLang,
  };
}

const COP_FMT = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 });


/** Convierte pesos a dólares con la tasa de referencia, redondeando al entero superior. */
export function copToUsd(cop: number, rate: number) {
  const safeRate = rate > 0 ? rate : 4000;
  return Math.ceil(cop / safeRate);
}

/** Formatea un importe respetando la moneda activa. `usd` tiene prioridad si existe. */
export function formatMoney(cop: number, currency: Currency, usd?: number | null, _rate = 4000) {
  // Sin precio USD guardado no se convierte desde pesos.
  if (currency === "USD") return typeof usd === "number" && usd > 0 ? formatUSD(usd) : "—";

  return COP_FMT.format(cop);
}

/** Formateador de precios ligado a la moneda activa. */
export function usePrice() {
  const { currency } = useLocale();
  const { data: trm } = useTrm();
  const rate = trm?.value && trm.value > 0 ? trm.value : 4000;
  return (cop: number | null | undefined, usd?: number | null) => formatMoney(typeof cop === "number" ? cop : 0, currency, usd, rate);
}

/** País real de acceso (código ISO de la geolocalización) o null si no se conoce. */
export function visitorGeoCode(): string | null {
  try { return window.localStorage.getItem("tb-geo"); } catch { return null; }
}

/** Las pasarelas colombianas solo se ofrecen a quienes visitan desde Colombia o Panamá. */
export function visitorAllowsLocalGateways(): boolean {
  const g = visitorGeoCode();
  return !g || g === "CO" || g === "PA";
}
