import { describe, expect, it } from "vitest";
import { availableAfterCommitted } from "./inventory-total";
describe("availableAfterCommitted", () => {
  it("resta lo comprometido B2B", () => expect(availableAfterCommitted(162, 66)).toBe(96));
  it("no queda negativo", () => expect(availableAfterCommitted(4, 10)).toBe(0));
});
