import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import { extractFields, localAdvance, type VoiceFields } from "@/lib/checkout/voice-parse";
import { decideCheckoutSpeech } from "@/lib/checkout/voice.functions";

type Props = {
  step: "details" | "delivery" | "payment";
  onFields: (fields: VoiceFields) => void;
  onAdvance: () => void;
};

const HINT: Record<Props["step"], string> = {
  details: "Di tu nombre, cédula, correo y celular.",
  delivery: "Di tu dirección y ciudad.",
  payment: "Revisa y confirma con un toque.",
};

/** Dictado continuo: rellena los campos mientras la clienta habla y avanza de paso sola. */
export function VoiceFill({ step, onFields, onAdvance }: Props) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const recognition = useRef<any>(null);
  const wanted = useRef(false);
  const decide = useServerFn(decideCheckoutSpeech);
  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const engine = new SR();
    engine.lang = "es-CO";
    engine.continuous = true;
    engine.interimResults = true;

    engine.onresult = (event: any) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0].transcript as string;
        if (!result.isFinal) { interim += text; continue; }
        setHeard(text.trim());
        const fields = extractFields(text);
        if (Object.keys(fields).length) onFields(fields);
        if (localAdvance(text)) window.setTimeout(onAdvance, 350);
        void decide({ data: { text: text.slice(0, 600), step: stepRef.current } })
          .then((decision) => { if (decision.advance) window.setTimeout(onAdvance, 350); })
          .catch(() => {});
      }
      if (interim) setHeard(interim.trim());
    };
    engine.onerror = (event: any) => {
      if (event?.error === "not-allowed") {
        wanted.current = false;
        setListening(false);
        toast.error("Permite el micrófono para dictar tus datos.");
      }
    };
    engine.onend = () => {
      if (wanted.current) { try { engine.start(); } catch { /* reinicio silencioso */ } }
      else setListening(false);
    };
    recognition.current = engine;
    return () => { wanted.current = false; try { engine.abort?.(); } catch { /* noop */ } };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    if (!recognition.current) { toast.info("Tu navegador no permite dictado por voz."); return; }
    if (listening) {
      wanted.current = false;
      recognition.current.stop();
      setListening(false);
      setHeard("");
      return;
    }
    wanted.current = true;
    setListening(true);
    try { recognition.current.start(); } catch { /* ya estaba activo */ }
  };

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={toggle}
        aria-pressed={listening}
        className={cn(
          "flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors",
          listening ? "border-ink bg-cream" : "border-ink/15 hover:bg-cream/60",
        )}
      >
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", listening ? "bg-ink text-ivory" : "bg-ink/5")}>
          {listening ? <Mic className="size-4 animate-pulse" strokeWidth={1.5} /> : <MicOff className="size-4" strokeWidth={1.5} />}
        </span>
        <span className="min-w-0">
          <span className="block text-sm">{listening ? "Escuchando…" : "Completar con voz"}</span>
          <span className="block truncate text-[11px] text-moss">{listening ? heard || HINT[step] : HINT[step]}</span>
        </span>
      </button>
    </div>
  );
}
