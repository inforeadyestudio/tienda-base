import { expect, it } from "vitest";
import { shippingOriginLocation } from "./shipping-origin";

const bogota = "415ee3ec-81a8-47d4-9b49-58951952d0b2";
const cali = "ebd12951-cf21-4d8a-94dc-977f8ad71930";
const order = { order_items: [1, 2, 3].map(() => ({ qty: 1, fulfill_location_id: bogota })) };
it("MANUAL-65 usa Bogotá para sus tres prendas, no el origen general Cali", () => {
  expect(shippingOriginLocation(order)).toBe(bogota);
  expect(shippingOriginLocation({ ...order, dispatch_location_id: bogota })).toBe(bogota);
});
it("Cali usa su bodega y Ecommerce/Wild House conservan su id para resolver la dirección general", () => {
  for (const id of [cali, "ecommerce", "wild-house"]) {
    expect(shippingOriginLocation({ order_items: [{ qty: 1, fulfill_location_id: id }] })).toBe(id);
  }
});
it("respeta la bodega de despacho donde se consolidan prendas", () => {
  expect(shippingOriginLocation({ dispatch_location_id: bogota, order_items: [{ qty: 1, fulfill_location_id: cali }] })).toBe(bogota);
});
it("no elige el origen general cuando hay varias bodegas sin despacho definido", () => {
  const mixed = { order_items: [...order.order_items, { qty: 1, fulfill_location_id: cali }] };
  expect(() => shippingOriginLocation(mixed)).toThrow("varias bodegas");
  expect(shippingOriginLocation(mixed, cali)).toBe(cali);
});
it("rechaza prendas sin origen o una bodega ajena al pedido", () => {
  expect(() => shippingOriginLocation({ order_items: [{ qty: 1 }] })).toThrow("Asigna");
  expect(() => shippingOriginLocation(order, cali)).toThrow("no tiene prendas");
});
it("las cajas siempre usan su propia bodega y rechazan discrepancias", () => {
  expect(shippingOriginLocation(order, null, { location_id: cali })).toBe(cali);
  expect(() => shippingOriginLocation(order, bogota, { location_id: cali })).toThrow("no coincide");
  expect(() => shippingOriginLocation(order, null, { location_id: null })).toThrow("no tiene bodega");
});