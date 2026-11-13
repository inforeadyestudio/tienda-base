export const RCOUNT_SETTINGS_KEY = "rcount_settings";

/** R-Count stores passports as PP and converts it to DIAN 41; PA belongs to the country field. */
export function rcountDocumentType(document: string, businessOrInvoiceRequested: boolean): "PP" | "NIT" | "CC" {
  if (/[A-Za-z]/.test(document)) return "PP";
  return businessOrInvoiceRequested && /^\d{9,10}$/.test(document) ? "NIT" : "CC";
}

export type RCountEntity = "co" | "pa";
export type RCountCenterKey = "web" | "b2b" | "assisted" | "cali" | "bogota";
export type RCountConsecutive = Partial<Record<RCountCenterKey, number>>;
export type RCountEntitySettings = { enabled: boolean; url: string; consecutive: RCountConsecutive };
export type RCountSettings = {
  co: RCountEntitySettings;
  pa: RCountEntitySettings;
  centers: Record<RCountCenterKey, string>;
  /** Cuenta contable de caja/banco por "centro:método" (ej. "3:efectivo"). */
  accounts: Record<string, string>;
};

export const RCOUNT_CO_DEFAULT_URL = "https://vfdcwrhegwuxxocmsgtc.supabase.co/functions/v1/rwear-api";

export const RCOUNT_LABEL: Record<RCountEntity, string> = {
  co: "R-Count Colombia (DIAN)",
  pa: "R-Count Panamá (eFactura)",
};

export const RCOUNT_CENTERS = [
  { code: "1", label: "Comercial" },
  { code: "2", label: "Tienda Bogotá" },
  { code: "3", label: "Tienda Cali" },
  { code: "4", label: "Corporativo" },
  { code: "5", label: "Diseño y producción" },
];

export const RCOUNT_CENTER_KEYS: { key: RCountCenterKey; label: string }[] = [
  { key: "web", label: "Tienda online" },
  { key: "assisted", label: "Venta asistida (envío)" },
  { key: "b2b", label: "B2B Colombia" },
  { key: "bogota", label: "POS Tienda Bogotá" },
  { key: "cali", label: "POS Tienda Cali" },
];

/** Métodos de pago que llevan cuenta contable propia. */
export const RCOUNT_PAY_METHODS = [
  { id: "efectivo", label: "Efectivo" },
  { id: "datafono", label: "Datáfono / tarjeta" },
  { id: "link_pago", label: "Link de pago" },
  { id: "transferencia", label: "Transferencia" },
  { id: "wompi", label: "Wompi" },
  { id: "bold", label: "Bold" },
  { id: "addi", label: "Addi" },
  { id: "paypal", label: "PayPal" },
  { id: "credito_15", label: "Crédito a 15 días" },
  { id: "credito_30", label: "Crédito 30 días" },
  { id: "credito_60", label: "Crédito 60 días" },
];

/** Cuentas según el proceso contable de Tu Marca (centro:método → cuenta). */
export const DEFAULT_ACCOUNTS: Record<string, string> = {
  "3:efectivo": "11050503", "2:efectivo": "11050502",
  "3:datafono": "11200502", "2:datafono": "11200503",
  "3:link_pago": "11200506", "2:link_pago": "11200506", "1:link_pago": "11200506",
  "1:addi": "11200505", "1:wompi": "11200504", "1:paypal": "11200507",
};

/** Normaliza el método guardado en el pedido a la clave contable. */
export const payMethodKey = (m: string | null | undefined) => {
  const v = String(m ?? "").toLowerCase().replace(/^pos_/, "");
  if (v === "tarjeta") return "datafono";
  // Links de pago manuales: cada pasarela lleva su cuenta contable.
  if (v === "link_wompi") return "wompi";
  if (v === "link_bold") return "link_pago";
  if (v === "bold") return "link_pago";
  // Online: la tarjeta se cobra por Wompi; la transferencia va aparte.
  if (v === "card") return "wompi";
  if (v === "transfer") return "transferencia";
  return v;
};

/** La pasarela del pago tiene prioridad sobre etiquetas genéricas o heredadas de Wompi. */
export const resolvePayKey = (m: string | null | undefined, gateway: string | null | undefined) => {
  const key = payMethodKey(m);
  const g = String(gateway ?? "").trim().toLowerCase();
  if (key === "wompi" || !key) {
    if (g === "addi" || g === "paypal") return g;
    if (g === "bold") return "link_pago";
  }
  return key;
};

