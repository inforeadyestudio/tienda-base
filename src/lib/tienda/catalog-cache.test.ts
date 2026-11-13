import { describe, test } from "node:test";
import { strictEqual } from "node:assert";
import { createSwrCache } from "./catalog-cache";

describe("caché del catálogo", () => {
  test("no consulta la base dentro de los 20 s", async () => {
    let t = 0, calls = 0;
    const load = createSwrCache({ ttlMs: 20_000, staleMs: 600_000, now: () => t, read: async () => ++calls });
    await load(); t = 19_000; await load();
    strictEqual(calls, 1);
  });
  test("sirve el último catálogo conocido si la base falla", async () => {
    let t = 0, fail = false;
    const load = createSwrCache({ ttlMs: 20_000, staleMs: 600_000, now: () => t, read: async () => { if (fail) throw new Error("x"); return "ok"; } });
    await load(); fail = true; t = 700_000;
    strictEqual(await load(), "ok");
  });
});

describe("caché del catálogo en el servidor", () => {
  test("una lectura colgada no bloquea a la siguiente visita", async () => {
    let t = 0, hang = true;
    const load = createSwrCache({ ttlMs: 20_000, staleMs: 600_000, now: () => t, readTimeoutMs: 50,
      read: () => (hang ? new Promise<string>(() => {}) : Promise.resolve("ok")) });
    await load().then(() => { throw new Error("no debía resolver"); }, () => undefined);
    hang = false;
    strictEqual(await load(), "ok");
  });
  test("si refrescar tarda, entrega el catálogo guardado a tiempo", async () => {
    let t = 0, hang = false;
    const load = createSwrCache({ ttlMs: 20_000, staleMs: 600_000, now: () => t, readTimeoutMs: 50,
      read: () => (hang ? new Promise<string>(() => {}) : Promise.resolve("v1")) });
    await load(); hang = true; t = 30_000;
    const start = Date.now();
    strictEqual(await load(), "v1");
    strictEqual(Date.now() - start < 1_000, true);
  });
});
