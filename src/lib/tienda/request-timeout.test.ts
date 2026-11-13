import { test } from "node:test";
import { strictEqual, rejects } from "node:assert";
import { withRequestTimeout } from "./request-timeout";

test("una lectura normal conserva el resultado", async () => {
  strictEqual(await withRequestTimeout(async () => "catalogo", 100), "catalogo");
});

test("una conexión que no responde deja de bloquear la carga", async () => {
  await rejects(withRequestTimeout(() => new Promise<never>(() => {}), 10), /tardó demasiado/);
});

test("un error de lectura se conserva para poder reintentar", async () => {
  await rejects(withRequestTimeout(async () => { throw new Error("sin conexión"); }, 100), /sin conexión/);
});