const DEFAULT_CENTERS: Record<RCountCenterKey, string> = { web: "1", b2b: "1", assisted: "1", cali: "3", bogota: "2" };

const normalizeConsecutive = (raw: any): RCountConsecutive => {
  const out: RCountConsecutive = {};
  for (const { key } of RCOUNT_CENTER_KEYS) {
    const n = Number(raw?.[key]);
    if (Number.isFinite(n) && n > 0) out[key] = Math.floor(n);
  }
  return out;
};

export function normalizeRCountSettings(raw: any): RCountSettings {
  const one = (v: any, def = ""): RCountEntitySettings => ({
    enabled: v?.enabled === true,
    url: typeof v?.url === "string" && v.url ? v.url : def,
    consecutive: normalizeConsecutive(v?.consecutive),
  });
  const centers = { ...DEFAULT_CENTERS };
  for (const k of Object.keys(DEFAULT_CENTERS) as RCountCenterKey[]) {
    if (typeof raw?.centers?.[k] === "string" && raw.centers[k]) centers[k] = raw.centers[k];
  }
  const accounts = { ...DEFAULT_ACCOUNTS };
  if (raw?.accounts && typeof raw.accounts === "object") {
    for (const [k, v] of Object.entries(raw.accounts)) if (typeof v === "string") { if (v.trim()) accounts[k] = v.trim(); else delete accounts[k]; }
  }
  return { co: one(raw?.co, RCOUNT_CO_DEFAULT_URL), pa: one(raw?.pa), centers, accounts };
}

/** Centro y consecutivo que le tocan a un pedido según canal y bodega. */
export const centerLabel = (key: RCountCenterKey) => RCOUNT_CENTER_KEYS.find((c) => c.key === key)?.label ?? key;

export const entityForCurrency = (currency: string | null | undefined): RCountEntity =>
  (currency ?? "COP").toUpperCase() === "USD" ? "pa" : "co";

/** Colombia si el país está vacío o es CO/Colombia. */
export const isColombia = (country: string | null | undefined) => {
  const c = (country ?? "").trim().toLowerCase();
  return !c || c === "co" || c === "col" || c === "colombia";
};

const COUNTRY_NAMES: Record<string, string> = {
  co: "Colombia", col: "Colombia", pa: "Panamá", pan: "Panamá", us: "Estados Unidos", usa: "Estados Unidos",
  mx: "México", ec: "Ecuador", pe: "Perú", cl: "Chile", ar: "Argentina", br: "Brasil", ve: "Venezuela",
  cr: "Costa Rica", do: "República Dominicana", gt: "Guatemala", es: "España", ca: "Canadá", gb: "Reino Unido",
  fr: "Francia", it: "Italia", de: "Alemania", pt: "Portugal", uy: "Uruguay", py: "Paraguay", bo: "Bolivia",
};

/** Nombre del país en español (acepta código ISO o nombre). Vacío si no hay país. */
export function countryName(v: string | null | undefined): string {
  const t = String(v ?? "").trim();
  if (!t) return "";
  return COUNTRY_NAMES[t.toLowerCase()] ?? t;
}

/** País de destino del pedido: dirección de envío, o país de la clienta (B2B). */
export const destinationCountry = (o: any) => countryName(o?.ship_to?.country || o?.buyer_country);

/** Precio unitario máximo razonable en US$: por encima casi siempre son pesos enviados como dólares. */
export const RCOUNT_MAX_USD_UNIT_PRICE = 5000;

/** Reparte montos en pesos sobre el total US$ (centavos exactos; el último ajusta). */
export function splitPaymentsUsd<T extends { amount: number }>(rows: T[], totalUsd: number): T[] {
  const cop = rows.reduce((s, r) => s + Number(r.amount), 0);
  if (!(cop > 0)) return rows;
  let acc = 0;
  return rows.map((r, k) => {
    const amount = k === rows.length - 1
      ? Math.round((totalUsd - acc) * 100) / 100
      : Math.round((Number(r.amount) / cop) * totalUsd * 100) / 100;
    acc += amount;
    return { ...r, amount };
  });
}

