import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Warehouse } from "lucide-react";
import { useWholesaleInventory } from "@/lib/b2b/admin";

export const Route = createFileRoute("/_authenticated/admin/b2b/inventario")({
  component: B2BInventario,
});

function B2BInventario() {
  const { data, isLoading } = useWholesaleInventory();
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const locs = new Map((data?.locations ?? []).map((l: any) => [l.id, l]));
    const byLoc = new Map<string, any[]>();
    (data?.rows ?? []).forEach((r: any) => {
      const row = {
        sku: r.product_variants?.sku ?? "—",
        name: r.product_variants?.products?.name ?? "—",
        size: r.product_variants?.size ?? "—",
        color: r.product_variants?.color ?? "—",
        quality: r.product_variants?.quality ?? "—",
        on_hand: r.on_hand ?? 0,
        reserved: r.reserved ?? 0,
      };
      if (!(row.name + row.sku).toLowerCase().includes(q.toLowerCase())) return;
      const list = byLoc.get(r.location_id) ?? [];
      list.push(row);
      byLoc.set(r.location_id, list);
    });
    return [...byLoc.entries()]
      .map(([locId, rows]) => {
        const loc = locs.get(locId);
        rows.sort((a, b) => a.name.localeCompare(b.name) || a.sku.localeCompare(b.sku));
        return {
          id: locId,
          name: loc?.name ?? "Bodega",
          units: rows.reduce((s, r) => s + r.on_hand, 0),
          rows,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [data, q]);

  return (
    <div className="p-6 md:p-10">
      <header className="mb-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-moss/70">Disponibilidad mayorista</p>
        <h1 className="font-serif text-3xl md:text-4xl text-ink mt-1">Inventario B2B</h1>
        <p className="mt-2 text-sm text-ink/60">Stock en las bodegas de cada cliente mayorista con consignación.</p>
      </header>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar producto o SKU…"
        className="w-full max-w-sm mb-5 px-4 py-2.5 rounded-full bg-white border border-ink/10 text-sm outline-none focus:border-ink/30"
      />

      {isLoading && <div className="px-5 py-8 text-sm text-ink/50">Cargando…</div>}
      {!isLoading && !groups.length && (
        <div className="bg-white rounded-3xl border border-ink/10 px-5 py-8 text-sm text-ink/50">
          No hay bodegas de consignación con stock.
        </div>
      )}

      <div className="space-y-6">
        {groups.map((g) => (
          <section key={g.id} className="bg-white rounded-3xl border border-ink/10 overflow-x-auto">
            <div className="flex items-center gap-3 px-5 pt-4 pb-2">
              <span className="inline-flex size-8 items-center justify-center rounded-full bg-moss/15 text-moss">
                <Warehouse className="size-4" />
              </span>
              <h2 className="font-serif text-xl text-ink">{g.name}</h2>
              <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-[11px] text-ink/60">{g.units} unidades</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.15em] text-ink/45 border-b border-ink/8">
                  <th className="px-5 py-3">Producto</th>
                  <th className="px-5 py-3">SKU</th>
                  <th className="px-5 py-3">Talla</th>
                  <th className="px-5 py-3">Color</th>
                  <th className="px-5 py-3">Calidad</th>
                  <th className="px-5 py-3">Disponible</th>
                  <th className="px-5 py-3">Reservado</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r, i) => (
                  <tr key={r.sku + i} className="border-b border-ink/5 last:border-0">
                    <td className="px-5 py-3 font-medium">{r.name}</td>
                    <td className="px-5 py-3 font-mono text-xs text-ink/60">{r.sku}</td>
                    <td className="px-5 py-3">{r.size}</td>
                    <td className="px-5 py-3">{r.color}</td>
                    <td className="px-5 py-3">{r.quality}</td>
                    <td className="px-5 py-3">{r.on_hand - r.reserved}</td>
                    <td className="px-5 py-3 text-ink/60">{r.reserved}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </div>
  );
}
