/**
 * Caché del catálogo con "último conocido" (stale-while-revalidate).
 * - Fresco: TTL corto, no toca la base.
 * - Vencido pero < STALE: quien gana el candado refresca dentro de SU propia
 *   petición (con tiempo límite); los demás reciben lo guardado al instante.
 * - Si la base falla o tarda: se sirve el último conocido.
 *
 * Importante (Cloudflare Workers): nunca se comparte una promesa de lectura
 * entre peticiones distintas ni se deja trabajo suelto después de responder.
 * El worker cancela esas lecturas y quien las esperaba se queda colgado para
 * siempre, dejando al visitante sin productos.
 */
export type CacheEntry<T> = { at: number; rows: T };

export type CacheStore<T> = {
  get: () => Promise<CacheEntry<T> | null>;
  put: (e: CacheEntry<T>) => Promise<void>;
  /** Devuelve true si esta instancia obtuvo el candado de refresco. */
  lock: () => Promise<boolean>;
};

function bounded<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("catalog-cache timeout")), ms);
    }),
  ]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  });
}

export function createSwrCache<T>(opts: {
  ttlMs: number;
  staleMs: number;
  read: () => Promise<T>;
  store?: CacheStore<T>;
  now?: () => number;
  /** Tiempo máximo de una lectura de la base dentro de la petición. */
  readTimeoutMs?: number;
  /** Tiempo máximo de cada operación de la caché compartida. */
  storeTimeoutMs?: number;
}) {
  const now = opts.now ?? Date.now;
  const readMs = opts.readTimeoutMs ?? 8_000;
  const storeMs = opts.storeTimeoutMs ?? 1_500;
  let memo: CacheEntry<T> | null = null;

  const refresh = async (): Promise<T> => {
    const rows = await bounded(opts.read(), readMs);
    memo = { at: now(), rows };
    if (opts.store) await bounded(opts.store.put(memo), storeMs).catch(() => {});
    return rows;
  };

  return async function load(): Promise<T> {
    const t = now();
    if (memo && t - memo.at < opts.ttlMs) return memo.rows;
    if (opts.store) {
      const hit = await bounded(opts.store.get(), storeMs).catch(() => null);
      if (hit && Number.isFinite(hit.at) && (!memo || hit.at > memo.at)) memo = hit;
    }
    if (memo && t - memo.at < opts.ttlMs) return memo.rows;
    if (memo && t - memo.at < opts.staleMs) {
      const stale = memo.rows;
      const got = opts.store ? await bounded(opts.store.lock(), storeMs).catch(() => true) : true;
      if (!got) return stale;
      try {
        return await refresh();
      } catch {
        return stale;
      }
    }
    try {
      return await refresh();
    } catch (e) {
      if (memo) return memo.rows;
      throw e;
    }
  };
}
