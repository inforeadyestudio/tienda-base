import { describe, expect, it } from "vitest";
import { selectBoxLocation } from "./b2b-box-selection";

describe("bodega de la caja B2B", () => {
  it("conserva Wild House al editar la caja 1 aunque Rienda S esté en Ecommerce", () => {
    expect(selectBoxLocation(["Ecommerce", "Wild House"], "Ecommerce", "Wild House")).toBe("Wild House");
  });
  it("no cambia la bodega de una caja existente aunque solo haya pendientes de otra", () => {
    expect(selectBoxLocation(["Ecommerce"], null, "Wild House")).toBe("Wild House");
  });
  it("permite seleccionar Ecommerce para una caja nueva", () => {
    expect(selectBoxLocation(["Wild House", "Ecommerce"], "Ecommerce", null)).toBe("Ecommerce");
  });
});