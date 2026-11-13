import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect } from "vitest";

const alejandra = "45e2276a-f1e5-4667-9401-f10fc27b1283";
const other = "00000000-0000-0000-0000-000000000001";
const order = "00000000-0000-0000-0000-000000000020";
let db;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('test.user', true), '')::uuid $$;
    CREATE TYPE public.app_role AS ENUM ('admin','bodega','jefe_tiendas');
    CREATE TABLE public.user_roles(user_id uuid, role public.app_role);
    CREATE FUNCTION public.has_role(u uuid, r public.app_role) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u AND role=r) $$;
    CREATE FUNCTION public.is_admin(u uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT public.has_role(u, 'admin') $$;
    CREATE FUNCTION public.is_staff(u uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=u) $$;
    CREATE TABLE public.packing_verifications(order_id uuid, scope text, skipped boolean, verified_by uuid, verified_at timestamptz, UNIQUE(order_id,scope));
    INSERT INTO public.user_roles VALUES ('${alejandra}','bodega'), ('${other}','bodega');
  `);
  await db.exec(readFileSync(new URL("../../drizzle/migrations/0080_allow_warehouse_chief_packing_skip.sql", import.meta.url), "utf8"));
}, 30000);
afterAll(async () => { await db?.close(); });
const signIn = async (id) => { await db.query("SELECT set_config('test.user', $1, false)", [id]); };
it("Alejandra can skip and the exception records her account per scope", async () => {
  await signIn(alejandra);
  expect((await db.query("SELECT public.can_skip_packing_verification() AS allowed")).rows[0].allowed).toBe(true);
  await db.query("SELECT public.record_packing_verification($1::uuid, 'box:test', true)", [order]);
  expect((await db.query("SELECT skipped, verified_by, scope FROM public.packing_verifications")).rows).toEqual([{ skipped: true, verified_by: alejandra, scope: "box:test" }]);
});
it("another warehouse employee cannot skip", async () => {
  await signIn(other);
  expect((await db.query("SELECT public.can_skip_packing_verification() AS allowed")).rows[0].allowed).toBe(false);
  await expect(db.query("SELECT public.record_packing_verification($1::uuid, 'order', true)", [order])).rejects.toThrow("No tienes permiso");
});
it("Alejandra loses the exception when her warehouse role is removed", async () => {
  await signIn(alejandra);
  await db.query("DELETE FROM public.user_roles WHERE user_id=$1::uuid", [alejandra]);
  expect((await db.query("SELECT public.can_skip_packing_verification() AS allowed")).rows[0].allowed).toBe(false);
});
it("administrators retain the permission", async () => {
  await db.query("INSERT INTO public.user_roles VALUES ($1::uuid, 'admin')", [other]);
  await signIn(other);
  await db.query("SELECT public.record_packing_verification($1::uuid, 'order', true)", [order]);
  expect((await db.query("SELECT skipped FROM public.packing_verifications WHERE scope='order'")).rows[0].skipped).toBe(true);
});