import { describe, expect, it } from "vitest";
import { normalizeShippingSettings, quoteShipping } from "./store-settings";

const settings = normalizeShippingSettings({
  freeShipping: { enabled: true, allProducts: true, minimumCop: 350000 },
  rates: [{ id: "co", name: "Estándar", country: "Colombia", regions: [], minWeightKg: 0, maxWeightKg: null, priceCop: 18000, enabled: true }],
});
const items = [{ productId: "p1", qty: 1 }];

describe("envío gratis solo con cuenta", () => {
  it("cliente con sesión y compra sobre el mínimo no paga envío", () => {
    expect(quoteShipping(settings, 400000, items, "Colombia", "", { signedIn: true }).cost).toBe(0);
  });
  it("invitado con la misma compra paga la tarifa", () => {
    expect(quoteShipping(settings, 400000, items, "Colombia", "", { signedIn: false }).cost).toBe(18000);
  });
});
