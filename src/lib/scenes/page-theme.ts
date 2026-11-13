import type { CSSProperties } from "react";

export const PAGE_BACKGROUNDS = [
  { value: "ivory", label: "Marfil", className: "bg-ivory text-ink" },
  { value: "white", label: "Blanco", className: "bg-[#ffffff] text-ink" },
  { value: "cream", label: "Crema", className: "bg-cream text-ink" },
  { value: "ink", label: "Tinta", className: "bg-ink text-ivory" },
  { value: "moss", label: "Verde musgo", className: "bg-moss text-ivory" },
] as const;

export function pageBackgroundClass(theme: unknown) {
  const bg = theme && typeof theme === "object" && "background" in theme ? (theme as { background?: string }).background : null;
  if (typeof bg === "string" && /^#[0-9a-fA-F]{6}$/.test(bg)) return "bg-[var(--page-custom-background)] text-[var(--page-custom-foreground)]";
  return PAGE_BACKGROUNDS.find((choice) => choice.value === bg)?.className ?? PAGE_BACKGROUNDS[0].className;
}

/** ¿El fondo de página elegido es oscuro? Nombres conocidos + hex por luminancia. */
export function isDarkBackground(bg: string): boolean {
  if (bg === "ink" || bg === "moss") return true;
  if (bg === "ivory" || bg === "cream" || bg === "white") return false;
  if (/^#[0-9a-fA-F]{6}$/.test(bg)) {
    const rgb = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16) / 255);
    const [r, g, b] = rgb.map((v) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b <= 0.19;
  }
  return false;
}

export function pageBackgroundStyle(theme: unknown): CSSProperties | undefined {
  const bg = theme && typeof theme === "object" && "background" in theme ? (theme as { background?: string }).background : null;
  if (typeof bg !== "string" || !/^#[0-9a-fA-F]{6}$/.test(bg)) return undefined;
  // Colores literales: los tokens del tema (--ink/--ivory) se invierten en modo oscuro
  // y dejarían el texto del mismo color que el fondo.
  return { "--page-custom-background": bg, "--page-custom-foreground": isDarkBackground(bg) ? "#f9f4e6" : "#17191a" } as CSSProperties;
}