/**
 * Motor determinístico de recomendación de talla.
 * La IA puede explicar el resultado; el cálculo vive aquí.
 */

export type FitPreference = "fitted" | "model" | "relaxed";
export type GarmentType = "bottom" | "top" | "dress" | "outerwear" | "other";
export type StretchLevel = "none" | "low" | "medium" | "high";
export type FitType = "slim" | "regular" | "relaxed" | "oversized";

export type SizeRow = {
  size: string;
  bust?: [number, number] | null;
  waist?: [number, number] | null;
  hip?: [number, number] | null;
  length?: number | null;
  low_waist?: number | null;
  inseam?: number | null;
};

export type FitSpec = {
  garment_type?: GarmentType;
  fit_type?: FitType;
  stretch_level?: StretchLevel;
  model_size?: string | null;
  model_measurements?: { height_cm?: number | null; bust?: number | null; waist?: number | null; hip?: number | null } | null;
  fit_notes?: string | null;
  measurements_by_size?: SizeRow[];
};

export type BodyInput = {
  height_cm?: number | null;
  weight_kg?: number | null;
  bust_cm?: number | null;
  waist_cm?: number | null;
  hip_cm?: number | null;
  preference: FitPreference;
  usual_size?: string | null;
  usual_brand?: string | null;
};

export type FitResult = {
  size: string | null;
  confidence: "alta" | "media" | "baja";
  confidenceLabel: string;
  ladder: { size: string; note: string; recommended: boolean }[];
  reason: string;
  fitLine: string;
};

const ORDER = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"];
const NUMERIC = /^\d+$/;

export function sizeIndex(size: string, all: string[]) {
  const norm = size.trim().toUpperCase();
  const i = all.findIndex((s) => s.trim().toUpperCase() === norm);
  return i;
}

/** Ordena tallas por convención (alfa o numérica). */
export function sortSizes(sizes: string[]) {
  return [...sizes].sort((a, b) => {
    const A = a.trim().toUpperCase();
    const B = b.trim().toUpperCase();
    if (NUMERIC.test(A) && NUMERIC.test(B)) return Number(A) - Number(B);
    const ia = ORDER.indexOf(A);
    const ib = ORDER.indexOf(B);
    if (ia !== -1 && ib !== -1) return ia - ib;
    return A.localeCompare(B);
  });
}

type BodyMeasure = "bust" | "waist" | "hip";

/** Qué medidas importan según la prenda. */
export function relevantMeasures(garment: GarmentType | undefined): BodyMeasure[] {
  switch (garment) {
    case "bottom":
      return ["waist", "hip"];
    case "top":
    case "outerwear":
      return ["bust", "waist"];
    case "dress":
      return ["bust", "waist", "hip"];
    default:
      return ["bust", "waist", "hip"];
  }
}

/**
 * Medidas a preguntar: las que la tabla del tipo de prenda realmente tiene.
 * Si el tipo quitó una medida (p. ej. cadera en un corset), no se pregunta.
 * Sin tabla, se usa la regla por tipo de prenda.
 */
export function measuresFromSpec(spec: FitSpec): BodyMeasure[] {
  const rows = spec.measurements_by_size ?? [];
  const present = (["bust", "waist", "hip"] as BodyMeasure[]).filter((m) =>
    rows.some((r) => Array.isArray(r[m]) && (r[m] as number[]).length === 2),
  );
  if (present.length) return present;
  return relevantMeasures(spec.garment_type);
}

const STRETCH_TOLERANCE: Record<StretchLevel, number> = { none: 0, low: 1.5, medium: 3, high: 5 };

function rangeScore(value: number, range: [number, number], tolerance: number) {
  const [min, max] = range;
  if (value >= min && value <= max) return 0;
  if (value < min) return min - value;
  return Math.max(0, value - max - tolerance);
}

/** Estimación por altura/peso cuando no hay medidas (IMC → talla aproximada). */
function estimateFromBodyMass(height?: number | null, weight?: number | null) {
  if (!height || !weight) return null;
  const bmi = weight / Math.pow(height / 100, 2);
  if (bmi < 18) return "XS";
  if (bmi < 21) return "S";
  if (bmi < 24.5) return "M";
  if (bmi < 28) return "L";
  return "XL";
}

