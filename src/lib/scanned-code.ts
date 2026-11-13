/** Corrige los separadores escritos por lectores con otra distribución de teclado. */
export function normalizeScannedCode(raw: string): string {
  return raw.trim().replace(/[’‘'`´–—−]/g, "-").replace(/\s+/g, "").toUpperCase();
}

/** Valores entre comillas para no interpretar el código como sintaxis de PostgREST. */
export function scannedCodeFilter(raw: string): string {
  const code = normalizeScannedCode(raw);
  const exact = JSON.stringify(code);
  const sku = JSON.stringify(code.replace(/[%_]/g, (char) => `\\${char}`));
  return `barcode.eq.${exact},sku.ilike.${sku}`;
}