import { describe, expect, it } from "vitest";
import { fillPriceRange, normalizePriceInput, usdPricePatch } from "./bulk-price-fill";

const rows = { a: { price: "199000", compare: "250000" }, b: { price: "180000", compare: "210000" }, c: { price: "300000", compare: "350000" }, d: { price: "400000", compare: "" } };
describe("arrastre de precios", () => {
  it("copia el precio a las filas recorridas sin modificar comparación ni filas externas", () => {
    const filled = fillPriceRange(rows, ["a", "b", "c", "d"], 0, 2, "price");
    expect(filled.b).toEqual({ price: "199000", compare: "210000" });
    expect(filled.c.price).toBe("199000");
    expect(filled.d).toEqual(rows.d);
    expect(rows.b.price).toBe("180000");
  });
  it("copia comparación hacia arriba sin alterar precios", () => {
    const filled = fillPriceRange(rows, ["a", "b", "c", "d"], 2, 0, "compare");
    expect(filled.a).toEqual({ price: "199000", compare: "350000" });
    expect(filled.b.compare).toBe("350000");
  });
  it("permite extender una comparación vacía", () => {
    expect(fillPriceRange(rows, ["a", "b", "c", "d"], 3, 2, "compare").c.compare).toBe("");
  });
});

describe("precios masivos en dólares", () => {
  it("admite centavos y coma decimal sin convertir dólares en pesos", () => {
    expect(normalizePriceInput("154,50", true)).toBe("154.50");
    expect(normalizePriceInput("154.509", true)).toBe("154.50");
    expect(usdPricePatch({ priceUsd: "154.50", compareUsd: "200.25" }, {})).toEqual({ price_usd: 154.5, compare_at_usd: 200.25 });
  });
  it("copia solo la columna de dólares seleccionada", () => {
    const data = { a: { ...rows.a, priceUsd: "154.50", compareUsd: "200" }, b: { ...rows.b, priceUsd: "80", compareUsd: "100" } };
    expect(fillPriceRange(data, ["a", "b"], 0, 1, "priceUsd").b).toEqual({ ...rows.b, priceUsd: "154.50", compareUsd: "100" });
    expect(fillPriceRange(data, ["a", "b"], 0, 1, "compareUsd").b).toEqual({ ...rows.b, priceUsd: "80", compareUsd: "200" });
  });
  it("no altera dólares existentes si no se editan y permite borrar comparación", () => {
    expect(usdPricePatch({ priceUsd: "154.5", compareUsd: "200" }, { price_usd: 154.5, compare_at_usd: 200 })).toEqual({});
    expect(usdPricePatch({ priceUsd: "154.5", compareUsd: "" }, { price_usd: 154.5, compare_at_usd: 200 })).toEqual({ compare_at_usd: null });
  });
  it("rechaza importes inválidos", () => {
    expect(() => usdPricePatch({ priceUsd: "." }, {})).toThrow();
  });
});