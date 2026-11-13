import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";

const KEY = "tb-theme-v1";

/** Sugerencia automática: modo oscuro entre las 7pm y las 7am, o si el sistema lo pide. */
function autoTheme(): ThemeMode {
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) return "dark";
  const hour = new Date().getHours();
  return hour >= 19 || hour < 7 ? "dark" : "light";
}

function readStored(): ThemeMode | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(KEY);
  return value === "dark" || value === "light" ? value : null;
}

function apply(mode: ThemeMode) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", mode === "dark");
  document.documentElement.style.colorScheme = mode;
}

const listeners = new Set<(mode: ThemeMode) => void>();
let current: ThemeMode = "light";

export function useTheme() {
  const [theme, setThemeState] = useState<ThemeMode>(current);

  useEffect(() => {
    const initial = readStored() ?? autoTheme();
    current = initial;
    apply(initial);
    setThemeState(initial);
    const fn = (mode: ThemeMode) => setThemeState(mode);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);

  const setTheme = (mode: ThemeMode) => {
    current = mode;
    apply(mode);
    try { window.localStorage.setItem(KEY, mode); } catch { /* ignore */ }
    listeners.forEach((fn) => fn(mode));
  };

  return { theme, setTheme, toggle: () => setTheme(current === "dark" ? "light" : "dark") };
}
