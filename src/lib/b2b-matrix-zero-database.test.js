import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("zero deletes the draft line and allocation, recalculates totals, and preserves another store", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
      CREATE FUNCTION is_staff(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      CREATE FUNCTION is_b2b(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      CREATE TABLE profiles(id uuid PRIMARY KEY, full_name text, company_name text, phone text, document_id text);
      CREATE TABLE b2b_client_stores(id uuid PRIMARY KEY, customer_id uuid, name text);
      CREATE TABLE orders(id uuid PRIMARY KEY, customer_id uuid, source text, status text, notes text, b2b_store_id uuid, created_at timestamptz DEFAULT now(), subtotal_cop integer, total_cop integer);
      CREATE TABLE order_items(id uuid PRIMARY KEY, order_id uuid, variant_id uuid, qty integer, unit_price_cop integer);
      CREATE TABLE preventa_allocations(order_item_id uuid, qty integer);
      INSERT INTO b2b_client_stores VALUES
        ('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000001','A'),
        ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','B');
      INSERT INTO orders VALUES
        ('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000001','assisted','draft','[PREVENTA] A','00000000-0000-0000-0000-000000000010',now(),100,100),
        ('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000001','assisted','draft','[PREVENTA] B','00000000-0000-0000-0000-000000000011',now(),100,100);
      INSERT INTO order_items VALUES
        ('00000000-0000-0000-0000-000000000030','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000040',1,100),
        ('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000040',1,100);
      INSERT INTO preventa_allocations VALUES ('00000000-0000-0000-0000-000000000030',1),('00000000-0000-0000-0000-000000000031',1);
    `);
    const migration = readFileSync(new URL("../../drizzle/migrations/0071_b2b_client_stores.sql", import.meta.url), "utf8");
    const start = migration.indexOf("CREATE OR REPLACE FUNCTION public.set_preventa_order_qty");
    const end = migration.indexOf("END; $function$;", start) + "END; $function$;".length;
    await db.exec(migration.slice(start, end));
    await db.query("SELECT set_preventa_order_qty($1::uuid,$2::uuid,0,$3::uuid)", ["00000000-0000-0000-0000-000000000001", "00000000-0000-0000-0000-000000000040", "00000000-0000-0000-0000-000000000010"]);
    expect((await db.query("SELECT count(*)::int AS n FROM order_items WHERE order_id='00000000-0000-0000-0000-000000000020'")).rows[0].n).toBe(0);
    expect((await db.query("SELECT count(*)::int AS n FROM preventa_allocations")).rows[0].n).toBe(1);
    expect((await db.query("SELECT total_cop FROM orders WHERE id='00000000-0000-0000-0000-000000000020'")).rows[0].total_cop).toBe(0);
    expect((await db.query("SELECT qty FROM order_items WHERE order_id='00000000-0000-0000-0000-000000000021'")).rows[0].qty).toBe(1);
  } finally { await db.close(); }
}, 30000);