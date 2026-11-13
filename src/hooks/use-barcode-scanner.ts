import { useEffect, useRef } from "react";

/**
 * Escucha lecturas de pistola lectora (actúa como teclado).
 * Detecta ráfagas rápidas de teclas terminadas en Enter.
 */
export function useBarcodeScanner(
  onScan: (code: string) => void,
  options: { enabled?: boolean; minLength?: number; maxDelayMs?: number } = {},
) {
  const { enabled = true, minLength = 4, maxDelayMs = 60 } = options;
  const buffer = useRef("");
  const lastTime = useRef(0);
  const cb = useRef(onScan);
  cb.current = onScan;

  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      const now = Date.now();
      if (now - lastTime.current > maxDelayMs) buffer.current = "";
      lastTime.current = now;

      if (e.key === "Enter") {
        const code = buffer.current.trim();
        buffer.current = "";
        if (code.length >= minLength) {
          e.preventDefault();
          cb.current(code);
        }
        return;
      }
      if (e.key.length === 1) buffer.current += e.key;
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [enabled, minLength, maxDelayMs]);
}
