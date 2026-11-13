import { describe, expect, it } from "vitest";
import { backupPaymentState, backupDeliveryState, orderBackupRows } from "./order-backup";

const order = { id: "test", number: "LU-WEB-162", source: "ecom", is_manual: false, b2b_mode: null, status: "paid", payment_status: "paid", payment_method: "card", b2b_payment_method: null, created_at: "2026-10-21T05:15:00Z", contact_name: "Prueba", currency: "COP", total_cop: 317000, total_usd: null, order_items: [{ product_name: "Pantano Top", variant_label: "M", qty: 2, unit_price_cop: 150000, unit_price_usd: 52, product_variants: { size: "L", color: "Taupe", sku: "PANTANO-M" } }] };
describe("copia de pedidos", () => {
  it("conserva productos, talla comprada y cantidad exacta", () => {
    const result = orderBackupRows([order], () => "Online", () => "Wompi");
    expect(result.items[0]).toMatchObject({ Pedido: "LU-WEB-162", Producto: "Pantano Top", "Talla / variante": "M", Cantidad: 2, "Precio unitario COP": 150000 });
    expect(result.summary[0]["Total COP"]).toBe(317000);
  });
  it("separa pagado de pendiente de envío", () => {
    expect(backupPaymentState(order)).toBe("Pagado");
    expect(backupDeliveryState(order)).toBe("Pendiente de envío");
  });
  it("no trata autorización antigua como pago", () => {
    expect(backupPaymentState({ ...order, payment_status: "pending", paid_at: "2026-10-21" })).toBe("Pendiente de pago");
  });
  it("distingue enviado de entregado", () => {
    expect(backupDeliveryState({ ...order, status: "shipped" })).toBe("Enviado · pendiente de entrega");
    expect(backupDeliveryState({ ...order, status: "delivered" })).toBe("Entregado");
  });
  it("conserva crédito pendiente", () => {
    expect(backupPaymentState({ ...order, payment_status: "pending", payment_method: "credito_30" })).toBe("Crédito · 30 días");
  });
  it("incluye pedidos sin prendas sin inventar unidades", () => {
    const result = orderBackupRows([{ ...order, order_items: [] }], () => "Online", () => "Wompi");
    expect(result.summary).toHaveLength(1);
    expect(result.items).toHaveLength(0);
  });
});