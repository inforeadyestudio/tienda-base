/**
 * Datos de la marca en un solo lugar. Al crear una marca nueva desde la base,
 * corre `node scripts/nueva-marca.mjs` (cambia el nombre en todo el proyecto) y
 * ajusta aquí lo demás. Lo que cambia por ambiente va en variables VITE_* de Vercel.
 */
const env = import.meta.env as Record<string, string | undefined>;

export const BRAND = {
  /** Nombre visible de la marca. */
  name: "Tu Marca",
  /** Razón social y NIT para recibos, facturas y documentos. */
  legalName: "Tu Marca S.A.S.",
  nit: "000000000-0",
  /** Correo de contacto y de contabilidad que se muestran a clientes. */
  contactEmail: "hola@tumarca.com",
  accountingEmail: "contabilidad@tumarca.com",
  /** Teléfono de la empresa (recibos POS). */
  phone: "+570000000000",
  /** WhatsApp de atención, solo dígitos con indicativo. */
  whatsapp: "570000000000",
  /** Dirección de la bodega (remitente en guías de despacho). */
  warehouseAddress: "Dirección de la bodega, Ciudad, Colombia",
  /** Dominio público de la tienda (sin barra final). */
  siteOrigin: (env.VITE_SITE_URL || "https://www.tumarca.com").replace(/\/+$/, ""),
  /** Usuario de Instagram, sin @. */
  instagram: "tumarca",
  /** Remitente de los correos (dominio verificado en Resend). */
  emailFrom: "Tu Marca <hola@news.tumarca.com>",
  /** Meta Pixel: vacío = no se carga. */
  metaPixelId: env.VITE_META_PIXEL_ID || "",
} as const;

export const BRAND_INSTAGRAM_URL = `https://www.instagram.com/${BRAND.instagram}`;
