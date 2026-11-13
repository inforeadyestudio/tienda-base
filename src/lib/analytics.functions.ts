import { createServerFn } from "@tanstack/react-start";

/** Ubicación aproximada del visitante, leída de las cabeceras del edge. */
export const getVisitorGeo = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequestHeader, getRequest } = await import("@tanstack/react-start/server");
  const cf = (getRequest() as Request & { cf?: { country?: string; city?: string; regionCode?: string; region?: string } }).cf;
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = getRequestHeader(k);
      if (v) {
        try { return decodeURIComponent(v); } catch { return v; }
      }
    }
    return "";
  };
  return {
    country: cf?.country ?? pick("cf-ipcountry", "x-vercel-ip-country", "x-country-code"),
    city: cf?.city ?? pick("cf-ipcity", "x-vercel-ip-city", "x-city"),
    region: cf?.regionCode ?? cf?.region ?? pick("cf-region-code", "x-vercel-ip-country-region", "x-region-code"),
  };
});
