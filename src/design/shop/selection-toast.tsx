import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check } from "lucide-react";
import { CART_ADDED_EVENT, type CartItem } from "@/lib/cart";

export function SelectionToast({ onOpenSelection }: { onOpenSelection: () => void }) {
  const [item, setItem] = useState<CartItem | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const onAdd = (e: Event) => {
      setItem((e as CustomEvent<CartItem>).detail);
      clearTimeout(timer);
      timer = setTimeout(() => setItem(null), 4500);
    };
    window.addEventListener(CART_ADDED_EVENT, onAdd as EventListener);
    return () => {
      window.removeEventListener(CART_ADDED_EVENT, onAdd as EventListener);
      clearTimeout(timer);
    };
  }, []);

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          initial={{ x: 40, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 40, opacity: 0 }}
          transition={{ type: "spring", stiffness: 320, damping: 32 }}
          className="fixed right-4 top-20 z-[60] w-[19rem] max-w-[calc(100vw-2rem)] border border-ink/10 bg-ivory p-4 shadow-[0_18px_50px_-30px_rgba(0,0,0,0.5)]"
        >
          <div className="flex gap-3">
            {item.imageUrl && (
              <div className="h-16 w-12 shrink-0 overflow-hidden bg-cream">
                <img src={item.imageUrl} alt={item.productName} className="h-full w-full object-cover" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] text-moss">
                <Check className="size-3" strokeWidth={2} /> Añadido a tu selección
              </p>
              <p className="mt-1.5 truncate font-serif text-base italic leading-tight">{item.productName}</p>
              <p className="text-[10px] uppercase tracking-[0.14em] text-moss">{item.variantLabel}</p>
              <button
                onClick={() => {
                  setItem(null);
                  onOpenSelection();
                }}
                className="mt-3 text-[10px] uppercase tracking-[0.18em] text-ink underline underline-offset-4"
              >
                Ver selección
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
