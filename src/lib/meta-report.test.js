import { describe, expect, it } from "vitest";
import { metaMetrics, metaDateRange, resolveMetaName, latestCampaigns } from "./meta-report";
describe("atribución por campaña", () => {
  it("no suma variantes de la misma compra ni compras de otros canales", () => {
    const m = metaMetrics({ spend: "100", actions: [
      { action_type: "purchase", value: "20" },
      { action_type: "omni_purchase", value: "20" },
      { action_type: "offsite_conversion.fb_pixel_purchase", value: "17" },
    ], action_values: [{ action_type: "offsite_conversion.fb_pixel_purchase", value: "340" }] });
    expect(m.purchases).toBe(17);
    expect(m.roas).toBe(3.4);
  });
  it("no inventa un valor ni ROAS cuando Meta no los devuelve", () => {
    expect(metaMetrics({ spend: "100" }).value).toBeNull();
    expect(metaMetrics({ spend: "100" }).roas).toBeNull();
  });
  it("usa días de la cuenta y fin exclusivo para evitar un día adicional", () => {
    expect(metaDateRange("2026-10-01T05:00:00Z", "2026-10-15T05:00:00Z", "America/Bogota"))
      .toEqual({ since: "2026-10-01", until: "2026-10-14" });
  });
  it("resuelve solo identificadores coincidentes, sin adivinar campañas", () => {
    const campaigns = [{ id: "120249657010790726", name: "Campaña ventas back to selva 2" }];
    expect(resolveMetaName("120249657010790726", campaigns)).toBe("Campaña ventas back to selva 2");
    expect(resolveMetaName("Sin campaña", campaigns)).toBe("Sin campaña");
  });
  it("muestra solo las campañas más recientes primero", () => {
    const campaigns = [
      { id: "1", name: "Vieja", status: "PAUSED", created_time: "2026-08-01T10:00:00-0500" },
      { id: "2", name: "Nueva", status: "ACTIVE", created_time: "2026-10-10T10:00:00-0500" },
      { id: "3", name: "Media", status: "PAUSED", created_time: "2026-09-05T10:00:00-0500" },
    ];
    expect(latestCampaigns(campaigns, 2).map((c) => c.id)).toEqual(["2", "3"]);
    expect(latestCampaigns(campaigns, 10)).toHaveLength(3);
  });
});