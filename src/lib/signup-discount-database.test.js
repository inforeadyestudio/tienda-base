import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
it("inscribe una vez por correo y aplica 10% COP/USD sin descontar envío ni repetirlo", async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '00000000-0000-0000-0000-000000000001'::uuid$$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT 'service_role'$$;
      CREATE FUNCTION is_staff(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
      CREATE FUNCTION is_admin(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
      CREATE TABLE promotions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,code text UNIQUE,active boolean DEFAULT true,kind text,value integer,amount_currency text DEFAULT 'COP',amount_usd numeric,channels text[],starts_at timestamptz,ends_at timestamptz,min_subtotal_cop int);
      CREATE TABLE orders(id uuid,customer_id uuid,status text,currency text,source text,points_redeemed int,subtotal_cop bigint,shipping_cop bigint,total_cop bigint,total_usd numeric,total_usd_exact numeric,discount_cop bigint,discount_usd numeric DEFAULT 0,promotion_code text);
      CREATE TABLE order_items(order_id uuid,unit_price_usd numeric,qty int);
      CREATE TABLE app_settings(key text,value jsonb); ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;`);
    await db.exec(readFileSync(new URL("../../drizzle/migrations/0068_storefront_signup_discount.sql", import.meta.url), "utf8"));
    await db.exec(`INSERT INTO app_settings VALUES('signup_discount','{"enabled":true,"discountPct":10}');`);
    const subscribe = async (email) => (await db.query("select subscribe_signup_discount('Prueba',$1) code", [email])).rows[0].code;
    const code = await subscribe("PRUEBA@example.com");
    expect(await subscribe("prueba@example.com")).toBe(code);
    expect(Number((await db.query("select count(*) count from signup_discount_subscribers")).rows[0].count)).toBe(1);
    const copId = "00000000-0000-0000-0000-000000000002";
    const usdId = "00000000-0000-0000-0000-000000000003";
    await db.exec(`INSERT INTO orders(id,status,currency,source,points_redeemed,subtotal_cop,shipping_cop,total_cop,total_usd_exact,discount_cop) VALUES
      ('${copId}','draft','COP','ecom',0,200000,17000,217000,NULL,0),
      ('${usdId}','draft','USD','ecom',0,400400,120000,520400,130.10,0);
      INSERT INTO order_items VALUES('${usdId}',100.10,1);`);
    await db.query("select apply_order_usd_code($1,$2)", [copId, code]);
    await db.query("select apply_order_usd_code($1,$2)", [copId, code]);
    expect(Number((await db.query("select total_cop from orders where id=$1", [copId])).rows[0].total_cop)).toBe(197000);
    await db.query("select apply_order_usd_code($1,$2)", [usdId, code]);
    expect(Number((await db.query("select total_usd_exact from orders where id=$1", [usdId])).rows[0].total_usd_exact)).toBe(120.09);
    await db.exec(`UPDATE app_settings SET value='{"enabled":false}';`);
    await expect(subscribe("another@example.com")).rejects.toThrow("no está disponible");
  } finally { await db.close(); }
}, 30000);