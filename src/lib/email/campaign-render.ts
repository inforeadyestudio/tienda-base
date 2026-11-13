import { SITE_ORIGIN } from "@/lib/site";
// Render de campañas (sirve para la vista previa en el admin y para el envío real).
export type CampaignProduct = { id: string; name: string; slug: string; price: number; image: string | null };
export type CampaignBlock =
  | { id: string; type: "heading"; text: string; align?: "left" | "center"; color?: string }
  | { id: string; type: "text"; text: string; align?: "left" | "center"; color?: string }
  | { id: string; type: "image"; url: string; href?: string; alt?: string }
  | { id: string; type: "button"; label: string; url: string; bg?: string; color?: string }
  | { id: string; type: "products"; title?: string; columns?: 2 | 3; items: CampaignProduct[] }
  | { id: string; type: "divider" }
  | { id: string; type: "spacer" };

export const SITE = SITE_ORIGIN;
export const EMAIL_LOGO = `${SITE}/email-logo.png`;

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const cop = (n: number) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");

/** Agrega parámetros de seguimiento a los enlaces de la tienda. */
export function trackUrl(url: string, campaignId: string) {
  try {
    const u = new URL(url, SITE);
    if (!/marca\.com\.co$/.test(u.hostname)) return u.toString();
    u.searchParams.set("utm_source", "email");
    u.searchParams.set("utm_medium", "campaign");
    u.searchParams.set("utm_campaign", campaignId);
    return u.toString();
  } catch { return url; }
}

const safeUrl = (u?: string) => (u && /^(https?:|mailto:)/i.test(u) ? u : u?.startsWith("/") ? SITE + u : "");

const hex = (c: string | undefined, d: string) => (c && /^#[0-9a-f]{3,8}$/i.test(c) ? c : d);

function block(b: CampaignBlock, cid: string): string {
  const L = (u: string) => esc(trackUrl(u, cid));
  switch (b.type) {
    case "heading":
      return `<tr><td style="padding:8px 32px;text-align:${b.align ?? "left"}"><h1 style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:28px;line-height:1.15;font-weight:600;letter-spacing:.02em;text-transform:uppercase;color:${hex(b.color, "#17191a")}">${esc(b.text)}</h1></td></tr>`;
    case "text":
      return `<tr><td style="padding:8px 32px;text-align:${b.align ?? "left"}">${b.text.split(/\n{2,}/).map((p) => `<p style="margin:0 0 12px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${hex(b.color, "#17191a")}">${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}</td></tr>`;
    case "image": {
      const src = safeUrl(b.url);
      if (!src) return "";
      const img = `<img src="${esc(src)}" alt="${esc(b.alt ?? "")}" width="600" style="display:block;width:100%;max-width:600px;height:auto;border:0">`;
      const href = safeUrl(b.href);
      return `<tr><td style="padding:8px 0">${href ? `<a href="${L(href)}">${img}</a>` : img}</td></tr>`;
    }
    case "button": {
      const href = safeUrl(b.url);
      if (!href || !b.label) return "";
      return `<tr><td style="padding:16px 32px;text-align:center"><a href="${L(href)}" style="display:inline-block;background:${hex(b.bg, "#17191a")};color:${hex(b.color, "#f9f4e6")};padding:15px 28px;font-family:Helvetica,Arial,sans-serif;font-size:12px;letter-spacing:.18em;text-transform:uppercase;text-decoration:none">${esc(b.label)}</a></td></tr>`;
    }
    case "products": {
      const cols = b.columns ?? 2;
      const w = Math.floor(100 / cols);
      const rows: string[] = [];
      for (let i = 0; i < b.items.length; i += cols) {
        const cells = b.items.slice(i, i + cols).map((p) => {
          const href = L(`${SITE}/producto/${p.slug}`);
          return `<td width="${w}%" valign="top" style="padding:8px"><a href="${href}" style="text-decoration:none;color:#17191a">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" width="100%" style="display:block;width:100%;height:auto;border:0">` : ""}<p style="margin:10px 0 2px;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#17191a">${esc(p.name)}</p><p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:13px;color:#6b6f5a">${cop(p.price)}</p></a></td>`;
        });
        while (cells.length < cols) cells.push(`<td width="${w}%"></td>`);
        rows.push(`<tr>${cells.join("")}</tr>`);
      }
      return `<tr><td style="padding:8px 24px">${b.title ? `<p style="margin:0 8px 8px;font-family:Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:#6b6f5a">${esc(b.title)}</p>` : ""}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.join("")}</table></td></tr>`;
    }
    case "divider":
      return `<tr><td style="padding:16px 32px"><hr style="border:0;border-top:1px solid #e5e0d2;margin:0"></td></tr>`;
    case "spacer":
      return `<tr><td style="height:32px;line-height:32px">&nbsp;</td></tr>`;
  }
}

/** Reemplaza {{nombre}} por el primer nombre de la clienta (o lo quita si no hay nombre). */
export function personalize(text: string, name?: string | null, escape = false) {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  const n = first ? first.charAt(0).toUpperCase() + first.slice(1).toLowerCase() : "";
  const v = escape ? esc(n) : n;
  return text.replace(/(\s?)\{\{\s*nombre\s*\}\}/gi, (_m, sp: string) => (v ? sp + v : ""));
}

export function renderCampaignHtml(opts: { campaignId: string; preheader?: string | null; blocks: CampaignBlock[]; unsubscribeUrl: string; name?: string | null }) {
  return personalize(renderRaw(opts), opts.name, true);
}

function renderRaw(opts: { campaignId: string; preheader?: string | null; blocks: CampaignBlock[]; unsubscribeUrl: string }) {
  const { campaignId, blocks } = opts;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#ffffff">
${opts.preheader ? `<div style="display:none;max-height:0;overflow:hidden">${esc(opts.preheader)}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
<tr><td style="padding:28px 32px 16px;text-align:center"><a href="${esc(trackUrl(SITE, campaignId))}"><img src="${EMAIL_LOGO}" alt="Tu Marca" width="150" style="display:inline-block;width:150px;height:auto;border:0"></a></td></tr>
${blocks.map((b) => block(b, campaignId)).join("\n")}
<tr><td style="padding:32px;text-align:center;border-top:1px solid #e5e0d2"><p style="margin:0 0 6px;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#6b6f5a">Tu Marca SAS · tumarca.com</p><p style="margin:0;font-family:Helvetica,Arial,sans-serif;font-size:11px;color:#6b6f5a">Recibes este correo porque eres clienta de Tu Marca. <a href="${esc(opts.unsubscribeUrl)}" style="color:#6b6f5a">Darme de baja</a></p></td></tr>
</table></td></tr></table></body></html>`;
}
