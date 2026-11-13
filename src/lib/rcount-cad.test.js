import { describe, it, expect } from "vitest";
import { validateCadTrm, buildCadInvoice } from "./rcount";

describe("facturas en CAD", () => {
  it("exige la tasa", () => expect(validateCadTrm(null)).toMatch(/Falta la tasa/));
  it("rechaza tasa menor a 500", () => expect(validateCadTrm(499)).not.toBeNull());
  it("rechaza tasa mayor a 10.000", () => expect(validateCadTrm(10001)).not.toBeNull());
  it("acepta 2950", () => expect(validateCadTrm(2950)).toBeNull());
  it("líneas + envío = total en CAD sin convertir", () => {
    const r = buildCadInvoice([{ sku: "A", quantity: 2, unit_price_cad: 80 }], 25, 2950);
    expect(r.error).toBeNull();
    expect(r.total).toBe(185);
    expect(r.items[0].unit_price).toBe(80);
  });
  it("bloquea prendas sin precio CAD", () => {
    expect(buildCadInvoice([{ sku: "A", quantity: 1, unit_price_cad: null }], 0, 2950).error).toMatch(/precio en CAD/);
  });
});
