import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Trash2, Upload, Plus, ArrowUp, ArrowDown, Eye, EyeOff } from "lucide-react";
import { uploadSceneMedia } from "@/lib/scenes/data";
import { isVideoUrl, posterUrlFor } from "@/lib/media";
import { newLayer, type FieldDef, type Layer } from "@/lib/scenes/types";
import { newCard, type ExpandCard } from "@/components/scenes/cards";
import { newCatalogBanner, type CatalogBanner } from "@/components/scenes/catalog-banners";
import { newGarmentTypeItem, type GarmentTypeItem } from "@/components/scenes/garment-types";
import { productTypesQuery } from "@/lib/product-types";
import { WALL_LAYOUT, type WallSlot } from "@/components/scenes/studio-wall";
import { boxOf, patchBox, type Device } from "@/components/admin/collage-canvas";

const input = "w-full px-3 py-2 rounded-lg bg-white border border-ink/10 text-sm focus:outline-none focus:border-ink/30";
const label = "block text-[10px] uppercase tracking-widest text-moss/70 mb-1";

export function SceneFields({
  fields,
  props,
  layers,
  onProps,
  onLayers,
  device = "desktop",
  onDevice,
  selectedLayer,
  onSelectLayer,
}: {
  fields: FieldDef[];
  props: Record<string, any>;
  layers: Layer[];
  onProps: (patch: Record<string, any>) => void;
  onLayers: (next: Layer[]) => void;
  device?: Device;
  onDevice?: (d: Device) => void;
  selectedLayer?: string | null;
  onSelectLayer?: (id: string | null) => void;
}) {
  return (
    <div className="space-y-4">
      {fields.map((f) => {
        if (f.key === "collectionSlug" && props.source !== "collection") return null;
        if (f.key === "collectionSlugs" && props.mode !== "collections") return null;
        if (f.key === "productIds" && fields.some((x) => x.key === "source" || x.key === "mode") && (props.mode ? props.mode !== "manual" : props.source !== "manual")) return null;
        return (
        <div key={f.key}>
          {f.type !== "boolean" && <label className={label}>{f.label}</label>}
          {f.type === "text" && (
            <input className={input} value={props[f.key] ?? ""} onChange={(e) => onProps({ [f.key]: e.target.value })} placeholder={f.placeholder} />
          )}
          {f.type === "textarea" && (
            <textarea rows={4} className={input} value={props[f.key] ?? ""} onChange={(e) => onProps({ [f.key]: e.target.value })} />
          )}
          {f.type === "number" && (
            <input
              type="number"
              className={input}
              min={f.min}
              max={f.max}
              step={f.step}
              value={props[f.key] ?? ""}
              onChange={(e) => onProps({ [f.key]: e.target.value === "" ? null : Number(e.target.value) })}
            />
          )}
          {f.type === "color" && (
            <div className="flex gap-2 items-center">
              <input type="color" value={props[f.key] ?? "#f9f4e6"} onChange={(e) => onProps({ [f.key]: e.target.value })} className="h-9 w-12 rounded border border-ink/10" />
              <input className={input} value={props[f.key] ?? ""} onChange={(e) => onProps({ [f.key]: e.target.value })} />
            </div>
          )}
          {f.type === "boolean" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={!!props[f.key]} onChange={(e) => onProps({ [f.key]: e.target.checked })} />
              {f.label}
            </label>
          )}
          {f.type === "select" && (
            <select className={input} value={props[f.key] ?? ""} onChange={(e) => onProps({ [f.key]: e.target.value })}>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          {f.type === "media" && <MediaField value={props[f.key] ?? ""} onChange={(url) => onProps({ [f.key]: url })} />}
          {f.type === "cards" && <CardsEditor value={props[f.key] ?? []} onChange={(v) => onProps({ [f.key]: v })} />}
          {f.type === "banners" && <BannersEditor value={props[f.key] ?? []} onChange={(v: CatalogBanner[]) => onProps({ [f.key]: v })} />}
          {f.type === "slots" && <WallSlotsEditor value={props[f.key] ?? []} onChange={(v: WallSlot[]) => onProps({ [f.key]: v })} />}
          {f.type === "garmentTypes" && (
            <GarmentTypesEditor value={props[f.key] ?? []} onChange={(v: GarmentTypeItem[]) => onProps({ [f.key]: v })} />
          )}
          {f.type === "collection" && <CollectionPicker value={props[f.key] ?? ""} onChange={(v: string) => onProps({ [f.key]: v })} />}
          {f.type === "collections" && (
            <CollectionsOrderPicker value={props[f.key] ?? []} onChange={(v: string[]) => onProps({ [f.key]: v })} />
          )}
          {f.type === "products" && <ProductPicker value={props[f.key] ?? []} max={f.max} emptyFallback={f.key !== "saleProductIds"} onChange={(v: string[]) => onProps({ [f.key]: v })} />}
          {f.type === "product" && <SingleProductPicker value={props[f.key]} onChange={(v) => onProps({ [f.key]: v ?? "" })} />}
          {f.type === "store" && <StorePicker value={props[f.key] ?? ""} onChange={(v) => onProps({ [f.key]: v })} />}
          {f.type === "medialist" && <MediaList value={props[f.key] ?? []} onChange={(v) => onProps({ [f.key]: v })} />}
          {f.type === "layers" && (
            <LayersEditor
              layers={layers}
              onChange={onLayers}
              device={device}
              onDevice={onDevice}
              selectedId={selectedLayer ?? null}
              onSelect={onSelectLayer}
            />
          )}
        </div>
        );
      })}
    </div>
  );
}

function StorePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { data = [] } = useQuery({
    queryKey: ["admin", "stores-picker"],
    queryFn: async () => {
      const { data, error } = await supabase.from("store_profiles").select("location_id, locations!inner(name)").order("position");
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <select className={input} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Elige una tienda —</option>
      {data.map((store: any) => <option key={store.location_id} value={store.location_id}>{store.locations?.name ?? "Tienda"}</option>)}
    </select>
  );
}

function CollectionPicker({ value, onChange }: { value: string; onChange: (slug: string) => void }) {
  const { data } = useQuery({
    queryKey: ["admin", "collections-picker"],
    queryFn: async () =>
      (await supabase.from("collections").select("slug, title").eq("is_page", false).order("position")).data ?? [],
  });
  return (
    <select className={input} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">— Elige una colección —</option>
      {(data ?? []).map((c: any) => (
        <option key={c.slug} value={c.slug}>
          {c.title}
        </option>
      ))}
    </select>
  );
}

function CollectionsOrderPicker({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { data } = useQuery({
    queryKey: ["admin", "collections-picker"],
    queryFn: async () =>
      (await supabase.from("collections").select("slug, title").eq("is_page", false).order("position")).data ?? [],
  });
  const all = (data ?? []) as Array<{ slug: string; title: string }>;
  const titleOf = (slug: string) => all.find((c) => c.slug === slug)?.title ?? slug;
  const move = (i: number, dir: -1 | 1) => {
    const next = [...value];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j]!, next[i]!];
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {value.map((slug, i) => (
        <div key={slug} className="flex items-center gap-2 rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm">
          <span className="flex-1 truncate">{titleOf(slug)}</span>
          <button type="button" onClick={() => move(i, -1)} className="p-1 opacity-60 hover:opacity-100">
            <ArrowUp className="size-3.5" />
          </button>
          <button type="button" onClick={() => move(i, 1)} className="p-1 opacity-60 hover:opacity-100">
            <ArrowDown className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onChange(value.filter((s) => s !== slug))}
            className="p-1 opacity-60 hover:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        </div>
      ))}
      <select
        className={input}
        value=""
        onChange={(e) => {
          if (e.target.value) onChange([...value, e.target.value]);
        }}
      >
        <option value="">+ Agregar colección…</option>
        {all
          .filter((c) => !value.includes(c.slug))
          .map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.title}
            </option>
          ))}
      </select>
    </div>
  );
}

