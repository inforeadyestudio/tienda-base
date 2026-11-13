// Fotos de cada gafa por vista: frente, tres cuartos y lateral (las del inventario vienen así por color).
// Se usan en el banner de gafas que giran y en el visor de la página de producto.
export type Views = { f: string; t: string; l: string };

const VIEW_WORDS: Array<[keyof Views, RegExp]> = [
  ["f", /frente|frontal|front/i],
  ["t", /tres[-_ ]?cuartos|three[-_ ]?quarter/i],
  ["l", /lateral|perfil|side/i],
];
const fileOf = (url: string) => {
  const last = url.split(/[?#]/)[0].split("/").pop() || "";
  try { return decodeURIComponent(last); } catch { return last; }
};
const colorOf = (file: string) => /c(\d{1,2})(?=[-_.])/i.exec(file)?.[1] ?? "";

/** Vista de una foto según su nombre (o su número 1 · 2 · 3); null si es una toma extra. */
export function viewOf(url: string): keyof Views | null {
  const stem = fileOf(url).replace(/\.\w+$/, "");
  for (const [v, re] of VIEW_WORDS) if (re.test(stem)) return /-\d$/.test(stem) ? null : v; // «tres-cuartos-2»: toma extra
  const n = /[-_](\d{1,2})$/.exec(stem)?.[1]; // fotos numeradas 1 · 2 · 3
  return n === "1" || n === "01" ? "f" : n === "2" || n === "02" ? "t" : n === "3" || n === "03" ? "l" : null;
}

// agrupa las fotos del producto por color; si los nombres no dicen la vista, toma el orden frente · 3/4 · lateral.
// TODO(logica): si ctx.products trajera product_images.color (como la ficha de producto), esto no tendría que leer nombres de archivo.
export function viewsByColor(urls: string[]): Views[] {
  const groups = new Map<string, Partial<Views>>();
  let named = false;
  for (const u of urls) {
    const v = viewOf(u);
    if (!v) continue;
    named = true;
    const c = colorOf(fileOf(u));
    const g = groups.get(c) ?? {};
    if (!g[v]) g[v] = u;
    groups.set(c, g);
  }
  const out: Views[] = [];
  if (named) {
    for (const g of groups.values()) {
      const f = g.f ?? g.t ?? g.l;
      if (f) out.push({ f, t: g.t ?? f, l: g.l ?? g.t ?? f });
    }
  } else {
    for (let i = 0; i < urls.length; i += 3) out.push({ f: urls[i], t: urls[i + 1] ?? urls[i], l: urls[i + 2] ?? urls[i + 1] ?? urls[i] });
  }
  return out;
}
