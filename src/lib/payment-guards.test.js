import { describe, it, expect, vi } from "vitest";
import { registerAttempt } from "./payment-guards.server";
import { paymentDraftSchema } from "./checkout/payment-draft";

const reference = "11111111-1111-4111-8111-111111111111";
const draft = { items: [{ variantId: "22222222-2222-4222-8222-222222222222", qty: 1 }], shipTo: { firstName: "Prueba", lastName: "Prueba", documentId: "1234567", email: "prueba@example.com", phone: "3001234567", line1: "Calle de prueba 123", line2: "", city: "Bogotá", department: "Bogotá D.C.", country: "Colombia" }, currency: "COP", holdToken: "33333333-3333-4333-8333-333333333333" };
function mockDb(existing = null, insertError = null, readError = null) {
  const insert = vi.fn().mockResolvedValue({ error: insertError });
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: existing, error: readError }), insert };
  return { from: vi.fn().mockReturnValue(query), insert };
}
describe("checkout persists recovery data before payment", () => {
  it.each(["wompi", "addi", "paypal", "paguelofacil"])("%s stores the full snapshot in the initial insert", async provider => {
    const db = mockDb();
    await registerAttempt(db, reference, provider, "COP", 100000, draft);
    expect(db.insert).toHaveBeenCalledWith({ reference, provider, currency: "COP", amount: 100000, status: "pending", draft });
  });
  it("blocks payment initiation when snapshot persistence fails", async () => {
    await expect(registerAttempt(mockDb(null, { message: "offline" }), reference, "wompi", "COP", 100000, draft)).rejects.toThrow("No pudimos registrar");
  });
  it("does not overwrite another cart on the same payment reference", async () => {
    const db = mockDb({ provider: "wompi", currency: "COP", amount: 100000, status: "pending", draft: { ...draft, items: [] } });
    await expect(registerAttempt(db, reference, "wompi", "COP", 100000, draft)).rejects.toThrow("ya existe");
    expect(db.insert).not.toHaveBeenCalled();
  });
  it("blocks a payment with missing reservation token", () => {
    expect(paymentDraftSchema.safeParse({ ...draft, holdToken: undefined }).success).toBe(false);
  });
  it("never registers a payment without a recovery snapshot", async () => {
    const db = mockDb();
    await expect(registerAttempt(db, reference, "wompi", "COP", 100000, undefined)).rejects.toThrow("carrito");
    expect(db.insert).not.toHaveBeenCalled();
  });
  it("blocks creation without a valid delivery address", async () => {
    const db = mockDb();
    await expect(registerAttempt(db, reference, "addi", "COP", 100000, { ...draft, shipTo: { ...draft.shipTo, line1: "" } })).rejects.toThrow();
    expect(db.insert).not.toHaveBeenCalled();
  });
  it("does not proceed when reading an existing attempt fails", async () => {
    await expect(registerAttempt(mockDb(null, null, { message: "offline" }), reference, "wompi", "COP", 100000, draft)).rejects.toThrow("comprobar");
  });
  it("keeps pickup without requiring a shipping address", async () => {
    const db = mockDb();
    const pickup = { ...draft, shipTo: { ...draft.shipTo, line1: "", city: "", department: "", deliveryKind: "pickup", pickupStore: "Tienda Cali" } };
    await registerAttempt(db, reference, "wompi", "COP", 100000, pickup);
    expect(db.insert).toHaveBeenCalledWith(expect.objectContaining({ draft: pickup }));
  });
});
