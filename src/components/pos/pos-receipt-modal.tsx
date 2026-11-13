import { useEffect, useState } from "react";
import { Printer, X, Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { resendOrderBilling } from "@/lib/rcount.functions";
import { BRAND } from "@/config/brand";

export type PosReceiptSale = {
  orderId: string;
  number: string;
  createdAt: string;
  method: string;
  customerName: string;
  customerDoc?: string | null;
  customerPhone?: string | null;
  storeCode?: string | null;
  lines: { name: string; label: string; qty: number; price: number }[];
  total: number;
  received: number;
};

export type Invoice = { number: string | null; cufe: string | null; issued_at: string | null; status: string; error: string | null };

// Direcciones de las tiendas por código de sede (aparecen en el recibo).
const STORE_ADDRESS: Record<string, string> = {
  cali: "Dirección de la tienda Cali",
  bogota: "Dirección de la tienda Bogotá",
};
const COMPANY = {
  name: BRAND.legalName.toUpperCase(),
  nit: BRAND.nit,
  phone: BRAND.phone,
  email: BRAND.accountingEmail,
  regime: "Responsable de IVA",
};
const storeAddress = (code?: string | null) => STORE_ADDRESS[code ?? ""] ?? STORE_ADDRESS.bogota;
const DIAN_URL = "https://catalogo-vpfe.dian.gov.co/User/SearchDocument?DocumentKey=";
const IVA = 0.19;

const money = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");
const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
const fmtDate = (iso: string) => new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "2-digit", year: "numeric", hour: "numeric", minute: "2-digit" });

export async function printPosReceipt(sale: PosReceiptSale, inv: Invoice | null) {
  const win = window.open("", "_blank", "width=420,height=900");
  if (!win) return;
  win.document.write(await buildHtml(sale, inv));
  win.document.close();
}

async function buildHtml(sale: PosReceiptSale, inv: Invoice | null) {
  const base = sale.total / (1 + IVA);
  const tax = sale.total - base;
  // Browser build only: the Node build pulls fs/pngjs and breaks the edge server at startup.
  const qr = inv?.cufe
    ? await (await import("qrcode/lib/browser")).toDataURL(DIAN_URL + inv.cufe, { margin: 0, width: 360 })
    : null;
  const units = sale.lines.reduce((a, l) => a + l.qty, 0);
  const rows = sale.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.name)}${l.label ? " / " + esc(l.label) : ""}<div class="m">(Unidad)</div></td><td class="c">${l.qty}</td><td class="r">${Math.round(l.price * l.qty).toLocaleString("es-CO")}</td><td class="c">D</td></tr>`).join("");
  const issued = inv?.issued_at ? fmtDate(inv.issued_at) : fmtDate(sale.createdAt);
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Factura ${esc(inv?.number ?? sale.number)}</title><style>
@page{size:85mm auto;margin:3mm}*{box-sizing:border-box}body{width:79mm;margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000;text-align:center}
h1{font-size:15px;margin:4px 0}h2{font-size:15px;margin:10px 0 4px}h3{font-size:13px;margin:10px 0 4px}p{margin:2px 0;line-height:1.35}b{font-weight:700}
table{width:100%;border-collapse:collapse;text-align:left}.items{border-top:1.5px solid #000;border-bottom:1.5px solid #000;margin:8px 0}.items td{padding:5px 2px;vertical-align:top;font-size:10px}
.m{font-size:9px}.c{text-align:center}.r{text-align:right}.tot{text-align:right;font-size:13px}.tot p{margin:3px 0}.big{font-size:15px;font-weight:700}
.tax th{font-size:10px;border-bottom:1.5px dashed #000;padding:3px}.tax td{padding:4px 3px;font-size:10px;text-align:right}.tax td:first-child{text-align:center}
.left{text-align:left;margin-top:8px}.line{border-top:1.5px solid #000;margin:8px 0}.cufe{word-break:break-all;font-size:9.5px}img{width:48mm;height:48mm;margin:8px auto 4px;display:block}
</style></head><body>
<h1>${COMPANY.name}</h1><p>${COMPANY.name}</p><p>NIT ${COMPANY.nit}</p><p>${esc(storeAddress(sale.storeCode))}</p>
<p><b>Teléfono:</b> ${COMPANY.phone}</p><p>${COMPANY.email}</p><p><b>Régimen:</b> ${COMPANY.regime}</p><br>
${inv?.cufe ? `<p><b>Factura electrónica de venta</b></p><p><b>N° ${esc(inv?.number ?? "")}</b></p>` : `<p><b>Comprobante de venta · Preventa</b></p><p>La factura electrónica se emitirá cuando la DIAN esté disponible.</p>`}
<p><b>Fecha de emisión:</b> ${issued}</p><p><b>Forma de pago:</b> Contado</p><p><b>Método de pago:</b> ${esc(sale.method)}</p>
<p><b>Vencimiento:</b> ${new Date(sale.createdAt).toLocaleDateString("es-CO")}</p><p>Pedido ${esc(sale.number)}</p>
<h2>${esc(sale.customerName)}</h2>${sale.customerPhone ? `<p><b>Teléfono:</b> ${esc(sale.customerPhone)}</p>` : ""}${sale.customerDoc ? `<p>${esc(sale.customerDoc)}</p>` : ""}
<table class="items">${rows}</table>
<div class="tot"><p><b>Subtotal:</b> <b>${money(base)}</b></p><p>Total IVA (19%): ${money(tax)}</p><p class="big">Total: ${money(sale.total)}</p></div>
<h3>Resumen de impuestos</h3><table class="tax"><tr><th class="c">Tarifa</th><th class="r">Base</th><th class="r">Impuesto</th></tr>
<tr><td>D = IVA 19%</td><td>${money(base)}</td><td>${money(tax)}</td></tr><tr><td></td><td><b>${money(base)}</b></td><td><b>${money(tax)}</b></td></tr></table>
<div class="left"><p><b>Total recibido:</b> ${money(sale.received)}</p><p><b>Total de líneas:</b> ${sale.lines.length}</p><p><b>Total de productos:</b> ${units}</p></div>
<div class="line"></div>
${qr ? `<img src="${qr}" alt="QR DIAN"><p class="cufe"><b>CUFE</b> ${esc(inv?.cufe)}</p>` : ""}
<p><b>Generado:</b> ${fmtDate(sale.createdAt)}</p>${inv?.issued_at ? `<p><b>Validación DIAN:</b> ${fmtDate(inv.issued_at)}</p>` : ""}<br>
<p>Este documento se asimila en todos sus efectos a una letra de cambio de conformidad con el Art. 774 del código de comercio. Autorizo que en caso de incumplimiento de esta obligación sea reportado a las centrales de riesgo, se cobrarán intereses por mora.</p>
${inv?.cufe ? "<p>Representación impresa de la factura electrónica</p>" : "<p>Documento provisional, no válido como factura electrónica</p>"}
<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},250)};<\/script></body></html>`;
}

