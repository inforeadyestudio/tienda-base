import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useSession } from "@/lib/auth-hooks";
import { saveTryOnResult, startTryOn, tryOnStatus } from "@/lib/tryon/tryon.functions";
import { tryOnCategory, tryOnPrompt, type LookFit, type LookSlot } from "@/lib/looks/board";
import { TryOnModal } from "@/components/tryon/try-on-modal";
import { Button } from "@/components/ui/button";
import { TryOnProgress } from "@/components/tryon/try-on-progress";

const POLL_MS = 1200;
const MAX_WAIT_MS = 150_000;
const EXPECTED_MS = 32_000;

export type TryOnJobParams = {
  productId?: string;
  productName: string;
  productImage: string;
  modelImage: string;
  garmentSlot?: LookSlot;
  garmentFit?: LookFit | null;
};

type TryOnJobState = {
  running: boolean;
  progress: number;
  result: string | null;
  failed: string | null;
  params: TryOnJobParams | null;
};

type TryOnJobContextValue = TryOnJobState & {
  /** Lanza la prueba en segundo plano y avisa por toast cuando termine. */
  startJob: (params: TryOnJobParams) => void;
  /** Abre el modal mostrando el resultado listo. */
  openResult: () => void;
};

// Contexto único aunque el módulo se recargue (evita que el modal y el
// proveedor terminen con contextos distintos por la importación circular).
const g = globalThis as unknown as { __marcaTryOnCtx?: React.Context<TryOnJobContextValue | null> };
const TryOnJobContext = (g.__marcaTryOnCtx ??= createContext<TryOnJobContextValue | null>(null));

export function useTryOnJob() {
  const ctx = useContext(TryOnJobContext);
  if (!ctx) throw new Error("useTryOnJob debe usarse dentro de TryOnProvider");
  return ctx;
}

export function TryOnProvider({ children }: { children: ReactNode }) {
  const { user } = useSession();
  const qc = useQueryClient();
  const start = useServerFn(startTryOn);
  const status = useServerFn(tryOnStatus);
  const save = useServerFn(saveTryOnResult);
  const cancelled = useRef(false);

  const [state, setState] = useState<TryOnJobState>({
    running: false,
    progress: 0,
    result: null,
    failed: null,
    params: null,
  });
  const [resultOpen, setResultOpen] = useState(false);

  const startJob = useCallback(
    (params: TryOnJobParams) => {
      if (state.running) {
        toast.info("Ya tienes una prueba en curso. Te avisamos cuando termine.");
        return;
      }
      cancelled.current = false;
      setState({ running: true, progress: 4, result: null, failed: null, params });
      setResultOpen(true);
      toast.info("Te avisaremos cuando tu look esté listo ✨", {
        description: "Suele tardar menos de 1 minuto. Puedes seguir navegando.",
      });

      const startedAt = Date.now();
      const ticker = window.setInterval(() => {
        const elapsed = Date.now() - startedAt;
        const pct = 95 * (1 - Math.exp(-elapsed / EXPECTED_MS));
        setState((s) => (s.running ? { ...s, progress: Math.max(s.progress, Math.min(95, Math.round(pct))) } : s));
      }, 200);

      void (async () => {
        try {
          const { id } = await start({
            data: {
              modelImage: params.modelImage,
              productImage: params.productImage,
              category: tryOnCategory(params.garmentSlot ?? "full"),
              prompt: tryOnPrompt(params.garmentSlot ?? "full", params.garmentFit ?? null),
            },
          });
          while (Date.now() - startedAt < MAX_WAIT_MS) {
            if (cancelled.current) return;
            await new Promise((r) => setTimeout(r, POLL_MS));
            const res = await status({ data: { id } });
            if (res.status === "completed" && res.output[0]) {
              let output = res.output[0];
              if (user) {
                const saved = await save({ data: { id, productId: params.productId ?? null } });
                output = saved.url;
                qc.invalidateQueries({ queryKey: ["tryon-results", user.id] });
              }
              setState((s) => ({ ...s, running: false, progress: 100, result: output }));
              toast.success("¡Tu look está listo! ✨", {
                description: params.productName,
                duration: 10_000,
                action: { label: "Ver look", onClick: () => setResultOpen(true) },
              });
              return;
            }
            if (res.status === "failed") throw new Error(res.error ?? "La prueba no pudo generarse.");
          }
          throw new Error("La prueba tardó más de lo normal. Intenta de nuevo.");
        } catch (e) {
          const message = e instanceof Error ? e.message : "No pudimos generar la prueba.";
          setState((s) => ({ ...s, running: false, failed: message }));
          toast.error(message);
        } finally {
          window.clearInterval(ticker);
        }
      })();
    },
    [state.running, start, status, save, user, qc],
  );

  const openResult = useCallback(() => setResultOpen(true), []);

  return (
    <TryOnJobContext.Provider value={{ ...state, startJob, openResult }}>
      {children}
      {state.running && !resultOpen && (
        <div className="fixed bottom-5 left-4 z-[79] w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-ivory shadow-md">
          <TryOnProgress />
          <Button variant="ghost" className="mb-2 w-full" onClick={openResult}>Ver prueba en curso</Button>
        </div>
      )}
      {state.params && (
        <TryOnModal
          open={resultOpen}
          onClose={() => setResultOpen(false)}
          productId={state.params.productId}
          productName={state.params.productName}
          productImage={state.params.productImage}
          garmentSlot={state.params.garmentSlot}
          garmentFit={state.params.garmentFit}
          resultOverride={state.result}
          modelImageOverride={state.params.modelImage}
        />
      )}
    </TryOnJobContext.Provider>
  );
}
