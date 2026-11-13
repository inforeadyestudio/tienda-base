import { describe, expect, it } from "vitest";
import { channelOf } from "./order-channel";

describe("canal de compra", () => {
  it("clasifica LU-WEB-113 de Carolina como online aunque la clienta tenga cuenta B2B", () => {
    expect(channelOf({ number: "LU-WEB-113", source: "ecom", b2b_mode: "direct", is_manual: false, customer_role: "b2b" })).toBe("online");
  });
  it("conserva los pedidos de Restock en B2B", () => {
    expect(channelOf({ source: "ecom", b2b_mode: "restock" })).toBe("b2b");
  });
  it("conserva los pedidos manuales en su canal", () => {
    expect(channelOf({ source: "ecom", b2b_mode: "direct", is_manual: true })).toBe("manual");
  });
});