function MediaField({ value, onChange }: { value: string; onChange: (url: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function pick(file?: File | null) {
    if (!file) return;
    if (file.type.startsWith("video/") && file.size > 25 * 1024 * 1024) {
      toast.warning(`El video pesa ${(file.size / 1048576).toFixed(0)} MB. Para que cargue rápido, súbelo en 1080p y menos de 25 MB.`);
    }
    setBusy(true);
    try {
      onChange(await uploadSceneMedia(file));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input className={input} value={value} onChange={(e) => onChange(e.target.value)} placeholder="URL o sube un archivo" />
        <button type="button" onClick={() => ref.current?.click()} disabled={busy} className="px-3 rounded-lg border border-ink/10 hover:bg-ink/5">
          <Upload className="size-4" />
        </button>
        <input ref={ref} type="file" accept="image/*,video/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
      </div>
      {value && (
        <div className="w-full h-28 bg-cream overflow-hidden rounded-lg">
          {isVideoUrl(value) ? (
            <video src={value} poster={posterUrlFor(value)} preload="none" className="w-full h-full object-cover" muted />
          ) : (
            <img src={value} alt="" loading="lazy" className="w-full h-full object-cover" />
          )}
        </div>
      )}
    </div>
  );
}


function MediaList({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try {
      const urls: string[] = [];
      for (const f of Array.from(files)) urls.push(await uploadSceneMedia(f));
      onChange([...(value ?? []), ...urls]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        {(value ?? []).map((url, i) => (
          <div key={i} className="relative h-24 bg-cream rounded-lg overflow-hidden group">
            {isVideoUrl(url) ? (
              <video src={url} poster={posterUrlFor(url)} preload="none" className="w-full h-full object-cover" muted />
            ) : (
              <img src={url} alt="" loading="lazy" className="w-full h-full object-cover" />
            )}
            <button
              type="button"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              className="absolute top-1 right-1 w-6 h-6 rounded-full bg-ivory/90 flex items-center justify-center opacity-0 group-hover:opacity-100"
            >
              <Trash2 className="size-3" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => ref.current?.click()}
          disabled={busy}
          className="h-24 rounded-lg border border-dashed border-ink/20 flex items-center justify-center text-xs text-moss hover:bg-ink/5"
        >
          {busy ? "Subiendo…" : "+ Añadir"}
        </button>
      </div>
      <input ref={ref} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => add(e.target.files)} />
    </div>
  );
}

function LayersEditor({
  layers,
  onChange,
  device = "desktop",
  onDevice,
  selectedId,
  onSelect,
}: {
  layers: Layer[];
  onChange: (l: Layer[]) => void;
  device?: Device;
  onDevice?: (d: Device) => void;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const patch = (id: string, p: Partial<Layer>) => onChange(layers.map((l) => (l.id === id ? { ...l, ...p } : l)));
  const patchPos = (l: Layer, p: Record<string, number | boolean>) =>
    onChange(layers.map((x) => (x.id === l.id ? patchBox(x, device, p as any) : x)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...layers];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next.map((l, k) => ({ ...l, z: k + 1 })));
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2">
          {(["image", "video", "text"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onChange([...layers, newLayer(k, layers.length + 1)])}
              className="px-3 py-1.5 rounded-full border border-ink/15 text-xs hover:bg-ink/5 flex items-center gap-1"
            >
              <Plus className="size-3" /> {k === "image" ? "Imagen" : k === "video" ? "Video" : "Texto"}
            </button>
          ))}
        </div>
        {onDevice && (
          <div className="flex rounded-full border border-ink/15 overflow-hidden text-[10px] uppercase tracking-widest">
            {(["desktop", "mobile"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => onDevice(d)}
                className={device === d ? "px-2.5 py-1.5 bg-ink text-ivory" : "px-2.5 py-1.5 hover:bg-ink/5"}
              >
                {d === "desktop" ? "Desk" : "Móvil"}
              </button>
            ))}
          </div>
        )}
      </div>

      {layers.map((l, i) => {
        const b = boxOf(l, device);
        const open = selectedId === l.id;
        return (
          <div key={l.id} className={"border rounded-xl p-3 bg-white space-y-2 " + (open ? "border-ink/40" : "border-ink/10")}>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => onSelect?.(open ? null : l.id)}
                className="text-[10px] uppercase tracking-widest text-moss/70 flex-1 text-left truncate"
              >
                {i + 1} · {l.kind} {l.kind === "text" && l.text ? `· ${l.text.slice(0, 18)}` : ""}
              </button>
              <div className="flex gap-1">
                <button type="button" onClick={() => patchPos(l, { hidden: !b.hidden })} className="p-1 hover:bg-ink/5 rounded">
                  {b.hidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                </button>
                <button type="button" onClick={() => move(i, -1)} className="p-1 hover:bg-ink/5 rounded"><ArrowUp className="size-3" /></button>
                <button type="button" onClick={() => move(i, 1)} className="p-1 hover:bg-ink/5 rounded"><ArrowDown className="size-3" /></button>
                <button type="button" onClick={() => onChange(layers.filter((x) => x.id !== l.id))} className="p-1 hover:bg-ink/5 rounded"><Trash2 className="size-3" /></button>
              </div>
            </div>

            {l.kind === "text" ? (
              <textarea rows={2} className={input} value={l.text ?? ""} onChange={(e) => patch(l.id, { text: e.target.value })} placeholder="Texto" />
            ) : (
              <MediaField value={l.url ?? ""} onChange={(url) => patch(l.id, { url })} />
            )}

            <div>
              <label className={label}>Enlace (opcional)</label>
              <input className={input} value={l.href ?? ""} onChange={(e) => patch(l.id, { href: e.target.value })} placeholder="/producto/mi-pieza" />
            </div>

            {l.kind === "text" && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={label}>Etiqueta SEO</label>
                    <select className={input} value={l.tag ?? "p"} onChange={(e) => patch(l.id, { tag: e.target.value as Layer["tag"] })}>
                      <option value="h1">H1 · Título principal</option>
                      <option value="h2">H2 · Subtítulo</option>
                      <option value="h3">H3</option>
                      <option value="p">Párrafo</option>
                    </select>
                  </div>
                  <div>
                    <label className={label}>Tipografía</label>
                    <select className={input} value={l.font ?? "serif"} onChange={(e) => patch(l.id, { font: e.target.value as Layer["font"] })}>
                      <option value="serif">Instrument Serif</option>
                      <option value="sans">Inter</option>
                      <option value="nm">Neue Montreal</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className={label}>Peso</label>
                    <select className={input} value={l.weight ?? 400} onChange={(e) => patch(l.id, { weight: Number(e.target.value) })}>
                      {[300, 400, 500, 600, 700, 800].map((w) => <option key={w} value={w}>{w}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={label}>Alineación</label>
                    <select className={input} value={l.align ?? "left"} onChange={(e) => patch(l.id, { align: e.target.value as Layer["align"] })}>
                      <option value="left">Izq.</option>
                      <option value="center">Centro</option>
                      <option value="right">Der.</option>
                    </select>
                  </div>
                  <div>
                    <label className={label}>Color</label>
                    <input type="color" value={l.color || "#1c1a17"} onChange={(e) => patch(l.id, { color: e.target.value })} className="h-9 w-full rounded border border-ink/10" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className={label}>Tamaño (vw)</label>
                    <input type="number" step="0.1" className={input} value={b.size ?? 4} onChange={(e) => patchPos(l, { size: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className={label}>Interlínea</label>
                    <input type="number" step="0.05" className={input} value={l.lineHeight ?? 1} onChange={(e) => patch(l.id, { lineHeight: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className={label}>Tracking</label>
                    <input type="number" step="0.01" className={input} value={l.tracking ?? 0} onChange={(e) => patch(l.id, { tracking: Number(e.target.value) })} />
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={!!l.italic} onChange={(e) => patch(l.id, { italic: e.target.checked })} /> Itálica
                </label>
              </div>
            )}

            {l.kind !== "text" && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={label}>Ajuste</label>
                  <select className={input} value={l.fit ?? "contain"} onChange={(e) => patch(l.id, { fit: e.target.value as Layer["fit"] })}>
                    <option value="contain">Completo (sin recortar)</option>
                    <option value="cover">Rellenar (recorta)</option>
                  </select>
                </div>
                <div>
                  <label className={label}>Proporción</label>
                  <select className={input} value={l.ratio ?? ""} onChange={(e) => patch(l.id, { ratio: e.target.value })}>
                    <option value="">Natural</option>
                    <option value="3/4">3:4</option>
                    <option value="1/1">1:1</option>
                    <option value="4/3">4:3</option>
                    <option value="16/9">16:9</option>
                    <option value="9/16">9:16</option>
                  </select>
                </div>
              </div>
            )}

            <div>
              <label className={label}>Posición · {device === "mobile" ? "Móvil" : "Desktop"}</label>
              <div className="grid grid-cols-4 gap-2">
                {(["x", "y", "w", "rotate"] as const).map((k) => (
                  <input
                    key={k}
                    type="number"
                    className={input}
                    value={b[k]}
                    onChange={(e) => patchPos(l, { [k]: Number(e.target.value) })}
                    placeholder={k}
                  />
                ))}
              </div>
              {device === "mobile" && l.mobile && (
                <button type="button" onClick={() => patch(l.id, { mobile: undefined })} className="mt-2 text-[11px] text-moss hover:underline">
                  Usar la misma posición del desktop
                </button>
              )}
            </div>

            <div>
              <label className={label}>Opacidad</label>
              <input type="range" min={0} max={1} step={0.05} value={l.opacity} onChange={(e) => patch(l.id, { opacity: Number(e.target.value) })} className="w-full" />
            </div>
          </div>
        );
      })}
      {!layers.length && <p className="text-xs text-moss/60">Aún no hay capas.</p>}
    </div>
  );
}

function CardsEditor({ value, onChange }: { value: ExpandCard[]; onChange: (v: ExpandCard[]) => void }) {
  const cards = value ?? [];
  const patch = (id: string, p: Partial<ExpandCard>) => onChange(cards.map((c) => (c.id === id ? { ...c, ...p } : c)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...cards];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => onChange([...cards, newCard()])}
        className="px-3 py-1.5 rounded-full border border-ink/15 text-xs hover:bg-ink/5 flex items-center gap-1"
      >
        <Plus className="size-3" /> Añadir tarjeta
      </button>
      {cards.map((c, i) => (
        <div key={c.id} className="border border-ink/10 rounded-xl p-3 bg-white space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-moss/70 truncate">{i + 1} · {c.title || "Sin título"}</span>
            <div className="flex gap-1">
              <button type="button" onClick={() => move(i, -1)} className="p-1 hover:bg-ink/5 rounded"><ArrowUp className="size-3" /></button>
              <button type="button" onClick={() => move(i, 1)} className="p-1 hover:bg-ink/5 rounded"><ArrowDown className="size-3" /></button>
              <button type="button" onClick={() => onChange(cards.filter((x) => x.id !== c.id))} className="p-1 hover:bg-ink/5 rounded"><Trash2 className="size-3" /></button>
            </div>
          </div>
          <div>
            <label className={label}>Categoría</label>
            <input className={input} value={c.category ?? ""} onChange={(e) => patch(c.id, { category: e.target.value })} />
          </div>
          <div>
            <label className={label}>Título</label>
            <input className={input} value={c.title ?? ""} onChange={(e) => patch(c.id, { title: e.target.value })} />
          </div>
          <div>
            <label className={label}>Contenido (un párrafo por línea)</label>
            <textarea rows={4} className={input} value={c.content ?? ""} onChange={(e) => patch(c.id, { content: e.target.value })} />
          </div>
          <div>
            <label className={label}>Imagen o video</label>
            <MediaField value={c.media ?? ""} onChange={(media) => patch(c.id, { media })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label}>Enlace</label>
              <input className={input} value={c.href ?? ""} onChange={(e) => patch(c.id, { href: e.target.value })} placeholder="/coleccion/back-to-selva" />
            </div>
            <div>
              <label className={label}>Texto del botón</label>
              <input className={input} value={c.ctaLabel ?? ""} onChange={(e) => patch(c.id, { ctaLabel: e.target.value })} placeholder="Ver más" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label}>Ancho de la tarjeta</label>
              <select className={input} value={c.size ?? "wide"} onChange={(e) => patch(c.id, { size: e.target.value as ExpandCard["size"] })}>
                <option value="wide">Automático (mosaico)</option>
                <option value="narrow">Angosta</option>
              </select>
            </div>
            <div>
              <label className={label}>Color del texto</label>
              <select className={input} value={c.theme ?? "light"} onChange={(e) => patch(c.id, { theme: e.target.value as ExpandCard["theme"] })}>
                <option value="light">Claro (sobre foto)</option>
                <option value="dark">Oscuro</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {([["width", "Zoom %"], ["left", "Izq %"], ["top", "Top px"], ["bottom", "Abajo px"]] as const).map(([k, lbl]) => (
              <div key={k}>
                <label className={label}>{lbl}</label>
                <input
                  type="number"
                  className={input}
                  value={c[k] ?? ""}
                  onChange={(e) => patch(c.id, { [k]: e.target.value === "" ? undefined : Number(e.target.value) } as Partial<ExpandCard>)}
                />
              </div>
            ))}
          </div>
        </div>
      ))}
      {!cards.length && <p className="text-xs text-moss/60">Aún no hay tarjetas.</p>}
    </div>
  );
}

/* ---------------- Selector de productos ---------------- */
type PickerProduct = { id: string; name: string; hero_image_url: string | null; slug: string };

function ProductPicker({ value, max, emptyFallback = true, onChange }: { value: string[]; max?: number; emptyFallback?: boolean; onChange: (v: string[]) => void }) {
  const [q, setQ] = useState("");
  const { data } = useQuery({
    queryKey: ["picker-products"],
    queryFn: async (): Promise<PickerProduct[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, hero_image_url")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as PickerProduct[];
    },
  });
  const all: PickerProduct[] = data ?? [];
  const byId = new Map(all.map((p) => [p.id, p]));
  const results = all.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) && !value.includes(p.id));

  const move = (i: number, dir: number) => {
    const next = [...value];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {value.map((id, i) => {
          const p = byId.get(id);
          return (
            <div key={id} className="flex items-center gap-2 bg-white border border-ink/10 rounded-lg p-2">
              <div className="w-9 h-11 bg-cream overflow-hidden rounded shrink-0">
                {p?.hero_image_url && <img src={p.hero_image_url} alt="" className="w-full h-full object-cover" />}
              </div>
              <span className="text-sm flex-1 truncate">{p?.name ?? id}</span>
              <button type="button" onClick={() => move(i, -1)} className="p-1 hover:bg-ink/5 rounded"><ArrowUp className="size-3.5" /></button>
              <button type="button" onClick={() => move(i, 1)} className="p-1 hover:bg-ink/5 rounded"><ArrowDown className="size-3.5" /></button>
              <button type="button" onClick={() => onChange(value.filter((v) => v !== id))} className="p-1 hover:bg-ink/5 rounded"><Trash2 className="size-3.5" /></button>
            </div>
          );
        })}
        {value.length === 0 && emptyFallback && <p className="text-xs text-moss/70">Sin productos: se muestran los de la colección.</p>}
      </div>
      {(!max || value.length < max) && <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto…" />}
      {max && <p className="text-[10px] text-moss/60">{value.length} de {max} productos seleccionados</p>}
      <div className="max-h-56 overflow-y-auto space-y-1">
        {(!max || value.length < max) && results.slice(0, 40).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => { if (max && value.length >= max) return; onChange([...value, p.id]); setQ(""); }}
            className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-ink/5 text-left"
          >
            <div className="w-8 h-10 bg-cream overflow-hidden rounded shrink-0">
              {p.hero_image_url && <img src={p.hero_image_url} alt="" className="w-full h-full object-cover" />}
            </div>
            <span className="text-sm flex-1 truncate">{p.name}</span>
            <Plus className="size-3.5 opacity-60" />
          </button>
        ))}
      </div>
    </div>
  );
}

function BannersEditor({ value, onChange }: { value: CatalogBanner[]; onChange: (v: CatalogBanner[]) => void }) {
  const banners = value ?? [];
  const patch = (id: string, p: Partial<CatalogBanner>) =>
    onChange(banners.map((b) => (b.id === id ? { ...b, ...p } : b)));
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => onChange([...banners, newCatalogBanner()])}
        className="px-3 py-1.5 rounded-full border border-ink/15 text-xs hover:bg-ink/5 flex items-center gap-1"
      >
        <Plus className="size-3" /> Añadir banner
      </button>
      <p className="text-[11px] text-moss/70">
        Cada banner aparece dentro de la misma retícula, en formato 1080 × 1350 y ocupando siempre dos columnas.
      </p>
      {banners.map((b, i) => (
        <div key={b.id} className="border border-ink/10 rounded-xl p-3 bg-white space-y-2">
          {!b.media && (
            <p className="text-[11px] text-red-600">Falta la imagen o el video: sin eso el banner no se muestra en la tienda.</p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-moss/70 truncate">
              {i + 1} · {b.title || "Banner"}
            </span>
            <button type="button" onClick={() => onChange(banners.filter((x) => x.id !== b.id))} className="p-1 hover:bg-ink/5 rounded">
              <Trash2 className="size-3" />
            </button>
          </div>
          <div>
            <label className={label}>Imagen o video</label>
            <MediaField value={b.media ?? ""} onChange={(media) => patch(b.id, { media })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label}>Antetítulo</label>
              <input className={input} value={b.eyebrow ?? ""} onChange={(e) => patch(b.id, { eyebrow: e.target.value })} />
            </div>
            <div>
              <label className={label}>Título</label>
              <input className={input} value={b.title ?? ""} onChange={(e) => patch(b.id, { title: e.target.value })} />
            </div>
          </div>
          <div>
            <label className={label}>Enlace</label>
            <input className={input} value={b.href ?? ""} onChange={(e) => patch(b.id, { href: e.target.value })} placeholder="/coleccion/back-to-selva" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label}>Tras N productos</label>
              <input type="number" min={0} className={input} value={b.after ?? 0} onChange={(e) => patch(b.id, { after: Number(e.target.value) })} />
            </div>
            <div>
              <label className={label}>Oscurecer</label>
              <input type="number" min={0} max={1} step={0.05} className={input} value={b.overlay ?? 0} onChange={(e) => patch(b.id, { overlay: Number(e.target.value) })} />
            </div>
          </div>
        </div>
      ))}
      {!banners.length && <p className="text-xs text-moss/60">Aún no hay banners.</p>}
    </div>
  );
}

/* ---------------- Recuadros del muro de estudio ---------------- */
function SingleProductPicker({ value, onChange }: { value?: string; onChange: (id: string | undefined) => void }) {
  const [q, setQ] = useState("");
  const { data } = useQuery({
    queryKey: ["picker-products"],
    queryFn: async (): Promise<PickerProduct[]> => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, hero_image_url")
        .eq("status", "published")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as PickerProduct[];
    },
  });
  const all = data ?? [];
  const current = all.find((p) => p.id === value);
  if (value) {
    return (
      <div className="flex items-center gap-2 bg-white border border-ink/10 rounded-lg p-2">
        <div className="w-9 h-11 bg-cream overflow-hidden rounded shrink-0">
          {current?.hero_image_url && <img src={current.hero_image_url} alt="" className="w-full h-full object-cover" />}
        </div>
        <span className="text-sm flex-1 truncate">{current?.name ?? value}</span>
        <button type="button" onClick={() => onChange(undefined)} className="p-1 hover:bg-ink/5 rounded"><Trash2 className="size-3.5" /></button>
      </div>
    );
  }
  const results = all.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="space-y-2">
      <input className={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar producto…" />
      <div className="max-h-44 overflow-y-auto space-y-1">
        {results.slice(0, 30).map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => { onChange(p.id); setQ(""); }}
            className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-ink/5 text-left"
          >
            <div className="w-8 h-10 bg-cream overflow-hidden rounded shrink-0">
              {p.hero_image_url && <img src={p.hero_image_url} alt="" className="w-full h-full object-cover" />}
            </div>
            <span className="text-sm flex-1 truncate">{p.name}</span>
            <Plus className="size-3.5 opacity-60" />
          </button>
        ))}
      </div>
    </div>
  );
}

