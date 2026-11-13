import { describe, expect, it } from "vitest";
import { groupB2BPrintItems } from "./order-print";

describe("cantidades del pedido mayorista B2B-16", () => {
  it("unifica las 26 unidades de Cerezo Top sin alterar su importe histórico", () => {
    const items = [
      { qty: 10, unit_price_cop: 155798, product_variants: { size: "S - Calidad A", products: { name: "Cerezo Top Denim" } } },
      { qty: 8, unit_price_cop: 155798, product_variants: { size: "M - Calidad A", products: { name: "Cerezo Top Denim" } } },
      { qty: 8, unit_price_cop: 185400, product_variants: { size: "L - Calidad A", products: { name: "Cerezo Top Denim" } } },
    ];
    const groups = groupB2BPrintItems(items);
    expect(groups).toHaveLength(1);
    expect(groups[0].sizes).toEqual({ S: 10, M: 8, L: 8 });
    expect(Object.values(groups[0].sizes).reduce((sum, qty) => sum + qty, 0)).toBe(26);
    expect(groups[0].amountCop).toBe(4287564);
  });
});