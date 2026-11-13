import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2, X, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { optimizeImageFile, uploadOptions } from "@/lib/media";
import {
  analyzeGarment,
  cutoutGarment,
  type GarmentAnalysis,
  type GarmentZone,
} from "@/lib/closet/vision.functions";

const ZONE_OPTIONS: { value: GarmentZone; label: string; hint: string }[] = [
  { value: "superior", label: "Superior", hint: "Camisa, blusa, sudadera, chaqueta" },
  { value: "inferior", label: "Inferior", hint: "Pantalón, jean, short, falda" },
  { value: "set", label: "Conjunto / Set", hint: "Superior e inferior que van juntos" },
  { value: "otro", label: "Otra", hint: "Vestido, calzado, accesorio…" },
];
import { CATEGORY_LABELS } from "@/lib/closet/queries";

type Draft = GarmentAnalysis & { previewUrl: string; path: string };

async function toDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("No pudimos leer la imagen."));
    reader.readAsDataURL(file);
  });
}

function b64ToBlob(b64: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/png" });
}

export function ClosetUploadModal({
  open,
  onClose,
  userId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  onSaved: (piece: { id: string; name: string; garment_type: string; color: string; category: string }) => void;
}) {
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const updateDraft = (index: number, patch: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));

  const analyze = useServerFn(analyzeGarment);
  const cutout = useServerFn(cutoutGarment);

  const processOne = async (optimized: File, dataUrl: string, zone: GarmentZone): Promise<Draft> => {
    const [meta, cut] = await Promise.all([
      analyze({ data: { imageDataUrl: dataUrl, zone } }),
      cutout({ data: { imageDataUrl: dataUrl, zone } }),
    ]);

    const blob = cut.b64 ? b64ToBlob(cut.b64) : optimized;
    const ext = cut.b64 ? "png" : (optimized.name.split(".").pop() ?? "webp");
    const path = `${userId}/${crypto.randomUUID()}.${ext}`;
    const upload = new File([blob], path.split("/")[1]!, { type: blob.type });
    const { error } = await supabase.storage.from("closet").upload(path, upload, uploadOptions(upload));
    if (error) throw new Error("No pudimos guardar la foto de la prenda.");

    const { data: signed } = await supabase.storage.from("closet").createSignedUrl(path, 3600);
    return { ...meta, path, previewUrl: signed?.signedUrl ?? dataUrl };
  };

  const process = useMutation({
    mutationFn: async ({ file, zone }: { file: File; zone: GarmentZone }): Promise<Draft[]> => {
      const optimized = await optimizeImageFile(file);
      const dataUrl = await toDataUrl(optimized);

      if (zone === "set") {
        // Un conjunto se guarda como dos prendas independientes para poder combinarlas.
        const [top, bottom] = await Promise.all([
          processOne(optimized, dataUrl, "superior"),
          processOne(optimized, dataUrl, "inferior"),
        ]);
        return [
          { ...top, category: top.category === "set" ? "superior" : top.category },
          { ...bottom, category: bottom.category === "set" ? "inferior" : bottom.category },
        ];
      }

      return [await processOne(optimized, dataUrl, zone)];
    },
    onSuccess: (d) => setDrafts(d),
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!drafts.length) throw new Error("Falta la prenda.");
      const { data, error } = await supabase
        .from("closet_items")
        .insert(
          drafts.map((draft) => ({
            user_id: userId,
            source: "upload",
            image_url: draft.path,
            name: draft.name,
            category: draft.category,
            garment_type: draft.garment_type,
            color: draft.color,
            color_hex: draft.color_hex,
            material: draft.material || null,
            fit: draft.fit || null,
            ai_meta: { generated: true },
          })),
        )
        .select("id");
      if (error) throw error;
      return data;
    },
    onSuccess: (rows) => {
      qc.invalidateQueries({ queryKey: ["closet"] });
      rows.forEach((row, i) => {
        const draft = drafts[i];
        if (!draft) return;
        onSaved({
          id: row.id,
          name: draft.name,
          garment_type: draft.garment_type,
          color: draft.color,
          category: draft.category,
        });
      });
      setPreview(null);
      setPendingFile(null);
      setDrafts([]);
      process.reset();
    },
  });

  const close = () => {
    onClose();
    setPreview(null);
    setPendingFile(null);
    setDrafts([]);
    process.reset();
    save.reset();
  };


  const pickFile = async (file: File) => {
    const optimized = await optimizeImageFile(file);
    setPendingFile(optimized);
    setPreview(await toDataUrl(optimized));
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="fixed inset-0 z-[95] bg-ink/50 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            className="fixed left-1/2 top-1/2 z-[96] w-[92vw] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-3xl bg-ivory shadow-2xl"
            role="dialog"
            aria-label="Agregar una prenda"
          >
            <header className="flex items-start justify-between border-b border-ink/10 px-6 py-5">
              <div>
                <p className="text-[10px] uppercase tracking-[0.28em] text-moss">Mi closet</p>
                <h2 className="font-nm mt-1 text-2xl leading-tight">Agregar una prenda</h2>
              </div>
              <button onClick={close} aria-label="Cerrar" className="text-moss">
                <X className="h-5 w-5" strokeWidth={1.5} />
              </button>
            </header>

            <div className="max-h-[70vh] overflow-y-auto px-6 py-6">
              {!preview && !drafts.length && !pendingFile && (
                <button
                  onClick={() => inputRef.current?.click()}
                  className="flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-ink/20 bg-white/60 px-6 py-12 text-center"
                >
                  <Camera className="h-6 w-6 text-moss" strokeWidth={1.5} />
                  <p className="text-sm">Toma una foto o sube una imagen</p>
                  <p className="max-w-xs text-[11px] leading-relaxed text-moss">
                    Jeans, zapatos, blazer, cartera… la recortamos y creamos su foto de producto automáticamente.
                  </p>
                </button>
              )}

              {preview && pendingFile && !process.isPending && !drafts.length && (
                <div className="flex flex-col items-center gap-5">
                  <div className="aspect-[3/4] w-40 overflow-hidden rounded-2xl bg-cream">
                    <img src={preview} alt="" className="h-full w-full object-cover" />
                  </div>
                  <div className="w-full text-center">
                    <p className="font-nm text-lg">¿Qué prenda quieres guardar?</p>
                    <p className="mt-1 text-[11px] text-moss">
                      Así la IA sabe exactamente qué extraer de la foto.
                    </p>
                  </div>
                  <div className="grid w-full grid-cols-2 gap-2">
                    {ZONE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => process.mutate({ file: pendingFile, zone: opt.value })}
                        className="rounded-2xl border border-ink/15 bg-white/70 px-3 py-3 text-left transition-colors hover:border-ink hover:bg-white"
                      >
                        <p className="text-sm">{opt.label}</p>
                        <p className="mt-0.5 text-[10px] leading-snug text-moss">{opt.hint}</p>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setPendingFile(null);
                      setPreview(null);
                    }}
                    className="text-[11px] uppercase tracking-[0.2em] text-moss underline underline-offset-4"
                  >
                    Cambiar foto
                  </button>
                </div>
              )}

              {process.isPending && preview && (
                <div className="flex flex-col items-center gap-4">
                  <div className="aspect-square w-48 overflow-hidden rounded-2xl bg-cream">
                    <img src={preview} alt="" className="h-full w-full object-cover blur-md" />
                  </div>
                  <p className="flex items-center gap-2 text-xs text-moss">
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} /> Recortando y reconociendo tu prenda…
                  </p>
                </div>
              )}

              {process.isError && (
                <p className="rounded-2xl border border-clay/40 bg-clay/10 p-4 text-xs">
                  {(process.error as Error).message}
                </p>
              )}

              {drafts.length > 0 && (
                <div className="space-y-6">
                  {drafts.length > 1 && (
                    <p className="rounded-2xl bg-white/70 px-4 py-3 text-[11px] leading-relaxed text-moss">
                      Separamos el conjunto en dos prendas para que puedas combinarlas por separado.
                    </p>
                  )}

                  {drafts.map((draft, i) => (
                    <div key={draft.path} className="space-y-3">
                      {drafts.length > 1 && (
                        <p className="text-[10px] uppercase tracking-[0.28em] text-moss">
                          {i === 0 ? "Prenda superior" : "Prenda inferior"}
                        </p>
                      )}
                      <div className="flex gap-4">
                        <div className="aspect-[3/4] w-28 shrink-0 overflow-hidden rounded-2xl bg-cream">
                          <img src={draft.previewUrl} alt={draft.name} className="h-full w-full object-cover" />
                        </div>
                        <div className="min-w-0 flex-1 space-y-3">
                          <Field label="Nombre" value={draft.name} onChange={(v) => updateDraft(i, { name: v })} />
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="text-[10px] uppercase tracking-[0.2em] text-moss">Categoría</label>
                              <select
                                value={draft.category}
                                onChange={(e) => updateDraft(i, { category: e.target.value })}
                                className="mt-1 w-full border-b border-ink/20 bg-transparent py-1 text-sm outline-none"
                              >
                                {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                                  <option key={k} value={k}>
                                    {label}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <Field
                              label="Tipo"
                              value={draft.garment_type}
                              onChange={(v) => updateDraft(i, { garment_type: v })}
                            />
                            <Field label="Color" value={draft.color} onChange={(v) => updateDraft(i, { color: v })} />
                            <Field
                              label="Material"
                              value={draft.material}
                              onChange={(v) => updateDraft(i, { material: v })}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {save.isError && (
                    <p className="text-xs text-clay">No pudimos guardar la prenda. Intenta de nuevo.</p>
                  )}

                  <button
                    onClick={() => save.mutate()}
                    disabled={save.isPending}
                    className="flex w-full items-center justify-center gap-2 bg-ink py-3 text-[11px] uppercase tracking-[0.25em] text-ivory disabled:opacity-60"
                  >
                    {save.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.5} />
                    ) : (
                      <Sparkles className="h-4 w-4" strokeWidth={1.5} />
                    )}
                    {drafts.length > 1 ? "Guardar las dos prendas" : "Guardar en mi closet"}
                  </button>
                </div>
              )}


              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void pickFile(file);
                }}
              />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-[0.2em] text-moss">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border-b border-ink/20 bg-transparent py-1 text-sm outline-none"
      />
    </div>
  );
}
