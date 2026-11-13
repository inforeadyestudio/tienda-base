import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, GripVertical, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { draftExperienceQuery, publishExperience } from "@/lib/scenes/data";
import type { Scene } from "@/lib/scenes/types";

type OrderProduct = { id: string; name: string; hero_image_url: string | null; status: "draft" | "published" | "archived" };

const catalogProductsQuery = () => ({
  queryKey: ["admin", "catalog-order-products"] as const,
  queryFn: () => fetchAll<OrderProduct>((from, to) => supabase.from("products").select("id, name, hero_image_url, status").or("available_national.eq.true,available_international.eq.true").order("created_at", { ascending: false }).range(from, to)),
  staleTime: 60_000,
});

export function CatalogOrderEditor({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const qc = useQueryClient();
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { data: page } = useQuery({ queryKey: ["admin", "catalog-order-page"], enabled: open, queryFn: async () => { const { data, error } = await supabase.from("collections").select("id").eq("slug", "page-tienda").single(); if (error) throw error; return data; } });
  const { data: products = [], isLoading: loadingProducts } = useQuery({ ...catalogProductsQuery(), enabled: open });
  const { data: draft, isLoading: loadingDraft } = useQuery({ ...draftExperienceQuery(page?.id), enabled: open && !!page?.id });
  const orderScene = draft?.scenes.find((scene) => scene.type === "catalog-order");
  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  useEffect(() => {
    if (!open || !draft || products.length === 0) return;
    const saved = Array.isArray(orderScene?.props?.productIds) ? (orderScene.props.productIds as string[]).filter((id) => productById.has(id)) : [];
    const seen = new Set(saved);
    setOrder([...saved, ...products.map((product) => product.id).filter((id) => !seen.has(id))]);
  }, [open, draft, orderScene?.id, products, productById]);

  const normalizedQuery = query.trim().toLocaleLowerCase("es");
  const visibleIds = useMemo(() => order.filter((id) => !normalizedQuery || productById.get(id)?.name.toLocaleLowerCase("es").includes(normalizedQuery)), [order, normalizedQuery, productById]);
  function moveTo(id: string, requestedPosition: number) { const from = order.indexOf(id); if (from < 0) return; const to = Math.max(0, Math.min(order.length - 1, requestedPosition - 1)); const next = [...order]; next.splice(from, 1); next.splice(to, 0, id); setOrder(next); }
  function moveBy(id: string, direction: -1 | 1) { const current = order.indexOf(id); if (current >= 0) moveTo(id, current + direction + 1); }
  function dropOn(targetId: string) { if (!dragId || dragId === targetId || normalizedQuery) return; const from = order.indexOf(dragId); const to = order.indexOf(targetId); if (from < 0 || to < 0) return; const next = [...order]; next.splice(from, 1); next.splice(to, 0, dragId); setOrder(next); setDragId(null); }

  async function saveAndPublish() {
    if (!draft?.experience || !page?.id) return;
    setSaving(true);
    try {
      let scene: Scene;
      if (orderScene) {
        const props = { ...orderScene.props, mode: "manual", productIds: order };
        const { error } = await supabase.from("collection_scenes").update({ props: props as any, visible: true }).eq("id", orderScene.id);
        if (error) throw error;
        scene = { ...orderScene, visible: true, props };
      } else {
        const { data, error } = await supabase.from("collection_scenes").insert({ experience_id: draft.experience.id, type: "catalog-order", source: "library", position: draft.scenes.length + 1, visible: true, props: { mode: "manual", productIds: order, collectionSlugs: [], pageSize: 20, restLabel: "Más piezas" }, layers: [] }).select("id, type, source, position, visible, props, layers").single();
        if (error) throw error;
        scene = { ...(data as Scene), props: (data.props ?? {}) as Record<string, any>, layers: [] };
      }
      const scenes = orderScene ? draft.scenes.map((item) => item.id === orderScene.id ? scene : item) : [...draft.scenes, scene];
      await publishExperience(draft.experience.id, scenes);
      await Promise.all([qc.invalidateQueries({ queryKey: ["collection-experience-draft", page.id] }), qc.invalidateQueries({ queryKey: ["collection-experience-published", page.id] }), qc.invalidateQueries({ queryKey: ["storefront", "catalog"] })]);
      toast.success("Orden publicado en la tienda");
      onOpenChange(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo guardar el orden"); }
    finally { setSaving(false); }
  }

  const loading = loadingProducts || loadingDraft;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90dvh] max-w-5xl grid-rows-none flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-ink/10 px-6 py-5 pr-14">
          <DialogTitle className="font-serif text-2xl font-normal italic">Ordenar productos</DialogTitle>
          <DialogDescription>Este es el orden de “Recomendados”. Los borradores conservan su posición y aparecerán cuando se publiquen.</DialogDescription>
        </DialogHeader>
        <div className="shrink-0 border-b border-ink/10 px-6 py-4">
          <div className="relative"><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-moss/50" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar dentro del orden…" className="w-full rounded-md border border-ink/10 bg-white py-2.5 pl-9 pr-3 text-sm focus:border-ink/30 focus:outline-none" /></div>
          <p className="mt-2 text-xs text-moss/70">{query ? `${visibleIds.length} coincidencias · escribe una posición para mover rápido` : `${order.length} productos · arrastra o usa las flechas`}</p>
        </div>
        <div className="sheet-scroll min-h-0 flex-1 overflow-y-auto px-6 py-3">
          {loading ? <p className="py-12 text-center text-sm text-moss/70">Cargando productos…</p> : <div className="space-y-1.5">{visibleIds.map((id) => { const product = productById.get(id); if (!product) return null; const position = order.indexOf(id) + 1; return (
            <div key={id} draggable={!normalizedQuery} onDragStart={() => setDragId(id)} onDragEnd={() => setDragId(null)} onDragOver={(event) => event.preventDefault()} onDrop={() => dropOn(id)} className="flex min-h-16 items-center gap-3 rounded-md border border-ink/10 bg-white px-3 py-2">
              <GripVertical className="size-4 shrink-0 cursor-grab text-moss/40" />
              <input aria-label={`Posición de ${product.name}`} type="number" min={1} max={order.length} value={position} onChange={(event) => moveTo(id, Number(event.target.value))} className="h-9 w-16 rounded-md border border-ink/10 text-center text-xs tabular-nums focus:border-ink/30 focus:outline-none" />
              <div className="h-12 w-10 shrink-0 overflow-hidden bg-cream">{product.hero_image_url && <img src={product.hero_image_url} alt="" className="h-full w-full object-cover" />}</div>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{product.name}</p><p className="text-[10px] uppercase tracking-widest text-moss/60">{product.status === "published" ? "Publicado" : product.status === "draft" ? "Borrador" : "Archivado"}</p></div>
              <Button type="button" variant="ghost" size="icon" onClick={() => moveBy(id, -1)} disabled={position === 1} aria-label="Mover arriba"><ArrowUp /></Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => moveBy(id, 1)} disabled={position === order.length} aria-label="Mover abajo"><ArrowDown /></Button>
            </div>); })}</div>}
        </div>
        <DialogFooter className="shrink-0 border-t border-ink/10 bg-white px-6 py-4"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="button" onClick={saveAndPublish} disabled={saving || loading || order.length === 0}>{saving ? "Publicando…" : "Guardar y publicar"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}