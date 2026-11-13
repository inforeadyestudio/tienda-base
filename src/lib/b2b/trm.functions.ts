import { createServerFn } from "@tanstack/react-start";

export type TrmInfo = {
  value: number;
  validFrom: string;
};

let cache: { info: TrmInfo; fetchedAt: number } | null = null;
const CACHE_MS = 6 * 60 * 60 * 1000;

export const getTrm = createServerFn({ method: "GET" }).handler(async (): Promise<TrmInfo | null> => {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) return cache.info;
  try {
    const url = "https://www.datos.gov.co/resource/32sa-8pi3.json?$order=vigenciadesde%20DESC&$limit=1";
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`TRM ${res.status}`);
    const rows = (await res.json()) as Array<{ valor?: string; vigenciadesde?: string }>;
    const row = rows?.[0];
    const value = Number(row?.valor);
    if (!Number.isFinite(value) || value <= 0) throw new Error("TRM invalid");
    const info: TrmInfo = { value, validFrom: row?.vigenciadesde ?? "" };
    cache = { info, fetchedAt: Date.now() };
    return info;
  } catch {
    // Fall back to the last known value within the process; never fabricate a future one.
    return cache?.info ?? null;
  }
});
