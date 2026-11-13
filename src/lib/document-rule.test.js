import { describe, it, expect } from "vitest";
import { documentError } from "./checkout/document-rule";
describe("documento obligatorio en checkout", () => {
  it("Colombia exige cédula", () => { expect(documentError("", true)).toBe("Revisa tu cédula"); expect(documentError("1047443186", true)).toBeNull(); });
  it("Estados Unidos exige pasaporte", () => { expect(documentError("", false)).toBe("Escribe tu pasaporte o documento"); expect(documentError("A1234567", false)).toBeNull(); });
});
