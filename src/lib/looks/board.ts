/** Zonas y geometría compartidas por el tablero de looks (admin y tienda). */

export const LOOK_SLOTS = ["top", "bottom", "full", "shoes", "accessory"] as const;
export type LookSlot = (typeof LOOK_SLOTS)[number];

export const SLOT_LABELS: Record<LookSlot, string> = {
  top: "Superior",
  bottom: "Inferior",
  full: "Cuerpo entero",
  shoes: "Calzado",
  accessory: "Accesorio",
};

/** Centro de cada zona en % del tablero + tamaño base en % del ancho. */
export const SLOT_ANCHORS: Record<LookSlot, { x: number; y: number; w: number }> = {
  top: { x: 50, y: 26, w: 42 },
  bottom: { x: 50, y: 64, w: 40 },
  full: { x: 50, y: 46, w: 46 },
  shoes: { x: 50, y: 90, w: 22 },
  accessory: { x: 84, y: 22, w: 20 },
};

/** Corte de las prendas inferiores: ayuda al probador virtual a interpretar la silueta. */
export const LOOK_FITS = ["skinny", "wide", "straight"] as const;
export type LookFit = (typeof LOOK_FITS)[number];

export const FIT_LABELS: Record<LookFit, string> = {
  skinny: "Skinny",
  wide: "Bota ancha",
  straight: "Recto",
};

const FIT_PROMPTS: Record<LookFit, string> = {
  skinny: "skinny, fitted through the leg",
  wide: "wide-leg, flared silhouette",
  straight: "straight-leg silhouette",
};

/** Categoría de prenda que entiende el proveedor de try-on. */
export function tryOnCategory(slot: LookSlot): "tops" | "bottoms" | "one-pieces" {
  if (slot === "bottom") return "bottoms";
  if (slot === "full") return "one-pieces";
  return "tops";
}

/** Instrucción textual para el probador virtual según zona y corte. */
export function tryOnPrompt(slot: LookSlot, fit?: LookFit | null): string {
  const base =
    slot === "bottom"
      ? "bottom garment (pants or skirt)"
      : slot === "full"
        ? "full-body one-piece garment (dress, jumpsuit or matching set)"
        : "upper body garment";
  const cut = slot === "bottom" && fit ? `, ${FIT_PROMPTS[fit]}` : "";
  return `Fit the ${base}${cut} naturally on the person, preserving fabric, color and proportions.`;
}

export function normalizeFit(raw: unknown): LookFit | null {
  return (LOOK_FITS as readonly string[]).includes(String(raw)) ? (raw as LookFit) : null;
}

export type LookTransform = { x: number; y: number; scale: number };

export const DEFAULT_TRANSFORM: LookTransform = { x: 0, y: 0, scale: 1 };

export function normalizeTransform(raw: unknown): LookTransform {
  const t = (raw ?? {}) as Partial<LookTransform>;
  return {
    x: clamp(Number(t.x) || 0, -22, 22),
    y: clamp(Number(t.y) || 0, -18, 18),
    scale: clamp(Number(t.scale) || 1, 0.3, 3),
  };
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

/** Estilo absoluto de una pieza dentro del tablero. */
export function pieceStyle(slot: LookSlot, transform: LookTransform) {
  const a = SLOT_ANCHORS[slot] ?? SLOT_ANCHORS.full;
  return {
    left: `${a.x + transform.x}%`,
    top: `${a.y + transform.y}%`,
    width: `${a.w * transform.scale}%`,
    transform: "translate(-50%, -50%)",
  } as const;
}

/** Deriva la zona sugerida a partir del tipo de producto o de la categoría del closet. */
export function slotFromType(type?: string | null): LookSlot {
  const t = (type ?? "").toLowerCase();
  if (/(vestido|enterizo|conjunto|set|overol|jumpsuit)/.test(t)) return "full";
  if (/(pantal|jean|short|falda|legg|bermuda|inferior)/.test(t)) return "bottom";
  if (/(zapat|tenis|bot|sandal|calzado|tacon|tacón)/.test(t)) return "shoes";
  if (/(bolso|cartera|gafa|sombrero|cinturon|cinturón|joya|arete|collar|accesorio)/.test(t)) return "accessory";
  return "top";
}
