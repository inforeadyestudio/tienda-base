import { describe, it, expect } from "vitest";
import { analysisBillingIncludes, analysisIncludes, analysisTotals } from "./order-analysis";

describe("chat y Análisis usan las mismas cifras", () => {
  const rows = [
    { status: "paid", payment_status: "paid", currency: "COP", total_cop: 39123000, order_items: [{ qty: 213 }] },
    { status: "reserved", payment_status: "pending", currency: "USD", total_cop: 14619000, total_usd: 4870, order_items: [{ qty: 72 }] },
    { status: "cancelled", currency: "COP", total_cop: 999999 },
  ];
  it("Todos suma el equivalente COP guardado, no una tasa inventada", () => {
    expect(analysisTotals(rows)).toMatchObject({ revenue: 53742000, orders: 2, units: 285 });
  });
  it("Internacionales incluye pendientes igual que Análisis", () => {
    expect(analysisTotals(rows, "internacional")).toMatchObject({ revenue: 4870, orders: 1, iva: 0 });
  });
  it("Nacionales no suma pedidos USD", () => {
    expect(analysisTotals(rows, "nacional")).toMatchObject({ revenue: 39123000, orders: 1 });
  });
  it("solo pagados es una consulta explícita y excluye pendientes", () => {
    expect(rows.filter(row => analysisIncludes(row, "all", true))).toHaveLength(1);
  });
});

describe("estadísticas B2B solo con factura", () => {
  const b2b = { source: "assisted", b2b_mode: "direct", status: "preparing", payment_status: "paid", currency: "COP", total_cop: 200000, order_items: [{ qty: 2 }] };
  it.each([undefined, [], [{ status: "pending", number: "B-1" }], [{ status: "error", number: "B-1" }], [{ status: "cancelled", number: "B-1" }], [{ status: "issued", number: null }], [{ status: "issued", number: " " }]])("no suma B2B sin factura emitida válida: %j", invoices => {
    expect(analysisTotals([{ ...b2b, invoices }])).toMatchObject({ revenue: 0, orders: 0, units: 0 });
  });
  it("cuenta el pedido una vez incluso con varias facturas de caja", () => {
    const invoices = [{ status: "issued", number: "B-1", box_id: "box1" }, { status: "issued", number: "B-2", box_id: "box2" }];
    expect(analysisTotals([{ ...b2b, invoices }])).toMatchObject({ revenue: 200000, orders: 1, units: 2 });
  });
  it("un B2B facturado a crédito cuenta aunque el pago esté pendiente", () => {
    const row = { ...b2b, payment_status: "pending", currency: "USD", total_usd: 116, invoices: [{ status: "issued", number: "B-1" }] };
    expect(analysisTotals([row], "internacional")).toMatchObject({ revenue: 116, orders: 1, units: 2 });
    expect(analysisIncludes(row, "internacional", true)).toBe(false);
  });
  it("mantiene Online, Manual y POS sin exigir factura ni pago", () => {
    const rows = [{ ...b2b, source: "ecom" }, { ...b2b, source: "ecom", is_manual: true }, { ...b2b, source: "pos", b2b_mode: "restock" }].map(row => ({ ...row, payment_status: "pending" }));
    expect(analysisTotals(rows)).toMatchObject({ revenue: 600000, orders: 3, units: 6 });
  });
  it("reconoce Restock y números B2B sin depender del rol de la clienta", () => {
    expect(analysisBillingIncludes({ ...b2b, source: "ecom", b2b_mode: "restock" })).toBe(false);
    expect(analysisBillingIncludes({ ...b2b, source: "ecom", number: "B2B-14" })).toBe(false);
  });
  it("excluye cancelados aunque estén facturados", () => {
    expect(analysisIncludes({ ...b2b, status: "cancelled", invoices: [{ status: "issued", number: "B-1" }] })).toBe(false);
  });
});