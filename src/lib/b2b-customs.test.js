import { describe, expect, it } from "vitest";
import { customsDifference, distributeCustomsValue } from "./b2b-customs";

describe("valores aduaneros B2B", () => {
  it("calcula la diferencia exacta de servicios", () => {
    expect(customsDifference(1_419, 900)).toBe(519);
  });

  it("rechaza un valor aduanero superior al comercial", () => {
    expect(() => customsDifference(100, 101)).toThrow("no puede superar");
  });

  it("distribuye el valor aduanero conservando el total exacto", () => {
    expect(distributeCustomsValue([{ commercialValue: 60 }, { commercialValue: 40 }], 33))
      .toEqual([19.8, 13.2]);
  });
});