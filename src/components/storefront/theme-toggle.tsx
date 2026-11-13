import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";

/** Interruptor de modo noche: invierte la paleta editorial a grises oscuros. */
export function ThemeToggle({ variant = "icon" }: { variant?: "icon" | "row" }) {
  const { theme, toggle } = useTheme();
  const isDark = theme === "dark";

  if (variant === "row") {
    return (
      <button
        onClick={toggle}
        className="mt-4 flex w-full items-center justify-between border border-ink/15 px-3 py-3 font-nm text-[12px] text-ink"
      >
        <span>{isDark ? "Modo noche" : "Modo día"}</span>
        {isDark ? <Sun className="size-4" strokeWidth={1.5} /> : <Moon className="size-4" strokeWidth={1.5} />}
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      className="text-ink/80 transition-colors hover:text-ink"
      aria-label={isDark ? "Activar modo día" : "Activar modo noche"}
      title={isDark ? "Modo día" : "Modo noche"}
    >
      {isDark ? <Sun className="size-[18px]" strokeWidth={1.5} /> : <Moon className="size-[18px]" strokeWidth={1.5} />}
    </button>
  );
}
