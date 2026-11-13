// Contenido personalizable de los correos automáticos (campos fijos). Sin dependencias de servidor:
// lo usan los envíos y la vista previa del admin.
import { formatUSD } from "@/lib/format";
import { SITE_ORIGIN } from "@/lib/site";

export type EmailContent = {
  heroImage?: string; heroLink?: string;
  intro?: string;
  showProducts?: boolean; productsTitle?: string;
  bannerImage?: string; bannerLink?: string; bannerTitle?: string; bannerText?: string;
  closing?: string;
};
export type EmailProduct = { name: string; slug: string; price: number; image: string | null };

export const CUSTOMIZABLE_EVENTS = ["customer_online_confirmed", "customer_abandoned_cart", "customer_welcome", "customer_review_request"] as const;
export const PRODUCT_EVENTS = ["customer_online_confirmed"];

const SITE = SITE_ORIGIN;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const url = (u?: string) => (u && /^https?:\/\//.test(u.trim()) ? u.trim() : u && u.startsWith("/") ? SITE + u : "");
const para = (t: string) => t.split(/\n{2,}/).map((x) => `<p style="font-size:14px;line-height:1.6;margin:0 0 12px">${esc(x).replace(/\n/g, "<br>")}</p>`).join("");
const img = (src: string, href: string) => {
  const i = `<img src="${esc(src)}" alt="" width="512" style="display:block;width:100%;height:auto;border:0;margin:0 0 20px">`;
  return href ? `<a href="${esc(href)}">${i}</a>` : i;
};

export function productsBlock(title: string, items: EmailProduct[], currency: "COP" | "USD" = "COP", rate = 4000) {
  if (!items.length) return "";
  const money = (n: number) => currency === "USD" ? formatUSD(Math.round(n / rate), 0) : "$" + Math.round(n).toLocaleString("es-CO");
  const cells = items.slice(0, 4).map((p) => `<td style="width:50%;padding:6px;vertical-align:top"><a href="${SITE}/producto/${esc(p.slug)}" style="color:#17191a;text-decoration:none">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" width="240" style="display:block;width:100%;height:auto;aspect-ratio:4/5;object-fit:cover;border:0;background:#f5efe4">` : ""}<span style="display:block;font-size:12px;text-transform:uppercase;letter-spacing:.06em;margin-top:8px">${esc(p.name)}</span><span style="display:block;font-size:12px;color:#6b6f5a">${money(p.price)}</span></a></td>`);
  const rows: string[] = [];
  for (let i = 0; i < cells.length; i += 2) rows.push(`<tr>${cells[i]}${cells[i + 1] ?? '<td style="width:50%"></td>'}</tr>`);
  return `<h2 style="font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:.1em;margin:28px 0 8px">${esc(title)}</h2><table style="width:100%;border-collapse:collapse">${rows.join("")}</table>`;
}

/** Envuelve el cuerpo del correo con los bloques personalizados. */
export function withCustomContent(body: string, c: EmailContent | null | undefined, products: EmailProduct[] = [], currency: "COP" | "USD" = "COP") {
  c = c ?? {};
  const hero = url(c.heroImage) ? img(url(c.heroImage), url(c.heroLink)) : "";
  const intro = c.intro?.trim() ? para(c.intro) : "";
  const prods = c.showProducts ? productsBlock(c.productsTitle?.trim() || "Combínalo con", products, currency) : "";
  const bImg = url(c.bannerImage) ? img(url(c.bannerImage), url(c.bannerLink)) : "";
  const bText = (c.bannerTitle?.trim() ? `<h2 style="font-size:16px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;margin:0 0 8px">${esc(c.bannerTitle)}</h2>` : "") + (c.bannerText?.trim() ? para(c.bannerText) : "");
  const banner = bImg || bText ? `<div style="margin:28px 0 0">${bImg}${bText}${url(c.bannerLink) && bText ? `<p style="margin:0"><a href="${esc(url(c.bannerLink))}" style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#17191a">Ver más →</a></p>` : ""}</div>` : "";
  const closing = c.closing?.trim() ? para(c.closing) : "";
  return hero + intro + body + prods + banner + closing;
}
