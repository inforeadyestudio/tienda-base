import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, expect, it } from 'vitest';

let db;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE TABLE locations(id uuid PRIMARY KEY, name text);
    CREATE TABLE order_counters(channel text PRIMARY KEY, last_value int);
    CREATE TABLE orders(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), number text UNIQUE,
      source text, b2b_mode text, is_manual boolean DEFAULT false, sold_by_location_id uuid);
  `);
  await db.exec(readFileSync(new URL('../../drizzle/migrations/0051_b2b_order_number_channel.sql', import.meta.url), 'utf8'));
  await db.exec(`CREATE TRIGGER assign_number BEFORE INSERT ON orders FOR EACH ROW EXECUTE FUNCTION assign_channel_order_number();`);
}, 30000);
afterAll(async () => { await db?.close(); });

async function create(source, mode, manual = false, number = null) {
  return (await db.query('INSERT INTO orders(source,b2b_mode,is_manual,number) VALUES($1,$2,$3,$4) RETURNING number', [source, mode, manual, number])).rows[0].number;
}

it('pedidos asistidos de venta en firme usan B2B, incluso sin prefijo provisional', async () => {
  expect(await create('assisted', 'direct')).toBe('B2B-01');
  expect(await create('assisted', 'direct', false, 'ORD-provisional')).toBe('B2B-02');
});
it('Restock y consignación usan B2B', async () => {
  expect(await create('ecom', 'restock')).toMatch(/^B2B-/);
  expect(await create('assisted', 'consignment')).toMatch(/^B2B-/);
});
it('compras web directas conservan WEB aunque el texto provisional diga B2B', async () => {
  expect(await create('ecom', 'direct', false, 'B2B-provisional')).toBe('LU-WEB-01');
});
it('pedidos manuales conservan su consecutivo independiente', async () => {
  expect(await create('ecom', 'direct', true)).toBe('LU-MANUAL-01');
});
it('POS mantiene prioridad sobre modo y código provisional', async () => {
  expect(await create('pos', 'restock', false, 'B2B-provisional')).toBe('LU-POS-01');
});
it('los consecutivos B2B después de 99 no se truncan', async () => {
  await db.query("UPDATE order_counters SET last_value=99 WHERE channel='B2B'");
  expect(await create('assisted', 'direct')).toBe('B2B-100');
});