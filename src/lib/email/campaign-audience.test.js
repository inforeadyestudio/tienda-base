import { describe, expect, it } from "vitest";
import { campaignAudience } from "./campaign-audience";

describe("público de campaña", () => {
  it("omite correos inválidos sin bloquear los válidos", () => {
    expect(campaignAudience([{ email: "mal escrito" }, { email: " clienta@example.com " }, { email: null }]))
      .toEqual([{ email: "clienta@example.com", name: null }]);
  });
  it("incluye una sola vez cada correo aunque cambien las mayúsculas", () => {
    expect(campaignAudience([{ email: "CLIENTA@example.com" }, { email: "clienta@example.com" }])).toHaveLength(1);
  });
});