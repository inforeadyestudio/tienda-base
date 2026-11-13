// Dominios propios de la tienda: el dominio de la marca y los despliegues de
// este proyecto en Vercel. Se usan para validar retornos de pago y orígenes de fotos.
import { BRAND } from "@/config/brand";

function hostOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Lista exacta de hosts permitidos (sin comodines). */
export function storeHosts(): Set<string> {
  const hosts = new Set<string>();
  const site = hostOf(BRAND.siteOrigin);
  if (site) {
    hosts.add(site);
    hosts.add(site.startsWith("www.") ? site.slice(4) : `www.${site}`);
  }
  // Variables que Vercel define en cada despliegue (producción y vistas previas).
  for (const key of ["VERCEL_URL", "VERCEL_BRANCH_URL", "VERCEL_PROJECT_PRODUCTION_URL"]) {
    const h = hostOf(process.env[key]);
    if (h) hosts.add(h);
  }
  // Dominios extra separados por coma (opcional).
  for (const raw of (process.env["ALLOWED_HOSTS"] ?? "").split(",")) {
    const h = hostOf(raw.trim());
    if (h) hosts.add(h);
  }
  return hosts;
}

export function isStoreHost(hostname: string): boolean {
  return storeHosts().has(hostname.toLowerCase());
}
