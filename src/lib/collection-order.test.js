import { describe, expect, it } from "vitest";
import { applyCollectionPositions } from "./collection-order";

describe("posiciones de colección al guardar", () => {
  it("aplica varios números juntos sin mover la lista original durante la edición", () => {
    const ids = ["a", "b", "c", "d"];
    const drafts = { a: "3", c: "1" };
    expect(ids).toEqual(["a", "b", "c", "d"]);
    expect(applyCollectionPositions(ids, drafts)).toEqual(["c", "b", "a", "d"]);
    expect(ids).toEqual(["a", "b", "c", "d"]);
  });
  it("intercala en el puesto 20 y desplaza las prendas sin número editado", () => {
    const ids = Array.from({ length: 30 }, (_, i) => String(i + 1));
    const result = applyCollectionPositions(ids, { "30": "20" });
    expect(result.slice(19, 22)).toEqual(["30", "20", "21"]);
    expect(new Set(result).size).toBe(30);
  });
  it("rechaza puestos duplicados en vez de perder prendas", () => {
    expect(() => applyCollectionPositions(["a", "b", "c"], { a: "2", c: "2" })).toThrow("posición 2 está repetida");
  });
  it("rechaza números vacíos o fuera de rango", () => {
    for (const value of ["", "0", "4", "1.5"]) {
      expect(() => applyCollectionPositions(["a", "b", "c"], { a: value })).toThrow();
    }
  });
});