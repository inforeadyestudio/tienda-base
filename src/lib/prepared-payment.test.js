import { describe, it, expect } from "vitest";
import { retryDecision } from "./checkout/prepared-payment";
import { beginGatewayAttempt, storeGatewayUrl } from "./payment-guards.server";
import { vi } from "vitest";

describe("prepared checkout retry decisions", () => {
  it("resumes a pending attempt for the same purchase", () => expect(retryDecision("pending", true, true)).toBe("resume"));
  it("does not replace pending PSE when changing provider", () => expect(retryDecision("pending", true, false)).toBe("block"));
  it("does not reuse a pending attempt for a different cart", () => expect(retryDecision("pending", false, true)).toBe("block"));
  it("confirms a late paid attempt rather than charging again", () => expect(retryDecision("paid", true, true)).toBe("confirm"));
  it("allows a new attempt after a confirmed rejection", () => expect(retryDecision("failed", true, false)).toBe("retry"));
});

describe("gateway initiation is single-use", () => {
  const original = "11111111-1111-4111-8111-111111111111";
  const draft = { items: [{ variantId: "22222222-2222-4222-8222-222222222222", qty: 1 }], shipTo: { firstName: "Prueba", lastName: "Prueba", email: "prueba@example.com", phone: "3001234567", line1: "Calle 123", line2: "", city: "Bogotá", department: "Bogotá", country: "Colombia" }, currency: "COP", holdToken: "33333333-3333-4333-8333-333333333333" };
  function db(url, claimed = true) {
    const q = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { status: "pending", provider: "wompi", currency: "COP", amount: 100000, draft, checkout_url: url }, error: null }) };
    return { from: vi.fn().mockReturnValue(q), rpc: vi.fn().mockResolvedValue({ data: claimed, error: null }) };
  }
  it("reopens the stored URL without creating a second request", async () => {
    const database = db("https://checkout.wompi.co/p/?reference=original");
    expect(await beginGatewayAttempt(database, original, "wompi", "COP", 100000, draft)).toBe("https://checkout.wompi.co/p/?reference=original");
    expect(database.rpc).not.toHaveBeenCalled();
  });
  it("blocks concurrent or ambiguous provider initiation", async () => {
    await expect(beginGatewayAttempt(db(null, false), original, "wompi", "COP", 100000, draft)).rejects.toThrow("verificando");
  });
  it("claims a new attempt exactly once", async () => {
    const database = db(null);
    expect(await beginGatewayAttempt(database, original, "wompi", "COP", 100000, draft)).toBeNull();
    expect(database.rpc).toHaveBeenCalledWith("claim_checkout_payment", { _reference: original });
  });
  it("does not expose a URL if saving it fails", async () => {
    const q = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnValueOnce(null) };
    q.eq = vi.fn().mockReturnValueOnce(q).mockResolvedValueOnce({ error: { message: "offline" } });
    await expect(storeGatewayUrl({ from: () => q }, "original", "https://checkout.wompi.co")).rejects.toThrow("No pudimos guardar");
  });
});