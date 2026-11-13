import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { LookSlot } from "@/lib/looks/board";
import type { ClosetPiece } from "./queries";

export type BoardItem = {
  pieceId: string;
  name: string;
  image: string;
  slot: LookSlot;
  /** Posición del centro en % del tablero. */
  x: number;
  y: number;
  scale: number;
  z: number;
};

export type ClosetLook = {
  id: string;
  name: string;
  items: BoardItem[];
  createdAt: string;
};

const TOP_WORDS = ["camis", "blus", "top", "sueter", "suéter", "saco", "chaqueta", "abrigo", "crop", "body", "superior"];
const BOTTOM_WORDS = ["pantal", "short", "falda", "jean", "bermuda", "legging", "inferior"];
const FULL_WORDS = ["vestido", "enterizo", "jumpsuit", "conjunto", "set", "overol"];
const SHOE_WORDS = ["zapato", "sandal", "tenis", "bota", "calzado"];
const ACC_WORDS = ["bolso", "gorra", "sombrero", "cintur", "accesor", "gafas", "joy"];

/** Deduce la zona del tablero a partir del tipo de prenda. */
export function slotForPiece(piece: Pick<ClosetPiece, "garment_type" | "category" | "name">): LookSlot {
  const text = `${piece.garment_type ?? ""} ${piece.category ?? ""} ${piece.name}`.toLowerCase();
  const has = (words: string[]) => words.some((w) => text.includes(w));
  if (has(FULL_WORDS)) return "full";
  if (has(SHOE_WORDS)) return "shoes";
  if (has(ACC_WORDS)) return "accessory";
  if (has(BOTTOM_WORDS)) return "bottom";
  if (has(TOP_WORDS)) return "top";
  return "top";
}

/** Posición inicial sugerida según la zona. */
export function defaultPlacement(slot: LookSlot): Pick<BoardItem, "x" | "y" | "scale"> {
  switch (slot) {
    case "bottom":
      return { x: 50, y: 66, scale: 1 };
    case "full":
      return { x: 50, y: 48, scale: 1.15 };
    case "shoes":
      return { x: 50, y: 90, scale: 0.55 };
    case "accessory":
      return { x: 82, y: 22, scale: 0.5 };
    default:
      return { x: 50, y: 28, scale: 1 };
  }
}

function normalizeItems(raw: unknown): BoardItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i: any) => i && typeof i.image === "string")
    .map((i: any, index: number) => ({
      pieceId: String(i.pieceId ?? index),
      name: String(i.name ?? "Prenda"),
      image: String(i.image),
      slot: (i.slot ?? "top") as LookSlot,
      x: Number(i.x) || 50,
      y: Number(i.y) || 50,
      scale: Number(i.scale) || 1,
      z: Number(i.z) || index + 1,
    }));
}

export function useClosetLooks(userId?: string) {
  return useQuery({
    queryKey: ["closet-looks", userId ?? "anon"],
    enabled: !!userId,
    queryFn: async (): Promise<ClosetLook[]> => {
      const { data, error } = await supabase
        .from("closet_looks")
        .select("id, name, items, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        items: normalizeItems(row.items),
        createdAt: row.created_at,
      }));
    },
  });
}

export async function saveClosetLook(userId: string, name: string, items: BoardItem[], id?: string) {
  if (id) {
    const { error } = await supabase.from("closet_looks").update({ name, items: items as any }).eq("id", id);
    if (error) throw error;
    return id;
  }
  const { data, error } = await supabase
    .from("closet_looks")
    .insert({ user_id: userId, name, items: items as any })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function deleteClosetLook(id: string) {
  const { error } = await supabase.from("closet_looks").delete().eq("id", id);
  if (error) throw error;
}
