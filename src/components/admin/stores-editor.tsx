import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { optimizeImageFile, uploadOptions } from "@/lib/media";
import { saveStoreProfile, storesQuery, type StoreProfile } from "@/lib/stores";

const input = "w-full px-3 py-2 rounded-lg bg-white border border-ink/10 text-sm focus:outline-none focus:border-ink/30";
const label = "block text-[10px] uppercase tracking-widest text-moss/70 mb-1";

/** Edita foto, dirección y mapa de cada tienda física mostrada en Our Stores. */
export function StoresEditor() {
  const qc = useQueryClient();
  const { data } = useQuery(storesQuery());
  const [rows, setRows] = useState<StoreProfile[]>([]);
  const [saving, setSaving] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => { if (data) setRows(data); }, [data]);

  const patch = (id: string, p: Partial<StoreProfile>) =>
    setRows((prev) => prev.map((r) => (r.location_id === id ? { ...r, ...p } : r)));

  async function upload(store: StoreProfile, file: File) {
    setUploading(store.location_id);
    try {
      const optimized = await optimizeImageFile(file, { maxDim: 1920, quality: 0.78 });
      const path = `stores/${store.location_id}-${Date.now()}-${optimized.name}`;
      const { error } = await supabase.storage.from("product-media").upload(path, optimized, uploadOptions(optimized));
      if (error) throw error;
      const url = supabase.storage.from("product-media").getPublicUrl(path).data.publicUrl;
      patch(store.location_id, { photo_url: url });
      await saveStoreProfile(store.location_id, { photo_url: url });
      await qc.invalidateQueries({ queryKey: ["store-profiles"] });
      toast.success("Foto actualizada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir la foto");
    } finally {
      setUploading(null);
    }
  }

  async function uploadGallery(store: StoreProfile, files: FileList | null) {
    if (!files?.length) return;
    const available = Math.max(0, 16 - store.gallery_urls.length);
    if (available === 0) return toast.error("El collage admite hasta 16 fotos");
    setUploading(store.location_id);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files).slice(0, available)) {
        const optimized = await optimizeImageFile(file, { maxDim: 1920, quality: 0.78 });
        const path = `stores/${store.location_id}/gallery-${Date.now()}-${crypto.randomUUID()}-${optimized.name}`;
        const { error } = await supabase.storage.from("product-media").upload(path, optimized, uploadOptions(optimized));
        if (error) throw error;
        urls.push(supabase.storage.from("product-media").getPublicUrl(path).data.publicUrl);
      }
      const gallery_urls = [...store.gallery_urls, ...urls];
      patch(store.location_id, { gallery_urls });
      await saveStoreProfile(store.location_id, { gallery_urls });
      await qc.invalidateQueries({ queryKey: ["store-profiles"] });
      toast.success(`${urls.length} foto${urls.length === 1 ? "" : "s"} añadida${urls.length === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir el collage");
    } finally {
      setUploading(null);
    }
  }

  function moveGallery(store: StoreProfile, index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= store.gallery_urls.length) return;
    const gallery_urls = [...store.gallery_urls];
    [gallery_urls[index], gallery_urls[nextIndex]] = [gallery_urls[nextIndex], gallery_urls[index]];
    patch(store.location_id, { gallery_urls });
  }

  async function save(store: StoreProfile) {
    setSaving(store.location_id);
    try {
      await saveStoreProfile(store.location_id, {
        photo_url: store.photo_url,
        gallery_urls: store.gallery_urls,
        address: store.address,
        city: store.city,
        phone: store.phone,
        whatsapp: store.whatsapp,
        hours_note: store.hours_note,
        lat: store.lat,
        lng: store.lng,
        map_query: store.map_query,
        visible: store.visible,
        position: store.position,
      });
      await qc.invalidateQueries({ queryKey: ["store-profiles"] });
      toast.success("Tienda actualizada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(null);
    }
  }

  if (rows.length === 0) {
    return <p className="text-sm text-moss/70">No hay tiendas físicas creadas en ubicaciones.</p>;
  }

  return (
    <div className="space-y-4">
      {rows.map((store) => (
        <div key={store.location_id} className="rounded-lg border border-ink/10 bg-white p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-nm text-lg">{store.name}</h3>
            <div className="flex items-center gap-3">
              <span className="text-[10px] uppercase tracking-widest text-moss/70">Visible</span>
              <Switch checked={store.visible} onCheckedChange={(v) => patch(store.location_id, { visible: v })} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[200px_1fr]">
            <div>
              <div className="aspect-[4/5] w-full overflow-hidden rounded-lg bg-ink/5">
                {store.photo_url ? (
                  <img src={store.photo_url} alt={store.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-[10px] uppercase tracking-widest text-ink/30">
                    Sin foto
                  </div>
                )}
              </div>
              <Button variant="outline" size="sm" className="mt-2 w-full" asChild disabled={uploading === store.location_id}>
                <label className="cursor-pointer">
                  <Upload className="size-3.5" /> {store.photo_url ? "Cambiar foto" : "Subir foto"}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void upload(store, file);
                      e.target.value = "";
                    }}
                  />
                </label>
              </Button>
              {uploading === store.location_id && <p className="text-xs text-moss/70">Subiendo…</p>}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="md:col-span-2">
                <span className={label}>Dirección</span>
                <input className={input} value={store.address} onChange={(e) => patch(store.location_id, { address: e.target.value })} />
              </label>
              <label>
                <span className={label}>Ciudad</span>
                <input className={input} value={store.city ?? ""} onChange={(e) => patch(store.location_id, { city: e.target.value })} />
              </label>
              <label>
                <span className={label}>Teléfono</span>
                <input className={input} value={store.phone ?? ""} onChange={(e) => patch(store.location_id, { phone: e.target.value })} />
              </label>
              <label>
                <span className={label}>WhatsApp</span>
                <input className={input} value={store.whatsapp ?? ""} onChange={(e) => patch(store.location_id, { whatsapp: e.target.value })} />
              </label>
              <label>
                <span className={label}>Horarios (texto)</span>
                <input className={input} value={store.hours_note ?? ""} onChange={(e) => patch(store.location_id, { hours_note: e.target.value })} placeholder="Lun a Sáb · 10am – 7pm" />
              </label>
              <label className="md:col-span-2">
                <span className={label}>Búsqueda en el mapa (opcional)</span>
                <input className={input} value={store.map_query ?? ""} onChange={(e) => patch(store.location_id, { map_query: e.target.value })} placeholder="Tu Marca, Cali" />
              </label>
              <label>
                <span className={label}>Latitud</span>
                <input className={input} value={store.lat ?? ""} onChange={(e) => patch(store.location_id, { lat: e.target.value === "" ? null : Number(e.target.value) })} />
              </label>
              <label>
                <span className={label}>Longitud</span>
                <input className={input} value={store.lng ?? ""} onChange={(e) => patch(store.location_id, { lng: e.target.value === "" ? null : Number(e.target.value) })} />
              </label>
            </div>
          </div>

          <div className="space-y-3 border-t border-ink/10 pt-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className={label}>Collage editorial</p>
                <p className="text-xs text-moss/70">Hasta 16 fotos. El orden define su posición en la cuadrícula.</p>
              </div>
              <Button variant="outline" size="sm" asChild disabled={uploading === store.location_id || store.gallery_urls.length >= 16}>
                <label className="cursor-pointer">
                  <Upload className="size-3.5" /> Añadir fotos
                  <input type="file" accept="image/*" multiple hidden onChange={(e) => { void uploadGallery(store, e.target.files); e.target.value = ""; }} />
                </label>
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 md:grid-cols-8">
              {store.gallery_urls.map((url, index) => (
                <div key={`${url}-${index}`} className="group relative aspect-square overflow-hidden border border-ink/10 bg-cream">
                  <img src={url} alt={`Collage ${store.name} ${index + 1}`} className="h-full w-full object-cover" />
                  <div className="absolute inset-x-1 bottom-1 flex justify-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button type="button" variant="secondary" size="icon" className="h-7 w-7" onClick={() => moveGallery(store, index, -1)} aria-label="Mover antes"><ArrowUp /></Button>
                    <Button type="button" variant="secondary" size="icon" className="h-7 w-7" onClick={() => moveGallery(store, index, 1)} aria-label="Mover después"><ArrowDown /></Button>
                    <Button type="button" variant="secondary" size="icon" className="h-7 w-7" onClick={() => patch(store.location_id, { gallery_urls: store.gallery_urls.filter((_, i) => i !== index) })} aria-label="Quitar foto"><Trash2 /></Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => save(store)} disabled={saving === store.location_id}>
              {saving === store.location_id ? "Guardando…" : "Guardar tienda"}
            </Button>
          </div>
        </div>
      ))}
      <p className="text-xs text-moss/70">
        Los horarios para agendar citas se configuran en el POS de cada tienda, en “Citas”.
      </p>
    </div>
  );
}
