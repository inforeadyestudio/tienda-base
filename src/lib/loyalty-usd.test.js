import { describe, expect, it } from "vitest";
import { pointsDiscountUsd } from "./loyalty";

describe("pointsDiscountUsd", () => {
  it("convierte 40.000 puntos ($40.000 COP) a US$10 con tasa 4000", () => {
    expect(pointsDiscountUsd(40_000, 4000)).toBe(10);
  });
  it("redondea centavos hacia abajo", () => {
    expect(pointsDiscountUsd(10_001, 4000)).toBe(2.5);
    expect(pointsDiscountUsd(12_345, 4000)).toBe(3.08);
  });
  it("devuelve 0 sin descuento o sin tasa", () => {
    expect(pointsDiscountUsd(0, 4000)).toBe(0);
    expect(pointsDiscountUsd(10_000, 0)).toBe(0);
  });
});
