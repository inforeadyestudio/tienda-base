import { describe, it, expect } from "vitest";
import { buildUsdPatchLines } from "./rcount";
const sum = (l) => Math.round(l.reduce((s, x) => s + x.quantity * x.unit_price * (1 - x.discount_rate / 100), 0) * 100) / 100;
describe("buildUsdPatchLines", () => {
  it("LU-WEB-281: prenda + envío 30 = US$76,09", () => {
    const l = buildUsdPatchLines([{ sku: "JAGPANMUD-XS-BAC", quantity: 1, unit_price_usd: 166 }], 76.09);
    expect(l).toHaveLength(2);
    expect(l[1]).toMatchObject({ sku: "ENVIO", unit_price: 30 });
    expect(sum(l)).toBe(76.09);
  });
  it("sin descuento las líneas cuadran sin %", () => {
    const l = buildUsdPatchLines([{ sku: "A", quantity: 1, unit_price_usd: 86 }, { sku: "B", quantity: 1, unit_price_usd: 52 }], 168);
    expect(l[0].discount_rate).toBe(0);
    expect(sum(l)).toBe(168);
  });
  it("rechaza precios en pesos", () => {
    expect(() => buildUsdPatchLines([{ sku: "A", quantity: 1, unit_price_usd: 307200 }], 307230)).toThrow();
  });
});
