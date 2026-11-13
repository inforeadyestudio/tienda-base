export const SIZE_ORDER = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "U"];

/**
 * Normaliza una talla: quita el sufijo interno de calidad (" - Calidad A/C"),
 * pasa a mayúsculas y unifica las variantes de talla única bajo "U".
 */
const clean = (raw?: string | null) => {
  const s = (raw ?? "")
    .replace(/\s*[-–—·|]\s*Calidad\s+[A-Z0-9]+\s*$/i, "")
    .trim()
    .toUpperCase();
  const key = s.replace(/[\s.]/g, "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  if (!key || /^(U|UNICA|UNICO|UNICATALLA|TALLAUNICA|TALLAUNICATALLA)$/.test(key)) return "U";
  return s;
};

/** Talla sin el dato de calidad, para agrupar y ordenar. */
export const sizeLabel = (raw?: string | null) => clean(raw);

/** Cómo se muestra la talla en la interfaz: sin calidad y "Único" si es talla única. */
export const displaySize = (raw?: string | null) => {
  const label = clean(raw);
  return label === "U" ? "Único" : label;
};

export const sizeRank = (raw?: string | null) => {
  const i = SIZE_ORDER.indexOf(clean(raw));
  return i < 0 ? 99 : i;
};

export const compareSizes = (a?: string | null, b?: string | null) =>
  sizeRank(a) - sizeRank(b) || clean(a).localeCompare(clean(b));
