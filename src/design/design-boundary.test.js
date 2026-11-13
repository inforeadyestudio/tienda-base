import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL(".", import.meta.url).pathname;
const files = [];
(function walk(d) {
  for (const f of readdirSync(d)) {
    const p = join(d, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(tsx?|jsx?)$/.test(f) && !f.endsWith(".test.js")) files.push(p);
  }
})(ROOT);

// El diseño no puede hablar con la base de datos, servidores ni pagos.
const FORBIDDEN = [
  /@\/integrations\/supabase/,
  /\.functions["']/,
  /\.server["']/,
  /@tanstack\/react-start/,
  /@\/lib\/(billing|checkout|payments|pos|b2b|email|rcount)/i,
  /\bfetch\(/,
];

// Excepción: visor 3D compilado (three.js) usa fetch( solo para cargar su .glb estático del sitio.
const FETCH_ALLOWED = [/product\/glasses3d\/marca-glasses-3d\.js$/];

describe("límite de la capa de diseño", () => {
  it("existen archivos de diseño", () => expect(files.length).toBeGreaterThan(0));
  for (const f of files) {
    it(`${f.replace(ROOT, "")} no usa base de datos, servidores ni pagos`, () => {
      const src = readFileSync(f, "utf8");
      for (const rule of FORBIDDEN) {
        if (rule.source === "\\bfetch\\(" && FETCH_ALLOWED.some((a) => a.test(f))) continue;
        expect(src, `${rule}`).not.toMatch(rule);
      }
    });
  }
});
