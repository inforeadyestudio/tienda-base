// Copia de seguridad cada 2 días: Excel con inventario, pedidos y productos (sin límite de 1000 filas).
import * as XLSX from "xlsx";
import { getSetting, layout, p, sendOnce } from "./resend.server";

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function fetchAll(admin: Admin, table: string, select: string, order: string): Promise<any[]> {
  const out: any[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await (admin.from(table as any) as any).select(select).order(order).range(from, from + size - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return out;
}

export async function handleBackup() {
  const { supabaseAdmin: admin } = await import("@/integrations/supabase/client.server");
  const s = await getSetting(admin, "team_inventory_backup");
  if (!s.enabled || !s.recipients.length) return;

  const [products, variants, levels, locations, orders, items, posSales, posSessions] = await Promise.all([
    fetchAll(admin, "products", "id,name,name_en,slug,reference_code,product_type,status,description,description_en,composition,materials,care,tags,created_at", "id"),
    fetchAll(admin, "product_variants", "id,product_id,sku,barcode,size,color,quality,active,price_cop,price_usd,compare_at_cop,cost_cop,tariff_code,weight_grams", "id"),
    fetchAll(admin, "inventory_levels", "variant_id,location_id,on_hand,reserved,returned_qty", "variant_id"),
    fetchAll(admin, "locations", "id,name", "id"),
    fetchAll(admin, "orders", "*", "created_at"),
    fetchAll(admin, "order_items", "*", "created_at"),
    fetchAll(admin, "pos_sales", "*", "created_at"),
    fetchAll(admin, "pos_sessions", "*", "opened_at"),
  ]);
  const prod = new Map(products.map((x) => [x.id, x]));
  const vars = new Map(variants.map((x) => [x.id, x]));
  const loc = new Map(locations.map((x) => [x.id, x.name]));
  const ordMap = new Map(orders.map((o) => [o.id, o]));
  const sessMap = new Map(posSessions.map((s) => [s.id, s]));

  const channel = (o: any) => o.source === "pos" ? "POS" : o.is_manual ? "Manual" : (o.b2b_mode || String(o.number ?? "").toUpperCase().startsWith("B2B")) ? "B2B" : o.source === "assisted" ? "Asistido" : "Web";
  const addr = (a: any) => !a ? "" : typeof a === "string" ? a : [a.name, a.line1 ?? a.address1 ?? a.address, a.line2 ?? a.address2, a.city, a.state ?? a.region, a.postal_code ?? a.zip, a.country].filter(Boolean).join(", ");
  const itemsByOrder = new Map<string, any[]>();
  for (const it of items) { const a = itemsByOrder.get(it.order_id) ?? []; a.push(it); itemsByOrder.set(it.order_id, a); }
  const payByOrder = new Map<string, any[]>();
  for (const s of posSales) { if (!s.order_id) continue; const a = payByOrder.get(s.order_id) ?? []; a.push(s); payByOrder.set(s.order_id, a); }

  const inventario = levels.map((l) => {
    const v = vars.get(l.variant_id); const pr = v ? prod.get(v.product_id) : null;
    return { Bodega: loc.get(l.location_id) ?? l.location_id, SKU: v?.sku ?? "", Producto: pr?.name ?? "", Talla: v?.size ?? "", Color: v?.color ?? "", "En existencia": l.on_hand, Reservado: l.reserved, Devueltas: l.returned_qty, Disponible: (l.on_hand ?? 0) - (l.reserved ?? 0) };
  });
  const productos = products.map((x) => ({ Nombre: x.name, "Nombre inglés": x.name_en, Referencia: x.reference_code, Slug: x.slug, Tipo: x.product_type, Estado: x.status, Descripción: x.description, "Descripción inglés": x.description_en, Composición: x.composition, Materiales: x.materials, Cuidado: x.care, Etiquetas: Array.isArray(x.tags) ? x.tags.join(", ") : x.tags, Creado: x.created_at }));
  const variantes = variants.map((v) => ({ Producto: prod.get(v.product_id)?.name ?? "", SKU: v.sku, "Código de barras": v.barcode, Talla: v.size, Color: v.color, Calidad: v.quality, Activa: v.active ? "Sí" : "No", "Precio COP": v.price_cop, "Precio USD": v.price_usd, "Precio antes COP": v.compare_at_cop, "Costo COP": v.cost_cop, "Partida arancelaria": v.tariff_code, "Peso (g)": v.weight_grams }));
  const orderRow = (o: any) => {
    const its = itemsByOrder.get(o.id) ?? [];
    const pays = payByOrder.get(o.id) ?? [];
    return {
      Número: o.number, Canal: channel(o), "Modo B2B": o.b2b_mode ?? "", Fecha: o.created_at, Estado: o.status, "Estado de pago": o.payment_status,
      "Medio de pago": o.payment_method ?? o.b2b_payment_method ?? "", "Pagos POS": pays.map((s) => `${s.method}: ${s.amount_cop}`).join(" | "), "Referencia de pago": o.payment_reference,
      Moneda: o.currency, País: o.buyer_country, Cliente: o.contact_name, Correo: o.contact_email, Teléfono: o.contact_phone, "Dirección de envío": addr(o.ship_to),
      Unidades: its.reduce((a, i) => a + (Number(i.qty) || 0), 0),
      Productos: its.map((i) => `${i.qty}× ${i.product_name}${i.variant_label ? ` (${i.variant_label})` : ""}`).join(" | "),
      Subtotal: o.subtotal_cop, Descuento: o.discount_cop, Envío: o.shipping_cop, "IVA incluido": o.tax_included_cop, "Puntos redimidos": o.points_redeemed, "Crédito devolución": o.return_credit_cop,
      "Total COP": o.total_cop, "Total USD": o.total_usd_exact ?? o.total_usd,
      "Tienda/bodega venta": loc.get(o.sold_by_location_id) ?? loc.get(sessMap.get(o.pos_session_id)?.location_id) ?? "", "Bodega despacho": loc.get(o.fulfill_location_id) ?? loc.get(o.dispatch_location_id) ?? "",
      Transportadora: o.shipping_carrier, Guía: o.tracking_number, "Factura solicitada": o.invoice_requested ? "Sí" : "No", "Factura a nombre": o.invoice_name, "Documento factura": o.invoice_document, "Correo factura": o.invoice_email,
      "Vence crédito": o.credit_due_at, "Crédito pagado con": o.credit_paid_method, Pagado: o.paid_at, "Recogido": o.picked_up_at, Notas: o.notes, Actualizado: o.updated_at,
    };
  };
  const pedidos = orders.map(orderRow);
  const byCh = (c: string) => pedidos.filter((r) => r.Canal === c);
  const lineas = items.map((i) => {
    const o = ordMap.get(i.order_id); const v = vars.get(i.variant_id);
    return { Pedido: o?.number ?? "", Canal: o ? channel(o) : "", Fecha: o?.created_at ?? i.created_at, Estado: o?.status ?? "", Cliente: o?.contact_name ?? "", Producto: i.product_name, Variante: i.variant_label, SKU: v?.sku ?? "", Talla: v?.size ?? "", Color: v?.color ?? "", Cantidad: i.qty, Despachadas: i.shipped_qty, "Precio unitario COP": i.unit_price_cop, "Precio lista COP": i.list_price_cop, "Precio unitario USD": i.unit_price_usd, "Total línea COP": (Number(i.unit_price_cop) || 0) * (Number(i.qty) || 0), Bodega: loc.get(i.fulfill_location_id) ?? "", "Origen B2B": i.b2b_source ?? "", "Partida arancelaria": i.hs_code };
  });
  const pagosPos = posSales.map((s) => { const o = ordMap.get(s.order_id); const ss = sessMap.get(s.session_id); return { Pedido: o?.number ?? "", Fecha: s.created_at, Tienda: loc.get(ss?.location_id) ?? "", Método: s.method, "Monto COP": s.amount_cop, Cliente: o?.contact_name ?? "" }; });
  const cajasPos = posSessions.map((s) => ({ Tienda: loc.get(s.location_id) ?? "", Apertura: s.opened_at, Cierre: s.closed_at, "Base inicial COP": s.opening_cash_cop, "Efectivo cierre COP": s.closing_cash_cop, Notas: s.notes }));

  const wb = XLSX.utils.book_new();
  const add = (rows: any[], name: string) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ "Sin registros": "" }]), name);
  add(inventario, "Inventario");
  add(pedidos, "Todos los pedidos");
  add(byCh("Web"), "Pedidos online");
  add(byCh("Manual"), "Pedidos manuales");
  add(byCh("B2B"), "Pedidos B2B");
  add(byCh("POS"), "Ventas POS");
  add(lineas, "Productos por pedido");
  add(pagosPos, "Pagos POS");
  add(cajasPos, "Cierres de caja POS");
  add(productos, "Productos");
  add(variantes, "Variantes y precios");
  const content = XLSX.write(wb, { type: "base64", bookType: "xlsx", compression: true }) as string;

  const day = new Date().toISOString().slice(0, 10);
  const units = inventario.reduce((a, r) => a + (Number(r["En existencia"]) || 0), 0);
  await sendOnce(admin, {
    dedupeKey: `backup-${day}`, event: "team_inventory_backup", to: s.recipients,
    subject: `Copia de seguridad Tu Marca · ${day}`,
    html: layout("Copia de seguridad", p(`Adjuntamos el Excel con la copia del ${day}.`) + p(`- Inventario: ${inventario.length} registros, ${units.toLocaleString("es-CO")} unidades<br>- Pedidos: ${pedidos.length} (online ${byCh("Web").length}, manuales ${byCh("Manual").length}, B2B ${byCh("B2B").length}, POS ${byCh("POS").length})<br>- Líneas de productos: ${lineas.length}<br>- Productos: ${productos.length}<br>- Variantes: ${variantes.length}`)),
    attachments: [{ filename: `respaldo-marca-${day}.xlsx`, content }],
  });
}
