import { test } from "node:test";
import { strictEqual } from "node:assert";
import { countLiveVisitors, isStorefrontVisitorPath } from "./live-visitors";

test("counts actual active visitors, deduplicating tabs and ignoring observers", () => {
  strictEqual(countLiveVisitors({ a: [{ active: true }, { active: true }], b: [{ active: true }], observer: [{}], hidden: [{ active: false }] }), 2);
  strictEqual(countLiveVisitors({}), 0);
});
test("excludes staff portals and counts storefront routes", () => {
  for (const path of ["/admin/tienda/estadisticas", "/pos/cali", "/auth", "/b2b/pedidos", "/api/public/test"]) strictEqual(isStorefrontVisitorPath(path), false);
  for (const path of ["/", "/tienda", "/coleccion/poison-bloom", "/producto/pluma", "/carrito"]) strictEqual(isStorefrontVisitorPath(path), true);
});