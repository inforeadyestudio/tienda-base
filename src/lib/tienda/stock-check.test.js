import { describe, expect, it } from "vitest";
import { canAddToCart } from "./stock-check";

const ecom = (on_hand, reserved = 0) => ({ on_hand, reserved, locations: { kind: "ecom" } });

describe("canAddToCart", () => {
  it("no agrega una talla agotada", () => {
    expect(canAddToCart([ecom(0)], 0, 1).ok).toBe(false);
  });
  it("resta lo apartado por otras clientas en el checkout", () => {
    expect(canAddToCart([ecom(2, 2)], 0, 1).ok).toBe(false);
    expect(canAddToCart([ecom(3, 2)], 0, 1).ok).toBe(true);
  });
  it("cuenta lo que ya está en el carrito", () => {
    expect(canAddToCart([ecom(1)], 1, 1).ok).toBe(false);
  });
  it("agrega si hay stock", () => {
    expect(canAddToCart([ecom(5)], 0, 1)).toEqual({ sellable: 5, ok: true });
  });
});
