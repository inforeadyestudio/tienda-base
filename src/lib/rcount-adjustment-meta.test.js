import { describe, expect, it } from "vitest";
import { adjustmentMeta, withAdjustmentMeta } from "./rcount-adjustment-meta";

const base = { type: "ajustes_inventario", data: { external_id: "AJ-1", bodega_codigo: "bodega", items: [{ code: "SKU1", quantity: -1, bodega_codigo: "bodega" }] } };

describe("ajustes a R-Count", () => {
  it("envía el nombre de quien lo elaboró", () => {
    const p = withAdjustmentMeta(base, adjustmentMeta({ full_name: "Laura Gómez", email: "laura@x.co" }, { name: "Wild House" }));
    expect(p.data.elaborado_por).toBe("Laura Gómez");
  });
  it("usa el correo si no hay nombre", () => {
    const p = withAdjustmentMeta(base, adjustmentMeta({ full_name: " ", email: "laura@x.co" }, null));
    expect(p.data.elaborado_por).toBe("laura@x.co");
  });
  it("manda el nombre de la bodega en el ajuste y en cada prenda", () => {
    const p = withAdjustmentMeta(base, adjustmentMeta(null, { name: "Wild House" }));
    expect(p.data.bodega_nombre).toBe("Wild House");
    expect(p.data.items[0].bodega_nombre).toBe("Wild House");
  });
  it("en reenvíos no pisa quien ya venía guardado", () => {
    const saved = { ...base, data: { ...base.data, elaborado_por: "Ana" } };
    expect(withAdjustmentMeta(saved, adjustmentMeta({ full_name: "Otro" }, null)).data.elaborado_por).toBe("Ana");
  });
});
