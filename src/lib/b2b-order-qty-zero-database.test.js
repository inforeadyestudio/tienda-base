import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("setting a Preventa line to 0 from the B2B order removes the line and its quota without violating qty > 0", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
      CREATE FUNCTION is_staff(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      CREATE FUNCTION log_b2b_order_event(uuid, text, jsonb) RETURNS void LANGUAGE sql AS $$ SELECT $$;
      CREATE TYPE inventory_movement_kind AS ENUM ('reservation','release');
      CREATE TABLE orders(id uuid PRIMARY KEY, status text, subtotal_cop integer, total_cop integer, shipping_cop integer, discount_cop integer);
      CREATE TABLE order_items(id uuid PRIMARY KEY, order_id uuid, variant_id uuid, qty integer, unit_price_cop integer, b2b_source text, fulfill_location_id uuid, product_name text);
      CREATE TABLE reservations(order_item_id uuid, status text, qty integer);
      CREATE TABLE preventa_allocations(order_item_id uuid, location_id uuid, variant_id uuid, status text, qty integer CHECK (qty > 0), updated_at timestamptz);
      CREATE TABLE preventa_rules(variant_id uuid, location_id uuid, active boolean, max_qty integer, starts_at timestamptz, ends_at timestamptz);
      CREATE TABLE inventory_levels(variant_id uuid, location_id uuid, on_hand integer, reserved integer, updated_at timestamptz);
      CREATE TABLE inventory_movements(variant_id uuid, location_id uuid, kind inventory_movement_kind, qty integer, ref_type text, ref_id uuid, actor_id uuid, note text);
      INSERT INTO orders VALUES ('00000000-0000-0000-0000-000000000020','paid',300,300,0,0);
      INSERT INTO order_items VALUES
        ('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000040',1,100,'preventa',NULL,'S'),
        ('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000041',2,100,'preventa',NULL,'M');
      INSERT INTO preventa_allocations VALUES
        ('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000040','pending',1,now()),
        ('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000050','00000000-0000-0000-0000-000000000041','pending',2,now());
    `);
    const migration = readFileSync(new URL("../../drizzle/migrations/0076_fix_b2b_item_qty_zero_preventa.sql", import.meta.url), "utf8");
    await db.exec(migration.replaceAll("public.", ""));
    await db.query("SELECT set_b2b_item_qty($1::uuid,$2::uuid,0)", ["00000000-0000-0000-0000-000000000020", "00000000-0000-0000-0000-000000000030"]);
    expect((await db.query("SELECT count(*)::int AS n FROM order_items WHERE id='00000000-0000-0000-0000-000000000030'")).rows[0].n).toBe(0);
    expect((await db.query("SELECT count(*)::int AS n FROM preventa_allocations WHERE order_item_id='00000000-0000-0000-0000-000000000030'")).rows[0].n).toBe(0);
    expect((await db.query("SELECT qty FROM preventa_allocations WHERE order_item_id='00000000-0000-0000-0000-000000000031'")).rows[0].qty).toBe(2);
    expect((await db.query("SELECT total_cop FROM orders")).rows[0].total_cop).toBe(200);
  } finally { await db.close(); }
}, 30000);
