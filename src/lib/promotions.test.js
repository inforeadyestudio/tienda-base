import { describe, expect, it } from 'vitest';
import { fixedUsdDiscount } from './promotions';
const promo = { kind:'amount', value:0, amount_currency:'USD', amount_usd:116, active:true, channels:['ecom_intl'], starts_at:null, ends_at:null, min_subtotal_cop:0 };
describe('códigos fijos en dólares', () => {
  it('descuenta US$116, no 116 pesos', () => expect(fixedUsdDiscount(promo,'USD',800000,200)).toBe(116));
  it('conserva centavos', () => expect(fixedUsdDiscount({...promo,amount_usd:44.20},'USD',800000,200)).toBe(44.20));
  it('no descuenta el envío ni más que las prendas', () => expect(fixedUsdDiscount(promo,'USD',200000,50)).toBe(50));
  it('no aplica dólares en pesos', () => expect(() => fixedUsdDiscount(promo,'COP',800000,200)).toThrow());
  it('no aplica códigos inactivos', () => expect(() => fixedUsdDiscount({...promo,active:false},'USD',800000,200)).toThrow());
  it('no aplica códigos vencidos', () => expect(() => fixedUsdDiscount({...promo,ends_at:'2026-10-26'},'USD',800000,200,Date.parse('2026-10-27'))).toThrow());
  it('respeta el mínimo', () => expect(() => fixedUsdDiscount({...promo,min_subtotal_cop:900000},'USD',800000,200)).toThrow());
});