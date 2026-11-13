/** Apply explicit destinations together; untouched products fill the remaining slots. */
export function applyCollectionPositions(ids: string[], positions: Record<string, string>): string[] {
  const slots: (string | undefined)[] = Array.from({ length: ids.length });
  const assigned = new Set<string>();
  for (const id of ids) {
    if (positions[id] === undefined) continue;
    const position = Number(positions[id]);
    if (!positions[id].trim() || !Number.isInteger(position) || position < 1 || position > ids.length) {
      throw new Error(`Cada posición debe ser un número entre 1 y ${ids.length}.`);
    }
    if (slots[position - 1] !== undefined) {
      throw new Error(`La posición ${position} está repetida. Asigna un número distinto a cada prenda editada.`);
    }
    slots[position - 1] = id;
    assigned.add(id);
  }
  const remaining = ids.filter((id) => !assigned.has(id));
  let next = 0;
  return slots.map((id) => id ?? remaining[next++]);
}