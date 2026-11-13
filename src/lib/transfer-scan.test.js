import { describe, expect, it } from "vitest";
import { addTransferScan, matchesTransferCode } from "./transfer-scan";

describe("cargar traslados por lectura", () => {
  it("cada lectura suma exactamente una unidad", () => {
    let lines = [];
    for (let i = 0; i < 4; i++) lines = addTransferScan(lines, { variantId: "s", qty: 1 });
    expect(lines).toEqual([{ variantId: "s", qty: 4 }]);
  });
  it("agrupa las referencias en cualquier orden y conserva tallas distintas", () => {
    let lines = [];
    for (const id of ["s", "m", "s", "xs", "m"]) lines = addTransferScan(lines, { variantId: id, qty: 1 });
    expect(lines).toEqual([{ variantId: "s", qty: 2 }, { variantId: "m", qty: 2 }, { variantId: "xs", qty: 1 }]);
  });
  it("reconoce el apóstrofe del lector y el código de barras", () => {
    const variant = { sku: "EQUDRE-S", barcode: "0012345678901" };
    expect(matchesTransferCode(variant, "equdre's")).toBe(true);
    expect(matchesTransferCode(variant, "0012345678901")).toBe(true);
    expect(matchesTransferCode(variant, "EQUDRE-M")).toBe(false);
    expect(matchesTransferCode(variant, "")).toBe(false);
  });
});