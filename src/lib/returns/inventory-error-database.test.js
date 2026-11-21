import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { it } from 'vitest';
import assert from 'node:assert/strict';
it('dos prendas conservan 200000 COP/US$44.20, descuentan cada bodega y no duplican el cambio; stock insuficiente revierte todo', async () => {
const db=new PGlite();
await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$SELECT '00000000-0000-0000-0000-000000000001'::uuid$$; CREATE FUNCTION public.is_staff(uuid) RETURNS boolean LANGUAGE sql AS $$SELECT true$$;
CREATE TABLE orders(id uuid primary key,status text,currency text,source text,subtotal_cop int,total_cop int,total_usd numeric,total_usd_exact numeric,updated_at timestamptz);
CREATE TABLE products(id uuid primary key,name text,status text);
CREATE TABLE product_variants(id uuid primary key,product_id uuid,active boolean,price_cop int,price_usd numeric,size text,color text,tariff_code text);
CREATE TABLE locations(id uuid primary key,active boolean);
CREATE TABLE order_items(id uuid primary key default gen_random_uuid(),order_id uuid,variant_id uuid,qty int,unit_price_cop int,unit_price_usd numeric,product_name text,variant_label text,fulfill_location_id uuid,list_price_cop int,hs_code text,picked_at timestamptz,picked_by uuid,b2b_source text,shipped_qty int default 0);
CREATE TABLE inventory_levels(variant_id uuid,location_id uuid,on_hand int,reserved int,updated_at timestamptz,primary key(variant_id,location_id));
CREATE TABLE reservations(id uuid primary key default gen_random_uuid(),variant_id uuid,location_id uuid,qty int,status text,order_id uuid,order_item_id uuid,expires_at timestamptz,committed_at timestamptz,created_at timestamptz default now());
CREATE TABLE inventory_movements(variant_id uuid,location_id uuid,kind text,qty int,ref_type text,ref_id uuid,actor_id uuid,note text);
CREATE TABLE order_fulfillments(order_id uuid,location_id uuid,unique(order_id,location_id));
CREATE TABLE promotions(id uuid,kind text,value int,channels text[]);
CREATE TABLE returns(id uuid primary key default gen_random_uuid(),order_id uuid,location_id uuid,source text,kind text,status text,reason text,notes text,created_by uuid,resolved_by uuid,resolved_at timestamptz,items jsonb,desired text,desired_qty int,resolution text);
CREATE TABLE audit_log(actor_id uuid,action text,entity text,entity_id uuid,diff jsonb);`);
await db.exec(readFileSync(new URL('../../../db/pruebas/0050_inventory_error_multiple_replacements.sql', import.meta.url),'utf8'));
await db.exec(readFileSync(new URL('../../../db/pruebas/0053_inventory_error_swap_not_duplicate_return.sql', import.meta.url),'utf8'));
await db.exec('CREATE TRIGGER prevent_duplicate_return BEFORE INSERT OR UPDATE ON returns FOR EACH ROW EXECUTE FUNCTION prevent_duplicate_return()');
await db.exec(readFileSync(new URL('../../../db/pruebas/0054_inventory_error_multiple_originals_and_usd_codes.sql', import.meta.url),'utf8'));
const id=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
await db.query('insert into orders values($1,$2,$3,$4,200000,200000,44.20,44.20,now())',[id(10),'paid','COP','ecom']);
for(const n of [20,21,22]) {
 await db.query("insert into products values($1,$2,'published')",[id(n),'Prenda '+n]);
 await db.query("insert into product_variants values($1,$2,true,100000,22.10,'S','Color','6100')",[id(n+10),id(n)]);
}
for(const n of [40,41]) await db.query('insert into locations values($1,true)',[id(n)]);
await db.query('insert into order_items(id,order_id,variant_id,qty,unit_price_cop,unit_price_usd,product_name,fulfill_location_id) values($1,$2,$3,1,200000,44.20,$4,$5)',[id(50),id(10),id(30),'Original',id(40)]);
await db.query('insert into inventory_levels values($1,$2,1,1,now()),($3,$2,2,0,now()),($4,$5,2,0,now())',[id(30),id(40),id(31),id(32),id(41)]);
await db.query("insert into reservations(variant_id,location_id,qty,status,order_id,order_item_id,expires_at) values($1,$2,1,'active',$3,$4,now()+interval '1 day')",[id(30),id(40),id(10),id(50)]);
const replacements=JSON.stringify([{variant_id:id(31),location_id:id(40),qty:1},{variant_id:id(32),location_id:id(41),qty:1}]);
await db.query('select swap_order_item_inventory_error_many($1,$2,$3,$4)',[id(50),replacements,id(60),'Acuerdo']);
let rows=(await db.query('select unit_price_cop,unit_price_usd from order_items order by id')).rows;
assert.equal(rows.length,2);assert.equal(rows.reduce((s,r)=>s+r.unit_price_cop,0),200000); assert.equal(rows.reduce((s,r)=>s+Number(r.unit_price_usd),0),44.20);
let stock=(await db.query('select on_hand,reserved from inventory_levels order by variant_id')).rows;
assert.deepEqual(stock,[{on_hand:0,reserved:0},{on_hand:1,reserved:0},{on_hand:1,reserved:0}]);
await db.query('select swap_order_item_inventory_error_many($1,$2,$3,$4)',[id(50),replacements,id(60),'Acuerdo']);
assert.equal((await db.query('select count(*)::int n from returns')).rows[0].n,1);
const before=JSON.stringify((await db.query('select * from inventory_levels order by variant_id')).rows);
await assert.rejects(()=>db.query('select swap_order_item_inventory_error_many($1,$2,$3,$4)',[id(50),JSON.stringify([{variant_id:id(32),location_id:id(41),qty:1},{variant_id:id(32),location_id:id(41),qty:1}]),id(61),'Prueba']),/stock libre/);
assert.equal(JSON.stringify((await db.query('select * from inventory_levels order by variant_id')).rows),before);

// Two missing originals become three replacements, with a normal pending return already present.
await db.query("insert into orders values($1,'paid','USD','ecom',200000,218000,44.20,44.20,now())",[id(70)]);
for (const [line,variant] of [[71,30],[72,31]]) await db.query('insert into order_items(id,order_id,variant_id,qty,unit_price_cop,unit_price_usd,product_name,fulfill_location_id) values($1,$2,$3,1,100000,22.10,$4,$5)',[id(line),id(70),id(variant),'Missing',id(40)]);
await db.query("insert into returns(order_id,status,resolution) values($1,'pendiente','normal')",[id(70)]);
await db.query('update inventory_levels set on_hand=5,reserved=0 where variant_id=$1',[id(32)]);
const three=JSON.stringify([{variant_id:id(32),location_id:id(41),qty:3}]);
await db.query('select swap_order_items_inventory_error_many($1,$2,$3,$4)',[[id(71),id(72)],three,id(73),'Dos por tres']);
const multi=(await db.query('select * from order_items where order_id=$1',[id(70)])).rows;
assert.equal(multi.length,3);
assert.equal(multi.reduce((s,r)=>s+r.unit_price_cop*r.qty,0),200000);
assert.equal(multi.reduce((s,r)=>s+Math.round(Number(r.unit_price_usd)*100)*r.qty,0),4420);
assert.equal((await db.query('select on_hand from inventory_levels where variant_id=$1',[id(32)])).rows[0].on_hand,2);
assert.equal((await db.query("select jsonb_array_length(items) n from returns where inventory_swap_request_id=$1",[id(73)])).rows[0].n,2);
await db.query('select swap_order_items_inventory_error_many($1,$2,$3,$4)',[[id(71),id(72)],three,id(73),'Dos por tres']);
assert.equal((await db.query('select on_hand from inventory_levels where variant_id=$1',[id(32)])).rows[0].on_hand,2);
const originals=JSON.stringify((await db.query('select * from order_items where order_id=$1 order by id',[id(70)])).rows);
await assert.rejects(()=>db.query('select swap_order_items_inventory_error_many($1,$2,$3,$4)',[[multi[0].id,multi[1].id],JSON.stringify([{variant_id:id(31),location_id:id(40),qty:10}]),id(74),'Sin stock']),/stock libre/);
assert.equal(JSON.stringify((await db.query('select * from order_items where order_id=$1 order by id',[id(70)])).rows),originals);
assert.equal((await db.query('select total_cop,total_usd_exact from orders where id=$1',[id(70)])).rows[0].total_cop,218000);
await db.close();

}, 30000);
