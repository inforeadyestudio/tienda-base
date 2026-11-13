export type JourneyKind = "selection" | "info" | "media" | "recommendation";

export type JourneyBlock = {
  id: string;
  kind: JourneyKind;
  /** "color" | "size" para los bloques que sí configuran el SKU */
  slot: string | null;
  title: string;
  subtitle: string | null;
  body: string | null;
  required: boolean;
  selectable: boolean;
  affects: { gallery?: boolean; sku?: boolean; price?: boolean; inventory?: boolean };
  media: string[];
  config: Record<string, any>;
  position: number;
};

export type JourneyMedia = { url: string; alt?: string | null; type: "image" | "video" };

export function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url);
}

/** Imágenes + videos del producto en una sola pista de medios. */
export function buildMedia(product: any, fallbackUrl?: string): JourneyMedia[] {
  const images = ((product?.product_images ?? []) as any[])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((i) => ({ url: i.url as string, alt: i.alt as string | null, type: "image" as const }));
  const videos = ((product?.product_videos ?? []) as any[])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((v) => ({ url: v.url as string, alt: null, type: "video" as const, position: Number(v.position ?? 0) }));
  const coverVideos = videos.filter((video) => video.position < 0);
  const galleryVideos = videos.filter((video) => video.position >= 0);
  const list = coverVideos.length
    ? [...coverVideos, ...images, ...galleryVideos]
    : images.length
      ? [images[0], ...galleryVideos, ...images.slice(1)]
      : galleryVideos;
  if (list.length) return list;
  if (product?.hero_image_url) return [{ url: product.hero_image_url, alt: product.name, type: "image" }];
  if (fallbackUrl) return [{ url: fallbackUrl, alt: product?.name ?? null, type: "image" }];
  return [];
}

function defaultBlock(slot: "color" | "size", position: number): JourneyBlock {
  return slot === "color"
    ? {
        id: "default-color",
        kind: "selection",
        slot: "color",
        title: "Color",
        subtitle: "Elige tu tono",
        body: null,
        required: true,
        selectable: true,
        affects: { gallery: true, sku: true },
        media: [],
        config: {},
        position,
      }
    : {
        id: "default-size",
        kind: "selection",
        slot: "size",
        title: "Talla",
        subtitle: "Elige tu talla",
        body: null,
        required: true,
        selectable: true,
        affects: { sku: true, inventory: true },
        media: [],
        config: {},
        position,
      };
}

/**
 * Bloques del recorrido. Si el producto aún no tiene bloques configurados,
 * se derivan los obligatorios (color y talla) para no romper productos viejos.
 * Color y talla siempre existen, aunque el admin los haya borrado.
 */
export function buildJourney(product: any, hasColors: boolean): JourneyBlock[] {
  const rows = ((product?.product_journey_blocks ?? []) as any[])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map<JourneyBlock>((r) => ({
      id: r.id,
      kind: (r.kind ?? "info") as JourneyKind,
      slot: r.slot ?? null,
      title: r.title,
      subtitle: r.subtitle ?? null,
      body: r.body ?? null,
      required: Boolean(r.required),
      selectable: Boolean(r.selectable),
      affects: (r.affects ?? {}) as JourneyBlock["affects"],
      media: Array.isArray(r.media) ? (r.media as string[]) : [],
      config: (r.config ?? {}) as Record<string, any>,
      position: r.position ?? 0,
    }));

  const blocks = rows.length ? rows : [];

  if (hasColors && !blocks.some((b) => b.slot === "color")) {
    blocks.unshift(defaultBlock("color", -2));
  }
  if (!blocks.some((b) => b.slot === "size")) {
    const colorIdx = blocks.findIndex((b) => b.slot === "color");
    blocks.splice(colorIdx + 1, 0, defaultBlock("size", -1));
  }
  return blocks.filter((b) => !(b.slot === "color" && !hasColors));
}

/** El medio que le toca a cada bloque: el suyo, o el siguiente de la pista. */
export function mediaForBlock(block: JourneyBlock, index: number, media: JourneyMedia[]): JourneyMedia | undefined {
  if (!media.length) return undefined;
  const own = block.media?.[0];
  if (own) return media.find((m) => m.url === own) ?? { url: own, type: isVideoUrl(own) ? "video" : "image" };
  return media[index % media.length];
}
