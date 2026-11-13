import { describe, it, expect } from "vitest";
import { isImmediate, shouldFlush, createRateLimiter } from "./analytics-batch.js";

describe("lote de analítica", () => {
  it("checkout y compras van de inmediato; navegación va en lote", () => {
    expect(isImmediate("purchase")).toBe(true);
    expect(isImmediate("checkout_started")).toBe(true);
    expect(isImmediate("page_view")).toBe(false);
    expect(isImmediate("selection_added")).toBe(false);
  });
  it("se envía al llegar a 20 eventos", () => {
    expect(shouldFlush(19)).toBe(false);
    expect(shouldFlush(20)).toBe(true);
  });
  it("permite 120 envíos por minuto por IP y frena el 121", () => {
    const allow = createRateLimiter();
    for (let i = 0; i < 120; i++) expect(allow("1.1.1.1", 1000)).toBe(true);
    expect(allow("1.1.1.1", 1000)).toBe(false);
    expect(allow("2.2.2.2", 1000)).toBe(true);
    expect(allow("1.1.1.1", 61_001)).toBe(true);
  });
});
