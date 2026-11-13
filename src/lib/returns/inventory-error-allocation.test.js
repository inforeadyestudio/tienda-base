import { describe, expect, it } from "vitest";
import { allocateSwapAmount } from "./inventory-error-allocation";

describe("cambio por varias prendas sin cobro extra", () => {
  it("reparte una prenda de 200000 entre dos prendas de 100000", () => {
    expect(allocateSwapAmount(200000, [100000, 100000])).toEqual([100000, 100000]);
  });
  it("permite tres prendas y conserva exactamente el total", () => {
    expect(allocateSwapAmount(200000, [100000, 100000, 100000])).toEqual([66666, 66667, 66667]);
  });
  it("conserva los centavos internacionales", () => {
    expect(allocateSwapAmount(4420, [1000, 1000, 1000])).toEqual([1473, 1473, 1474]);
  });
  it("reparte proporcionalmente al precio de las prendas acordadas", () => {
    expect(allocateSwapAmount(200000, [100000, 300000])).toEqual([50000, 150000]);
  });
});