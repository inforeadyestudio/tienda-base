import { Link } from "@tanstack/react-router";
import { ChevronRight, ShoppingBag } from "lucide-react";
import { openB2BCart, useB2BCart } from "@/lib/b2b/cart";
import { useB2BSettings } from "@/lib/b2b/portal";

export function B2BTopBar() {
  const items = useB2BCart();
  const { data: settings } = useB2BSettings();
  const units = items.reduce((s, i) => s + i.qty, 0);
  const slide = (settings?.slides ?? []).find((s) => s.active);

  return (
    <div className="min-h-14 border-b border-ink/8 px-4 md:px-6 py-2 flex items-center gap-3 bg-[#f5f0e6] sticky top-0 z-30">
      <div className="flex-1 min-w-0 flex items-center justify-center gap-2 md:gap-4 text-[10px] md:text-[11px] tracking-[0.16em]">
        <span className="text-ink/60 hidden sm:inline">{slide ? slide.eyebrow || "NUEVA COLECCIÓN DISPONIBLE" : "PORTAL MAYORISTA"}</span>
        {slide && (
          <Link to="/b2b/colecciones" className="text-ink font-medium flex items-center gap-1 truncate">
            {slide.title} <ChevronRight className="size-3.5 text-ink/50 hidden sm:inline" />
          </Link>
        )}
      </div>
      <button onClick={openB2BCart} className="relative text-ink/70 hover:text-ink shrink-0" aria-label="Ver pedido">
        <ShoppingBag className="size-4" />
        {units > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-[#c85a3a] text-ivory text-[9px] rounded-full size-4 flex items-center justify-center">{units}</span>
        )}
      </button>
    </div>
  );
}
