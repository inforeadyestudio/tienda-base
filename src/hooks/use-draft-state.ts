import { useEffect, useRef, useState } from "react";

/**
 * Estado de un formulario en curso guardado en localStorage: sobrevive a cambiar de
 * pestaña, recargar o cerrar la ventana. Con key null se comporta como useState.
 */
export function useDraftState<T>(key: string | null, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const loaded = useRef(false);
  useEffect(() => {
    if (!key) return;
    try {
      const raw = localStorage.getItem(key);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {}
    loaded.current = true;
  }, [key]);
  useEffect(() => {
    if (!key || !loaded.current) return;
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  }, [key, value]);
  return [value, setValue] as const;
}

/** Borra todos los campos guardados de un borrador (prefijo común). */
export function clearDraft(prefix: string) {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith(prefix)).forEach((k) => localStorage.removeItem(k));
  } catch {}
}
