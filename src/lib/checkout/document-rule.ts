/** Documento de identidad obligatorio en todos los países (cédula en Colombia, pasaporte fuera). */
export function documentError(value: string, colombia: boolean): string | null {
  const v = value.trim();
  if (v.length < 5 || v.length > 30) return colombia ? "Revisa tu cédula" : "Escribe tu pasaporte o documento";
  if (!/^[A-Za-z0-9.-]+$/.test(v)) return colombia ? "Revisa tu cédula" : "Usa solo letras y números";
  return null;
}