export type PosClosingReport = {
  storeName: string;
  storeCode?: string | null;
  sellerName: string;
  openedAt?: string | null;
  sales: { time: string; number: string; invoice: string | null; method: string; amount: number }[];
  byMethod: { label: string; amount: number; count: number }[];
  total: number;
  openingCash: number;
  cashIn: number;
  cashOut: number;
  expectedCash: number;
  counted: number | null;
  creditNotes?: { time: string; number: string; invoice: string | null; amount: number }[];
};

export function printPosClosing(r: PosClosingReport) {
  const win = window.open("", "_blank", "width=420,height=900");
  if (!win) return;
  const t = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
  const rows = r.sales.map((s) => `<tr><td>${t(s.time)}</td><td>${esc(s.invoice ?? s.number)}</td><td>${esc(s.method)}</td><td class="r">${money(s.amount)}</td></tr>`).join("");
  const methods = r.byMethod.map((m) => `<tr><td>${esc(m.label)} (${m.count})</td><td class="r">${money(m.amount)}</td></tr>`).join("");
  const diff = r.counted == null ? null : r.counted - r.expectedCash;
  const notes = r.creditNotes ?? [];
  const notesTotal = notes.reduce((a, n) => a + n.amount, 0);
  const noteRows = notes.map((n) => `<tr><td>${t(n.time)}</td><td>${esc(n.number)}</td><td>${esc(n.invoice ?? "")}</td><td class="r">-${money(n.amount)}</td></tr>`).join("");
  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Cierre de caja</title><style>
@page{size:85mm auto;margin:3mm}*{box-sizing:border-box}body{width:79mm;margin:0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#000}
h1{font-size:15px;margin:4px 0;text-align:center}h3{font-size:12px;margin:10px 0 4px;border-bottom:1.5px solid #000;padding-bottom:2px}p{margin:2px 0}.c{text-align:center}
table{width:100%;border-collapse:collapse}td{padding:2px 1px;font-size:10px;vertical-align:top}.r{text-align:right;white-space:nowrap}.b td{font-weight:700;font-size:12px;border-top:1.5px solid #000;padding-top:4px}
</style></head><body>
<h1>${COMPANY.name}</h1><p class="c">NIT ${COMPANY.nit}</p><p class="c">${esc(r.storeName)}</p><p class="c">${esc(storeAddress(r.storeCode))}</p>
<h1>CIERRE DE CAJA</h1>
<p><b>Vendedora:</b> ${esc(r.sellerName)}</p>${r.openedAt ? `<p><b>Apertura:</b> ${fmtDate(r.openedAt)}</p>` : ""}<p><b>Cierre:</b> ${fmtDate(new Date().toISOString())}</p>
<h3>Transacciones (${r.sales.length})</h3>
<table><tr><td><b>Hora</b></td><td><b>Factura</b></td><td><b>Medio</b></td><td class="r"><b>Valor</b></td></tr>${rows || `<tr><td colspan="4">Sin ventas</td></tr>`}</table>
<h3>Medios de pago</h3><table>${methods}<tr class="b"><td>Total ventas</td><td class="r">${money(r.total)}</td></tr></table>
${notes.length ? `<h3>Notas crédito (${notes.length})</h3><table><tr><td><b>Hora</b></td><td><b>Nota</b></td><td><b>Factura</b></td><td class="r"><b>Valor</b></td></tr>${noteRows}<tr class="b"><td colspan="3">Total notas crédito</td><td class="r">-${money(notesTotal)}</td></tr></table><table><tr class="b"><td>Venta neta</td><td class="r">${money(r.total - notesTotal)}</td></tr></table>` : ""}
<h3>Efectivo</h3><table>
<tr><td>Base inicial</td><td class="r">${money(r.openingCash)}</td></tr>
${r.cashIn ? `<tr><td>Entradas</td><td class="r">${money(r.cashIn)}</td></tr>` : ""}${r.cashOut ? `<tr><td>Salidas</td><td class="r">-${money(r.cashOut)}</td></tr>` : ""}
<tr><td>Efectivo esperado</td><td class="r">${money(r.expectedCash)}</td></tr>
${r.counted != null ? `<tr><td>Efectivo contado</td><td class="r">${money(r.counted)}</td></tr><tr class="b"><td>${diff === 0 ? "Cuadra" : diff! > 0 ? "Sobrante" : "Faltante"}</td><td class="r">${money(Math.abs(diff!))}</td></tr>` : ""}
</table><br><br><p class="c">______________________</p><p class="c">Firma</p>
<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},250)};<\/script></body></html>`);
  win.document.close();
}

export function PosReceiptModal({ sale, onClose }: { sale: PosReceiptSale; onClose: () => void }) {
  const [inv, setInv] = useState<Invoice | null>(null);
  const [waited, setWaited] = useState(0);
  const resend = useServerFn(resendOrderBilling);

  useEffect(() => {
    let alive = true;
    let tries = 0;
    let pushed = false;
    const tick = async () => {
      const { data } = await supabase.from("invoices").select("number, cufe, issued_at, status, error").eq("order_id", sale.orderId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (!alive) return;
      if (data) setInv(data as Invoice);
      tries++;
      setWaited(tries);
      const d = data as any;
      if (d?.status === "issued" && d?.cufe) return;
      if (d?.status === "error") return;
      // Empuja el envío de inmediato si sigue pendiente
      if (!pushed && tries >= 2) {
        pushed = true;
        resend({ data: { orderId: sale.orderId } }).catch(() => {});
      }
      // Rápido los primeros 15 s, luego sigue en segundo plano cada 10 s
      setTimeout(tick, tries < 10 ? 1500 : 10000);
    };
    tick();
    return () => { alive = false; };
  }, [sale.orderId]);

  const ready = inv?.status === "issued" && !!inv.cufe;
  const unavailable = !ready && inv?.status !== "error" && waited >= 10;
  const print = () => printPosReceipt(sale, ready ? inv : null);

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-ink/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-background p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Venta registrada</p>
            <h3 className="mt-1 text-2xl font-nm">Pedido {sale.number}</h3>
            <p className="text-sm text-muted-foreground">{money(sale.total)} · {sale.method}</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="rounded-full p-1 hover:bg-muted"><X className="h-5 w-5" /></button>
        </div>
        <div className="mt-5 rounded-xl border border-border p-4 text-sm">
          {ready ? (
            <div className="space-y-1">
              <p className="flex items-center gap-2 font-medium"><Check className="h-4 w-4 text-moss" /> Validada por la DIAN</p>
              <p>Factura N° <b>{inv!.number}</b></p>
              <p className="break-all text-xs text-muted-foreground">CUFE {inv!.cufe}</p>
            </div>
          ) : inv?.status === "error" ? (
            <p className="text-destructive">La factura fue rechazada: {inv.error ?? "sin detalle"}. Puedes imprimir el comprobante y reenviarla desde el pedido.</p>
          ) : unavailable ? (
            <div className="space-y-1">
              <p className="font-medium">DIAN no disponible por el momento</p>
              <p className="text-xs text-muted-foreground">Puedes imprimir un comprobante de preventa sin CUFE. La factura se emitirá sola y, cuando llegue, aquí verás el número y el CUFE para imprimirla.</p>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Enviando a la DIAN y esperando número y CUFE…</p>
          )}
        </div>
        <button onClick={print} className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-ink py-3 text-sm text-ivory hover:bg-ink/90">
          <Printer className="h-4 w-4" /> {ready ? "Imprimir factura 85 mm" : unavailable ? "Imprimir comprobante de preventa" : "Imprimir factura 85 mm"}
        </button>
        <button onClick={onClose} className="mt-2 w-full rounded-full py-2 text-sm text-muted-foreground hover:text-ink">Nueva venta</button>
      </div>
    </div>
  );
}
