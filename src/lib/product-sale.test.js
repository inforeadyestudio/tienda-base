import { describe, it, expect } from "vitest";
import { hasSalePrice, priceVaries } from "./product-sale";
describe("priceVaries", () => {
  it("detecta tallas con precios distintos (XS 150.000 y S 359.000)", () => {
    expect(priceVaries([{ price_cop: 150000 }, { price_cop: 359000 }], "COP")).toBe(true);
  });
  it("no marca «Desde» si todas las tallas cuestan 150.000", () => {
    expect(priceVaries([{ price_cop: 150000 }, { price_cop: 150000 }], "COP")).toBe(false);
  });
  it("ignora tallas inactivas", () => {
    expect(priceVaries([{ price_cop: 150000 }, { price_cop: 359000, active: false }], "COP")).toBe(false);
  });
});

describe("Sale en todas las tallas", () => {
  it("reconoce el descuento de Amber Taupe Body en COP y USD y rechaza el precio completo", () => {
    const sale = { price_cop: 150000, compare_at_cop: 265000, price_usd: 52, compare_at_usd: 85 };
    expect(hasSalePrice(sale, "COP")).toBe(true);
    expect(hasSalePrice(sale, "USD")).toBe(true);
    expect(hasSalePrice({ ...sale, price_cop: 265000 }, "COP")).toBe(false);
    expect(hasSalePrice({ ...sale, price_usd: 85 }, "USD")).toBe(false);
  });
});
