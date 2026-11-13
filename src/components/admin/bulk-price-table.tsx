import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { fillPriceRange, normalizePriceInput, type PriceColumn, type PriceRows } from "@/lib/bulk-price-fill";

type Product = { id: string; name: string; hero_image_url?: string | null };
type Fill = { source: number; target: number; column: PriceColumn };

export function BulkPriceTable({ products, rows, setRows, disabled }: { products: Product[]; rows: PriceRows; setRows: Dispatch<SetStateAction<PriceRows>>; disabled: boolean }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<Fill | null>(null);
  const [fill, setFill] = useState<Fill | null>(null);
  const ids = products.map((product) => product.id);

  useEffect(() => {
    if (!fill) return;
    let pointer: { x: number; y: number } | null = null;
    let frame = 0;
    const updateTarget = () => {
      if (!pointer || !dragRef.current) return;
      const cell = document.elementFromPoint(pointer.x, pointer.y)?.closest<HTMLElement>("[data-price-row]");
      if (!cell || !scrollRef.current?.contains(cell)) return;
      const target = Number(cell.dataset.priceRow);
      if (target !== dragRef.current.target) {
        dragRef.current = { ...dragRef.current, target };
        setFill(dragRef.current);
      }
    };
    const tick = () => {
      const container = scrollRef.current;
      if (pointer && container) {
        const bounds = container.getBoundingClientRect();
        if (pointer.y < bounds.top + 35) container.scrollTop -= 8;
        else if (pointer.y > bounds.bottom - 35) container.scrollTop += 8;
        updateTarget();
      }
      frame = requestAnimationFrame(tick);
    };
    const move = (event: PointerEvent) => { event.preventDefault(); pointer = { x: event.clientX, y: event.clientY }; updateTarget(); };
    const finish = () => {
      const active = dragRef.current;
      if (active) setRows((current) => fillPriceRange(current, products.map((product) => product.id), active.source, active.target, active.column));
      dragRef.current = null;
      setFill(null);
    };
    const cancel = () => { dragRef.current = null; setFill(null); };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel(); } };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key, true);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key, true);
    };
  }, [Boolean(fill), products, setRows]);

  return <div ref={scrollRef} className={`mt-5 min-h-0 overflow-y-auto -mx-1 px-1 ${fill ? "select-none cursor-crosshair" : ""}`}>
    <table className="w-full min-w-[760px] table-fixed text-[13px]">
      <thead><tr className="text-[10px] uppercase tracking-widest text-moss/70 text-left">
        <th className="pb-2 font-normal w-[30%]">Producto</th>
        <th className="pb-2 font-normal">Precio COP</th>
        <th className="pb-2 font-normal">Comparación COP</th>
        <th className="pb-2 font-normal">Precio US$</th>
        <th className="pb-2 font-normal">Comparación US$</th>
      </tr></thead>
      <tbody>{products.map((product, index) => <tr key={product.id} data-price-row={index} className="border-t border-ink/5">
        <td className="py-2 pr-3"><div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-10 bg-cream overflow-hidden shrink-0">{product.hero_image_url && <img src={product.hero_image_url} alt="" className="w-full h-full object-cover" />}</div>
          <span className="truncate">{product.name}</span>
        </div></td>
        {(["price", "compare", "priceUsd", "compareUsd"] as const).map((column) => {
          const selected = fill?.column === column && index >= Math.min(fill.source, fill.target) && index <= Math.max(fill.source, fill.target);
          const value = selected ? rows[ids[fill.source]]?.[column] ?? "" : rows[product.id]?.[column] ?? "";
          const usd = column === "priceUsd" || column === "compareUsd";
          const label = { price: "Precio COP", compare: "Comparación COP", priceUsd: "Precio US$", compareUsd: "Comparación US$" }[column];
          return <td key={column} className="py-2 pr-2">
            <div className="group relative">
              {usd && <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-moss/70">US$</span>}
              <input aria-label={`${label} de ${product.name}`} value={value} disabled={disabled || Boolean(fill)}
                onChange={(event) => setRows((current) => ({ ...current, [product.id]: { ...current[product.id], [column]: normalizePriceInput(event.target.value, usd) } }))}
                inputMode={usd ? "decimal" : "numeric"} placeholder={column === "price" ? "180000" : column === "priceUsd" ? "72.00" : "Opcional"}
                className={`w-full min-w-0 pr-2 ${usd ? "pl-9" : "pl-3"} py-2 rounded-xl bg-background border text-sm focus:outline-none focus:border-ink/40 ${selected ? "border-moss bg-moss/10 ring-1 ring-moss/30" : "border-ink/15"}`} />
              <Button type="button" variant="ghost" size="icon" disabled={disabled}
                aria-label={`Extender ${label.toLowerCase()} de ${product.name}`} title="Arrastrar para copiar el valor"
                className="absolute -bottom-2 -right-1 z-10 size-5 touch-none cursor-crosshair rounded-none p-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  dragRef.current = { source: index, target: index, column };
                  setFill(dragRef.current);
                }}
                onKeyDown={(event) => {
                  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
                  event.preventDefault();
                  setRows((current) => fillPriceRange(current, ids, index, index + (event.key === "ArrowDown" ? 1 : -1), column));
                }}><span className="size-2 rounded-full border border-background bg-moss" /></Button>
            </div>
          </td>;
        })}
      </tr>)}</tbody>
    </table>
  </div>;
}