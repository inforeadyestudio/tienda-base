import { useMemo, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function GeoSelect({
  label, value, options, error, placeholder = "Selecciona", disabled, onChange,
}: {
  label: string;
  value: string;
  options: string[];
  error?: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const term = normalize(query.trim());
    if (!term) return options;
    return options.filter((option) => normalize(option).includes(term));
  }, [options, query]);

  return (
    <div className="block">
      <span className="mb-1.5 block text-[11px] text-moss">{label}</span>
      <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(""); }}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-md border bg-transparent px-3 py-3 text-left text-sm outline-none focus:border-ink disabled:opacity-50",
              error ? "border-destructive" : "border-ink/15",
            )}
          >
            <span className={cn("truncate", !value && "text-moss")}>{value || placeholder}</span>
            <ChevronDown className="size-4 shrink-0 text-moss" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="z-[95] w-[--radix-popover-trigger-width] p-0">
          <div className="flex items-center gap-2 border-b border-ink/10 px-3 py-2">
            <Search className="size-3.5 text-moss" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar…"
               className="w-full bg-transparent text-base outline-none sm:text-sm"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && <p className="px-3 py-3 text-xs text-moss">Sin resultados</p>}
            {filtered.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => { onChange(option); setOpen(false); setQuery(""); }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-cream"
              >
                <span className="truncate">{option}</span>
                {option === value && <Check className="size-3.5 shrink-0" />}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {error && <span className="mt-1 block text-[11px] text-destructive">{error}</span>}
    </div>
  );
}
