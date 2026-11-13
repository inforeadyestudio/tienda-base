import { formatCOP, formatUSD } from "@/lib/format";
import logoAsset from "@/assets/marca-logo-verde-oscuro.png";
import { compareSizes, displaySize, sizeLabel } from "@/lib/size-order";
import { BRAND } from "@/config/brand";

type PrintKind = "order" | "delivery";

function esc(v: unknown) {
  return String(v ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
}

function addressLines(ship: Record<string, any>) {
  return [
    ship.name,
    ship.address ?? ship.line1 ?? ship.street,
    ship.address2 ?? ship.line2,
    [ship.city, ship.state ?? ship.province, ship.country].filter(Boolean).join(", "),
    ship.zip ?? ship.postal_code,
    ship.phone,
  ].filter(Boolean).map((l) => esc(l));
}

/** Abre una ventana con el documento listo para imprimir o guardar como PDF. */
export function printOrderDocument(order: any, kind: PrintKind, opts?: { withPrices?: boolean; withPhotos?: boolean }) {
  if (kind === "order" && order.is_b2b) return b2bDocument(order, false, opts?.withPrices ?? true, false, opts?.withPhotos ?? true);
  if (kind === "delivery" && order.is_b2b) return b2bDocument(order, true, !!opts?.withPrices, true, opts?.withPhotos ?? true);
  const items = (order.order_items ?? []) as any[];
  const ship = (order.ship_to ?? {}) as Record<string, any>;
  const isDelivery = kind === "delivery";
  const showMoney = opts?.withPrices ?? !isDelivery;
  const title = isDelivery ? "Remisión" : "Pedido";
  const date = new Date(order.created_at).toLocaleString("es-CO", {
    day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit",
  });

  const rows = [...items]
    .sort((a, b) =>
      String(a.product_name ?? "").localeCompare(String(b.product_name ?? ""), "es", { sensitivity: "base", numeric: true }) ||
      String(a.variant_label ?? a.product_variants?.sku ?? "").localeCompare(String(b.variant_label ?? b.product_variants?.sku ?? ""), "es"))
    .map((it) => {
    const detail = [it.variant_label, it.product_variants?.sku].filter(Boolean).join(" · ");
    const img = it.product_variants?.products?.hero_image_url as string | undefined;
    const money = showMoney ? `
      <td class="num">${esc(formatCOP(it.unit_price_cop ?? 0))}</td>
      <td class="num">${esc(formatCOP((it.unit_price_cop ?? 0) * (it.qty ?? 1)))}</td>` : "";
    return `<tr>
      <td class="pic">${img ? `<img src="${esc(img)}" alt="" />` : ""}</td>
      <td><strong>${esc(it.product_name)}</strong>${detail ? `<div class="muted">${esc(detail)}</div>` : ""}</td>
      <td class="num">${esc(it.qty)}</td>${money}
    </tr>`;
  }).join("");

  const totals = showMoney ? `
    <table class="totals">
      <tr><td>Subtotal</td><td class="num">${esc(formatCOP(order.subtotal_cop ?? 0))}</td></tr>
      ${order.discount_cop ? `<tr><td>Descuento</td><td class="num">- ${esc(formatCOP(order.discount_cop))}</td></tr>` : ""}
      <tr><td>Envío</td><td class="num">${esc(formatCOP(order.shipping_cop ?? 0))}</td></tr>
      <tr class="grand"><td>Total</td><td class="num">${esc(formatCOP(order.total_cop ?? 0))}</td></tr>
    </table>` : "";

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8">
  <title>${esc(title)} ${esc(order.number)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1c1c1c; margin: 0; }
    h1 { font-size: 22px; margin: 0 0 2px; letter-spacing: .02em; }
    .muted { color: #777; font-size: 11px; }
    header { display: flex; justify-content: space-between; align-items: flex-start;
      border-bottom: 1px solid #ddd; padding-bottom: 14px; margin-bottom: 18px; }
    .brand { font-size: 13px; letter-spacing: .28em; text-transform: uppercase; }
    .cols { display: flex; gap: 32px; margin-bottom: 22px; }
    .cols section { flex: 1; }
    h2 { font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: #888; margin: 0 0 6px; }
    p { margin: 0 0 2px; font-size: 12px; line-height: 1.45; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th { text-align: left; font-size: 10px; letter-spacing: .12em; text-transform: uppercase;
      color: #888; border-bottom: 1px solid #ddd; padding: 0 0 6px; font-weight: 500; }
    td { padding: 9px 0; border-bottom: 1px solid #eee; vertical-align: top; }
    .num { text-align: right; white-space: nowrap; }
    .pic { width: 52px; padding-right: 10px; }
    .pic img { width: 44px; height: 55px; object-fit: cover; border-radius: 4px; display: block; }
    .totals { width: 260px; margin-left: auto; margin-top: 14px; }
    .totals td { border: none; padding: 3px 0; }
    .totals .grand td { border-top: 1px solid #ddd; padding-top: 8px; font-weight: 600; font-size: 14px; }
    footer { margin-top: 34px; font-size: 10px; color: #999; border-top: 1px solid #eee; padding-top: 10px; }
    .sign { margin-top: 44px; font-size: 11px; }
    .sign div { border-top: 1px solid #bbb; width: 240px; padding-top: 6px; margin-top: 40px; }
  </style></head><body>
  <header>
    <div>
      <div class="brand">Tu Marca</div>
      <h1>${esc(title)} #${esc(order.number)}</h1>
      <div class="muted">${esc(date)}</div>
    </div>
    <div class="muted" style="text-align:right">
      ${showMoney ? `<div>Pago: ${esc(order.payment_method ?? "—")}</div>` : ""}
      <div>Estado: ${esc(order.status)}</div>
    </div>
  </header>
  <div class="cols">
    <section>
      <h2>Cliente</h2>
      <p>${esc(order.contact_name ?? ship.name ?? "—")}</p>
      <p>${esc(order.contact_email ?? "")}</p>
      <p>${esc(order.contact_phone ?? "")}</p>
    </section>
    <section>
      <h2>Dirección de envío</h2>
      ${addressLines(ship).map((l) => `<p>${l}</p>`).join("") || "<p>—</p>"}
    </section>
  </div>
  <table>
    <thead><tr><th></th><th>Producto</th><th class="num">Cant.</th>${showMoney ? '<th class="num">Precio</th><th class="num">Total</th>' : ""}</tr></thead>
    <tbody>${rows}</tbody>
  </table>
  ${totals}
  ${order.notes ? `<p class="muted" style="margin-top:18px"><strong>Notas:</strong> ${esc(order.notes)}</p>` : ""}
  ${isDelivery ? '<div class="sign"><div>Recibido por (nombre y firma)</div></div>' : ""}
  <footer>Tu Marca · Documento generado el ${esc(new Date().toLocaleDateString("es-CO"))}.${showMoney ? " Precios con impuestos incluidos." : ""}</footer>
  <script>window.onload = function(){
    var imgs = Array.prototype.slice.call(document.images);
    var pending = imgs.filter(function(i){ return !i.complete; }).length;
    function go(){ window.focus(); window.print(); }
    if (!pending) return go();
    var done = false;
    function tick(){ if (done) return; if (--pending <= 0){ done = true; go(); } }
    imgs.forEach(function(i){ if (!i.complete){ i.onload = tick; i.onerror = tick; } });
    setTimeout(function(){ if (!done){ done = true; go(); } }, 4000);
  };<\/script>
  </body></html>`;

  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}

/** Agrupa cantidades y valores históricos sin dividir una referencia por precio de talla. */
export function groupB2BPrintItems(items: any[]) {
  const groups = new Map<string, { ref: string; type: string; color: string; hs: string; img: string; sizes: Record<string, number>; amountCop: number; retail: number | null }>();
  for (const it of items) {
    const pv = it.product_variants ?? {};
    const ref = pv.products?.name ?? it.product_name ?? "—";
    const color = pv.color ?? "—";
    const hs = it.hs_code ?? pv.tariff_code ?? "";
    const key = JSON.stringify([pv.products?.id ?? ref, color, hs]);
    const g = groups.get(key) ?? { ref, type: pv.products?.product_type ?? "—", color, hs, img: pv.products?.hero_image_url ?? "", sizes: {} as Record<string, number>, amountCop: 0, retail: null };
    const s = sizeLabel(pv.size || String(it.variant_label ?? "").split("/").pop()?.trim());
    g.sizes[s] = (g.sizes[s] ?? 0) + Number(it.qty ?? 0);
    g.amountCop += Number(it.unit_price_cop ?? 0) * Number(it.qty ?? 0);
    groups.set(key, g);
  }
  return [...groups.values()];
}

// Reducir imágenes antes de imprimir: el PDF nunca incorpora los originales enormes.
const B2B_PRINT_IMAGES_SCRIPT = `<script>window.onload=async function(){
  async function compact(img){
    try {
      var response=await fetch(img.src,{signal:AbortSignal.timeout(12000)});
      if(!response.ok) throw new Error('image');
      var blob=await response.blob();
      var bitmap=await createImageBitmap(blob);
      var limit=img.classList.contains('logo')?480:160;
      var scale=Math.min(1,limit/Math.max(bitmap.width,bitmap.height));
      var canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(bitmap.width*scale));
      canvas.height=Math.max(1,Math.round(bitmap.height*scale));
      var ctx=canvas.getContext('2d');
      if(!ctx) throw new Error('canvas');
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
      img.src=canvas.toDataURL('image/jpeg',0.65);
      await img.decode();
    } catch(e){ img.removeAttribute('src'); }
  }
  var images=Array.from(document.images);
  for(var start=0;start<images.length;start+=4){
    await Promise.all(images.slice(start,start+4).map(compact));
  }
  document.documentElement.dataset.printReady='true';
  window.focus();window.print();
};<\/script>`;

const B2B_STYLE = `
  @page { size: letter; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1c1c1c; margin: 0; font-size: 12px; }
  header { display: flex; justify-content: space-between; border-bottom: 1px solid #ccc; padding-bottom: 12px; margin-bottom: 16px; }
  .brand { font-size: 12px; letter-spacing: .28em; text-transform: uppercase; }
  h1 { font-size: 20px; margin: 4px 0 2px; }
  h2 { font-size: 10px; letter-spacing: .18em; text-transform: uppercase; color: #888; margin: 0 0 6px; }
  .muted { color: #777; font-size: 11px; }
  .cols { display: flex; gap: 24px; margin-bottom: 18px; }
  .cols section { flex: 1; border: 1px solid #ddd; border-radius: 6px; padding: 10px 12px; }
  p { margin: 0 0 2px; line-height: 1.45; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ddd; padding: 6px 7px; }
  th { background: #f4f4f1; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; font-weight: 600; }
  .c { text-align: center; }
  .tot td { font-weight: 700; background: #f4f4f1; }
  .box { border: 1px solid #bbb; border-radius: 6px; padding: 10px 12px; min-height: 44px; }
  .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 16px; }
  .sign { display: flex; gap: 40px; margin-top: 56px; }
  .sign div { flex: 1; border-top: 1px solid #999; padding-top: 6px; font-size: 11px; }
  .big { font-size: 22px; font-weight: 700; }
`;

function openPrint(html: string) {
  const win = window.open("", "_blank", "width=900,height=1000");
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  return true;
}

function b2bHeader(order: any, title: string) {
  const date = new Date(order.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  return `<header><div><div class="brand">Tu Marca</div><h1>${esc(title)}</h1>
    <div class="muted">Pedido #${esc(order.number)} · ${esc(date)} · ${order.currency === "USD" ? "USD · Internacional" : "COP · Nacional"}${order.b2b_mode === "consignment" ? " · Consignación" : ""}</div></div>
    <div class="muted" style="text-align:right">Impreso ${esc(new Date().toLocaleString("es-CO"))}</div></header>`;
}

function customerBlock(order: any) {
  const ship = (order.ship_to ?? {}) as Record<string, any>;
  const lines = addressLines(ship);
  return `<section><h2>Cliente mayorista</h2>
    <p><strong>${esc(order.company_name ?? order.contact_name ?? ship.name ?? "—")}</strong></p>
    ${order.company_name && order.contact_name ? `<p>${esc(order.contact_name)}</p>` : ""}
    <p>${esc(order.contact_phone ?? ship.phone ?? "")}</p><p>${esc(order.contact_email ?? "")}</p>${(ship.country || order.buyer_country) ? `<p>País: ${esc(ship.country ?? order.buyer_country)}</p>` : ""}</section>
    <section><h2>Dirección de entrega</h2>${lines.map((l) => `<p>${l}</p>`).join("") || "<p>Por confirmar</p>"}</section>`;
}

const B2B_DOCUMENT_STYLE = `
  @page { size: letter; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #202820; margin: 0; font-size: 10px; }
  .top { display: flex; justify-content: space-between; align-items: start; gap: 18px; padding-bottom: 10px; border-bottom: 1px solid #cad0ca; }
  .logo { width: 162px; height: auto; max-height: 55px; object-fit: contain; object-position: left center; }
  .heading { text-align: right; line-height: 1.6; }
  h1 { font-size: 14px; margin: 0; font-weight: 700; color: #344a39; }
  .details { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); gap: 18px; margin: 14px 0 20px; }
  .detail-row { display: grid; grid-template-columns: 94px minmax(0, 1fr); gap: 8px; margin: 0 0 7px; line-height: 1.4; }
  .detail-row span { color: #5e665e; }
  .detail-row strong { font-weight: 600; overflow-wrap: anywhere; }
  .seller { padding-left: 15px; border-left: 1px solid #cad0ca; }
  .seller p { margin: 0 0 7px; line-height: 1.4; }
  .seller strong { display: inline-block; min-width: 54px; }
  .meta { display: flex; justify-content: space-between; gap: 10px; font-weight: 700; padding: 5px 7px; border: 1px solid #859287; border-bottom: 0; background: #eef2ed; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; font-size: 8.5px; }
  th, td { border: 1px solid #a3afa4; padding: 5px 3px; vertical-align: middle; overflow-wrap: anywhere; }
  th { background: #edf1ec; font-size: 7.5px; text-transform: uppercase; font-weight: 700; }
  td { background: #fff; }
  .ref { width: 15%; } .type { width: 7%; } .color { width: 9%; } .hs { width: 9%; }
  .size { width: 4%; white-space: nowrap; } .qty { width: 5%; } .price { width: 9%; }
  .pic { width: 46px; }
  img:not([src]) { visibility: hidden; }
  .center { text-align: center; } .right { text-align: right; white-space: nowrap; }
  tr.total td { background: #edf1ec; font-weight: 700; }
  tr { break-inside: avoid; }
  .summary { margin-left: auto; width: min(270px, 55%); margin-top: 0; }
  .summary div { display: flex; justify-content: space-between; gap: 8px; padding: 6px 7px; border: 1px solid #a3afa4; border-top: 0; }
  .summary .grand { background: #edf1ec; font-weight: 700; font-size: 11px; }
  .foot { margin-top: 18px; font-size: 9px; color: #5e665e; line-height: 1.5; }
  @media print { .top, .details, .meta, thead, .summary { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
`;

function b2bDocument(order: any, packing: boolean, showMoney = true, delivery = false, withPhotos = true) {
  const items = (order.order_items ?? []) as any[];
  const isUSD = order.currency === "USD";
  const subtotalCop = Number(order.subtotal_cop ?? 0);
  const totalUSD = Number(order.total_usd ?? 0);
  // Los artículos guardan su precio histórico en COP; los pedidos USD guardan el total cobrado en USD.
  const usdFactor = subtotalCop > 0 && totalUSD > 0 ? totalUSD / subtotalCop : 0;
  const money = (n: number) => isUSD
    ? formatUSD(n)
    : new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(n);

  const groups = groupB2BPrintItems(items);
  const used = new Set<string>();
  for (const g of groups) {
    Object.keys(g.sizes).forEach((s) => used.add(s));
    const pv = items.find((it) => (it.product_variants?.products?.name ?? it.product_name ?? "—") === g.ref && (it.product_variants?.color ?? "—") === g.color)?.product_variants;
    const retail = isUSD ? pv?.price_usd : pv?.price_cop;
    g.retail = retail == null ? null : Number(retail);
  }
  const sizes = [...used].sort(compareSizes);
  if (!sizes.length) sizes.push("XS", "S", "M", "L");
  const colTot: Record<string, number> = {};
  let grand = 0;
  let linesTotal = 0;
  const rows = groups.sort((a, b) => a.ref.localeCompare(b.ref, "es", { sensitivity: "base", numeric: true }) || a.color.localeCompare(b.color, "es")).map((g) => {
    const t = Object.values(g.sizes).reduce((a, b) => a + b, 0);
    grand += t;
    const lineAmount = isUSD ? Math.round(g.amountCop * usdFactor * 100) / 100 : g.amountCop;
    linesTotal += lineAmount;
    return `<tr>${withPhotos ? `<td class="pic">${g.img ? `<img src="${esc(g.img)}" alt="" style="width:40px;height:50px;object-fit:cover;border-radius:4px;display:block" />` : ""}</td>` : ""}<td>${esc(g.ref)}</td><td>${esc(g.type)}</td><td>${esc(g.color)}</td><td>${esc(g.hs || "—")}</td>
      ${sizes.map((s) => { colTot[s] = (colTot[s] ?? 0) + (g.sizes[s] ?? 0); return `<td class="center">${g.sizes[s] || ""}</td>`; }).join("")}
      <td class="center"><strong>${t}</strong></td>${showMoney ? `<td class="right">${g.retail == null ? "—" : esc(money(g.retail))}</td>
      <td class="right">${t ? esc(money(lineAmount / t)) : "—"}</td><td class="right">${esc(money(lineAmount))}</td>` : ""}</tr>`;
  }).join("");
  const ship = (order.ship_to ?? {}) as Record<string, any>;
  const addr = [ship.line1 ?? ship.address ?? ship.street, ship.line2 ?? ship.address2,
    [ship.city, ship.department ?? ship.state ?? ship.province].filter(Boolean).join(", "),
    ship.country ?? order.buyer_country, ship.postal_code ?? ship.zip].filter(Boolean).join(" · ");
  const row = (label: string, value: unknown) => value ? `<div class="detail-row"><span>${label}</span><strong>${esc(value)}</strong></div>` : "";
  const title = delivery ? "REMISIÓN" : packing ? "LISTA DE EMPAQUE" : "PEDIDO MAYORISTA";
  const date = new Date(order.created_at).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
  const finalTotal = isUSD ? totalUSD : Number(order.total_cop ?? linesTotal);
  const shippingCop = Number(order.shipping_cop ?? 0);
  const discountCop = Number(order.discount_cop ?? 0);
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${title} ${esc(order.number)}</title>
    <style>${B2B_DOCUMENT_STYLE}</style></head><body>
    <div class="top"><img class="logo" src="${esc(logoAsset)}" alt="Tu Marca" />
      <div class="heading"><h1>${title} N.º ${esc(order.number)}</h1><div>Fecha: ${esc(date)}</div><div>Moneda: ${isUSD ? "USD" : "COP"}</div></div></div>
    <div class="details"><div>
      ${row("Cliente", order.company_name ?? order.contact_name ?? ship.recipient ?? ship.name ?? "—")}
      ${row("Documento", order.customer_document_id)}
      ${row("Dirección de envío", addr || "Por confirmar")}
      ${row("Teléfono", order.contact_phone ?? ship.phone)}
      ${row("Contacto", order.company_name ? order.contact_name : ship.recipient)}
      ${row("Correo", order.contact_email ?? ship.email)}
    </div><div class="seller"><p><strong>Debe a:</strong> ${esc(BRAND.legalName)}</p><p><strong>NIT:</strong> ${esc(BRAND.nit)}</p>
    ${showMoney ? `<p><strong>Valor:</strong> ${esc(money(finalTotal))}</p>` : ""}</div></div>
    <div class="meta"><span>Caja(s): ______</span><span>Fecha de preparación: __________</span></div>
    <table><thead><tr>${withPhotos ? '<th class="pic"></th>' : ""}<th class="ref">Referencia</th><th class="type">Tipo</th><th class="color">Color / estampado</th><th class="hs">Código HS</th>
      ${sizes.map((s) => `<th class="size center">${esc(displaySize(s))}</th>`).join("")}
      <th class="qty center">Und.</th>${showMoney ? '<th class="price right">Precio público</th><th class="price right">Precio mayorista</th><th class="price right">Total</th>' : ""}</tr></thead>
       <tbody>${rows}<tr class="total"><td colspan="${withPhotos ? 5 : 4}">Total prendas</td>${sizes.map((s) => `<td class="center">${colTot[s] ?? 0}</td>`).join("")}
      <td class="center">${grand}</td>${showMoney ? `<td></td><td></td><td class="right">${esc(money(linesTotal))}</td>` : ""}</tr></tbody></table>
    ${showMoney ? `<div class="summary">${!isUSD && shippingCop ? `<div><span>Envío</span><span>${esc(money(shippingCop))}</span></div>` : ""}
      ${!isUSD && discountCop ? `<div><span>Descuento</span><span>− ${esc(money(discountCop))}</span></div>` : ""}
      <div class="grand"><span>TOTAL</span><span>${esc(money(finalTotal))}</span></div></div>` : ""}
    ${order.notes ? `<p class="foot"><strong>Notas:</strong> ${esc(order.notes)}</p>` : ""}
    ${showMoney ? '<p class="foot">Precio mayorista unitario promedio cuando las tallas tienen precios distintos. Los totales conservan los valores del pedido.</p>' : ""}
    ${showMoney && isUSD ? '<p class="foot">Los precios mayoristas por referencia en USD son estimados según los precios en COP guardados en el pedido. El total en USD es el valor definitivo; el desglose de envío o comisiones en USD no se guarda por separado.</p>' : ""}
    ${delivery ? '<p class="foot" style="margin-top:40px">Recibido por (nombre y firma): ____________________________________</p>' : ""}
    ${B2B_PRINT_IMAGES_SCRIPT}</body></html>`;
  return openPrint(html);
}

/** Pedido y lista de empaque B2B comparten el formato del documento comercial. */
export function printB2BPackingList(order: any, withPrices = true, withPhotos = true) { return b2bDocument(order, true, withPrices, false, withPhotos); }
export function printB2BOrder(order: any, withPrices = true) { return b2bDocument(order, false, withPrices); }

/** Guía de despacho B2B: remitente, destinatario, bultos y transportadora. */
export function printB2BDispatchGuide(order: any) {
  const total = ((order.order_items ?? []) as any[]).reduce((a, i) => a + (i.qty ?? 0), 0);
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Guía de despacho ${esc(order.number)}</title>
    <style>${B2B_STYLE}</style></head><body>
    ${b2bHeader(order, "Guía de despacho")}
    <div class="cols"><section><h2>Remitente</h2><p><strong>Tu Marca · Bodega Central</strong></p>
      <p>${esc(BRAND.warehouseAddress)}</p></section></div>
    <div class="cols">${customerBlock(order)}</div>
    <div class="grid">
      <div class="box"><h2>Total prendas</h2><div class="big">${total}</div></div>
      <div class="box"><h2>Número de bultos / cajas</h2></div>
      <div class="box"><h2>Peso total (kg)</h2></div>
      <div class="box"><h2>Transportadora</h2>${esc(order.carrier ?? "")}</div>
      <div class="box"><h2>Número de guía</h2>${esc(order.tracking ?? "")}</div>
      <div class="box"><h2>Fecha de despacho</h2>${esc(new Date().toLocaleDateString("es-CO"))}</div>
    </div>
    <div class="sign"><div>Entregado por (nombre y firma)</div><div>Transportadora (nombre y firma)</div><div>Recibido por (nombre, firma y fecha)</div></div>
    <script>window.onload=function(){window.focus();window.print();};<\/script></body></html>`;
  return openPrint(html);
}

/** Guía de una caja B2B: transportadora y número de guía para imprimir cuando no hay PDF de etiqueta. */
export function printB2BBoxGuide(order: any, box: any) {
  const unit = box?.package_type === "paquete" ? "Paquete" : "Caja";
  const dims = box?.length_cm ? `${box.length_cm} × ${box.width_cm} × ${box.height_cm} cm` : "—";
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Guía ${esc(order.number)} · ${unit} ${esc(box.box_number)}</title>
    <style>${B2B_STYLE}</style></head><body>
    ${b2bHeader(order, `Guía de envío · ${unit} ${esc(box.box_number)}`)}
    <div class="cols">${customerBlock(order)}</div>
    <div class="grid">
      <div class="box"><h2>Transportadora</h2>${esc(box.carrier ?? "")}</div>
      <div class="box"><h2>Número de guía</h2><div class="big">${esc(box.tracking ?? "")}</div></div>
      <div class="box"><h2>Bulto</h2><div class="big">${unit} ${esc(box.box_number)}</div></div>
      <div class="box"><h2>Peso (kg)</h2>${box.weight_kg ?? "—"}</div>
      <div class="box"><h2>Medidas</h2>${esc(dims)}</div>
      <div class="box"><h2>Fecha de despacho</h2>${esc(new Date().toLocaleDateString("es-CO"))}</div>
    </div>
    <div class="sign"><div>Entregado por (nombre y firma)</div><div>Transportadora (nombre y firma)</div><div>Recibido por (nombre, firma y fecha)</div></div>
    <script>window.onload=function(){window.focus();window.print();};<\/script></body></html>`;
  return openPrint(html);
}
