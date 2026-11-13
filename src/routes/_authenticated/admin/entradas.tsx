import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PackagePlus, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { sendRCountAdjustment } from "@/lib/rcount.functions";

export const Route = createFileRoute("/_authenticated/admin/entradas")({
  component: IntakePage,
  head: () => ({
    meta: [
      { title: "Entradas de producción | Tu Marca" },
      { name: "description", content: "Registra inventario terminado en la ubicación correspondiente." },
      { property: "og:title", content: "Entradas de producción | Tu Marca" },
      { property: "og:description", content: "Registra inventario terminado en la ubicación correspondiente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type IntakeVariant = {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  products: { name: string } | null;
};

type Line = {
  variant_id: string;
  qty: number;
  product_name: string;
  sku: string;
  size: string | null;
  color: string | null;
};

function IntakePage() {
  const qc = useQueryClient();
  const [locationId, setLocationId] = useState<string>("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [search, setSearch] = useState("");

  const { data: locations } = useQuery({
    queryKey: ["intake-locations"],
    queryFn: async () => (await supabase.from("locations").select("id, code, name, kind").order("priority")).data ?? [],
  });

  const { data: variants } = useQuery({
    queryKey: ["intake-variants", search],
    queryFn: async () => {
      const term = search.trim();
      let productIds: string[] = [];

      if (term) {
        const { data: matchingProducts, error: productsError } = await supabase
          .from("products")
          .select("id")
          .or(`name.ilike.%${term}%,reference_code.ilike.%${term}%`)
          .limit(100);
        if (productsError) throw productsError;
        productIds = (matchingProducts ?? []).map((product) => product.id);
      }

      let query = supabase
        .from("product_variants")
        .select("id, sku, size, color, products(name)")
        .eq("active", true)
        .limit(100);

      if (term) {
        query = productIds.length > 0
          ? query.or(`sku.ilike.%${term}%,product_id.in.(${productIds.join(",")})`)
          : query.ilike("sku", `%${term}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as IntakeVariant[];
    },
  });

  const { data: recent } = useQuery({
    queryKey: ["intake-recent"],
    queryFn: async () => (await supabase.from("inventory_movements")
      .select("id, created_at, qty, note, kind, ref_type, variant_id, location_id")
      .eq("ref_type", "intake").order("created_at", { ascending: false }).limit(20)).data ?? [],
  });

  const total = useMemo(() => lines.reduce((s, l) => s + l.qty, 0), [lines]);

  const addVariant = (variant: IntakeVariant) => {
    setLines((prev) => prev.find((line) => line.variant_id === variant.id) ? prev : [...prev, {
      variant_id: variant.id,
      qty: 1,
      product_name: variant.products?.name ?? "Producto",
      sku: variant.sku,
      size: variant.size,
      color: variant.color,
    }]);
  };

  const sendRCount = useServerFn(sendRCountAdjustment);
  const submit = useMutation({
    mutationFn: async () => {
      if (!locationId || lines.length === 0) throw new Error("Selecciona ubicación y añade piezas");
      const { error } = await supabase.rpc("create_intake", {
        _location_id: locationId,
        _items: lines.map(({ variant_id, qty }) => ({ variant_id, qty })) as unknown as never,
        _note: note || undefined,
      });
      if (error) throw error;
      const r = await sendRCount({ data: { kind: "ajuste", reason: note || "Entrada de producción Hub", items: lines.map(({ variant_id, qty }) => ({ variant_id, qty })), location_id: locationId } });
      if (!r.ok) toast.error(r.message);
    },
    onSuccess: () => {
      toast.success("Entrada registrada en bodega");
      setLines([]); setNote("");
      qc.invalidateQueries();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Error"),
  });

  return (
    <div className="p-10 max-w-6xl">
      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-widest text-moss/70">Operación</p>
        <h1 className="font-serif italic text-4xl mt-1">Entradas de producción</h1>
        <p className="text-sm text-moss mt-2 max-w-xl">Registra la llegada de piezas terminadas desde producción a una bodega. Solo el Sales Hub tiene esta autoridad.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-6">
        <section className="bg-white border border-ink/10 rounded-2xl p-6 space-y-5">
          <div>
            <label className="text-xs uppercase tracking-widest text-moss/70">Ubicación destino</label>
            <select value={locationId} onChange={(e) => setLocationId(e.target.value)} className="mt-2 w-full rounded-full border border-ink/15 px-4 py-2.5 bg-ivory">
              <option value="">— Selecciona —</option>
              {locations?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-moss/70">Buscar producto o variante</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre, referencia o SKU" className="mt-2 w-full rounded-full border border-ink/15 px-4 py-2.5 bg-ivory outline-none focus:border-ink" />
            <div className="mt-3 max-h-56 overflow-auto border border-ink/5 rounded-2xl divide-y divide-ink/5">
              {variants?.map((v) => (
                <button key={v.id} onClick={() => addVariant(v)} className="w-full text-left px-4 py-2 hover:bg-cream/60 flex items-center justify-between text-sm">
                  <span><span className="font-serif italic">{v.products?.name}</span> · <span className="font-mono text-xs text-ink/60">{v.sku}</span> · <span className="text-xs text-moss">{[v.color, v.size].filter(Boolean).join(" ")}</span></span>
                  <Plus className="size-4" />
                </button>
              ))}
              {(variants?.length ?? 0) === 0 && <p className="p-4 text-sm text-moss/60">Sin resultados.</p>}
            </div>
          </div>

          <div>
            <div className="text-xs uppercase tracking-widest text-moss/70 mb-2">Líneas</div>
            {lines.length === 0 ? (
              <p className="text-sm text-moss/60">Agrega variantes para empezar.</p>
            ) : (
              <div className="space-y-2">
                {lines.map((l, i) => {
                  return (
                    <div key={l.variant_id} className="flex items-center gap-3 border border-ink/10 rounded-2xl px-4 py-2.5">
                      <div className="flex-1 text-sm">
                        <div className="font-serif italic">{l.product_name}</div>
                        <div className="text-xs text-moss"><span className="font-mono">{l.sku}</span>{[l.color, l.size].filter(Boolean).length > 0 ? ` · ${[l.color, l.size].filter(Boolean).join(" · ")}` : ""}</div>
                      </div>
                      <input type="number" min={1} value={l.qty} onChange={(e) => {
                        const q = Math.max(1, Number(e.target.value) || 0);
                        setLines((prev) => prev.map((x, idx) => idx === i ? { ...x, qty: q } : x));
                      }} className="w-20 rounded-full border border-ink/15 px-3 py-1.5 bg-ivory text-center" />
                      <button onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))} className="text-ink/40 hover:text-clay"><Trash2 className="size-4" /></button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs uppercase tracking-widest text-moss/70">Nota (lote, remisión…)</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-2 w-full rounded-full border border-ink/15 px-4 py-2.5 bg-ivory outline-none focus:border-ink" />
          </div>

          <button onClick={() => submit.mutate()} disabled={submit.isPending || !locationId || lines.length === 0}
            className="flex items-center gap-2 px-6 py-3 rounded-full bg-ink text-ivory text-sm hover:bg-ink/85 disabled:opacity-40">
            <PackagePlus className="size-4" /> Registrar entrada ({total} pza)
          </button>
        </section>

        <aside className="bg-white border border-ink/10 rounded-2xl p-6">
          <h3 className="font-serif italic text-xl mb-4">Últimas entradas</h3>
          <ul className="space-y-3 text-sm">
            {recent?.map((m) => (
              <li key={m.id} className="flex justify-between border-b border-ink/5 pb-2">
                <span className="text-moss text-xs">{new Date(m.created_at).toLocaleString("es-CO")}</span>
                <span className="font-medium">+{m.qty}</span>
              </li>
            ))}
            {(recent?.length ?? 0) === 0 && <li className="text-moss/60">Sin registros aún.</li>}
          </ul>
        </aside>
      </div>
    </div>
  );
}