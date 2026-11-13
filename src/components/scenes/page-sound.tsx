import { useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";

export type PageSoundConfig = { url?: string; enabled?: boolean; volume?: number; autoplay?: boolean };

/** Sonido ambiente de la página. Si autoplay está activo intenta sonar solo (el navegador puede bloquearlo);
 *  si no, arranca apagado y el visitante lo activa con el botón. */
export function PageSound({ sound }: { sound?: PageSoundConfig | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  const [on, setOn] = useState(false);
  const active = !!sound?.enabled && !!sound?.url;

  useEffect(() => {
    if (!active) return;
    const saved = localStorage.getItem("tb-sound");
    if (saved === "on") setOn(true);
    else if (saved === "off") setOn(false);
    else if (sound?.autoplay) setOn(true);
  }, [active, sound?.autoplay]);

  useEffect(() => {
    const a = ref.current;
    if (!a) return;
    a.volume = Math.min(1, Math.max(0, Number(sound?.volume ?? 0.3)));
    if (on) a.play().catch(() => setOn(false));
    else a.pause();
  }, [on, sound?.volume, sound?.url]);

  if (!active) return null;
  return (
    <>
      <audio ref={ref} src={sound!.url} loop preload="none" />
      <button
        type="button"
        onClick={() => setOn((v) => { localStorage.setItem("tb-sound", v ? "off" : "on"); return !v; })}
        aria-label={on ? "Apagar sonido" : "Activar sonido"}
        aria-pressed={on}
        className="fixed bottom-5 left-5 z-50 flex size-11 items-center justify-center rounded-full border border-ink/15 bg-ivory/85 text-ink backdrop-blur transition-transform hover:scale-105"
      >
        {on ? <Volume2 className="size-4" strokeWidth={1.5} /> : <VolumeX className="size-4" strokeWidth={1.5} />}
      </button>
    </>
  );
}
