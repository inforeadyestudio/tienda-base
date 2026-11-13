import { describe, expect, it } from "vitest";
import { matrixClientQuantity, matrixDraftQty, verifyMatrixEdits } from "./b2b-matrix-edits";

const line = (qty, status = "draft", store = "store-a", notes = "[PREVENTA] x") => ({ variant_id: "s", qty, orders: { customer_id: "client", b2b_store_id: store, status, notes } });
describe("matrix quantity removal", () => {
  it("accepts zero only when the saved line is gone", () => {
    expect(() => verifyMatrixEdits([], "client~store-a", [["s", 0]])).not.toThrow();
    expect(() => verifyMatrixEdits([line(1)], "client~store-a", [["s", 0]])).toThrow();
  });
  it("does not confuse another store's unit with the deleted one", () => {
    expect(matrixClientQuantity([line(1, "draft", "store-b")], "client~store-a", "s")).toBe(0);
  });
  it("locks confirmed quantities instead of saving zero into another draft", () => {
    expect(matrixClientQuantity([line(1, "preparing"), line(2)], "client~store-a", "s", true)).toBe(1);
    expect(matrixClientQuantity([line(2)], "client~store-a", "s", true)).toBe(0);
  });
  it("requires the complete saved sum to match and ignores cancelled lines", () => {
    expect(() => verifyMatrixEdits([line(1), line(1)], "client~store-a", [["s", 1]])).toThrow();
    expect(() => verifyMatrixEdits([line(1, "cancelled")], "client~store-a", [["s", 0]])).not.toThrow();
  });
  it("a normal manual draft is locked and never breaks preventa verification", () => {
    const manual = line(3, "draft", "store-a", "Pedido manual");
    expect(matrixClientQuantity([manual], "client~store-a", "s", true)).toBe(3);
    expect(() => verifyMatrixEdits([manual, line(1)], "client~store-a", [["s", 1]])).not.toThrow();
  });
});

describe("adding units on top of a confirmed order", () => {
  const items = [line(2, "preparing", null, "[PREVENTA] x")];
  it("sends only the extra units to the preventa draft", () => {
    expect(matrixDraftQty(items, "client", "s", 3)).toBe(1);
    expect(matrixDraftQty(items, "client", "s", 2)).toBe(0);
  });
  it("rejects going below the confirmed units", () => {
    expect(() => matrixDraftQty(items, "client", "s", 1)).toThrow();
  });
});
