#!/usr/bin/env node
// Convierte la tienda base en una marca nueva: cambia el nombre de ejemplo
// ("Tu Marca"), el dominio (tumarca.com) y el Instagram (@tumarca) en todo el proyecto.
//
//   node scripts/nueva-marca.mjs --nombre "Mi Marca" --dominio mimarca.com --instagram mimarca
//
// Después ajusta a mano `src/config/brand.ts` (razón social, NIT, teléfonos,
// direcciones), el logo (`src/design/storefront/marca-logo.tsx`), las fotos de
// ejemplo (`src/design/assets/marca/`, `src/assets/`, `public/`) y los textos SEO
// (`src/lib/seo.ts`).
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1]]] : acc), []),
);
const nombre = args.nombre?.trim();
const dominio = args.dominio?.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/+$/, "");
const instagram = (args.instagram ?? "").trim().replace(/^@/, "");
if (!nombre || !dominio) {
  console.error('Uso: node scripts/nueva-marca.mjs --nombre "Mi Marca" --dominio mimarca.com [--instagram mimarca]');
  process.exit(1);
}

const SKIP = new Set(["node_modules", ".git", ".output", ".vercel", ".tanstack", "dist", "scripts"]);
const EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".css", ".md", ".json", ".html", ".sql", ".txt", ".toml", ".example"]);
const reglas = [
  ["TU MARCA", nombre.toUpperCase()],
  ["Tu Marca", nombre],
  ["instagram.com/tumarca", `instagram.com/${instagram || "tumarca"}`],
  ['instagram: "tumarca"', `instagram: "${instagram || "tumarca"}"`],
  ["@tumarca.com", `@${dominio}`],
  ["news.tumarca.com", `news.${dominio}`],
  ["tumarca.com", dominio],
  ...(instagram ? [["@tumarca", `@${instagram}`]] : []),
];

let cambiados = 0;
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { walk(p); continue; }
    if (!EXT.has(extname(name)) || name === "bun.lock") continue;
    const antes = readFileSync(p, "utf8");
    let despues = antes;
    for (const [de, a] of reglas) despues = despues.split(de).join(a);
    if (despues !== antes) { writeFileSync(p, despues); cambiados++; }
  }
})(process.cwd());
console.log(`Listo: ${cambiados} archivos actualizados para "${nombre}" (${dominio}).`);
