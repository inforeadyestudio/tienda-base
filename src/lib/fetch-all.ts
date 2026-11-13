/**
 * Recorre una consulta en bloques de 1000 filas hasta traerlas todas,
 * para que ningún listado quede cortado por el límite del servidor.
 * `build` debe devolver una consulta nueva (con orden estable) en cada llamada.
 */
export async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  pageSize = 1000,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    const chunk = data ?? [];
    out.push(...chunk);
    if (chunk.length < pageSize) break;
  }
  return out;
}
