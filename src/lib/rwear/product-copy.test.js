import { describe, it, expect } from "vitest";
import { productCopy, publicCopySchema } from "./product-copy";

describe("R Wear public copy", () => {
  it("stores the complete commercial description as story and a 160-character summary", () => {
    const description = "Una camiseta con silueta relajada. ".repeat(12).trim();
    const row = productCopy({ description });
    expect(row.story).toBe(description);
    expect(row.description).toHaveLength(160);
    expect(row.description).not.toBe(description);
  });
  it("accepts the provided English copy without discarding or translating it", () => {
    const payload = publicCopySchema.parse({ name_en: "Rodeo T-shirt", description_en: "An effortless cotton T-shirt." });
    expect(productCopy(payload)).toEqual({ name_en: "Rodeo T-shirt", story_en: "An effortless cotton T-shirt.", description_en: "An effortless cotton T-shirt." });
  });
  it("never maps technical materials to public characteristics", () => {
    expect(productCopy(publicCopySchema.parse({ materials: "Usar molde Ave, corregir patronaje" }))).toEqual({});
  });
  it("does not clear saved Spanish or English copy when omitted or empty", () => {
    expect(productCopy({ description: null, description_en: " ", name_en: null })).toEqual({});
  });
  it("prioritizes explicit full descriptions over summaries", () => {
    expect(productCopy({ story: "Historia completa", description: "Resumen", story_en: "Full story", description_en: "Summary" })).toEqual({ story: "Historia completa", description: "Historia completa", story_en: "Full story", description_en: "Full story" });
  });
});