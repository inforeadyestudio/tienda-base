import { describe, it, expect } from "vitest";
import { validateUsdInvoice, splitPaymentsUsd } from "./rcount";

describe("facturas en US$ hacia R-Count", () => {
  it("acepta María Muñoz: prendas + envío US$30 = US$361", () => {
    expect(validateUsdInvoice([{ sku: "A", quantity: 1, unit_price: 96 }, { sku: "B", quantity: 1, unit_price: 235 }, { sku: "ENVIO", quantity: 1, unit_price: 30 }], null, 361)).toBeNull();
  });
  it("bloquea una prenda en pesos (307.200)", () => {
    expect(validateUsdInvoice([{ sku: "A", quantity: 1, unit_price: 307200 }], null, 361)).toMatch(/pesos/);
  });
  it("bloquea si las líneas no suman el total", () => {
    expect(validateUsdInvoice([{ sku: "A", quantity: 1, unit_price: 96 }], null, 361)).toMatch(/suman/);
  });
  it("pagos mixtos se reparten y suman exacto el total US$", () => {
    const p = splitPaymentsUsd([{ amount: 1000000 }, { amount: 50000 }], 361);
    expect(p.reduce((s, x) => s + x.amount, 0)).toBeCloseTo(361, 2);
    expect(validateUsdInvoice([{ sku: "A", quantity: 1, unit_price: 361 }], p, 361)).toBeNull();
  });
});
