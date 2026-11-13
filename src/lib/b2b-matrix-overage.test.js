import { describe, expect, it } from "vitest";
import { matrixClientOrdered, matrixOverage } from "./b2b-matrix-overage";

describe("aviso de sobreventa en Total pedidos", () => {
  it("suma los pedidos de todos los clientes", () => {
    expect(matrixClientOrdered([1, 2, 1])).toBe(4);
  });
  it("sin pedidos muestra cero", () => {
    expect(matrixClientOrdered([])).toBe(0);
  });
  it("avisa cuando los pedidos superan la capacidad de la talla", () => {
    expect(matrixOverage(24, 20)).toBe(4);
  });
  it("no avisa al alcanzar exactamente la capacidad", () => {
    expect(matrixOverage(20, 20)).toBe(0);
  });
  it("avisa si hay pedidos y la capacidad es cero", () => {
    expect(matrixOverage(1, 0)).toBe(1);
  });
  it("el saldo de otra talla no oculta la sobreventa del total", () => {
    expect(matrixOverage(24, 20) + matrixOverage(12, 20)).toBe(4);
  });
});