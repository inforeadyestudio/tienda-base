import { describe, it, expect } from "vitest";
import { analyzeInventoryRows } from "./inventory-import";

const wh = { id: "wh", name: "Wild House" };
const cali = { id: "cali", name: "Tienda Cali" };
const variants = [{ id: "v1", sku: "A-S", levels: [{ location_id: "wh", on_hand: 3, reserved: 0 }, { location_id: "cali", on_hand: 5, reserved: 0 }] }];

describe("carga de inventario a una bodega elegida", () => {
  it("columna genérica «Stock» va a la bodega elegida", () => {
    const p = analyzeInventoryRows([["SKU", "Stock"], ["A-S", 10]], variants, [wh], wh);
    expect(p.lines).toEqual([expect.objectContaining({ locationId: "wh", current: 3, target: 10, delta: 7 })]);
  });
  it("una columna con nombre de otra bodega se carga en la bodega elegida", () => {
    const ecom = { id: "ecom", name: "Ecommerce" };
    const p = analyzeInventoryRows([["SKU", "Stock Wild House"], ["A-S", 4]], variants, [ecom], ecom);
    expect(p.lines).toEqual([expect.objectContaining({ locationId: "ecom", current: 0, target: 4, delta: 4 })]);
  });
  it("si hay varias columnas de cantidad, solo usa la primera", () => {
    const p = analyzeInventoryRows([["SKU", "Stock Tienda Cali", "Stock Wild House"], ["A-S", 1, 2]], variants, [wh], wh);
    expect(p.lines).toHaveLength(1);
    expect(p.lines[0].delta).toBe(-2);
  });
});
