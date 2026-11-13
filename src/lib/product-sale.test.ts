import { test } from "node:test";
import { strictEqual } from "node:assert";
import { hasSalePrice, saleSecondsLeft, saleBogotaInput, saleBogotaToISO } from "./product-sale";

test("comparación COP solo activa con precio anterior mayor al actual", () => {
  strictEqual(hasSalePrice({ price_cop: 300000, compare_at_cop: 400000 }, "COP"), true);
  strictEqual(hasSalePrice({ price_cop: 300000, compare_at_cop: 300000 }, "COP"), false);
  strictEqual(hasSalePrice({ price_cop: 300000, compare_at_cop: 200000 }, "COP"), false);
});
test("comparación USD utiliza exclusivamente sus precios guardados", () => {
  strictEqual(hasSalePrice({ price_cop: 300000, price_usd: 80, compare_at_usd: 100 }, "USD"), true);
  strictEqual(hasSalePrice({ price_cop: 300000, price_usd: 80, compare_at_cop: 400000 }, "USD"), false);
  strictEqual(hasSalePrice({ price_cop: 300000, price_usd: null, compare_at_usd: 100 }, "USD"), false);
});
test("el reloj termina en cero, nunca reinicia al expirar", () => {
  const end = "2026-10-24T05:00:00.000Z";
  strictEqual(saleSecondsLeft(end, Date.parse(end) - 61000), 61);
  strictEqual(saleSecondsLeft(end, Date.parse(end) + 1000), 0);
  strictEqual(saleSecondsLeft(null, Date.parse(end)), 0);
});
test("la hora colombiana queda fija sin depender del dispositivo", () => {
  strictEqual(saleBogotaToISO("2026-10-24T23:59"), "2026-10-25T04:59:00.000Z");
  strictEqual(saleBogotaInput("2026-10-25T04:59:00.000Z"), "2026-10-24T23:59");
});