import { describe, expect, it } from "vitest";
import { localizeAnnouncementItems } from "./announcement-items";

const GENERAL = ["Envíos Gratis a toda Colombia", "Nueva colección disponible"];

describe("announcement bar copy by language and visitor country", () => {
  it("shows Shipping worldwide to English visitors outside Colombia", () => {
    expect(localizeAnnouncementItems(GENERAL, "en", "Rest of world")).toEqual([
      "Shipping worldwide",
      "Nueva colección disponible",
    ]);
  });

  it("keeps the free shipping notice for visitors in Colombia", () => {
    expect(localizeAnnouncementItems(GENERAL, "en", "Colombia")).toEqual(GENERAL);
    expect(localizeAnnouncementItems(GENERAL, "es", "Colombia")).toEqual(GENERAL);
    expect(localizeAnnouncementItems(GENERAL, "es", "CO")).toEqual(GENERAL);
  });

  it("never promises free shipping to Panama, which pays international rates", () => {
    expect(localizeAnnouncementItems(GENERAL, "es", "Panama")).toEqual([
      "Envíos a todo el mundo",
      "Nueva colección disponible",
    ]);
  });

  it("leaves items without a shipping claim untouched", () => {
    expect(localizeAnnouncementItems(["Costa Rica", "Panamá", "Colombia"], "en", "United States")).toEqual([
      "Costa Rica",
      "Panamá",
      "Colombia",
    ]);
  });
});
