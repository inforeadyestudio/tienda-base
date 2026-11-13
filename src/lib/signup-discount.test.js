import { describe, expect, it } from "vitest";
import { DEFAULT_SIGNUP_SETTINGS, SIGNUP_DELAY_MS, signupInputSchema, signupSettingsSchema, isSignupStorefrontPath } from "./signup-discount";
import { promotionDiscount } from "./promotions";
const promo = { kind: "percent", value: 10, amount_currency: "COP", amount_usd: null, active: true, channels: ["ecom_nacional", "ecom_intl"], starts_at: null, ends_at: null, min_subtotal_cop: 0 };
describe("inscripción con descuento", () => {
  it("espera los 10 segundos solicitados", () => expect(SIGNUP_DELAY_MS).toBe(10000));
  it("ofrece 10% inicialmente", () => expect(DEFAULT_SIGNUP_SETTINGS.discountPct).toBe(10));
  it("permite configurar otro descuento", () => expect(signupSettingsSchema.parse({ ...DEFAULT_SIGNUP_SETTINGS, discountPct: 15 }).discountPct).toBe(15));
  it("inscribe con nombre y correo sin cuenta ni contraseña", () => expect(signupInputSchema.parse({ name: "Juan", email: "JUAN@example.com", consent: true })).toEqual({ name: "Juan", email: "juan@example.com", consent: true }));
  it("descuenta 10% de prendas COP, no del envío", () => {
    const discount = promotionDiscount(promo, "COP", 200000, 50);
    expect(discount.discountCop).toBe(20000);
    expect(200000 + 17000 - discount.discountCop).toBe(197000);
  });
  it("descuenta 10% en dólares conservando centavos", () => expect(promotionDiscount(promo, "USD", 400400, 100.10).discountUsd).toBe(10.01));
  it("no muestra la ventana en portales o retorno de pago", () => {
    expect(isSignupStorefrontPath("/tienda")).toBe(true);
    expect(isSignupStorefrontPath("/admin/tienda/configuracion")).toBe(false);
    expect(isSignupStorefrontPath("/pago-retorno")).toBe(false);
  });
});