export function recommendSize(spec: FitSpec, body: BodyInput, availableSizes: string[]): FitResult {
  const sizes = sortSizes(availableSizes.filter(Boolean));
  const rows = (spec.measurements_by_size ?? []).filter((r) => r.size);
  const measures = measuresFromSpec(spec);
  const tolerance = STRETCH_TOLERANCE[spec.stretch_level ?? "low"] ?? 1.5;

  const hasBodyMeasures = measures.some((m) => Number(body[`${m}_cm` as keyof BodyInput]));
  let base: string | null = null;
  let confidence: FitResult["confidence"] = "baja";

  const usable = rows.filter((r) => sizes.length === 0 || sizes.some((s) => s.toUpperCase() === r.size.toUpperCase()));

  if (hasBodyMeasures && usable.length) {
    let best: { size: string; score: number } | null = null;
    for (const row of usable) {
      let score = 0;
      let counted = 0;
      for (const m of measures) {
        const value = Number(body[`${m}_cm` as keyof BodyInput]);
        const range = row[m];
        if (!value || !range || range.length !== 2) continue;
        score += rangeScore(value, range as [number, number], tolerance);
        counted += 1;
      }
      if (!counted) continue;
      score = score / counted;
      if (!best || score < best.score) best = { size: row.size, score };
    }
    if (best) {
      base = best.size;
      confidence = best.score <= 0.5 ? "alta" : best.score <= 3 ? "media" : "baja";
    }
  }

  if (!base && body.usual_size) {
    base = body.usual_size;
    confidence = body.usual_brand === "Tu Marca" ? "alta" : "media";
  }
  if (!base) {
    base = estimateFromBodyMass(body.height_cm, body.weight_kg);
    confidence = "baja";
  }
  if (!base) base = spec.model_size ?? sizes[Math.floor(sizes.length / 2)] ?? null;

  // Ajuste por preferencia y por el carácter de la prenda.
  const pool = sizes.length ? sizes : sortSizes(usable.map((r) => r.size));
  let idx = base ? sizeIndex(base, pool) : -1;
  if (idx === -1 && pool.length) idx = Math.floor(pool.length / 2);

  const looseGarment = spec.fit_type === "relaxed" || spec.fit_type === "oversized";
  const slimGarment = spec.fit_type === "slim";
  let shift = 0;
  if (body.preference === "fitted") shift -= slimGarment ? 0 : 1;
  if (body.preference === "relaxed") shift += looseGarment ? 0 : 1;
  if (body.preference === "model" && slimGarment && !hasBodyMeasures) shift += 0;

  const finalIdx = pool.length ? Math.min(pool.length - 1, Math.max(0, idx + shift)) : -1;
  const size = finalIdx >= 0 ? pool[finalIdx]! : base;

  const ladder = pool.map((s, i) => ({
    size: s,
    recommended: i === finalIdx,
    note: i === finalIdx ? "Recomendado" : i < finalIdx ? "Más ajustado" : "Más relajado",
  }));

  const fitWord =
    spec.fit_type === "oversized"
      ? "un fit amplio"
      : spec.fit_type === "relaxed"
        ? "un fit ligeramente relajado"
        : spec.fit_type === "slim"
          ? "un fit ceñido al cuerpo"
          : "un fit natural";

  const fitLine = `Esta pieza tiene ${fitWord}.`;
  const reason = hasBodyMeasures
    ? `Con tus medidas, ${size} debería darte el fit que ${body.preference === "fitted" ? "buscas, más cerca del cuerpo" : body.preference === "relaxed" ? "buscas, con un poco más de espacio" : "ves en la modelo"}.`
    : body.usual_size
      ? `Tomamos como referencia tu talla habitual (${body.usual_size}${body.usual_brand ? ` en ${body.usual_brand}` : ""}) y el carácter de esta pieza.`
      : `Es una estimación con los datos que nos diste; si nos cuentas tus medidas la afinamos.`;

  const confidenceLabel =
    confidence === "alta" ? "Muy buena coincidencia" : confidence === "media" ? "Buena coincidencia" : "Coincidencia aproximada";

  return { size: size ?? null, confidence, confidenceLabel, ladder, reason, fitLine };
}

/** Talla dominante en el historial de compras. */
export function sizeFromHistory(history: { size: string | null }[]) {
  const counts = new Map<string, number>();
  history.forEach((h) => {
    if (!h.size) return;
    const k = h.size.trim().toUpperCase();
    counts.set(k, (counts.get(k) ?? 0) + 1);
  });
  let top: { size: string; n: number } | null = null;
  counts.forEach((n, size) => {
    if (!top || n > top.n) top = { size, n };
  });
  return top as { size: string; n: number } | null;
}

export function parseFitSpec(raw: unknown): FitSpec {
  if (!raw || typeof raw !== "object") return {};
  return raw as FitSpec;
}
