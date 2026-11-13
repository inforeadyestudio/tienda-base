import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { uploadSceneMedia } from "@/lib/scenes/data";
import { ArrowLeft, Eye, EyeOff, GripVertical, Monitor, PanelLeftClose, PanelLeftOpen, Plus, Save, Smartphone, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { publicUrl } from "@/lib/site";
import { collectionWithProductsQuery, draftExperienceQuery, publishExperience, unpublishExperience } from "@/lib/scenes/data";
import { availableScenes, sceneDef, sourceOf } from "@/lib/scenes/registry";
import { useSceneContextWithPicked } from "@/lib/scenes/scene-products";
import { resolvedSceneProps, SceneView } from "@/components/scenes/scene-renderer";
import { PageBackgroundContext } from "@/components/scenes/page-background-context";
import { SceneFields } from "@/components/admin/scene-fields";
import { CollageCanvas, type Device } from "@/components/admin/collage-canvas";
import type { Scene, SceneContext } from "@/lib/scenes/types";
import { cn } from "@/lib/utils";
import { BrandLoader } from "@/components/ui/page-loader";
import { Button } from "@/components/ui/button";
import { PAGE_BACKGROUNDS, pageBackgroundClass, pageBackgroundStyle } from "@/lib/scenes/page-theme";

export const Route = createFileRoute("/_authenticated/admin/tienda/experiencia/$slug")({
  head: ({ params }) => ({ meta: [
    { title: `Editar ${params.slug} · Tu Marca` },
    { name: "description", content: `Edita las secciones y el fondo de ${params.slug} en Tu Marca.` },
    { property: "og:title", content: `Editar ${params.slug} · Tu Marca` },
    { property: "og:description", content: `Edita las secciones y el fondo de ${params.slug} en Tu Marca.` },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
  ] }),
  component: ExperienceBuilder,
  validateSearch: (s: Record<string, unknown>) => ({ scene: typeof s.scene === "string" ? s.scene : undefined }),
});

const SOURCE_LABEL: Record<string, string> = { library: "Library", editorial: "Editorial", signature: "Signature" };

function ExperienceBuilder() {
  const { slug } = Route.useParams();
  const qc = useQueryClient();
  const { data: ctxData } = useQuery(collectionWithProductsQuery(slug, false));
  const collectionId = ctxData?.collection?.id;
  const { data: draft } = useQuery(draftExperienceQuery(collectionId));

  const [scenes, setScenes] = useState<Scene[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [background, setBackground] = useState("ivory");
  const [sound, setSound] = useState<{ url?: string; enabled?: boolean; volume?: number; autoplay?: boolean }>({});
  const [soundUploading, setSoundUploading] = useState(false);
  const [customBackgrounds, setCustomBackgrounds] = useState<string[]>([]);
  const [newColor, setNewColor] = useState("#f9f4e6");
  const [addingColor, setAddingColor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [panels, setPanels] = useState(true);
  const [layerId, setLayerId] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>("desktop");

  const { scene: sceneParam } = Route.useSearch();

  useEffect(() => {
    if (draft?.scenes) {
      setScenes(draft.scenes);
      setBackground(typeof draft.experience?.theme === "object" && draft.experience.theme && "background" in draft.experience.theme ? String(draft.experience.theme.background) : "ivory");
      setSound(((draft.experience?.theme as any)?.sound ?? {}) as any);
      const savedColors = (draft.experience?.theme as { customBackgrounds?: unknown } | null)?.customBackgrounds;
      setCustomBackgrounds(Array.isArray(savedColors) ? savedColors.filter((color): color is string => typeof color === "string" && /^#[0-9a-fA-F]{6}$/.test(color)) : []);
      setDirty(false);
      const wanted = sceneParam && draft.scenes.some((s) => s.id === sceneParam) ? sceneParam : null;
      setSelected((s) => wanted ?? s ?? draft.scenes[0]?.id ?? null);
    }
  }, [draft?.scenes, sceneParam]);

  const ctx: SceneContext | null = useMemo(() => {
    if (!ctxData?.collection) return null;
    return { collection: ctxData.collection as any, products: (ctxData.products ?? []) as any, catalogScenes: slug === "page-tienda" ? scenes : undefined, previewDevice: device };
  }, [ctxData, slug, scenes, device]);

  const pickedCtx = useSceneContextWithPicked(scenes, ctx ?? { collection: null as any, products: [] }, false);
  const viewCtx = ctx ? pickedCtx : null;
  const current = scenes.find((s) => s.id === selected) ?? null;
  const def = current ? sceneDef(current.type) : null;

  async function addScene(type: string) {
    if (!draft?.experience) return;
    const d = sceneDef(type);
    const { data, error } = await supabase
      .from("collection_scenes")
      .insert({
        experience_id: draft.experience.id,
        type,
        source: sourceOf(type),
        position: scenes.length + 1,
        props: (d?.defaults ?? {}) as any,
        layers: [] as any,
      })
      .select("id, type, source, position, visible, props, layers")
      .single();
    if (error) return toast.error(error.message);
    const scene = { ...(data as any), props: data.props ?? {}, layers: [] } as Scene;
    setScenes((prev) => [...prev, scene]);
    setSelected(scene.id);
  }

  async function removeScene(id: string) {
    const { error } = await supabase.from("collection_scenes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setScenes((prev) => prev.filter((s) => s.id !== id));
    if (selected === id) setSelected(null);
  }

  function patchScene(id: string, patch: Partial<Scene>) {
    setScenes((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
    setDirty(true);
  }

  function reorder(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const from = scenes.findIndex((s) => s.id === dragId);
    const to = scenes.findIndex((s) => s.id === targetId);
    const next = [...scenes];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setScenes(next.map((s, i) => ({ ...s, position: i + 1 })));
    setDirty(true);
  }

  async function save(): Promise<boolean> {
    setSaving(true);
    try {
      for (const s of scenes) {
        const { error } = await supabase
          .from("collection_scenes")
          .update({ position: s.position, visible: s.visible, props: s.props as any, layers: s.layers as any })
          .eq("id", s.id);
        if (error) throw error;
      }
      if (draft?.experience) {
        const { error } = await supabase.from("collection_experiences").update({ theme: { ...((draft.experience.theme ?? {}) as object), background, customBackgrounds, sound } as any }).eq("id", draft.experience.id);
        if (error) throw error;
      }
      setDirty(false);
      toast.success("Borrador guardado");
      qc.invalidateQueries({ queryKey: ["collection-experience-draft", collectionId] });
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    if (!draft?.experience) return;
    try {
      if (dirty && !(await save())) return;
      await publishExperience(draft.experience.id, scenes, { ...((draft.experience.theme ?? {}) as object), background, customBackgrounds, sound });
      toast.success("Experiencia publicada");
      qc.invalidateQueries({ queryKey: ["collection-experience-draft", collectionId] });
      qc.invalidateQueries({ queryKey: ["collection-experience-published", collectionId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo publicar");
    }
  }

  async function unpublish() {
    if (!draft?.experience) return;
    await unpublishExperience(draft.experience.id);
    toast.success("Experiencia despublicada");
    qc.invalidateQueries({ queryKey: ["collection-experience-draft", collectionId] });
  }

  if (!ctx || !draft) {
    return <BrandLoader />;
  }

  const published = !!draft?.experience?.published_at;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Lista de escenas */}
      <aside className={cn("w-80 shrink-0 border-r border-ink/10 bg-white flex-col h-full min-h-0", panels ? "flex" : "hidden")}>
        <div className="px-5 pt-7 pb-5 border-b border-ink/10 shrink-0">
          <Link to="/admin/tienda/colecciones" className="text-xs text-moss flex items-center gap-1 mb-3">
            <ArrowLeft className="size-3" /> Volver a colecciones
          </Link>
          <p className="font-nm text-[10px] uppercase tracking-[0.2em] text-ink/50">{ctx.collection.title} / Experience</p>
          <h1 className="font-serif italic text-2xl mt-1">Editar experiencia</h1>
          <span className={cn("inline-block mt-3 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest", published ? "bg-moss/15 text-moss" : "bg-ink/10 text-ink/60")}>
            {published ? "Publicada" : "Borrador"}
          </span>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-3 builder-scroll">
          <div className="px-5 pb-5 mb-3 border-b border-ink/10">
            <p className="font-nm text-[10px] uppercase tracking-widest text-moss/70 mb-3">Fondo de la página</p>
            <div className="flex flex-wrap gap-2">
              {PAGE_BACKGROUNDS.map((choice) => (
                <Button key={choice.value} type="button" variant="ghost" size="icon" onClick={() => { setBackground(choice.value); setDirty(true); }}
                  title={choice.label} aria-label={`Fondo ${choice.label}`} aria-pressed={background === choice.value}
                  className={cn("size-9 rounded-full border-2 transition-transform hover:scale-105", choice.className, background === choice.value ? "ring-2 ring-ink ring-offset-2 border-ivory" : "border-ink/15")} />
              ))}
              {customBackgrounds.map((color) => (
                <Button key={color} type="button" variant="ghost" size="icon" onClick={() => { setBackground(color); setDirty(true); }}
                  title={color} aria-label={`Fondo ${color}`} aria-pressed={background === color}
                  style={{ backgroundColor: color }}
                  className={cn("size-9 rounded-full border-2 transition-transform hover:scale-105", background === color ? "ring-2 ring-ink ring-offset-2 border-ivory" : "border-ink/15")} />
              ))}
              <Button type="button" variant="outline" size="icon" title="Agregar color" aria-label="Agregar color" aria-expanded={addingColor}
                onClick={() => setAddingColor((open) => !open)} className="size-9 rounded-full border-dashed border-ink/30"><Plus className="size-4" /></Button>
            </div>
            <p className="text-xs text-moss/70 mt-2">{PAGE_BACKGROUNDS.find((c) => c.value === background)?.label ?? background.toUpperCase()}</p>
            {addingColor && (
              <div className="mt-3 flex items-center gap-2">
                <input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} aria-label="Elegir color" className="size-9 shrink-0 cursor-pointer border-0 bg-transparent p-0" />
                <input type="text" value={newColor} onChange={(e) => setNewColor(e.target.value)} aria-label="Código de color" maxLength={7}
                  className="min-w-0 w-24 rounded border border-ink/20 bg-background px-2 py-1.5 text-xs text-foreground uppercase" />
                <Button type="button" size="sm" disabled={!/^#[0-9a-fA-F]{6}$/.test(newColor)} onClick={() => {
                  const color = newColor.toLowerCase();
                  setCustomBackgrounds((prev) => prev.includes(color) ? prev : [...prev, color]);
                  setBackground(color); setDirty(true); setAddingColor(false);
                }}>Agregar</Button>
              </div>
            )}
            {customBackgrounds.includes(background) && <Button type="button" variant="link" size="sm" className="mt-1 h-auto px-0 text-xs" onClick={() => {
              setCustomBackgrounds((prev) => prev.filter((color) => color !== background)); setBackground("ivory"); setDirty(true);
            }}>Eliminar color seleccionado</Button>}
          </div>
          <div className="px-5 pb-5 mb-3 border-b border-ink/10">
            <p className="font-nm text-[10px] uppercase tracking-widest text-moss/70 mb-3">Sonido ambiente</p>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" className="accent-ink" checked={!!sound.enabled} onChange={(e) => { setSound((v) => ({ ...v, enabled: e.target.checked })); setDirty(true); }} />
              Activar sonido en esta página
            </label>
            {sound.url && <audio src={sound.url} controls className="mt-3 w-full h-8" />}
            <label className="mt-3 inline-flex cursor-pointer rounded border border-ink/20 px-3 py-1.5 text-xs hover:bg-ink/5">
              {soundUploading ? "Subiendo…" : sound.url ? "Cambiar audio" : "Subir audio (MP3 o WAV)"}
              <input type="file" accept="audio/*,.mp3,.wav,.m4a,.ogg,.aac,.flac" className="hidden" disabled={soundUploading} onChange={async (e) => {
                const f = e.target.files?.[0]; if (!f) return;
                if (f.size > 30 * 1024 * 1024) {
                  toast.error("El audio pesa demasiado. Usa un MP3 o WAV de menos de 30 MB.");
                  e.target.value = "";
                  return;
                }
                setSoundUploading(true);
                try { const url = await uploadSceneMedia(f); setSound((v) => ({ ...v, url, enabled: true })); setDirty(true); }
                catch { toast.error("No se pudo subir el audio"); } finally { setSoundUploading(false); e.target.value = ""; }
              }} />
            </label>
            {sound.url && <Button type="button" variant="link" size="sm" className="ml-2 h-auto px-0 text-xs" onClick={() => { setSound({}); setDirty(true); }}>Quitar</Button>}
            <label className="mt-3 block text-xs">Volumen {Math.round((sound.volume ?? 0.3) * 100)}%
              <input type="range" min={0.05} max={1} step={0.05} value={sound.volume ?? 0.3} className="w-full accent-ink" onChange={(e) => { setSound((v) => ({ ...v, volume: Number(e.target.value) })); setDirty(true); }} />
            </label>
            <label className="mt-3 flex items-center gap-2 text-xs">
              <input type="checkbox" className="accent-ink" checked={!!sound.autoplay} onChange={(e) => { setSound((v) => ({ ...v, autoplay: e.target.checked })); setDirty(true); }} />
              Sonar automáticamente al entrar
            </label>
            <p className="text-[11px] text-moss/70 mt-1">Con reproducción automática el navegador puede bloquearlo hasta que el visitante toque la página; si está apagada, el visitante lo enciende con el botón flotante.</p>
          </div>
          {scenes.map((s, i) => {
            const d = sceneDef(s.type);
            return (
              <div
                key={s.id}
                draggable
                onDragStart={() => setDragId(s.id)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => reorder(s.id)}
                onClick={() => setSelected(s.id)}
                className={cn(
                  "mx-3 mb-1 px-3 py-2.5 rounded-xl cursor-pointer flex items-center gap-2 group",
                  selected === s.id ? "bg-ink text-ivory" : "hover:bg-ink/5",
                )}
              >
                <GripVertical className="size-3.5 opacity-40" />
                <span className="text-[10px] tabular-nums opacity-60">{String(i + 1).padStart(2, "0")}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{d?.label ?? s.type}</p>
                  <p className="text-[10px] uppercase tracking-widest opacity-50">{SOURCE_LABEL[s.source] ?? s.source}</p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); patchScene(s.id, { visible: !s.visible }); }}
                  className="p-1 opacity-60 hover:opacity-100"
                >
                  {s.visible ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); removeScene(s.id); }}
                  className="p-1 opacity-0 group-hover:opacity-60 hover:!opacity-100"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
          {!scenes.length && <p className="px-5 text-xs text-moss/60">Aún no hay escenas. Agrega la primera.</p>}
          <AddScene slug={slug} onAdd={addScene} />
        </div>

        <div className="p-4 border-t border-ink/10 space-y-2">
          <button onClick={save} disabled={saving || !dirty} className="w-full py-2.5 rounded-full border border-ink/15 text-sm hover:bg-ink/5 disabled:opacity-40 flex items-center justify-center gap-2">
            <Save className="size-4" /> {saving ? "Guardando…" : "Guardar borrador"}
          </button>
          <button onClick={publish} className="w-full py-2.5 rounded-full bg-ink text-ivory text-sm hover:bg-ink/85 flex items-center justify-center gap-2">
            <Upload className="size-4" /> Publicar experiencia
          </button>
          {published && (
            <button onClick={unpublish} className="w-full py-2 text-xs text-moss hover:underline">
              Despublicar
            </button>
          )}
        </div>
      </aside>

      {/* Preview */}
      <main className="flex-1 min-w-0 h-full min-h-0 bg-ink/5 overflow-y-auto overscroll-contain builder-scroll">
        <div className="sticky top-0 z-10 bg-ivory/90 backdrop-blur px-6 py-3 border-b border-ink/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setPanels((v) => !v)}
              className="p-1.5 rounded-lg border border-ink/10 hover:bg-ink/5"
              title={panels ? "Ocultar paneles" : "Mostrar paneles"}
            >
              {panels ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
            </button>
            <p className="font-nm text-[10px] uppercase tracking-[0.2em] text-ink/50">Vista previa en vivo</p>
            <div className="flex items-center gap-1 rounded-full border border-ink/10 p-0.5">
              {([["desktop", Monitor, "Desktop"], ["mobile", Smartphone, "Móvil"]] as const).map(([d, Icon, lbl]) => (
                <button
                  key={d}
                  onClick={() => setDevice(d)}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[11px] flex items-center gap-1.5 whitespace-nowrap",
                    device === d ? "bg-ink text-ivory" : "hover:bg-ink/5",
                  )}
                >
                  <Icon className="size-3.5" /> {lbl}
                </button>
              ))}
            </div>
          </div>
          <a
            href={publicUrl(slug === "home" ? "/home" : slug === "page-tienda" ? "/tienda" : slug === "our-world" ? "/our-world" : slug === "our-stores" ? "/our-stores" : `/coleccion/${slug}`)}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-moss hover:underline"
          >
            Ver página pública ↗
          </a>

        </div>
        <div style={pageBackgroundStyle({ background })} className={cn(pageBackgroundClass({ background }), "transition-all", device === "mobile" && "mx-auto max-w-[420px] border-x border-ink/10")}>
          <PageBackgroundContext.Provider value={background}>
          {scenes.length ? (
            [...scenes]
              .sort((a, b) => a.position - b.position)
              .map((s) => {
                const isCurrent = s.id === selected;
                if (!s.visible) {
                  if (!isCurrent) return null;
                  return (
                    <div
                      key={s.id}
                      id={`scene-${s.id}`}
                      className="flex items-center justify-center gap-2 border border-dashed border-ink/15 bg-ink/5 px-6 py-10"
                    >
                      <EyeOff className="size-4 text-ink/40" />
                      <p className="text-xs text-ink/50">
                        Esta escena está oculta y no aparecerá en la página. Actívala con el ojo para editarla aquí.
                      </p>
                    </div>
                  );
                }
                return (
                  <div
                    key={s.id}
                    id={`scene-${s.id}`}
                    onClick={() => !isCurrent && setSelected(s.id)}
                    className={cn(
                      "relative",
                      !isCurrent && "opacity-70 cursor-pointer hover:opacity-100 transition-opacity",
                    )}
                  >
                    {isCurrent && s.type === "collage" ? (
                      <CollageCanvas
                        props={{ ...def?.defaults, ...s.props }}
                        layers={s.layers ?? []}
                        selectedId={layerId}
                        device={device}
                        onSelect={setLayerId}
                        onLayers={(layers) => patchScene(s.id, { layers })}
                      />
                    ) : (
                      <div className={cn("scene-preview", !isCurrent && "pointer-events-none")}>
                        <SceneView scene={s} ctx={viewCtx!} />
                      </div>
                    )}
                  </div>
                );
              })
          ) : (
            <div className="p-20 text-center text-moss/60 text-sm">Selecciona o agrega una escena para verla aquí.</div>
          )}
          </PageBackgroundContext.Provider>
        </div>
      </main>

      {/* Formulario */}
      <aside className={cn("w-96 shrink-0 border-l border-ink/10 bg-white h-full min-h-0 overflow-y-auto overscroll-contain builder-scroll", panels ? "block" : "hidden")}>
        {current && def ? (
          <div className="p-6">
            <p className="text-[10px] uppercase tracking-widest text-moss/70">{SOURCE_LABEL[current.source]}</p>
            <h2 className="font-serif italic text-2xl mt-1 mb-1">{def.label}</h2>
            <p className="text-xs text-moss/70 mb-6">{def.description}</p>
            <SceneFields
              fields={def.fields}
              props={resolvedSceneProps(current)}
              layers={current.layers ?? []}
              device={device}
              onDevice={setDevice}
              selectedLayer={layerId}
              onSelectLayer={setLayerId}
              onProps={(patch) => patchScene(current.id, { props: { ...current.props, ...patch } })}
              onLayers={(layers) => patchScene(current.id, { layers })}
            />
          </div>
        ) : (
          <div className="p-6 text-sm text-moss/60">Selecciona una escena para editarla.</div>
        )}
      </aside>
    </div>
  );
}

function AddScene({ slug, onAdd }: { slug: string; onAdd: (type: string) => void }) {
  const [open, setOpen] = useState(false);
  const options = availableScenes(slug);
  const groups = ["Universal", "Editorial", "Signature"] as const;
  return (
    <div className="px-3 mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full py-2.5 rounded-xl border border-dashed border-ink/20 text-sm text-moss hover:bg-ink/5 flex items-center justify-center gap-2"
      >
        <Plus className="size-4" /> Agregar escena
      </button>
      {open && (
        <div className="mt-2 border border-ink/10 rounded-xl overflow-hidden">
          {groups.map((g) => {
            const list = options.filter(([, d]) => d.group === g);
            if (!list.length) return null;
            return (
              <div key={g}>
                <p className="px-3 py-2 bg-ink/5 text-[10px] uppercase tracking-widest text-moss/70">{g}</p>
                {list.map(([type, d]) => (
                  <button
                    key={type}
                    onClick={() => { onAdd(type); setOpen(false); }}
                    className="w-full text-left px-3 py-2.5 hover:bg-ink/5 border-t border-ink/5"
                  >
                    <p className="text-sm">{d.label}</p>
                    <p className="text-[11px] text-moss/60">{d.description}</p>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
