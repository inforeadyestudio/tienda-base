import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

export type LabelItem = {
  code: string;
  name: string;
  variant?: string | null;
  price?: number | null;
  copies?: number;
};

export function Barcode({
  value,
  height = 48,
  width = 1.6,
  displayValue = true,
  className,
}: {
  value: string;
  height?: number;
  width?: number;
  displayValue?: boolean;
  className?: string;
}) {
  const ref = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: "CODE128",
        height,
        width,
        displayValue,
        fontSize: 11,
        fontOptions: "bold",
        margin: 4,
        lineColor: "#1a1a1a",
        background: "transparent",
      });
    } catch {
      /* código inválido */
    }
  }, [value, height, width, displayValue]);

  return <svg ref={ref} className={className} />;
}

function svgFor(value: string) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(el, value, {
      format: "CODE128",
      height: 46,
      width: 1.5,
      displayValue: true,
      fontSize: 11,
      fontOptions: "bold",
      margin: 2,
    });
  } catch {
    return "";
  }
  return new XMLSerializer().serializeToString(el);
}

const money = (n: number) => "$" + n.toLocaleString("es-CO");

/** Abre una hoja imprimible con etiquetas de código de barras. */
export function printLabels(items: LabelItem[]) {
  const cells: string[] = [];
  items.forEach((it) => {
    const svg = svgFor(it.code);
    if (!svg) return;
    for (let i = 0; i < Math.max(1, it.copies ?? 1); i++) {
      cells.push(`
        <div class="label">
          <div class="name">${escapeHtml(it.name)}</div>
          <div class="variant">${escapeHtml(it.variant ?? "")}</div>
          ${svg}
          <div class="price">${it.price ? money(it.price) : ""}</div>
        </div>`);
    }
  });
  if (cells.length === 0) return;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.write(`<!doctype html><html><head><meta charset="utf-8" /><title>Etiquetas</title>
  <style>
    @page { margin: 8mm; }
    body { font-family: ui-sans-serif, system-ui, sans-serif; margin: 0; }
    .sheet { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6mm; }
    .label { border: 1px dashed #ddd; padding: 4px 6px; text-align: center; break-inside: avoid; }
    .name { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
    .variant { font-size: 8px; color: #666; margin-bottom: 2px; }
    .price { font-size: 10px; font-weight: 700; }
    svg { width: 100%; height: auto; }
  </style></head><body><div class="sheet">${cells.join("")}</div>
  <script>window.onload = () => { window.focus(); window.print(); };<\/script>
  </body></html>`);
  win.document.close();
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
