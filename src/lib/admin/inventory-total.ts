/** Unidades disponibles: físico en bodegas menos lo comprometido B2B, nunca negativo. */
export const availableAfterCommitted = (physical: number, committed: number) => Math.max(0, physical - committed);
