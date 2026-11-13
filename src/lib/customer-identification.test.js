import { describe, expect, it } from "vitest";
import { createUserInputSchema } from "./admin/users.functions";

describe("identificación del cliente", () => {
  it("conserva pasaporte o DNI al crear la cuenta desde un pedido manual", () => {
    const result = createUserInputSchema.parse({
      email: "cliente@example.com",
      password: "ClaveSegura123",
      documentId: "P-1234567",
    });
    expect(result.documentId).toBe("P-1234567");
  });

  it("rechaza una identificación vacía cuando se envía", () => {
    expect(() => createUserInputSchema.parse({
      email: "cliente@example.com",
      password: "ClaveSegura123",
      documentId: "",
    })).toThrow("La identificación es obligatoria");
  });
});