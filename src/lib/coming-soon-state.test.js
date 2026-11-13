import { describe, expect, it } from "vitest";
import { normalizeComingSoon } from "./coming-soon-state";

describe("automatic storefront reopening", () => {
  const launchAt = "2026-10-26T23:20:00.000Z";
  it("unchecks closure when the launch date has passed", () => {
    expect(normalizeComingSoon({ enabled: true, launchAt }, Date.parse("2026-11-10T13:36:00Z")).enabled).toBe(false);
  });
  it("unchecks closure at the exact opening time", () => {
    expect(normalizeComingSoon({ enabled: true, launchAt }, Date.parse(launchAt)).enabled).toBe(false);
  });
  it("preserves closure before opening", () => {
    expect(normalizeComingSoon({ enabled: true, launchAt }, Date.parse(launchAt) - 1).enabled).toBe(true);
  });
  it("preserves manual closure without a launch date", () => {
    expect(normalizeComingSoon({ enabled: true, launchAt: null }, Date.parse("2026-11-10T13:36:00Z")).enabled).toBe(true);
  });
});