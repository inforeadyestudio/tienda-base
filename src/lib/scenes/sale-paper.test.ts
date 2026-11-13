import { test } from "node:test";
import { strictEqual, ok } from "node:assert";
import { salePhotoSize, stripImageBox } from "./sale-paper";

// Tira 1 de la hoja (119 x 374 en unidades del lienzo) y la silueta real de una
// foto recortada de 1024 x 1536 (modelo central, ~37% del ancho del lienzo).
const strip = { w: 119, h: 374 };
const cutout = { x: 350 / 1024, y: 22 / 1536, w: 381 / 1024, h: 1433 / 1536, iw: 1024, ih: 1536 };

const near = (value: number, expected: number, tolerance: number, label: string) =>
  ok(Math.abs(value - expected) <= tolerance, `${label}: ${value} no está a menos de ${tolerance} de ${expected}`);

test("la silueta recortada llena el alto del área de impresión y queda centrada", () => {
  const box = stripImageBox(strip, cutout, 92)!;
  const silW = cutout.w * box.width;
  const silH = cutout.h * box.height;
  const silLeft = box.left + cutout.x * box.width;
  const silTop = box.top + cutout.y * box.height;

  near(silH, 92, 0.5, "alto de la modelo");
  near(silLeft + silW / 2, 50, 0.5, "centro horizontal");
  near(silTop + silH, 97, 0.5, "base de la modelo (pie al borde del papel)");
  // width es % del ancho del área y height % de su alto: la proporción real se
  // recupera multiplicando cada uno por el lado del área que le corresponde.
  const area = { w: strip.w * 0.92, h: strip.h * 0.85 };
  near((box.width * area.w) / (box.height * area.h), 1024 / 1536, 0.005, "proporción de la foto");
});

test("una foto sin transparencias se sigue ajustando por su ancho, como antes", () => {
  const box = stripImageBox(strip, { x: 0, y: 0, w: 1, h: 1, iw: 1024, ih: 1536 }, 92)!;
  near(box.width, 92, 0.5, "ancho de la foto");
  near(box.left + box.width / 2, 50, 0.5, "centro horizontal");
  near(box.top + box.height, 97, 0.5, "base de la foto");
});

test("el tamaño de las fotos solo admite valores entre 60 y 100", () => {
  strictEqual(salePhotoSize(120), 100);
  strictEqual(salePhotoSize(10), 60);
  strictEqual(salePhotoSize("76"), 76);
  strictEqual(salePhotoSize(undefined), 92);
  strictEqual(salePhotoSize("abc"), 92);
});

test("sin silueta medible no se reescala la foto", () => {
  strictEqual(stripImageBox(strip, { ...cutout, w: 0 }, 92), null);
});
