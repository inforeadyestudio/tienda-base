import type { Scene } from "./types";

export function catalogOrderIds(scenes: Scene[], collections: Record<string, string[]> = {}): string[] | null {
  const scene = scenes.find((item) => item.type === "catalog-order" && item.visible !== false);
  if (scene?.props.mode === "manual") return [...new Set((scene.props.productIds ?? []) as string[])];
  if (scene?.props.mode === "collections") {
    return [...new Set(((scene.props.collectionSlugs ?? []) as string[]).flatMap((slug) => collections[slug] ?? []))];
  }
  return null;
}