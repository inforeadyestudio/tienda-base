import { describe, expect, it } from "vitest";
import { displaySize } from "./size-order";
import { entryFromHtml } from "../components/version-watcher";

describe("tallas", () => {
  it("XS/S/M/L nunca se muestran como talla única", () => {
    expect(["XS", "S", "M", "L"].map(displaySize)).toEqual(["XS", "S", "M", "L"]);
  });
  it("solo una talla vacía o única se muestra como Único", () => {
    expect(displaySize(null)).toBe("Único");
    expect(displaySize("Talla única")).toBe("Único");
  });
  it("detecta la versión publicada", () => {
    expect(entryFromHtml('<script src="/assets/index-Bt_Ls7dp.js">')).toBe("/assets/index-Bt_Ls7dp.js");
  });
});
