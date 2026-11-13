/** Reglas del lote de analítica (compartidas por el navegador y el servidor). */

/** Eventos de checkout y compra: se guardan al instante, nunca en lote. */
export const IMMEDIATE_EVENTS = new Set([
  "checkout_started",
  "shipping_completed",
  "payment_started",
  "purchase",
  "checkout_exit_intent",
  "checkout_exit_recovered",
  "checkout_abandon_reason",
]);

export const BATCH_MAX_EVENTS = 20;
export const BATCH_INTERVAL_MS = 10_000;
export const SERVER_MAX_EVENTS = 50;
export const SERVER_MAX_BYTES = 32 * 1024;
export const RATE_LIMIT_PER_MIN = 120;

export function isImmediate(name) {
  return IMMEDIATE_EVENTS.has(name);
}

export function shouldFlush(queueLength) {
  return queueLength >= BATCH_MAX_EVENTS;
}

/** Límite fijo por ventana de 60 s. Devuelve una función allow(ip, now). */
export function createRateLimiter(limit = RATE_LIMIT_PER_MIN, windowMs = 60_000) {
  const hits = new Map();
  return function allow(ip, now = Date.now()) {
    if (hits.size > 5_000) {
      for (const [k, v] of hits) if (now - v.start >= windowMs) hits.delete(k);
    }
    const cur = hits.get(ip);
    if (!cur || now - cur.start >= windowMs) {
      hits.set(ip, { start: now, count: 1 });
      return true;
    }
    if (cur.count >= limit) return false;
    cur.count += 1;
    return true;
  };
}
