import { describe, expect, it } from "vitest";
import { groupMatrixSizes, matchesMatrixSearch, sumMatrixVariants } from "./b2b-matrix-sizes";

const product = { id: "pant", name: "Pant", reference_code: "PANT" };
const variant = (id, size) => ({ id, size, color: "Negro", product });

describe("matrix canonical sizes", () => {
  it("unifies L quality suffixes into one column while preserving variant IDs", () => {
    const model = groupMatrixSizes([variant("l1", "L"), variant("l2", "L - Calidad A"), variant("l3", "L- Calidad A")]);
    expect(model.sizes).toEqual(["L"]);
    expect(model.rows[0].bySize.L).toEqual(["l1", "l2", "l3"]);
    const quantities = { l1: 2, l2: 4, l3: 1 };
    expect(sumMatrixVariants(model.rows[0].bySize.L, id => quantities[id])).toBe(7);
  });
  it("keeps combined sizes separate and unifies unique sizes and letter casing", () => {
    const model = groupMatrixSizes([variant("s1", "s"), variant("s2", "S"), variant("ml", "M - L - Calidad A"), variant("u1", null), variant("u2", "UNICA TALLA - Calidad A")]);
    expect(model.sizes).toEqual(["S", "U", "M - L"]);
    expect(model.rows[0].bySize.S).toEqual(["s1", "s2"]);
    expect(model.rows[0].bySize.U).toEqual(["u1", "u2"]);
  });
  it("does not count duplicate source rows twice or mix product colors", () => {
    const model = groupMatrixSizes([variant("l", "L"), variant("l", "L"), { ...variant("green", "L - Calidad A"), color: "Verde" }]);
    expect(model.rows).toHaveLength(2);
    expect(model.rows[0].bySize.L).toEqual(["l"]);
    expect(sumMatrixVariants(undefined, () => 10)).toBe(0);
  });
});
it("matrix search ignores accents and case", () => {
  const row = { name: "Andaluz Dress", ref: "AND-01", color: "Café" };
  expect(matchesMatrixSearch(row, "andaluz")).toBe(true);
  expect(matchesMatrixSearch(row, "cafe")).toBe(true);
  expect(matchesMatrixSearch(row, "duna")).toBe(false);
  expect(matchesMatrixSearch(row, "  ")).toBe(true);
});
