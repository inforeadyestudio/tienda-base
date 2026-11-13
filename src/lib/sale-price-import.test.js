import { describe, it, expect } from "vitest";
import { parseSaleRows, buildPatch, copValue, indexBySku } from "./sale-price-import";

const cur = { id: "v", sku: "AGUBERGRE-XS", price_cop: 389000, compare_at_cop: null, price_usd: 129, compare_at_usd: null };

describe("importar precios Sale", () => {
  it("pesos en miles se multiplican por 1000", () => {
    expect(copValue(200)).toBe(200000);
    expect(copValue(389000)).toBe(389000);
  });
  it("comparación USD vacía toma el precio USD actual", () => {
    const [row] = parseSaleRows([{ Title: "x", SKU: " agubergre-xs ", "PRECIO CO": 200, "COMPARACION CO": 389, "PRECIO USD": 69, "COMPARACION US": null }]);
    expect(row.sku).toBe("AGUBERGRE-XS");
    expect(buildPatch(row, cur)).toEqual({ price_cop: 200000, compare_at_cop: 389000, price_usd: 69, compare_at_usd: 129 });
  });
  it("comparación USD del Excel tiene prioridad", () => {
    const [row] = parseSaleRows([{ SKU: "A", "PRECIO USD": 69, "COMPARACION US": 150 }]);
    expect(buildPatch(row, cur).compare_at_usd).toBe(150);
  });
  it("encuentra SKU guardado con minúsculas", () => {
    const [row] = parseSaleRows([{ SKU: "GORILLATOPEIV-M" }]);
    expect(indexBySku([{ id: "g", sku: "GorillaTopEIv-M" }]).get(row.sku)?.id).toBe("g");
  });
});
