import { describe, expect, it } from "vitest";
import { normalizeScannedCode, scannedCodeFilter } from "./scanned-code";

describe("códigos del lector POS", () => {
  it("corrige el apóstrofe que reemplaza al guion", () => {
    expect(normalizeScannedCode("RIEBOO'S")).toBe("RIEBOO-S");
    expect(normalizeScannedCode("ANDDRE'XS'S")).toBe("ANDDRE-XS-S");
  });
  it("normaliza minúsculas, espacios y separadores de teclado", () => {
    expect(normalizeScannedCode(" equdre’s\r\n")).toBe("EQUDRE-S");
    expect(normalizeScannedCode("TROPANIVO–S")).toBe("TROPANIVO-S");
  });
  it("mantiene códigos numéricos y tallas distintas", () => {
    expect(normalizeScannedCode("0012345678901")).toBe("0012345678901");
    expect(normalizeScannedCode("EQUDRE-XS")).not.toBe(normalizeScannedCode("EQUDRE-S"));
  });
  it("busca el SKU normalizado sin distinguir mayúsculas", () => {
    expect(scannedCodeFilter("rieboo's")).toBe('barcode.eq."RIEBOO-S",sku.ilike."RIEBOO-S"');
  });
  it("no permite que comodines conviertan un código en coincidencia parcial", () => {
    expect(scannedCodeFilter("SKU_%")).toBe('barcode.eq."SKU_%",sku.ilike."SKU\\\\_\\\\%"');
  });
});