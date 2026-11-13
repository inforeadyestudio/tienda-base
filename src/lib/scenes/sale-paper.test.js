import { describe, expect, it } from "vitest";
import { saleProductIds, saleStripImage } from "./sale-paper";
describe("Hoja Sale", () => {
  it("conserva hasta seis productos en el orden elegido", () => {
    expect(saleProductIds(["c", "a", "b", "d", "e", "f", "g"])).toEqual(["c", "a", "b", "d", "e", "f"]);
  });
  it("no inventa productos para las tiras vacías", () => {
    expect(saleProductIds([])).toEqual([]);
    expect(saleStripImage("", undefined)).toBeUndefined();
  });
  it("usa la foto específica antes que la del producto", () => {
    expect(saleStripImage("tira.png", { cutout_url: "producto.png" })).toBe("tira.png");
  });
});
