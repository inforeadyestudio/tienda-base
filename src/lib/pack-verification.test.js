import { describe, it, expect } from "vitest";
import { matchScan, isComplete, mergeLines, packVerifyRequired } from "./pack-verification.js";

const lines = [{ variantId: "a", qty: 2, sku: "ZL-1-M", barcode: null }, { variantId: "b", qty: 1, sku: "ZL-2-S", barcode: "777" }];

describe("verificación de empaque", () => {
  it("cuenta una prenda del pedido por SKU o código", () => {
    expect(matchScan(lines, {}, "zl-1-m")).toEqual({ ok: true, variantId: "a" });
    expect(matchScan(lines, {}, "777")).toEqual({ ok: true, variantId: "b" });
  });
  it("rechaza prendas que no son del pedido", () => {
    expect(matchScan(lines, {}, "OTRA").reason).toBe("not_in_order");
  });
  it("rechaza unidades de más", () => {
    expect(matchScan(lines, { a: 2 }, "ZL-1-M").reason).toBe("excess");
  });
  it("completo solo con todas las unidades", () => {
    expect(isComplete(lines, { a: 2 })).toBe(false);
    expect(isComplete(lines, { a: 2, b: 1 })).toBe(true);
  });
  it("une líneas repetidas", () => {
    expect(mergeLines([{ variantId: "a", qty: 1 }, { variantId: "a", qty: 2 }])[0].qty).toBe(3);
  });
  it("obligatoria desde el lunes 9 de noviembre de 2026 hora Colombia", () => {
    expect(packVerifyRequired(new Date("2026-11-08T23:59:00-05:00"))).toBe(false);
    expect(packVerifyRequired(new Date("2026-11-09T00:00:00-05:00"))).toBe(true);
  });
});