/** Valida una factura en US$ antes de enviarla: devuelve el motivo del bloqueo o null. */
export function validateUsdInvoice(
  items: { sku?: string; quantity: number; unit_price: number; discount_rate?: number }[],
  payments: { amount: number }[] | null | undefined,
  totalUsd: number,
): string | null {
  if (!(totalUsd > 0)) return "Pedido al exterior sin total en dólares";
  const big = items.find((i) => i.sku !== "ENVIO" && Number(i.unit_price) > RCOUNT_MAX_USD_UNIT_PRICE);
  if (big) return `La prenda ${big.sku || ""} tiene precio de US$${Number(big.unit_price).toLocaleString("en-US")}; parecen pesos y no dólares`.replace("  ", " ");
  const sum = items.reduce((s, i) => s + i.quantity * i.unit_price * (1 - (i.discount_rate ?? 0) / 100), 0);
  if (Math.abs(sum - totalUsd) > 0.01 + items.length * 0.005)
    return `Las líneas más el envío suman US$${sum.toFixed(2)} y el pedido es de US$${totalUsd.toFixed(2)}`;
  if (payments?.length) {
    const p = payments.reduce((s, x) => s + Number(x.amount), 0);
    if (Math.abs(p - totalUsd) > 0.01) return `Los pagos suman US$${p.toFixed(2)} y el pedido es de US$${totalUsd.toFixed(2)}`;
  }
  return null;
}

/** Rango aceptado por R-Count para la tasa pesos por 1 CAD. */
export const CAD_TRM_MIN = 500;
export const CAD_TRM_MAX = 10000;

export function validateCadTrm(trm: number | null | undefined): string | null {
  const v = Number(trm);
  if (!(v > 0)) return "Falta la tasa (pesos por 1 dólar canadiense)";
  if (v < CAD_TRM_MIN || v > CAD_TRM_MAX) return `La tasa ${v} no parece pesos por 1 CAD (debe estar entre ${CAD_TRM_MIN} y ${CAD_TRM_MAX})`;
  return null;
}

/** Líneas y envío de un pedido en CAD (precios digitados a mano) y validación de cuadre. */
export function buildCadInvoice(
  lines: { sku: string; description?: string; quantity: number; unit_price_cad: number | null | undefined; bodega_codigo?: string | null }[],
  shippingCad: number,
  trm: number | null | undefined,
): { items: any[]; total: number; error: string | null } {
  const trmError = validateCadTrm(trm);
  const missing = lines.find((l) => !(Number(l.unit_price_cad) > 0));
  const items: any[] = lines.map((l) => ({ sku: l.sku, description: l.description ?? "", quantity: l.quantity, unit_price: Math.round(Number(l.unit_price_cad ?? 0) * 100) / 100, discount_rate: 0, tax_rate: 19, bodega_codigo: l.bodega_codigo ?? null }));
  if (shippingCad > 0) items.push({ sku: "ENVIO", description: "Envío", quantity: 1, unit_price: Math.round(shippingCad * 100) / 100, discount_rate: 0, tax_rate: 19 });
  const total = Math.round(items.reduce((s, i) => s + i.quantity * i.unit_price, 0) * 100) / 100;
  const error = trmError ?? (missing ? `Falta el precio en CAD de ${missing.sku || missing.description || "una prenda"}` : !lines.length ? "El pedido no tiene prendas" : null);
  return { items, total, error };
}

/**
 * Líneas para corregir un borrador de exportación en R-Count (PATCH /facturas).
 * Precios en US$ de cada prenda, envío fijo y, si hubo descuento (puntos/código),
 * un % por línea para que líneas + envío den exacto el total cobrado en US$.
 */
export function buildUsdPatchLines(
  items: { sku: string; description?: string; quantity: number; unit_price_usd: number }[],
  totalUsd: number,
  shippingUsd = 30,
) {
  const gross = items.reduce((s, i) => s + i.quantity * i.unit_price_usd, 0);
  const net = Math.round((totalUsd - shippingUsd) * 100) / 100;
  if (net < 0 || net - gross > 0.01) throw new Error(`Las prendas (US$${gross}) + envío no pueden dar US$${totalUsd}`);
  const rate = gross > 0 ? Math.round((1 - net / gross) * 1e6) / 1e4 : 0;
  const lines = items.map((i) => {
    if (i.unit_price_usd > 5000) throw new Error(`Prenda ${i.sku} supera US$5.000`);
    return { sku: i.sku, description: i.description ?? "", quantity: i.quantity, unit_price: i.unit_price_usd, discount_rate: rate > 0.0001 ? rate : 0, tax_rate: 19 };
  });
  if (shippingUsd > 0) lines.push({ sku: "ENVIO", description: "Envío", quantity: 1, unit_price: shippingUsd, discount_rate: 0, tax_rate: 19 });
  return lines;
}
