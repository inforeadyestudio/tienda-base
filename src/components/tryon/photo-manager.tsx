import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Loader2, Star, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PHOTO_VIEWS,
  VIEW_LABELS,
  deleteTryOnPhoto,
  setDefaultTryOnPhoto,
  uploadTryOnPhoto,
  useTryOnPhotos,
  type PhotoView,
  type TryOnPhoto,
} from "@/lib/tryon/photos";

/** Gestor de las fotos de la clienta para el probador virtual. */
export function TryOnPhotoManager({ userId, className }: { userId: string; className?: string }) {
  const qc = useQueryClient();
  const { data: photos, isLoading } = useTryOnPhotos(userId);
  const [view, setView] = useState<PhotoView>("front");
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ["tryon-photos", userId] });

  const upload = useMutation({
    mutationFn: async (file: File) => uploadTryOnPhoto(userId, file, view, !photos?.length),
    onSuccess: () => {
      toast.success("Foto guardada");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const makeDefault = useMutation({
    mutationFn: async (id: string) => setDefaultTryOnPhoto(userId, id),
    onSuccess: refresh,
  });

  const remove = useMutation({
    mutationFn: async (photo: TryOnPhoto) => deleteTryOnPhoto(photo),
    onSuccess: () => {
      toast.success("Foto eliminada");
      refresh();
    },
  });

  return (
    <section className={cn("rounded-2xl border border-ink/5 bg-white/60 p-6", className)}>
      <h2 className="font-nm text-lg">Mis fotos para probar looks</h2>
      <p className="mt-1 text-sm text-ink/60">
        Sube una foto de cuerpo completo de frente y, si quieres, otra de espalda o de lado. Solo tú puedes verlas.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {PHOTO_VIEWS.map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={cn(
              "px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors",
              view === v ? "bg-ink text-ivory" : "bg-ink/[0.06] text-ink hover:bg-ink/[0.12]",
            )}
          >
            {VIEW_LABELS[v]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={upload.isPending}
          className="ml-auto inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ivory disabled:opacity-50"
        >
          {upload.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
          Subir foto
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) upload.mutate(file);
          }}
        />
      </div>

      {isLoading ? (
        <p className="mt-5 text-sm text-ink/50">Cargando tus fotos…</p>
      ) : !photos?.length ? (
        <p className="mt-5 text-sm text-ink/50">Aún no has subido ninguna foto.</p>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {photos.map((photo) => (
            <figure key={photo.id} className="group relative overflow-hidden rounded-2xl bg-cream">
              <img src={photo.url} alt={VIEW_LABELS[photo.view]} className="aspect-[3/4] w-full object-cover" />
              <figcaption className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-ink/70 px-2 py-1.5 text-[9px] uppercase tracking-[0.16em] text-ivory">
                <span>{VIEW_LABELS[photo.view]}</span>
                <span className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Usar como principal"
                    onClick={() => makeDefault.mutate(photo.id)}
                    className={photo.isDefault ? "text-ivory" : "text-ivory/50 hover:text-ivory"}
                  >
                    <Star className="size-3.5" fill={photo.isDefault ? "currentColor" : "none"} />
                  </button>
                  <button
                    type="button"
                    aria-label="Eliminar foto"
                    onClick={() => remove.mutate(photo)}
                    className="text-ivory/50 hover:text-ivory"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
