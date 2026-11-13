import { describe, expect, it } from "vitest";
import { resolveProductVariant } from "./product-selection";

describe("selección de la prenda actual", () => {
  it("al cambiar de producto descarta la talla anterior y selecciona una variante propia disponible", () => {
    const current = [{ id: "nuevo-xs", size: "XS", stock: 0 }, { id: "nuevo-m", size: "M", stock: 2 }];
    expect(resolveProductVariant(current, "anterior-l", v => v.stock > 0)).toEqual(current[1]);
  });
  it("al cambiar de color no conserva una variante de otro color", () => {
    const current = [{ id: "blanco-s", size: "S", stock: 1 }];
    expect(resolveProductVariant(current, "negro-m", v => v.stock > 0)?.id).toBe("blanco-s");
  });
  it("una prenda sin variantes no hereda una talla de otra prenda", () => {
    expect(resolveProductVariant([], "anterior-l", () => true)).toBeUndefined();
  });
  it("conserva la talla elegida mientras pertenece a la prenda y color actuales", () => {
    const current = [{ id: "actual-xs", stock: 1 }, { id: "actual-l", stock: 1 }];
    expect(resolveProductVariant(current, "actual-l", v => v.stock > 0)?.id).toBe("actual-l");
  });
});