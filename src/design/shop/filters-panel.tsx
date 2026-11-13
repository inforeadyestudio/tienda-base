import { X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { formatCOP } from "@/lib/format";
import type { ShopFilters, Availability } from "@/lib/tienda/catalog";
import { cn } from "@/lib/utils";

type Facets = ReturnType<typeof import("@/lib/tienda/catalog")["facetsFrom"]>;

type Props = {
  open: boolean;
  onClose: () => void;
  facets: Facets;
  filters: ShopFilters;
  setFilters: (f: ShopFilters) => void;
  results: number;
};

const toggle = (list: string[], value: string) =>
  list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

const AVAILABILITY: { value: Availability; label: string }[] = [
  { value: "all", label: "Todo" },
  { value: "now", label: "Disponible ahora" },
  { value: "cali", label: "En Cali" },
  { value: "bogota", label: "En Bogotá" },
  { value: "online", label: "Online" },
];

export function FiltersPanel({ open, onClose, facets, filters, setFilters, results }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-ink/20"
          />
          <motion.aside
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="fixed left-0 top-0 z-[61] h-full w-full max-w-[380px] bg-ivory border-r border-ink/10 flex flex-col"
          >
            <header className="flex items-center justify-between px-6 h-16 border-b border-ink/10">
              <p className="font-nm text-[11px] uppercase tracking-[0.24em]">Filtros</p>
              <button onClick={onClose} aria-label="Cerrar filtros">
                <X className="size-4" strokeWidth={1.5} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-9">
              <Group title="Tipo de prenda">
                <div className="space-y-2">
                  {facets.types.map((t) => (
                    <label key={t.value} className="flex items-center justify-between text-[13px] cursor-pointer">
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          className="accent-ink"
                          checked={filters.types.includes(t.value)}
                          onChange={() => setFilters({ ...filters, types: toggle(filters.types, t.value) })}
                        />
                        {t.value}
                      </span>
                      <span className="opacity-40 text-[11px]">{t.total}</span>
                    </label>
                  ))}
                </div>
              </Group>

              <Group title="Color">
                <div className="flex flex-wrap gap-2.5">
                  {facets.colors.map((c) => (
                    <button
                      key={c.name}
                      title={c.name}
                      onClick={() => setFilters({ ...filters, colors: toggle(filters.colors, c.name) })}
                      className={cn(
                        "size-7 rounded-full border transition-transform",
                        filters.colors.includes(c.name) ? "border-ink scale-110" : "border-ink/15",
                      )}
                      style={{ background: c.hex }}
                    />
                  ))}
                </div>
              </Group>

              <Group title="Talla">
                <div className="flex flex-wrap gap-2">
                  {facets.sizes.map((s) => (
                    <Pill
                      key={s.value}
                      active={filters.sizes.includes(s.value)}
                      onClick={() => setFilters({ ...filters, sizes: toggle(filters.sizes, s.value) })}
                    >
                      {s.value}
                    </Pill>
                  ))}
                </div>
              </Group>

              <Group title="Rango de precio">
                <div className="flex items-center gap-3">
                  <NumberField
                    label={formatCOP(facets.priceMin)}
                    value={filters.min}
                    onChange={(v) => setFilters({ ...filters, min: v })}
                  />
                  <span className="opacity-30">—</span>
                  <NumberField
                    label={formatCOP(facets.priceMax)}
                    value={filters.max}
                    onChange={(v) => setFilters({ ...filters, max: v })}
                  />
                </div>
              </Group>

              {facets.materials.length > 0 && (
                <Group title="Material">
                  <div className="flex flex-wrap gap-2">
                    {facets.materials.slice(0, 12).map((m) => (
                      <Pill
                        key={m.value}
                        active={filters.materials.includes(m.value)}
                        onClick={() => setFilters({ ...filters, materials: toggle(filters.materials, m.value) })}
                      >
                        {m.value}
                      </Pill>
                    ))}
                  </div>
                </Group>
              )}

              {facets.tags.length > 0 && (
                <Group title="Fit, ocasión y más">
                  <div className="flex flex-wrap gap-2">
                    {facets.tags.slice(0, 30).map((t) => (
                      <Pill
                        key={t.value}
                        active={filters.tags.includes(t.value)}
                        onClick={() => setFilters({ ...filters, tags: toggle(filters.tags, t.value) })}
                      >
                        {t.value}
                      </Pill>
                    ))}
                  </div>
                </Group>
              )}

              <Group title="Disponibilidad">
                <div className="flex flex-wrap gap-2">
                  {AVAILABILITY.map((a) => (
                    <Pill
                      key={a.value}
                      active={filters.availability === a.value}
                      onClick={() => setFilters({ ...filters, availability: a.value })}
                    >
                      {a.label}
                    </Pill>
                  ))}
                </div>
              </Group>
            </div>

            <footer className="border-t border-ink/10 px-6 py-4 flex items-center justify-between">
              <button
                onClick={() =>
                  setFilters({
                    ...filters,
                    types: [],
                    sizes: [],
                    colors: [],
                    materials: [],
                    tags: [],
                    min: null,
                    max: null,
                    availability: "all",
                  })
                }
                className="font-nm text-[10px] uppercase tracking-[0.2em] opacity-60"
              >
                Limpiar
              </button>
              <button
                onClick={onClose}
                className="bg-ink text-ivory font-nm text-[10px] uppercase tracking-[0.2em] px-6 py-3"
              >
                Ver {results} piezas
              </button>
            </footer>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="font-nm text-[10px] uppercase tracking-[0.22em] opacity-50 mb-3">{title}</p>
      {children}
    </section>
  );
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "border px-3 py-1.5 text-[11px] transition-colors",
        active ? "border-ink bg-ink text-ivory" : "border-ink/15 hover:border-ink/40",
      )}
    >
      {children}
    </button>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <input
      inputMode="numeric"
      placeholder={label}
      value={value ?? ""}
      onChange={(e) => {
        const raw = e.target.value.replace(/\D/g, "");
        onChange(raw ? Number(raw) : null);
      }}
      className="w-full border border-ink/15 bg-transparent px-3 py-2 text-[12px] outline-none focus:border-ink/50"
    />
  );
}