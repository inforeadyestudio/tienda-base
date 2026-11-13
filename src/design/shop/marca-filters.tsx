// Panel de filtros Tu Marca (tienda y páginas de colección). Solo presentación: recibe los filtros y las facetas
// tal como los calcula la lógica (useShopPage) y devuelve los filtros nuevos con setFilters.
import * as Dialog from "@radix-ui/react-dialog";
import { formatCOP } from "@/logic";
import type { ShopFilters } from "@/lib/tienda/catalog";
import { cx } from "@/design/sections/marca/shared";

type Facets = {
  types: Array<{ value: string; total: number }>;
  sizes: Array<{ value: string; total: number }>;
  materials: Array<{ value: string; total: number }>;
  tags: Array<{ value: string; total: number }>;
  colors: Array<{ name: string; hex: string }>;
  priceMin: number;
  priceMax: number;
};

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
const round = (n: number) => Math.round(n / 10000) * 10000;

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-marca-line py-5">
      <h3 className="marca-mono marca-mono-soft m-0 mb-3.5">{title}</h3>
      {children}
    </section>
  );
}

function Pick({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} className={cx("marca-bk py-1 hover:text-marca-cacao", !on && "text-marca-suave")}>
      {children}
    </button>
  );
}

export function MarcaFilters({ open, onClose, facets, filters, setFilters, results, showTypes, reset }: {
  open: boolean;
  onClose: () => void;
  facets: Facets;
  filters: ShopFilters;
  setFilters: (f: ShopFilters) => void;
  results: number;
  showTypes: boolean;
  /** filtros a los que vuelve «Limpiar» (en una colección conserva su categoría) */
  reset: ShopFilters;
}) {
  const set = (patch: Partial<ShopFilters>) => setFilters({ ...filters, ...patch });
  // tres rangos de precio a partir de los precios que llegan del catálogo
  const lo = facets.priceMin, hi = facets.priceMax;
  const a = round(lo + (hi - lo) / 3), b = round(lo + ((hi - lo) * 2) / 3);
  const ranges = hi > lo && a > lo && b > a
    ? [
        { label: `Hasta ${formatCOP(a)}`, min: null, max: a },
        { label: `${formatCOP(a)} – ${formatCOP(b)}`, min: a, max: b },
        { label: `Desde ${formatCOP(b)}`, min: b, max: null },
      ]
    : [];
  const tags = facets.tags.slice(0, 18);

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="marca-scrim fixed inset-0 z-[80] bg-marca-cacao/25" />
        <Dialog.Content aria-describedby={undefined} className="marca marca-drawer fixed inset-y-0 right-0 z-[81] flex w-[min(420px,100%)] flex-col bg-marca-paper outline-none">
          <header className="flex items-center justify-between border-b border-marca-line px-6 py-5">
            <Dialog.Title className="marca-t m-0 text-[22px]">Filtros</Dialog.Title>
            <Dialog.Close className="marca-bk">Cerrar</Dialog.Close>
          </header>

          <div className="flex-1 overflow-y-auto px-6">
            {showTypes && facets.types.length > 1 ? (
              <Group title="Categoría">
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  {facets.types.map((t) => <Pick key={t.value} on={filters.types.includes(t.value)} onClick={() => set({ types: toggle(filters.types, t.value) })}>{t.value}</Pick>)}
                </div>
              </Group>
            ) : null}

            {facets.colors.length > 1 ? (
              <Group title="Color">
                <div className="flex flex-wrap gap-x-4 gap-y-3">
                  {facets.colors.map((c) => {
                    const on = filters.colors.includes(c.name);
                    return (
                      <button key={c.name} type="button" aria-pressed={on} onClick={() => set({ colors: toggle(filters.colors, c.name) })}
                        className={cx("flex items-center gap-2 bg-transparent p-0", on ? "text-marca-cacao" : "text-marca-suave")}>
                        <span className={cx("size-4 rounded-full", on ? "shadow-[0_0_0_1px_var(--marca-paper),0_0_0_2px_var(--marca-cacao)]" : "shadow-[inset_0_0_0_1px_var(--marca-line-strong)]")} style={{ background: c.hex }} />
                        <span className="marca-mono">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              </Group>
            ) : null}

            {tags.length ? (
              <Group title="Forma y estilo">
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  {tags.map((t) => <Pick key={t.value} on={filters.tags.includes(t.value)} onClick={() => set({ tags: toggle(filters.tags, t.value) })}>{t.value}</Pick>)}
                </div>
              </Group>
            ) : null}

            {facets.materials.length > 1 ? (
              <Group title="Material">
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  {facets.materials.map((m) => <Pick key={m.value} on={filters.materials.includes(m.value)} onClick={() => set({ materials: toggle(filters.materials, m.value) })}>{m.value}</Pick>)}
                </div>
              </Group>
            ) : null}

            {facets.sizes.length > 1 ? (
              <Group title="Talla">
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  {facets.sizes.map((z) => <Pick key={z.value} on={filters.sizes.includes(z.value)} onClick={() => set({ sizes: toggle(filters.sizes, z.value) })}>{z.value}</Pick>)}
                </div>
              </Group>
            ) : null}

            {ranges.length ? (
              <Group title="Precio">
                <div className="flex flex-wrap gap-x-5 gap-y-1">
                  {ranges.map((r) => {
                    const on = filters.min === r.min && filters.max === r.max;
                    return <Pick key={r.label} on={on} onClick={() => set(on ? { min: null, max: null } : { min: r.min, max: r.max })}>{r.label}</Pick>;
                  })}
                </div>
              </Group>
            ) : null}

            <Group title="Disponibilidad">
              <label className="marca-mono flex cursor-pointer items-center gap-2.5">
                <input type="checkbox" className="marca-check" checked={filters.availability === "now"} onChange={(e) => set({ availability: e.target.checked ? "now" : "all" })} />
                Solo disponibles ahora
              </label>
            </Group>
          </div>

          <footer className="flex items-center gap-4 border-t border-marca-line px-6 py-4">
            <button type="button" className="marca-bk" onClick={() => setFilters({ ...reset })}>Limpiar</button>
            <button type="button" onClick={onClose}
              className="marca-mono ml-auto flex-1 border border-marca-cacao bg-marca-cacao px-5 py-3.5 text-[11px] tracking-[.14em] text-marca-paper transition-colors duration-200 marca-steps hover:bg-transparent hover:text-marca-cacao">
              Ver {results} {results === 1 ? "referencia" : "referencias"}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
