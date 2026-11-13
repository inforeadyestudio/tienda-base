import { describe, expect, it } from "vitest";
import { orderIvaCop, sumOrderIva, sumOrderTotals } from "./order-totals";

describe("totales de la lista de pedidos", () => {
  it("conserva US$44.20 de un pedido manual con descuento", () => {
    const totals = sumOrderTotals([{ status: "draft", currency: "USD", total_usd: 44.2 }]);
    expect(totals.usd).toBe(44.2);
  });
  it("cuenta las ventas y suma cada pedido en su propia moneda", () => {
    const t = sumOrderTotals([
      { status: "paid", currency: "COP", total_cop: 599000, order_items: [{ qty: 1 }] },
      { status: "shipped", currency: "COP", total_cop: 848000, order_items: [{ qty: 2 }] },
      { status: "delivered", currency: "USD", total_usd: 656, order_items: [{ qty: 3 }] },
    ]);
    expect(t).toEqual({ sales: 3, cancelled: 0, cop: 1447000, usd: 656, units: 6 });
  });

  it("excluye los pedidos cancelados del dinero y de las unidades", () => {
    const t = sumOrderTotals([
      { status: "paid", currency: "COP", total_cop: 100000, order_items: [{ qty: 2 }] },
      { status: "cancelled", currency: "COP", total_cop: 500000, order_items: [{ qty: 5 }] },
    ]);
    expect(t).toEqual({ sales: 1, cancelled: 1, cop: 100000, usd: 0, units: 2 });
  });

  it("usa los pesos cuando un pedido en dólares no tiene total en dólares", () => {
    const t = sumOrderTotals([{ status: "paid", currency: "USD", total_usd: null, total_cop: 300000 }]);
    expect(t).toEqual({ sales: 1, cancelled: 0, cop: 300000, usd: 0, units: 0 });
  });

  it("no suma nada cuando la lista está vacía", () => {
    expect(sumOrderTotals([])).toEqual({ sales: 0, cancelled: 0, cop: 0, usd: 0, units: 0 });
  });
});

describe("IVA del análisis de pedidos", () => {
  it("extrae el 19% incluido de un pedido nacional", () => {
    const iva = orderIvaCop({ status: "paid", currency: "COP", total_cop: 119000 });
    expect(iva).toBe(19000);
  });

  it("usa el IVA guardado cuando el pedido lo trae", () => {
    const iva = orderIvaCop({ status: "paid", currency: "COP", total_cop: 119000, tax_included_cop: 12345 });
    expect(iva).toBe(12345);
  });

  it("los internacionales van sin IVA y los cancelados no suman", () => {
    expect(orderIvaCop({ status: "paid", currency: "USD", total_cop: 2233000, total_usd: 656 })).toBe(0);
    expect(orderIvaCop({ status: "cancelled", currency: "COP", total_cop: 119000 })).toBe(0);
  });

  it("suma el IVA de varios pedidos", () => {
    const iva = sumOrderIva([
      { status: "paid", currency: "COP", total_cop: 119000 },
      { status: "delivered", currency: "COP", total_cop: 475000 },
      { status: "paid", currency: "USD", total_cop: 2233000, total_usd: 656 },
    ]);
    expect(iva).toBe(94840); // 19.000 + 75.840 + 0
  });
});
