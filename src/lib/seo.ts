import { SITE_ORIGIN } from "@/lib/site";
import { BRAND, BRAND_INSTAGRAM_URL } from "@/config/brand";

/**
 * SEO de Tu Marca en un solo lugar: textos de marca, palabras clave y helpers
 * para armar las etiquetas <head> de cada página pública.
 */
export const SEO_BRAND = BRAND.name;
export const SEO_IMAGE = `${SITE_ORIGIN}/share.jpg`;

export const SEO_DEFAULT_TITLE = "Tu Marca | Tienda oficial";
export const SEO_DEFAULT_DESCRIPTION =
  "Tienda oficial de Tu Marca: descubre la colección y compra en línea con envíos a toda Colombia.";

/** Descripción larga de la marca (Nuestro mundo, datos estructurados). */
export const SEO_BRAND_STORY =
  "Cuenta aquí la historia de Tu Marca: qué hace, para quién y qué la hace distinta.";

export const SEO_KEYWORDS = [
  "Tu Marca",
  "tienda online",
  "moda Colombia",
  "envíos a toda Colombia",
].join(", ");

/** Frases de marca para textos cortos. */
export const SEO_TAGLINES = [
  "Tu frase de marca va aquí.",
] as const;

type SeoInput = {
  title: string;
  description: string;
  /** Ruta pública, ej. "/tienda". */
  path: string;
  image?: string | null;
  type?: "website" | "product" | "article";
  /** Páginas privadas o de paso (carrito, ingreso, pagos): no se indexan. */
  noindex?: boolean;
};

/** Recorta un texto para descripciones (máx. ~160 caracteres, sin cortar palabras). */
export function seoClip(text: string, max = 160) {
  const clean = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ")).replace(/[.,;:]$/, "")}…`;
}

/** Etiquetas meta + canónica para una página pública. */
export function seoHead({ title, description, path, image, type = "website", noindex }: SeoInput) {
  const url = `${SITE_ORIGIN}${path.startsWith("/") ? path : `/${path}`}`;
  const img = image && /^https:\/\//.test(image) ? image : SEO_IMAGE;
  const desc = seoClip(description);
  return {
    meta: [
      { title },
      { name: "description", content: desc },
      ...(noindex ? [{ name: "robots", content: "noindex, nofollow" }] : []),
      { property: "og:title", content: title },
      { property: "og:description", content: desc },
      { property: "og:url", content: url },
      { property: "og:type", content: type },
      { property: "og:image", content: img },
      { property: "og:locale", content: "es_CO" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: desc },
      { name: "twitter:image", content: img },
    ],
    links: noindex ? [] : [{ rel: "canonical", href: url }],
  };
}

/** Datos estructurados (JSON-LD) de la marca y del sitio, para la portada. */
export function seoOrganizationScript() {
  return {
    type: "application/ld+json",
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          "@id": `${SITE_ORIGIN}/#organization`,
          name: SEO_BRAND,
          url: SITE_ORIGIN,
          logo: `${SITE_ORIGIN}/favicon.png`,
          description: SEO_BRAND_STORY,
          slogan: SEO_TAGLINES[0],
          sameAs: [BRAND_INSTAGRAM_URL],
        },
        {
          "@type": "WebSite",
          "@id": `${SITE_ORIGIN}/#website`,
          url: SITE_ORIGIN,
          name: SEO_BRAND,
          inLanguage: "es-CO",
          publisher: { "@id": `${SITE_ORIGIN}/#organization` },
        },
      ],
    }),
  };
}

/** Texto de apoyo según el tipo de producto. */
export function seoTypeLine(productType?: string | null) {
  const t = (productType ?? "").trim();
  return t ? `${t} de ${SEO_BRAND}.` : `Producto de ${SEO_BRAND}.`;
}

/** JSON-LD de un producto para resultados enriquecidos de Google. */
export function seoProductScript(p: {
  name: string;
  slug: string;
  description?: string | null;
  product_type?: string | null;
  hero_image_url?: string | null;
  product_images?: { url: string; position: number }[] | null;
  product_variants?: { price_cop: number | null; active?: boolean | null; sku?: string | null }[] | null;
}) {
  const images = [
    ...(p.hero_image_url ? [p.hero_image_url] : []),
    ...((p.product_images ?? []).slice().sort((a, b) => a.position - b.position).map((i) => i.url)),
  ].filter((u, i, all) => /^https:\/\//.test(u) && all.indexOf(u) === i).slice(0, 6);
  const prices = (p.product_variants ?? [])
    .filter((v) => v.active !== false && typeof v.price_cop === "number" && v.price_cop > 0)
    .map((v) => v.price_cop as number);
  const url = `${SITE_ORIGIN}/producto/${p.slug}`;
  const offers = prices.length
    ? {
        "@type": "AggregateOffer",
        priceCurrency: "COP",
        lowPrice: Math.min(...prices),
        highPrice: Math.max(...prices),
        offerCount: prices.length,
        url,
      }
    : undefined;
  return {
    type: "application/ld+json",
    children: JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Product",
      name: p.name,
      description: seoClip(`${p.description ?? ""} ${seoTypeLine(p.product_type)}`, 300),
      image: images,
      brand: { "@type": "Brand", name: SEO_BRAND },
      category: p.product_type ?? "Productos",
      url,
      ...(offers ? { offers } : {}),
    }),
  };
}
