import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useSession } from "@/lib/auth-hooks";
import { useTryOnPhotos } from "@/lib/tryon/photos";
import { saveTryOnResult, startTryOn, tryOnStatus } from "@/lib/tryon/tryon.functions";
import { tryOnCategory, tryOnPrompt } from "@/lib/looks/board";
import type { BoardItem } from "@/lib/closet/looks";

const POLL_MS = 1400;
const MAX_WAIT_MS = 160_000;

/** Prendas que el probador puede vestir, en el orden en que deben aplicarse. */
function wearable(items: BoardItem[]) {
  const order = { full: 0, top: 1, bottom: 2, shoes: 9, accessory: 9 } as const;
  return items
    .filter((i) => i.slot === "full" || i.slot === "top" || i.slot === "bottom")
    .sort((a, b) => order[a.slot as "full" | "top" | "bottom"] - order[b.slot as "full" | "top" | "bottom"])
    .slice(0, 3);
}

export function LookTryOnModal({
  open,
  onClose,
  lookName,
  items,
}: {
  open: boolean;
  onClose: () => void;
  lookName: string;
  items: BoardItem[];
}) {
  const { user } = useSession();
  const qc = useQueryClient();
  const { data: photos } = useTryOnPhotos(user?.id);
  const start = useServerFn(startTryOn);
  const status = useServerFn(tryOnStatus);
  const save = useServerFn(saveTryOnResult);
  const cancelled = useRef(false);

  const [selected, setSelected] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState("");
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    cancelled.current = !open;
    if (!open) {
      setResult(null);
      setRunning(false);
      setStep("");
    }
  }, [open]);

  useEffect(() => {
    if (!selected && photos?.length) setSelected((photos.find((p) => p.isDefault) ?? photos[0]).url);
  }, [photos, selected]);

  const garments = wearable(items);

  const runOne = async (modelImage: string, item: BoardItem) => {
    const { id } = await start({
      data: {
        modelImage,
        productImage: item.image,
        category: tryOnCategory(item.slot),
        prompt: tryOnPrompt(item.slot, null),
      },
    });
    const startedAt = Date.now();
    while (Date.now() - startedAt < MAX_WAIT_MS) {
      if (cancelled.current) throw new Error("cancelado");
      await new Promise((r) => setTimeout(r, POLL_MS));
      const res = await status({ data: { id } });
      if (res.status === "completed" && res.output[0]) return { url: res.output[0], id };
      if (res.status === "failed") throw new Error(res.error ?? "La prueba no pudo generarse.");
    }
    throw new Error("La prueba tardó más de lo normal. Intenta de nuevo.");
  };

  const run = async () => {
    if (!selected || !garments.length) return;
    setRunning(true);
    setResult(null);
    try {
      let current = selected;
      let lastId = "";
      for (const item of garments) {
        setStep(`Poniéndote ${item.name}…`);
        const generated = await runOne(current, item);
        current = generated.url;
        lastId = generated.id;
        setResult(current);
      }
      if (user && lastId) {
        const saved = await save({ data: { id: lastId } });
        setResult(saved.url);
        qc.invalidateQueries({ queryKey: ["tryon-results", user.id] });
      }
      setStep("");
    } catch (e) {
      const message = e instanceof Error ? e.message : "No pudimos generar la prueba.";
      if (message !== "cancelado") toast.error(message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[95]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 30, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[92svh] w-full max-w-3xl flex-col overflow-hidden bg-shell md:inset-y-10 md:rounded-[2px]"
          >
            <header className="flex items-center justify-between border-b border-ink/10 px-5 py-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-ink/60">Probar {lookName}</p>
              <button onClick={onClose} aria-label="Cerrar" className="text-ink/60 hover:text-ink">
                <X className="size-4" />
              </button>
            </header>

            <div className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-5 md:grid-cols-2">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-ink/45">Tu foto</p>
                {photos?.length ? (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {photos.map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setSelected(p.url)}
                        className={`overflow-hidden rounded-lg border ${selected === p.url ? "border-ink" : "border-transparent"}`}
                      >
                        <img src={p.url} alt="Foto para probador" className="aspect-[3/4] w-full object-cover" />
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-[11px] leading-relaxed text-moss">
                    Primero sube una foto tuya en la sección Try-On de tu cuenta.
                  </p>
                )}

                <p className="mt-5 font-mono text-[9px] uppercase tracking-[0.24em] text-ink/45">Prendas del look</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {garments.map((g) => (
                    <span key={g.pieceId} className="rounded-full bg-cream px-3 py-1 text-[10px]">
                      {g.name}
                    </span>
                  ))}
                  {!garments.length && (
                    <span className="text-[11px] text-moss">Agrega una prenda superior, inferior o un vestido.</span>
                  )}
                </div>

                <button
                  onClick={run}
                  disabled={running || !selected || !garments.length}
                  className="mt-5 flex w-full items-center justify-center gap-2 bg-ink px-4 py-3 text-[10px] uppercase tracking-[0.25em] text-ivory disabled:opacity-40"
                >
                  {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {running ? "Probando…" : "Ponerme el look"}
                </button>
                {step && <p className="mt-2 text-center text-[11px] text-moss">{step}</p>}
              </div>

              <div className="rounded-2xl bg-cream p-3">
                {result ? (
                  <img src={result} alt="Resultado de la prueba" className="w-full rounded-xl object-cover" />
                ) : (
                  <div className="flex h-full min-h-[280px] items-center justify-center text-center text-[11px] text-moss">
                    Aquí verás el look puesto sobre tu foto.
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
