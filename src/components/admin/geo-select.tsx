import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { COUNTRIES, citiesFor, countryFlag } from "@/lib/geo";

const inputClass =
  "mt-1 w-full px-4 py-3 rounded-2xl border border-ink/15 text-sm bg-white flex items-center justify-between gap-2 text-left";

function useClickOutside(onClose: () => void) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);
  return ref;
}

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  disabled?: boolean;
  /** Permite escribir un valor que no está en la lista */
  allowCustom?: boolean;
  renderOption?: (option: string) => React.ReactNode;
  renderValue?: (value: string) => React.ReactNode;
};

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = "Seleccionar",
  disabled,
  allowCustom = true,
  renderOption,
  renderValue,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useClickOutside(() => setOpen(false));

  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const filtered = query
    ? options.filter((o) => norm(o).includes(norm(query)))
    : options;
  const showCustom =
    allowCustom && query.trim() && !options.some((o) => norm(o) === norm(query.trim()));

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
        }}
        className={inputClass + " disabled:bg-ink/5 disabled:text-moss/60"}
      >
        <span className="truncate">
          {value ? (renderValue ? renderValue(value) : value) : <span className="text-moss/50">{placeholder}</span>}
        </span>
        <ChevronDown className="size-4 shrink-0 text-moss/60" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-2xl border border-ink/15 bg-white shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-ink/10">
            <Search className="size-4 text-moss/50 shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar…"
              className="w-full py-1 text-sm outline-none"
            />
          </div>
          <div className="max-h-56 overflow-y-auto">
            {filtered.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => {
                  onChange(o);
                  setOpen(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-ivory flex items-center justify-between gap-2"
              >
                <span className="truncate">{renderOption ? renderOption(o) : o}</span>
                {o === value && <Check className="size-4 text-moss shrink-0" />}
              </button>
            ))}
            {showCustom && (
              <button
                type="button"
                onClick={() => {
                  onChange(query.trim());
                  setOpen(false);
                }}
                className="w-full px-4 py-2 text-left text-sm hover:bg-ivory text-moss"
              >
                Usar «{query.trim()}»
              </button>
            )}
            {!filtered.length && !showCustom && (
              <p className="px-4 py-3 text-xs text-moss/60">Sin resultados</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function CountrySelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={COUNTRIES}
      placeholder="Seleccionar país"
      disabled={disabled}
      renderOption={(c) => (
        <span>
          {countryFlag(c)} {c}
        </span>
      )}
      renderValue={(c) => (
        <span>
          {countryFlag(c)} {c}
        </span>
      )}
    />
  );
}

export function CitySelect({
  country,
  value,
  onChange,
  disabled,
}: {
  country: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const cities = citiesFor(country);
  if (!cities.length) {
    // País sin lista de ciudades: texto libre
    return (
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 px-4 py-3 rounded-2xl border border-ink/15 text-sm w-full disabled:bg-ink/5"
      />
    );
  }
  return (
    <SearchableSelect
      value={value}
      onChange={onChange}
      options={cities}
      placeholder="Seleccionar ciudad"
      disabled={disabled}
    />
  );
}
