import { createFileRoute, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, History, Search, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { usePaged } from "@/components/ui/use-paged";
import { formatCOP } from "@/lib/format";
import { SEDES } from "./route";

export const Route = createFileRoute("/_authenticated/pos/$sede/productos")({
  component: SedeProductos,
});

type Scope = "all" | "sede";

function SedeProductos() {
  const { sede } = useParams({ from: "/_authenticated/pos/$sede/productos" });
  const info = SEDES[sede as keyof typeof SEDES];
  const posField = sede === "bogota" ? "available_pos_bogota" : "available_pos_cali";
  const qc = useQueryClient();

  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("sede");
  const [collectionId, setCollectionId] = useState("");
  const [viewId, setViewId] = useState<string | null>(null);
  const [kardex, setKardex] = useState<{ id: string; name: string } | null>(null);

  const { data: loc } = useQuery({
    queryKey: ["sede-loc", info.code],
    queryFn: async () => (await supabase.from("locations").select("id, name, code").eq("code", info.code).maybeSingle()).data,
  });

  const togglePos = useMutation({
    mutationFn: async ({ id, value }: { id: string; value: boolean }) => {
      const { error } = await supabase.from("products").update({ [posField]: value } as any).eq("id", id);
      if (error) throw error;
    },
    onSuccess: async (_v, vars) => {
      toast.success(vars.value ? `Disponible en ${info.label}` : `Retirado de ${info.label}`);
      await qc.invalidateQueries({ queryKey: ["pos-products", info.code] });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo actualizar"),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["pos-products", info.code],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name, slug, status, product_type, available_national, available_pos_cali, available_pos_bogota, hero_image_url, collection_products(collection_id, collections(title)), product_variants(id, sku, size, color, price_cop, active, inventory_levels(location_id, on_hand, reserved))",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: collections } = useQuery({
    queryKey: ["tienda-collections-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("collections").select("id, title").order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  const availAt = (variants: any[]) =>
    variants.reduce(
      (s: number, v: any) =>
        s +
        (v.inventory_levels ?? [])
          .filter((l: any) => !loc?.id || l.location_id === loc.id)
          .reduce((a: number, l: any) => a + Math.max(0, (l.on_hand ?? 0) - (l.reserved ?? 0)), 0),
      0,
    );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((p: any) => {
      if (scope === "sede" && !p[posField]) return false;
      if (collectionId && !(p.collection_products ?? []).some((cp: any) => cp.collection_id === collectionId)) return false;
      if (q) {
        const hay = [p.name, p.slug, p.product_type].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [data, query, scope, collectionId, posField]);

  return (
    <div className="p-6 md:p-10">
      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-widest text-moss/70">Catálogo · {info.label}</p>
        <h1 className="font-serif italic text-3xl md:text-4xl mt-1">Productos</h1>
        <p className="text-sm text-moss mt-2 max-w-xl">
          Mismo catálogo global, con el inventario de esta sede. Un producto puede estar en borrador para la tienda online y seguir disponible aquí.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-moss/50" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar producto…"
            className="w-full pl-9 pr-3 py-2.5 rounded-full bg-white border border-ink/10 text-sm focus:outline-none focus:border-ink/30"
          />
        </div>
        <div className="flex gap-1 rounded-full bg-white border border-ink/10 p-1">
          {([["sede", `En ${info.label}`], ["all", "Todo el catálogo"]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setScope(k)}
              className={"px-3.5 py-1.5 rounded-full text-xs transition-colors " + (scope === k ? "bg-ink text-ivory" : "text-ink/60 hover:bg-ink/5")}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          value={collectionId}
          onChange={(e) => setCollectionId(e.target.value)}
          className="pill-select py-2.5 rounded-full bg-white border border-ink/10 text-sm"
        >
          <option value="">Todas las colecciones</option>
          {(collections ?? []).map((c: any) => (
            <option key={c.id} value={c.id}>{c.title}</option>
          ))}
        </select>
      </div>

      <div className="bg-white border border-ink/10 rounded-2xl overflow-x-auto">
        <table className="w-full text-sm min-w-[820px]">
          <thead className="text-xs uppercase tracking-widest text-moss/70">
            <tr>
              <th className="text-left px-4 py-3">Producto</th>
              <th className="text-left">Tienda online</th>
              <th className="text-left">En esta sede</th>
              <th className="text-right">Disponible aquí</th>
              <th className="text-right">Precio COP</th>
              <th className="px-4"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p: any) => {
              const variants = p.product_variants ?? [];
              const copVals = variants.map((v: any) => v.price_cop).filter((n: any) => Number.isFinite(n));
              const cop = copVals.length ? Math.min(...copVals) : null;
              const available = availAt(variants);
              const on = !!p[posField];
              return (
                <tr key={p.id} className="border-t border-ink/5 hover:bg-cream/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-12 bg-cream overflow-hidden shrink-0">
                        {p.hero_image_url && <img src={p.hero_image_url} alt="" loading="lazy" className="w-full h-full object-cover" />}
                      </div>
                      <span className="font-serif italic text-lg">{p.name}</span>
                    </div>
                  </td>
                  <td>
                    <span
                      className={
                        "text-[9px] uppercase tracking-widest px-2 py-0.5 rounded " +
                        (p.status === "published" ? "bg-moss/15 text-moss" : "bg-ink/10 text-ink/60")
                      }
                    >
                      {p.status === "published" ? "published" : p.status}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      disabled={togglePos.isPending && togglePos.variables?.id === p.id}
                      onClick={() => togglePos.mutate({ id: p.id, value: !on })}
                      className={
                        "text-[9px] uppercase tracking-widest px-2 py-0.5 rounded transition-colors disabled:opacity-50 " +
                        (on ? "bg-clay/15 text-clay hover:bg-clay/25" : "bg-ink/10 text-ink/50 hover:bg-ink/20")
                      }
                    >
                      {on ? "activo" : "inactivo"}
                    </button>
                  </td>
                  <td className={"text-right " + (available > 0 ? "" : "text-clay")}>{available}</td>
                  <td className="text-right">{cop !== null ? formatCOP(cop) : "—"}</td>
                  <td className="px-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => setViewId(p.id)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-3 py-1.5 text-xs hover:border-ink/30"
                    >
                      <Eye className="w-3.5 h-3.5" /> Ver
                    </button>
                    <button
                      type="button"
                      onClick={() => setKardex({ id: p.id, name: p.name })}
                      className="ml-2 inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-3 py-1.5 text-xs hover:border-ink/30"
                    >
                      <History className="w-3.5 h-3.5" /> Kardex
                    </button>
                  </td>
                </tr>
              );
            })}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-moss/60">Sin resultados.</td></tr>
            )}
            {isLoading && (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-moss/60">Cargando…</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {viewId && (
        <ProductViewModal
          product={(data ?? []).find((p: any) => p.id === viewId)}
          locationId={loc?.id ?? null}
          sedeLabel={info.label}
          onClose={() => setViewId(null)}
        />
      )}
      {kardex && (
        <KardexModal
          productId={kardex.id}
          productName={kardex.name}
          locationId={loc?.id ?? null}
          onClose={() => setKardex(null)}
        />
      )}
    </div>
  );
}

function ModalShell({ title, subtitle, onClose, children }: { title: string; subtitle: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-ink/45 p-4" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-ink/10 px-6 py-5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-moss/70">{subtitle}</p>
            <h2 className="mt-1 font-serif italic text-2xl">{title}</h2>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-ink/5" aria-label="Cerrar">
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function ProductViewModal({
  product,
  locationId,
  sedeLabel,
  onClose,
}: {
  product: any;
  locationId: string | null;
  sedeLabel: string;
  onClose: () => void;
}) {
  if (!product) return null;
  const variants = product.product_variants ?? [];
  const cols = (product.collection_products ?? []).map((cp: any) => cp.collections?.title).filter(Boolean);
  return (
    <ModalShell title={product.name} subtitle={`Configuración · ${sedeLabel}`} onClose={onClose}>
      <div className="grid gap-6 md:grid-cols-[160px_minmax(0,1fr)]">
        <div className="aspect-[3/4] bg-cream overflow-hidden rounded-xl">
          {product.hero_image_url && <img src={product.hero_image_url} alt={product.name} className="w-full h-full object-cover" />}
        </div>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <Info label="Tienda online" value={product.status} />
          <Info label="Tipo" value={product.product_type ?? "—"} />
          <Info label="Slug" value={product.slug} />
          <Info label="Colecciones" value={cols.length ? cols.join(", ") : "—"} />
        </dl>
      </div>

      <h3 className="mt-8 mb-2 text-[10px] uppercase tracking-widest text-moss/70">Variantes</h3>
      <table className="w-full text-sm">
        <thead className="text-[10px] uppercase tracking-widest text-moss/70">
          <tr>
            <th className="text-left py-2">Variante</th>
            <th className="text-left">SKU</th>
            <th className="text-right">COP</th>
            <th className="text-right">Disponible aquí</th>
          </tr>
        </thead>
        <tbody>
          {variants.map((v: any) => {
            const avail = (v.inventory_levels ?? [])
              .filter((l: any) => !locationId || l.location_id === locationId)
              .reduce((a: number, l: any) => a + Math.max(0, (l.on_hand ?? 0) - (l.reserved ?? 0)), 0);
            return (
              <tr key={v.id} className="border-t border-ink/5">
                <td className="py-2">{[v.color, v.size].filter(Boolean).join(" · ") || "Único"}</td>
                <td className="font-mono text-[11px] text-ink/60">{v.sku}</td>
                <td className="text-right">{Number.isFinite(v.price_cop) ? formatCOP(v.price_cop) : "—"}</td>
                <td className={"text-right " + (avail > 0 ? "" : "text-clay")}>{avail}</td>
              </tr>
            );
          })}
          {variants.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-moss/60">Sin variantes.</td></tr>}
        </tbody>
      </table>
    </ModalShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-widest text-moss/70">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}

function KardexModal({
  productId,
  productName,
  locationId,
  onClose,
}: {
  productId: string;
  productName: string;
  locationId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["pos-kardex", productId, locationId],
    queryFn: async () => {
      const { data: variants, error: vErr } = await supabase
        .from("product_variants")
        .select("id, sku, size, color")
        .eq("product_id", productId);
      if (vErr) throw vErr;
      const ids = (variants ?? []).map((v) => v.id);
      if (!ids.length) return { variants: [], movements: [] };
      const moves = await fetchAll((from, to) => {
        let q = supabase
          .from("inventory_movements")
          .select("id, variant_id, location_id, kind, qty, ref_type, note, created_at")
          .in("variant_id", ids)
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, to);
        if (locationId) q = q.eq("location_id", locationId);
        return q;
      });
      return { variants: variants ?? [], movements: moves ?? [] };
    },
  });

  const { pageItems: movesPage, pager: movesPager } = usePaged((data?.movements ?? []) as any[]);

  const variantMap = new Map((data?.variants ?? []).map((v: any) => [v.id, v]));

  return (
    <ModalShell title={productName} subtitle="Kardex de esta sede" onClose={onClose}>
      {isLoading ? (
        <p className="py-10 text-center text-sm text-moss/60">Cargando movimientos…</p>
      ) : (data?.movements.length ?? 0) === 0 ? (
        <p className="py-10 text-center text-sm text-moss/60">Sin movimientos registrados.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-moss/70">
            <tr>
              <th className="py-2 text-left">Fecha</th>
              <th className="text-left">Variante</th>
              <th className="text-left">Tipo</th>
              <th className="text-right">Cantidad</th>
              <th className="text-left pl-4">Nota</th>
            </tr>
          </thead>
          <tbody>
            {movesPage.map((m: any) => {
              const v: any = variantMap.get(m.variant_id);
              const positive = m.qty >= 0;
              return (
                <tr key={m.id} className="border-t border-ink/5">
                  <td className="py-2 text-xs text-moss/80">{new Date(m.created_at).toLocaleString("es-CO")}</td>
                  <td className="text-xs">
                    {v ? [v.color, v.size].filter(Boolean).join(" · ") || "Único" : "—"}
                    <div className="font-mono text-[10px] text-ink/50">{v?.sku}</div>
                  </td>
                  <td className="text-xs uppercase tracking-widest text-moss/70">{m.kind}</td>
                  <td className={"text-right font-serif " + (positive ? "text-moss" : "text-clay")}>{positive ? "+" : ""}{m.qty}</td>
                  <td className="pl-4 text-xs text-moss/70">{m.note ?? m.ref_type ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {movesPager}
    </ModalShell>
  );
}
