import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth-hooks";
import { fileToDataUrl, uploadTryOnPhoto, useTryOnPhotos, VIEW_LABELS } from "@/lib/tryon/photos";
import { useTryOnJob } from "@/lib/tryon/tryon-jobs";
import type { LookFit, LookSlot } from "@/lib/looks/board";
import { TryOnProgress } from "@/components/tryon/try-on-progress";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onClose: () => void;
  productId?: string;
  productName: string;
  /** PNG sin fondo de la prenda (recorte guardado en Looks). */
  productImage: string | null;
  /** Zona de la prenda: superior, inferior o conjunto. */
  garmentSlot?: LookSlot;
  /** Corte de la prenda inferior. */
  garmentFit?: LookFit | null;
  /** Resultado ya generado (lo abre el aviso «Ver look»). */
  resultOverride?: string | null;
  /** Foto usada en la prueba en segundo plano. */
  modelImageOverride?: string | null;
};

export function TryOnModal({
  open,
  onClose,
  productId,
  productName,
  productImage,
  garmentSlot = "full",
  garmentFit = null,
  resultOverride = null,
  modelImageOverride = null,
}: Props) {
  const { user } = useSession();
  const qc = useQueryClient();
  const { data: photos } = useTryOnPhotos(user?.id);
  const job = useTryOnJob();

  const inputRef = useRef<HTMLInputElement>(null);

  const [selected, setSelected] = useState<string | null>(null);
  const [guestPhoto, setGuestPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setGuestPhoto(null);
    }
  }, [open]);

  useEffect(() => {
    if (!selected && photos?.length) setSelected((photos.find((p) => p.isDefault) ?? photos[0]).url);
  }, [photos, selected]);

  const matchingJob = job.params?.productImage === productImage;
  const modelImage = modelImageOverride ?? (matchingJob && job.running ? job.params?.modelImage : null) ?? guestPhoto ?? selected;
  const result = resultOverride ?? (matchingJob ? job.result : null);

  const pickFile = async (file: File) => {
    try {
      const dataUrl = await fileToDataUrl(file);
      setGuestPhoto(dataUrl);
      if (user) {
        await uploadTryOnPhoto(user.id, file, "front", !photos?.length);
        qc.invalidateQueries({ queryKey: ["tryon-photos", user.id] });
      }
    } catch {
      toast.error("No pudimos leer la foto.");
    }
  };

  const run = () => {
    if (!modelImage || !productImage) return;
    job.startJob({
      productId,
      productName,
      productImage,
      modelImage,
      garmentSlot,
      garmentFit,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[80]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[92svh] w-full max-w-3xl flex-col overflow-hidden bg-ivory md:inset-y-10 md:rounded-[2px]"
          >
            <header className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink/60">Probar look</p>
              <button onClick={onClose} aria-label="Cerrar" className="text-ink/60 hover:text-ink">
                <X className="size-4" />
              </button>
            </header>

            <div className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-5 md:grid-cols-2">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-ink/45">Tu foto</p>

                {user && photos?.length ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {photos.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => {
                          setSelected(p.url);
                          setGuestPhoto(null);
                        }}
                        className={cn(
                          "overflow-hidden rounded-xl border-2 transition-colors",
                          !guestPhoto && selected === p.url ? "border-ink" : "border-transparent opacity-70",
                        )}
                      >
                        <img src={p.url} alt={VIEW_LABELS[p.view]} className="aspect-[3/4] w-full object-cover" />
                      </button>
                    ))}
                  </div>
                ) : null}

                {(guestPhoto || modelImageOverride) && modelImage && (
                  <img src={modelImage} alt="Tu foto" className="mt-3 aspect-[3/4] w-full rounded-xl object-cover" />
                )}

                <button
                  onClick={() => inputRef.current?.click()}
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 border border-ink/25 px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-ink/70 hover:border-ink hover:text-ink"
                >
                  <Camera className="size-3.5" /> {modelImage ? "Usar otra foto" : "Subir mi foto"}
                </button>
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) pickFile(file);
                  }}
                />
                <p className="mt-2 text-[11px] text-ink/45">
                  Foto de cuerpo completo, buena luz y fondo simple. {user ? "Se guarda en tu perfil." : "No la guardamos."}
                </p>
              </div>

              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-ink/45">Resultado</p>
                <div className="mt-3 flex aspect-[3/4] items-center justify-center overflow-hidden rounded-xl bg-ink/[0.05]">
                  {job.running && matchingJob ? (
                    <TryOnProgress />
                  ) : result ? (
                    <img src={result} alt={`Prueba virtual de ${productName}`} className="size-full object-cover" />
                  ) : productImage ? (
                    <img src={productImage} alt={productName} className="size-full object-contain p-6" />
                  ) : null}
                </div>

                <Button
                  onClick={run}
                  disabled={!modelImage || !productImage || job.running}
                  className="mt-4 inline-flex w-full items-center justify-center gap-2 bg-ink py-3.5 font-mono text-[11px] uppercase tracking-[0.22em] text-ivory disabled:opacity-35"
                >
                  {job.running ? "Prueba en curso…" : result ? "Probar de nuevo" : "Probar el look"}
                </Button>
                {job.running && <Button variant="ghost" className="mt-2 w-full text-ink" onClick={onClose}>Cerrar y seguir navegando</Button>}
                {matchingJob && job.failed && <p role="alert" className="mt-3 text-sm text-destructive">{job.failed}</p>}
                <p className="mt-2 text-center text-[11px] text-ink/45">
                  Se genera en segundo plano: te avisamos cuando esté lista y puedes seguir navegando.
                </p>
                {result && (
                  <a
                    href={result}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 block text-center font-mono text-[10px] uppercase tracking-[0.18em] text-ink/55 underline"
                  >
                    Ver en grande
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
