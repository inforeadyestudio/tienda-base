import { describe, test } from "node:test";
import { strictEqual } from "node:assert";
import { rcountDocumentType, resolvePayKey, DEFAULT_ACCOUNTS } from "./rcount";

describe("R-Count passport document type", () => {
  test("sends PP for passports rather than the Panama country code", () => {
    strictEqual(rcountDocumentType("PA1465949", true), "PP");
    strictEqual(rcountDocumentType("N231991", false), "PP");
  });

  test("preserves existing numeric document classification", () => {
    strictEqual(rcountDocumentType("900123456", true), "NIT");
    strictEqual(rcountDocumentType("12345678", false), "CC");
    strictEqual(rcountDocumentType("222222222222", false), "CC");
  });
});
describe("resolvePayKey", () => {
  test("Bold online usa link_pago y cuenta 11200506", () => { strictEqual(resolvePayKey("bold", "bold"), "link_pago"); strictEqual(DEFAULT_ACCOUNTS["1:link_pago"], "11200506"); });
  test("Bold POS conserva datafono", () => strictEqual(resolvePayKey("datafono", "bold"), "datafono"));
  test("Addi online va como addi", () => strictEqual(resolvePayKey("card", "addi"), "addi"));
  test("PayPal online va como paypal", () => strictEqual(resolvePayKey("card", "paypal"), "paypal"));
  test("Wompi sigue como wompi", () => strictEqual(resolvePayKey("card", "wompi"), "wompi"));
  test("Addi prevalece sobre Wompi heredado", () => strictEqual(resolvePayKey("wompi", "addi"), "addi"));
  test("PayPal prevalece sobre Wompi heredado", () => strictEqual(resolvePayKey("link_wompi", "paypal"), "paypal"));
  test("Addi explícito nunca se convierte a Wompi", () => strictEqual(resolvePayKey("addi", "wompi"), "addi"));
  test("PayPal explícito nunca se convierte a Wompi", () => strictEqual(resolvePayKey("paypal", "wompi"), "paypal"));
  test("Link Bold usa su medio propio", () => strictEqual(resolvePayKey("link_bold", null), "link_pago"));
  test("Link Bold usa la cuenta 11200506", () => strictEqual(DEFAULT_ACCOUNTS["1:link_pago"], "11200506"));
  test("Wompi usa la cuenta 11200504", () => strictEqual(DEFAULT_ACCOUNTS["1:wompi"], "11200504"));
  test("Addi usa la cuenta 11200505", () => strictEqual(DEFAULT_ACCOUNTS["1:addi"], "11200505"));
  test("PayPal usa la cuenta 11200507", () => strictEqual(DEFAULT_ACCOUNTS["1:paypal"], "11200507"));
});
