import { supabase } from "@/integrations/supabase/client";

export type GuideSettings = {
  warehouse_name: string;
  warehouse_address: string;
  warehouse_city: string;
  warehouse_phone: string;
  rules: string[];
};

export const DEFAULT_GUIDE: GuideSettings = {
  warehouse_name: "Tu Marca · Bodega Central",
  warehouse_address: "Dirección de la bodega",
  warehouse_city: "Ciudad, Departamento",
  warehouse_phone: "",
  rules: [
    "Tienes 5 días hábiles desde la aprobación para enviar la prenda.",
    "La prenda debe estar sin uso, sin lavar, con etiquetas y en su empaque original.",
    "Empaca la prenda junto con esta guía impresa dentro del paquete.",
    "Envía por la transportadora de tu preferencia y guarda el número de guía.",
    "El cambio se despacha cuando recibamos y revisemos la prenda.",
  ],
};

export async function fetchGuideSettings(): Promise<GuideSettings> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "returns_guide").maybeSingle();
  const v = (data?.value ?? {}) as Partial<GuideSettings>;
  return {
    ...DEFAULT_GUIDE,
    ...v,
    rules: Array.isArray(v.rules) && v.rules.length > 0 ? v.rules : DEFAULT_GUIDE.rules,
  };
}

export type GuideData = {
  code: string;
  createdAt: string;
  kind: string;
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  items: { name: string; variant_label?: string | null; qty: number }[];
  desired: string;
};

const esc = (s: string) =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

export function buildGuideHtml(g: GuideData, s: GuideSettings) {
  const items = g.items
    .map((i) => `<li>${i.qty} × ${esc(i.name)}${i.variant_label ? ` · ${esc(i.variant_label)}` : ""}</li>`)
    .join("");
  const rules = s.rules.map((r) => `<li>${esc(r)}</li>`).join("");
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Guía de devolución ${esc(g.code)}</title>
<style>
 *{box-sizing:border-box} body{font-family:Georgia,'Times New Roman',serif;color:#1c1a17;margin:0;padding:32px;background:#f9f4e6}
 .sheet{max-width:720px;margin:0 auto;background:#fff;border:1px solid #ddd6c4;padding:32px}
 h1{font-size:20px;letter-spacing:.18em;text-transform:uppercase;margin:0 0 4px}
 .muted{color:#6b6a5e;font-size:12px}
 .grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin:24px 0}
 .box{border:1px solid #e3ddcc;padding:16px}
 .label{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#8a8676;margin:0 0 6px}
 p{margin:2px 0;font-size:13px} ul{margin:6px 0 0 16px;padding:0;font-size:13px} li{margin:3px 0}
 .code{font-family:monospace;font-size:22px;letter-spacing:.12em;border:1px dashed #1c1a17;padding:10px 14px;display:inline-block;margin-top:8px}
 @media print{body{background:#fff;padding:0}.sheet{border:none}}
</style></head><body><div class="sheet">
 <h1>Guía de devolución</h1>
 <p class="muted">${esc(g.kind === "cambio" ? "Cambio de talla / producto" : g.kind === "puntos" ? "Devolución en Puntos Tu Marca" : "Devolución de dinero")} · Pedido ${esc(g.orderNumber)} · ${esc(g.createdAt)}</p>
 <div class="code">${esc(g.code)}</div>
 <div class="grid">
  <div class="box"><p class="label">Enviar a</p>
   <p><strong>${esc(s.warehouse_name)}</strong></p>
   <p>${esc(s.warehouse_address)}</p>
   <p>${esc(s.warehouse_city)}</p>
   ${s.warehouse_phone ? `<p>Tel. ${esc(s.warehouse_phone)}</p>` : ""}
  </div>
  <div class="box"><p class="label">Remitente</p>
   <p><strong>${esc(g.customerName || "—")}</strong></p>
   ${g.customerAddress ? `<p>${esc(g.customerAddress)}</p>` : ""}
   ${g.customerPhone ? `<p>Tel. ${esc(g.customerPhone)}</p>` : ""}
   ${g.customerEmail ? `<p>${esc(g.customerEmail)}</p>` : ""}
  </div>
 </div>
 <div class="box"><p class="label">Productos que devuelves</p><ul>${items || "<li>—</li>"}</ul>
  ${g.desired ? `<p style="margin-top:10px"><strong>Cambio solicitado:</strong> ${esc(g.desired)}</p>` : ""}
 </div>
 <div class="box" style="margin-top:20px"><p class="label">Reglas de la devolución</p><ul>${rules}</ul></div>
 <p class="muted" style="margin-top:20px">Imprime esta guía, pégala en el paquete e incluye una copia adentro.</p>
</div>
<script>window.onload=()=>setTimeout(()=>window.print(),300)</script>
</body></html>`;
}

export function printGuide(g: GuideData, s: GuideSettings) {
  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) return false;
  w.document.write(buildGuideHtml(g, s));
  w.document.close();
  return true;
}
