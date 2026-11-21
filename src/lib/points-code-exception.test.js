import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

it('permite Juliana y JULIANACORTES30 una sola vez, bloquea otros casos y libera cancelaciones sin pago', async () => {
 const db = new PGlite();
 const customer='02e53cb4-1f03-4ceb-9e79-6046cecb5957';
 const other='00000000-0000-0000-0000-000000000001';
 const first='00000000-0000-0000-0000-000000000002';
 const second='00000000-0000-0000-0000-000000000003';
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT '${customer}'::uuid $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'authenticated' $$;
 CREATE FUNCTION public.is_staff(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
 CREATE TABLE profiles(id uuid PRIMARY KEY);
 CREATE TABLE orders(id uuid PRIMARY KEY,customer_id uuid,promotion_code text,points_redeemed int,status text,payment_status text,source text,currency text);
 INSERT INTO profiles VALUES ('${customer}');`);
 const sql=readFileSync(new URL('../../db/pruebas/0058_scoped_points_code_exception.sql',import.meta.url),'utf8');
 await db.exec(sql.split('DO $patch$')[0]);
 await db.exec(readFileSync(new URL('../../db/pruebas/0059_defer_points_exception_order_claim.sql',import.meta.url),'utf8'));
 await db.exec(`INSERT INTO points_code_exceptions(customer_id,code) VALUES('${customer}','JULIANACORTES30');`);
 async function insert(id, who=customer, code='JULIANACORTES30') {
  return db.query(`INSERT INTO orders VALUES($1,$2,$3,10000,'draft','pending','ecom','USD')`,[id,who,code]);
 }
 await expect(insert(first,other)).rejects.toThrow('Usa puntos o código');
 await expect(insert(first,customer,'OTRO')).rejects.toThrow('Usa puntos o código');
 await insert(first);
 expect((await db.query('select claimed_order_id from points_code_exceptions')).rows[0].claimed_order_id).toBe(first);
 await expect(insert(second)).rejects.toThrow('Usa puntos o código');
 await db.exec(`UPDATE orders SET status='cancelled' WHERE id='${first}';`);
 expect((await db.query('select claimed_order_id from points_code_exceptions')).rows[0].claimed_order_id).toBeNull();
 await insert(second);
 await db.exec(`UPDATE orders SET payment_status='paid',status='paid' WHERE id='${second}';`);
 const exception=(await db.query('select active,used_order_id from points_code_exceptions')).rows[0];
 expect(exception.active).toBe(false); expect(exception.used_order_id).toBe(second);
 await expect(insert('00000000-0000-0000-0000-000000000004')).rejects.toThrow('Usa puntos o código');
 await db.close();
},30000);