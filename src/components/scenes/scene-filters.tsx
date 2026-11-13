import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  allLabel: string;
  value: string | null;
  options: string[];
  onChange: (next: string | null) => void;
  format?: (option: string) => string;
};

/**
 * Filtro en menú desplegable: solo el rótulo con una línea debajo y una flecha
 * para abrir las opciones. Sin cajas ni botones rectangulares.
 */
export function SceneFilterSelect({ label, allLabel, value, options, onChange, format }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const show = (option: string) => (format ? format(option) : option);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={cn(
          "flex min-w-[8rem] items-center gap-2 border-b border-current/25 pb-1.5 text-left transition-colors hover:border-current/60",
          value && "border-current",
        )}
      >
        <span className="font-nm text-[10px] uppercase tracking-[0.2em] opacity-75">{label}</span>
        {value && <span className="truncate font-nm text-[11px]">{show(value)}</span>}
        <ChevronDown
          size={12}
          className={cn("ml-auto shrink-0 opacity-50 transition-transform duration-300", open && "rotate-180")}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            role="listbox"
            className="absolute left-0 top-full z-30 mt-2 max-h-64 min-w-full overflow-y-auto border border-current/15 py-1 shadow-xl"
            style={{
              background: "var(--page-custom-background, var(--background))",
              color: "var(--page-custom-foreground, var(--foreground))",
            }}
          >
            <button
              type="button"
              role="option"
              aria-selected={!value}
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left font-nm text-[11px] transition-colors hover:bg-current/10"
            >
              <span className={cn(!value ? "opacity-100" : "opacity-60")}>{allLabel}</span>
              {!value && <Check size={11} className="ml-auto" />}
            </button>
            {options.map((option) => {
              const active = value === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(option);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left font-nm text-[11px] opacity-70 transition-colors hover:bg-current/10 hover:opacity-100"
                >
                  <span>{show(option)}</span>
                  {active && <Check size={11} className="ml-auto" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