function WallSlotsEditor({ value, onChange }: { value: WallSlot[]; onChange: (v: WallSlot[]) => void }) {
  const slots: WallSlot[] = WALL_LAYOUT.map(
    (l) => (value ?? []).find((s) => s.id === l.id) ?? { id: l.id, kind: "empty" as const, fit: "cover" as const },
  );
  const patch = (id: string, p: Partial<WallSlot>) => onChange(slots.map((s) => (s.id === id ? { ...s, ...p } : s)));

  return (
    <div className="space-y-3">
      {WALL_LAYOUT.map((l, i) => {
        const s = slots[i];
        return (
          <div key={l.id} className="border border-ink/10 rounded-xl p-3 bg-white space-y-2">
            <span className="text-[10px] uppercase tracking-widest text-moss/70">{i + 1} · {l.label}</span>
            <div className="flex gap-1.5">
              {([["empty", "Vacío"], ["product", "Producto"], ["image", "Imagen"], ["video", "Video"]] as const).map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => patch(l.id, { kind: k })}
                  className={
                    "px-2.5 py-1 rounded-full text-[11px] border " +
                    (s.kind === k ? "bg-ink text-ivory border-ink" : "border-ink/15 hover:bg-ink/5")
                  }
                >
                  {lbl}
                </button>
              ))}
            </div>
            {s.kind === "product" && <SingleProductPicker value={s.productId} onChange={(productId) => patch(l.id, { productId })} />}
            {(s.kind === "image" || s.kind === "video") && (
              <>
                <MediaField value={s.url ?? ""} onChange={(url) => patch(l.id, { url })} />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={label}>Enlace (opcional)</label>
                    <input className={input} value={s.href ?? ""} onChange={(e) => patch(l.id, { href: e.target.value })} placeholder="/coleccion/back-to-selva" />
                  </div>
                  <div>
                    <label className={label}>Ajuste</label>
                    <select className={input} value={s.fit ?? "cover"} onChange={(e) => patch(l.id, { fit: e.target.value as WallSlot["fit"] })}>
                      <option value="cover">Rellenar (recorta)</option>
                      <option value="contain">Completo</option>
                    </select>
                  </div>
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Tipos de prenda ---------------- */
function GarmentTypesEditor({ value, onChange }: { value: GarmentTypeItem[]; onChange: (v: GarmentTypeItem[]) => void }) {
  const items = value ?? [];
  const { data: types } = useQuery(productTypesQuery());
  const options = (types ?? []).filter((t) => t.active !== false);
  const patch = (id: string, p: Partial<GarmentTypeItem>) =>
    onChange(items.map((it) => (it.id === id ? { ...it, ...p } : it)));
  const move = (i: number, dir: -1 | 1) => {
    const next = [...items];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => onChange([...items, newGarmentTypeItem()])}
        className="px-3 py-1.5 rounded-full border border-ink/15 text-xs hover:bg-ink/5 flex items-center gap-1"
      >
        <Plus className="size-3" /> Añadir tipo de prenda
      </button>
      {items.map((it, i) => (
        <div key={it.id} className="border border-ink/10 rounded-xl p-3 bg-white space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase tracking-widest text-moss/70 truncate">
              {i + 1} · {it.label || options.find((o) => o.slug === it.slug)?.name || "Tipo"}
            </span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => move(i, -1)} className="p-1 hover:bg-ink/5 rounded"><ArrowUp className="size-3" /></button>
              <button type="button" onClick={() => move(i, 1)} className="p-1 hover:bg-ink/5 rounded"><ArrowDown className="size-3" /></button>
              <button type="button" onClick={() => onChange(items.filter((x) => x.id !== it.id))} className="p-1 hover:bg-ink/5 rounded"><Trash2 className="size-3" /></button>
            </div>
          </div>
          <div>
            <label className={label}>Tipo de prenda</label>
            <select className={input} value={it.slug ?? ""} onChange={(e) => patch(it.id, { slug: e.target.value })}>
              <option value="">Elige un tipo…</option>
              {options.map((o) => (
                <option key={o.id} value={o.slug}>{o.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Imagen</label>
            <MediaField value={it.image ?? ""} onChange={(image) => patch(it.id, { image })} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={label}>Nombre visible</label>
              <input className={input} value={it.label ?? ""} onChange={(e) => patch(it.id, { label: e.target.value })} placeholder="Pantalones" />
            </div>
            <div>
              <label className={label}>Oscurecer</label>
              <input type="number" min={0} max={1} step={0.05} className={input} value={it.overlay ?? 0.15} onChange={(e) => patch(it.id, { overlay: Number(e.target.value) })} />
            </div>
          </div>
        </div>
      ))}
      {!items.length && <p className="text-xs text-moss/60">Aún no hay tipos de prenda en esta sección.</p>}
    </div>
  );
}
