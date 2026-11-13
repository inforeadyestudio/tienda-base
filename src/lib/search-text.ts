/**
 * Normaliza texto para búsquedas: minúsculas y sin tildes,
 * para que «maria» encuentre «María» y viceversa.
 */
export function normSearch(value: string | null | undefined): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}
