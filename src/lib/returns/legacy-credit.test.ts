import { test } from "node:test";
import { strictEqual, deepStrictEqual } from "node:assert";
import { colombiaMonth, legacyCreditSchema, legacyCreditPayload, legacyCreditResult } from "./legacy-credit";

const input = { requestId: "11111111-1111-4111-8111-111111111111", locationId: "22222222-2222-4222-8222-222222222222", destinationLocationId: "33333333-3333-4333-8333-333333333333", saleMonth: "2026-09", resolution: "reembolso" as const, paymentMethod: "efectivo" as const, lines: [{ sku: "ALAPANMOC-S", quantity: 1, unit_price: 189000, tax_rate: 19 as const, reason: "talla" as const, condition: "buena" as const }] };
test("sale month must precede the current Colombian month", () => {
  strictEqual(legacyCreditSchema.safeParse({ ...input, saleMonth: colombiaMonth() }).success, false);
  strictEqual(legacyCreditSchema.safeParse({ ...input, saleMonth: "2026-99" }).success, false);
  strictEqual(legacyCreditSchema.safeParse(input).success, true);
});
test("refund requires the original payment method", () => { strictEqual(legacyCreditSchema.safeParse({ ...input, paymentMethod: undefined }).success, false); });
test("legacy note uses the confirmed contract and IVA-inclusive price", () => {
  const note = legacyCreditPayload(input, "CO 03").data.credit_notes[0];
  strictEqual(note.without_invoice, true); strictEqual(note.operation_center_code, "CO 03"); strictEqual("order_id" in note, false); strictEqual("invoice_external_id" in note, false);
  deepStrictEqual(note.lines[0], input.lines[0]); strictEqual(note.payment_method, "efectivo");
});
test("exchange omits payment_method", () => { strictEqual("payment_method" in legacyCreditPayload({ ...input, resolution: "cambio" }, "CO 03").data.credit_notes[0], false); });
test("PP is accepted and PA is not a document type", () => {
  const customer = { document_type: "PP", document_number: "PA1465949", name: "Ana" };
  strictEqual(legacyCreditSchema.safeParse({ ...input, customer }).success, true);
  strictEqual(legacyCreditSchema.safeParse({ ...input, customer: { ...customer, document_type: "PA" } }).success, false);
});
test("only explicit DIAN approval with validation authorizes inventory", () => {
  strictEqual(legacyCreditResult({ status: "error_dian", error_dian: "Rechazada" }).status, "error");
  strictEqual(legacyCreditResult({ status: "duplicada" }).status, "duplicate");
  strictEqual(legacyCreditResult({ status: "emitida_dian", numero_dian: "NCZ1" }).status, "pending");
  strictEqual(legacyCreditResult({ status: "emitida_dian", numero_dian: "NCZ1", cude: "validacion", public_url: "https://example.com/nc.pdf" }).status, "issued");
});