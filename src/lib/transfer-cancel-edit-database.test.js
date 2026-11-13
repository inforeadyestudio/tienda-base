import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const V1 = "00000000-0000-0000-0000-000000000040";
const V2 = "00000000-0000-0000-0000-000000000041";
const ORIGIN = "00000000-0000-0000-0000-000000000050";
const DEST = "00000000-0000-0000-0000-000000000051";
const ORDER = "00000000-0000-0000-0000-000000000060";

async function setup() {
  const db = new PGlite();
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;
    CREATE FUNCTION is_staff(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE TYPE inventory_movement_kind AS ENUM ('reservation','release','transfer_out','transfer_in');
    CREATE TABLE transfers(id uuid PRIMARY KEY, from_location_id uuid, to_location_id uuid, status text, order_id uuid, handoff boolean, rejected_reason text);
    CREATE TABLE transfer_items(transfer_id uuid, variant_id uuid, qty integer);
    CREATE TABLE inventory_levels(variant_id uuid, location_id uuid, on_hand integer, reserved integer, updated_at timestamptz, PRIMARY KEY (variant_id, location_id));
    CREATE TABLE inventory_movements(variant_id uuid, location_id uuid, kind inventory_movement_kind, qty integer, ref_type text, ref_id uuid, actor_id uuid);
    INSERT INTO inventory_levels VALUES
      ('${V1}', '${ORIGIN}', 10, 3, now()),
      ('${V2}', '${ORIGIN}', 5, 0, now());
  `);
  const migration = readFileSync(new URL("../../drizzle/migrations/0077_cancel_and_edit_transfers.sql", import.meta.url), "utf8");
  await db.exec(migration.replaceAll("public.", ""));
  return db;
}

const level = async (db, v, loc) =>
  (await db.query("SELECT on_hand, reserved FROM inventory_levels WHERE variant_id=$1 AND location_id=$2", [v, loc])).rows[0];

it("cancelling an approved transfer releases the reserved units at origin", async () => {
  const db = await setup();
  try {
    const id = "00000000-0000-0000-0000-000000000070";
    await db.query("INSERT INTO transfers VALUES ($1,$2,$3,'approved',NULL,false,NULL)", [id, ORIGIN, DEST]);
    await db.query("INSERT INTO transfer_items VALUES ($1,$2,2),($1,$3,1)", [id, V1, V2]);
    await db.query("SELECT cancel_transfer($1::uuid, 'pedido duplicado')", [id]);
    expect((await db.query("SELECT status, rejected_reason FROM transfers WHERE id=$1", [id])).rows[0])
      .toEqual({ status: "cancelled", rejected_reason: "pedido duplicado" });
    expect(await level(db, V1, ORIGIN)).toEqual({ on_hand: 10, reserved: 1 });
    expect(await level(db, V2, ORIGIN)).toEqual({ on_hand: 5, reserved: 0 });
    const rel = await db.query("SELECT count(*)::int AS n FROM inventory_movements WHERE kind='release' AND ref_id=$1", [id]);
    expect(rel.rows[0].n).toBe(2);
  } finally { await db.close(); }
}, 30000);

it("cancelling an in-transit transfer returns the units to the origin", async () => {
  const db = await setup();
  try {
    const id = "00000000-0000-0000-0000-000000000071";
    await db.query("INSERT INTO transfers VALUES ($1,$2,$3,'in_transit',NULL,false,NULL)", [id, ORIGIN, DEST]);
    await db.query("INSERT INTO transfer_items VALUES ($1,$2,4)", [id, V1]);
    await db.query("UPDATE inventory_levels SET on_hand = on_hand - 4, reserved = GREATEST(0, reserved - 4) WHERE variant_id=$1 AND location_id=$2", [V1, ORIGIN]);
    await db.query("SELECT cancel_transfer($1::uuid, NULL)", [id]);
    expect(await level(db, V1, ORIGIN)).toEqual({ on_hand: 10, reserved: 0 });
    const tin = await db.query("SELECT qty FROM inventory_movements WHERE kind='transfer_in' AND ref_id=$1", [id]);
    expect(tin.rows[0].qty).toBe(4);
  } finally { await db.close(); }
}, 30000);

it("editing units on an approved transfer adjusts reservations and blocks increases beyond availability", async () => {
  const db = await setup();
  try {
    const id = "00000000-0000-0000-0000-000000000072";
    await db.query("INSERT INTO transfers VALUES ($1,$2,$3,'approved',NULL,false,NULL)", [id, ORIGIN, DEST]);
    await db.query("INSERT INTO transfer_items VALUES ($1,$2,2),($1,$3,1)", [id, V1, V2]);
    // V1: 10 on_hand, 3 reserved (2 by this transfer) → only 7 free; asking +8 must fail
    await expect(
      db.query("SELECT edit_transfer_items($1::uuid, $2::jsonb)", [id, JSON.stringify([{ variant_id: V1, qty: 10 }, { variant_id: V2, qty: 1 }])]),
    ).rejects.toThrow(/insufficient stock/);
    // V1 down to 1 (release 1), V2 removed (release 1)
    await db.query("SELECT edit_transfer_items($1::uuid, $2::jsonb)", [id, JSON.stringify([{ variant_id: V1, qty: 1 }])]);
    expect(await level(db, V1, ORIGIN)).toEqual({ on_hand: 10, reserved: 2 });
    expect(await level(db, V2, ORIGIN)).toEqual({ on_hand: 5, reserved: 0 });
    const items = await db.query("SELECT variant_id, qty FROM transfer_items WHERE transfer_id=$1", [id]);
    expect(items.rows).toEqual([{ variant_id: V1, qty: 1 }]);
  } finally { await db.close(); }
}, 30000);

it("refuses to cancel a received transfer or one linked to an order", async () => {
  const db = await setup();
  try {
    const received = "00000000-0000-0000-0000-000000000073";
    const linked = "00000000-0000-0000-0000-000000000074";
    await db.query("INSERT INTO transfers VALUES ($1,$2,$3,'received',NULL,false,NULL)", [received, ORIGIN, DEST]);
    await db.query("INSERT INTO transfers VALUES ($1,$2,$3,'requested',$4,false,NULL)", [linked, ORIGIN, DEST, ORDER]);
    await expect(db.query("SELECT cancel_transfer($1::uuid, NULL)", [received])).rejects.toThrow(/cannot cancel/);
    await expect(db.query("SELECT cancel_transfer($1::uuid, NULL)", [linked])).rejects.toThrow(/order-linked/);
    await expect(db.query("SELECT edit_transfer_items($1::uuid, '[]'::jsonb)", [linked])).rejects.toThrow(/order-linked/);
  } finally { await db.close(); }
}, 30000);
