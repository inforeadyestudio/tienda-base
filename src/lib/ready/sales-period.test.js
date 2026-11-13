import { describe, it, expect } from "vitest";
import { calendarSalesRange, colombiaClock, colombiaDate, inSalesRange, salesPeriod, salesTotals } from "./sales-period";

describe("ventas actuales de Colombia", () => {
  const now = new Date("2026-10-21T03:09:00Z");
  it("hoy sigue siendo 20 de octubre a las 22:09 Colombia", () => {
    expect(colombiaClock(now)).toMatchObject({ date: "2026-10-20", time: "22:09:00" });
  });
  it("incluye el día completo de Colombia hasta medianoche sin perder fracciones", () => {
    expect(salesPeriod({ from: "2026-10-20", to: "2026-10-20" }, now)).toMatchObject({ start: "2026-10-20T05:00:00.000Z", end: "2026-10-21T05:00:00.000Z" });
  });
  it("20 al 20 incluye las ventas de la noche del 20 y no las del 21", () => {
    const range = calendarSalesRange("2026-10-20", "2026-10-20");
    expect(range).toEqual({ from: "2026-10-20T05:00:00.000Z", to: "2026-10-21T05:00:00.000Z", previousFrom: "2026-10-19T05:00:00.000Z", days: 1 });
    expect(inSalesRange("2026-10-21T04:59:59.999Z", range.from, range.to)).toBe(true);
    expect(inSalesRange("2026-10-21T05:00:00.000Z", range.from, range.to)).toBe(false);
    expect(inSalesRange("2026-10-20T04:59:59.999Z", range.from, range.to)).toBe(false);
  });
  it("Hoy sigue siendo 20 a las 22:48 Colombia aunque UTC ya sea 21", () => {
    expect(colombiaDate(0, new Date("2026-10-21T03:48:00Z"))).toBe("2026-10-20");
  });
  it("consulta desde las 6pm Colombia sin confundirlas con UTC", () => {
    expect(salesPeriod({ from: "2026-10-20T18:00:00" }, now)).toMatchObject({ start: "2026-10-20T23:00:00.000Z", end: "2026-10-21T03:09:00.000Z" });
  });
  it("separa COP y USD sin sumar el equivalente en pesos de dólares", () => {
    expect(salesTotals([{ currency: "COP", total_cop: 217000 }, { currency: "USD", total_usd: 160, total_cop: 480000 }])).toEqual({ orders: 2, cop_orders: 1, usd_orders: 1, total_cop: 217000, total_usd: 160 });
  });
});