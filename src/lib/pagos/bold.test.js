import { describe, it, expect, vi } from "vitest";
import { createHmac } from "node:crypto";
import { boldAmount, boldAmountMatches, verifyBoldSignature } from "./bold";
import { applyBoldEvent } from "./bold.server";
import { normalizePaymentsSettings, paymentMethodsFor } from "../payments";
vi.mock("../checkout/guest-order.server", () => ({ finalizePaidAttempt: vi.fn().mockResolvedValue({ id: "fixture-order", number: "fixture-number" }) }));

describe("Bold online monetary rules", () => {
  it("preserves US$76.09 instead of rounding to whole dollars", () => expect(boldAmount(76.09, "USD")).toBe("76.09"));
  it("uses pesos for a 200000 COP payment", () => expect(boldAmount(200000, "COP")).toBe("200000"));
  it("does not approve a converted COP payment by assuming a 4000 exchange rate", () => expect(boldAmountMatches(116, "USD", 464000, "COP")).toBe(false));
  it("rejects a one-cent discrepancy", () => expect(boldAmountMatches(76.09, "USD", 76.08, "USD")).toBe(false));
  it("accepts the exact original dollar total", () => expect(boldAmountMatches(76.09, "USD", 76.09, "USD")).toBe(true));
  it("offers Bold in Colombia when enabled", () => expect(paymentMethodsFor("Colombia", normalizePaymentsSettings({ bold: { enabled: true } })).map(o => o.id)).toContain("bold"));
  it("does not offer unverified international Bold by default", () => expect(paymentMethodsFor("Estados Unidos", normalizePaymentsSettings({ bold: { enabled: true } })).map(o => o.id)).not.toContain("bold"));
});

describe("Bold provider evidence", () => {
  it("approves the exact COP payment once and reuses finalization on webhook replay", async () => {
    const state = { provider: "bold", status: "pending", amount: 200000, currency: "COP" };
    const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn(async () => ({ data: { ...state } })), update: vi.fn(value => { Object.assign(state, value); return q; }) };
    const db = { from: () => q };
    const event = { id: "fixture", type: "SALE_APPROVED", data: { payment_id: "fixture", amount: { total: 200000, currency: "COP" }, metadata: { reference: "11111111-1111-4111-8111-111111111111" } } };
    await applyBoldEvent(db, event);
    await applyBoldEvent(db, event);
    expect(state.status).toBe("paid");
    expect(q.update).toHaveBeenCalledTimes(1);
    const { finalizePaidAttempt } = await import("../checkout/guest-order.server");
    expect(finalizePaidAttempt).toHaveBeenCalledWith(event.data.metadata.reference);
  });
  it("verifies base64 raw UTF-8 body and rejects translated or tampered content", async () => {
    const raw = '{"description":"prenda ñ"}';
    const fake = "fixture-not-a-real-credential";
    const signature = createHmac("sha256", fake).update(Buffer.from(raw).toString("base64")).digest("hex");
    expect(await verifyBoldSignature(raw, signature, fake)).toBe(true);
    expect(await verifyBoldSignature(raw + " ", signature, fake)).toBe(false);
    expect(await verifyBoldSignature(raw, signature, "")).toBe(false);
  });
  it("does not update a POS or different gateway attempt", async () => {
    const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { provider: "wompi", status: "pending" } }), update: vi.fn() };
    await applyBoldEvent({ from: () => q }, { id: "fixture", type: "SALE_APPROVED", data: { payment_id: "fixture", amount: { total: 200000, currency: "COP" }, metadata: { reference: "11111111-1111-4111-8111-111111111111" } } });
    expect(q.update).not.toHaveBeenCalled();
  });
  it("keeps converted USD evidence pending without consuming stock", async () => {
    const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { provider: "bold", status: "pending", currency: "USD", amount: 116 } }), update: vi.fn().mockReturnThis() };
    const rpc = vi.fn();
    await applyBoldEvent({ from: () => q, rpc }, { id: "fixture", type: "SALE_APPROVED", data: { payment_id: "fixture", amount: { total: 464000, currency: "COP" }, metadata: { reference: "11111111-1111-4111-8111-111111111111" } } });
    expect(q.update.mock.calls[0][0]).not.toHaveProperty("status");
    expect(rpc).not.toHaveBeenCalled();
  });
});