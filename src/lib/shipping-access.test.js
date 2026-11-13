import { describe, expect, it } from "vitest";
import { assertShipper } from "./shipping-access";

const contextFor = (role) => ({
  userId: "andrea-test",
  supabase: {
    rpc: async (name, args) => ({
      data: name === "is_admin" ? role === "admin" : args._role === role,
      error: null,
    }),
  },
});

describe("shipping access", () => {
  it("permite guías a Andrea con jefe_tiendas sin exigir admin", async () => {
    await expect(assertShipper(contextFor("jefe_tiendas"))).resolves.toBeUndefined();
  });
  it("conserva acceso de bodega", async () => {
    await expect(assertShipper(contextFor("bodega"))).resolves.toBeUndefined();
  });
  it("conserva acceso de administradores", async () => {
    await expect(assertShipper(contextFor("admin"))).resolves.toBeUndefined();
  });
  it("rechaza clientes y otros roles sin permiso de guías", async () => {
    for (const role of ["b2b", "staff_cali", "staff_bogota", "contabilidad", "mercadeo", "servicio", ""]) {
      await expect(assertShipper(contextFor(role))).rejects.toThrow("Solo administradores");
    }
  });
  it("no concede acceso si falla la consulta de permisos", async () => {
    const context = { userId: "andrea-test", supabase: { rpc: async () => ({ data: true, error: new Error("failed") }) } };
    await expect(assertShipper(context)).rejects.toThrow("No pudimos verificar");
  });
});