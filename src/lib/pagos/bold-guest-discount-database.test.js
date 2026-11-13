import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it } from "vitest";

let db;
const reference = "00000000-0000-0000-0000-000000000001";
const holdToken = "00000000-0000-0000-0000-000000000002";
const variantId = "00000000-0000-0000-0000-000000000003";
const locationId = "00000000-0000-0000-0000-000000000004";
const draft = { holdToken, currency: "COP", promotionCode: "BIENVENIDA-PRUEBA" };
const order = { subtotal_cop: 200000, shipping_cop: 17000, total_cop: 217000, buyer_country: "Colombia", contact_email: "fixture@example.com", ship_to: { country: "Colombia" } };
const items = [{ variant_id: variantId, product_name: "Prenda de prueba", qty: 1, unit_price_cop: 200000 }];

async function prepare(amount = 197000, paymentDraft = draft) {
  return (await db.query("SELECT prepare_bold_guest_checkout($1,$2::jsonb,$3::jsonb,$4::jsonb,$5) result", [reference, JSON.stringify(paymentDraft), JSON.stringify(order), JSON.stringify(items), amount])).rows[0].result;
}

beforeEach(async () => {
  db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT NULL::uuid$$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT 'service_role'$$;
    CREATE FUNCTION is_staff(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
    CREATE FUNCTION is_admin(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT false$$;
    CREATE TABLE promotions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text,code text UNIQUE,active boolean DEFAULT true,kind text,value integer,amount_currency text DEFAULT 'COP',amount_usd numeric,channels text[],starts_at timestamptz,ends_at timestamptz,min_subtotal_cop int);
    CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),customer_id uuid,hold_token uuid,source text,status text,subtotal_cop bigint,shipping_cop bigint,total_cop bigint,currency text,total_usd numeric,total_usd_exact numeric,buyer_country text,ship_to jsonb,contact_email text,contact_name text,contact_phone text,payment_status text,payment_method text,payment_reference text,reserved_at timestamptz,analytics_session_id uuid,points_redeemed int DEFAULT 0,discount_cop bigint DEFAULT 0,discount_usd numeric DEFAULT 0,promotion_code text);
    CREATE TABLE order_items(order_id uuid,variant_id uuid,product_name text,variant_label text,qty int,unit_price_cop bigint,unit_price_usd numeric,fulfill_location_id uuid);
    CREATE TABLE payment_attempts(id uuid DEFAULT gen_random_uuid(),reference text UNIQUE,provider text,currency text,amount numeric,status text,draft jsonb);
    CREATE TABLE reservations(hold_token uuid,order_id uuid,variant_id uuid,qty int,status text,expires_at timestamptz,location_id uuid,created_at timestamptz DEFAULT now());
    CREATE TABLE app_settings(key text,value jsonb); ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;`);
  await db.exec(readFileSync(new URL("../../../drizzle/migrations/0068_storefront_signup_discount.sql", import.meta.url), "utf8"));
  await db.exec(readFileSync(new URL("../../../drizzle/migrations/0070_fix_bold_guest_discount_before_reservation.sql", import.meta.url), "utf8"));
  await db.exec(`INSERT INTO promotions(code,kind,value,channels) VALUES ('BIENVENIDA-PRUEBA','percent',10,ARRAY['ecom_nacional']);
    INSERT INTO reservations(hold_token,variant_id,qty,status,expires_at,location_id) VALUES('${holdToken}','${variantId}',1,'active',now()+interval '12 minutes','${locationId}');`);
}, 30000);

afterEach(async () => { await db?.close(); });

it("prepares guest Bold with the 10% welcome code, preserving shipping and the reserved location", async () => {
  const prepared = await prepare();
  const saved = (await db.query("SELECT * FROM orders")).rows[0];
  expect(saved.customer_id).toBeNull();
  expect(saved.status).toBe("reserved");
  expect(saved.promotion_code).toBe("BIENVENIDA-PRUEBA");
  expect(Number(saved.discount_cop)).toBe(20000);
  expect(Number(saved.shipping_cop)).toBe(17000);
  expect(Number(saved.total_cop)).toBe(197000);
  expect(prepared.draft.preparedOrderId).toBe(saved.id);
  expect((await db.query("SELECT order_id FROM reservations")).rows[0].order_id).toBe(saved.id);
  expect((await db.query("SELECT fulfill_location_id FROM order_items")).rows[0].fulfill_location_id).toBe(locationId);
  const attempt = (await db.query("SELECT amount,status FROM payment_attempts")).rows[0];
  expect(Number(attempt.amount)).toBe(197000);
  expect(attempt.status).toBe("pending");
});

it("retries the same guest payment without a second order or discount", async () => {
  const first = await prepare();
  expect(await prepare()).toEqual(first);
  expect(Number((await db.query("SELECT count(*) n FROM orders")).rows[0].n)).toBe(1);
  expect(Number((await db.query("SELECT count(*) n FROM payment_attempts")).rows[0].n)).toBe(1);
  expect(Number((await db.query("SELECT discount_cop FROM orders")).rows[0].discount_cop)).toBe(20000);
  await expect(prepare(197001)).rejects.toThrow("El intento anterior tiene otros datos");
});

it("keeps guest Bold without a code at the full total", async () => {
  await prepare(217000, { holdToken, currency: "COP" });
  const saved = (await db.query("SELECT status,total_cop,promotion_code FROM orders")).rows[0];
  expect(saved.status).toBe("reserved");
  expect(Number(saved.total_cop)).toBe(217000);
  expect(saved.promotion_code).toBeNull();
});

it("rolls back an invalid code without attaching stock or leaving an order", async () => {
  await expect(prepare(197000, { ...draft, promotionCode: "INVALIDO" })).rejects.toThrow("Ese código no está vigente");
  expect(Number((await db.query("SELECT count(*) n FROM orders")).rows[0].n)).toBe(0);
  expect(Number((await db.query("SELECT count(*) n FROM order_items")).rows[0].n)).toBe(0);
  expect(Number((await db.query("SELECT count(*) n FROM payment_attempts")).rows[0].n)).toBe(0);
  expect((await db.query("SELECT order_id FROM reservations")).rows[0].order_id).toBeNull();
});

it("rejects a payment amount differing from the discounted total atomically", async () => {
  await expect(prepare(196999)).rejects.toThrow("El total no coincide con el pedido");
  expect(Number((await db.query("SELECT count(*) n FROM orders")).rows[0].n)).toBe(0);
  expect(Number((await db.query("SELECT count(*) n FROM payment_attempts")).rows[0].n)).toBe(0);
  expect((await db.query("SELECT order_id FROM reservations")).rows[0].order_id).toBeNull();
});

it("rejects expired guest reservations even with a valid code", async () => {
  await db.exec("UPDATE reservations SET expires_at=now()-interval '1 minute'");
  await expect(prepare()).rejects.toThrow("Tus prendas ya no están apartadas");
  expect(Number((await db.query("SELECT count(*) n FROM orders")).rows[0].n)).toBe(0);
});