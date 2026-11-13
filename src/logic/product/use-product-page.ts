// Lógica de la página de producto. Claude NO modifica este archivo.
// Talla, color, stock, carrito, looks y probador se resuelven aquí;
// el diseño (src/design/product/product-page-view.tsx) solo muestra `vm`.
import { webSellable } from "@/lib/web-stock";
import { notFound, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { openCheckout } from "@/lib/checkout/engine";
import { toast } from "sonner";
import { productBySlugQuery, relatedProductsQuery, productLooksQuery, myClosetQuery, productVersionsQuery } from "@/lib/queries";
import { useProductSale } from "@/components/storefront/product-sale";
import { usePrice, useLocale } from "@/lib/locale";
import { useCart } from "@/lib/cart";
import { track } from "@/lib/analytics";
import { useSession } from "@/lib/auth-hooks";
import { useCloset } from "@/lib/closet/queries";
import type { CombineBase } from "@/components/closet/combine-panel";
import type { ConfPanel } from "@/components/storefront/mobile-configurator";
import type { LookRow } from "@/components/storefront/look-modal";
import { buildJourney, buildMedia, mediaForBlock } from "@/lib/journey";
import { useReadyPageContext } from "@/components/ready/ready-context";
import { normalizeLookbookConfig } from "@/components/storefront/lookbook-product";
import { LOOK_SLOTS, normalizeFit, slotFromType, type LookSlot } from "@/lib/looks/board";
import { tryOnSettingsQuery } from "@/lib/tryon/settings";
import { compareSizes, displaySize, sizeLabel } from "@/lib/size-order";
import { resolveProductVariant } from "@/lib/product-selection";

const CHAPTERS = ["Silueta", "Movimiento", "Detalle", "Fit", "Construcción", "Historia", "Espalda"];
const URGENCY_THRESHOLD = 5;

export type Availability = {
  status: "online" | "store" | "out";
  online: number;
  total: number;
  stores: { name: string; city: string | null; units: number }[];
  label: string;
  urgent: boolean;
};

export function computeAvailability(levels: { on_hand: number; reserved: number; name: string; kind: string; city: string | null; lending?: boolean; safety?: number }[]): Availability {
  const avail = levels.map((l) => {
    const raw = Math.max(0, l.on_hand - l.reserved);
    const units = l.kind === "ecom" ? raw : l.kind === "store" && l.lending ? Math.max(0, raw - (l.safety ?? 0)) : 0;
    return { ...l, units };
  });
  const online = avail.filter((l) => l.kind === "ecom").reduce((s, l) => s + l.units, 0);
  const stores = avail
    .filter((l) => l.kind === "store" && l.units > 0)
    .map((l) => ({ name: l.name, city: l.city, units: l.units }));
  const total = online + stores.reduce((s, l) => s + l.units, 0);

  if (online > 0) {
    const urgent = online <= URGENCY_THRESHOLD;
    return {
      status: "online",
      online,
      total,
      stores,
      urgent,
      label: urgent
        ? online === 1
          ? "Disponible · Última unidad"
          : `Disponible · Quedan ${online} unidades`
        : "Disponible",
    };
  }
  if (stores.length) {
    const names = stores.map((s) => s.city ?? s.name);
    const where = names.length > 1 ? `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}` : names[0];
    const units = stores.reduce((s, l) => s + l.units, 0);
    return {
      status: "store",
      online: 0,
      total,
      stores,
      urgent: true,
      label: units === 1 ? "Disponible · Última unidad" : `Disponible · Quedan ${units} unidades`,
    };
  }
  return { status: "out", online: 0, total: 0, stores: [], urgent: false, label: "Agotado", };
}

function hashCode(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function isVideo(url: string) {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url);
}

/** Unidades disponibles reales de una variante (sobre lo que hay sin reservar). */
export function variantStock(v: { inventory_levels?: unknown }) {
  return ((v.inventory_levels ?? []) as any[]).reduce(
    (sum: number, level: any) => sum + webSellable(level),
    0,
  );
}

/** Disponibilidad de una talla ya agrupada (para pintar botones de talla). */
export function sizeAvailability(v: { inventory_levels?: unknown }) {
  return computeAvailability(
    ((v.inventory_levels ?? []) as any[]).map((l) => ({
      on_hand: l.on_hand,
      reserved: l.reserved,
      name: l.locations?.name ?? "Bodega",
      kind: l.locations?.kind ?? "warehouse",
      city: l.locations?.city ?? null,
      lending: !!l.locations?.web_lending,
      safety: Number(l.locations?.web_safety_stock ?? 0),
    })),
  );
}

const colorKey = (value: string | null | undefined) => (value ?? "").trim().toLowerCase();

/** Al cambiar de versión (ej. Sol → Óptica) la ficha nueva arranca con el mismo color. */
let versionHandoff: { slug: string; color: string; at: number } | null = null;

export function useProductPage(slug: string) {
  const { data: productData } = useSuspenseQuery(productBySlugQuery(slug));
  const { lang } = useLocale();
  const data = productData && lang === "en" ? {
    ...productData,
    name: productData.name_en || productData.name,
    description: productData.description_en || productData.description,
    story: productData.story_en || productData.story,
  } : productData;
  const cart = useCart();
  const money = usePrice();
  const { user } = useSession();
  if (!data) throw notFound();

  const { data: related } = useQuery(relatedProductsQuery(data.id));
  const { data: looks } = useQuery(productLooksQuery(data.id));
  const { data: closetIds } = useQuery({ ...myClosetQuery(), enabled: Boolean(user) });
  const { data: closetPieces } = useCloset(user?.id);
  const [combineBase, setCombineBase] = useState<CombineBase | null>(null);
  useEffect(() => { track("product_view", { product: data.id, slug }); }, [data.id, slug]);

  const variants = (data.product_variants ?? []).filter((v) => v.active);
  const colors = useMemo(() => {
    const seen = new Map<string, { color: string; hex: string | null }>();
    variants.forEach((v) => {
      const c = v.color ?? "Único";
      if (!seen.has(c)) seen.set(c, { color: c, hex: v.color_hex });
    });
    return Array.from(seen.values());
  }, [variants]);

  // Color heredado al venir desde otra versión del mismo modelo.
  const [colorFromVersion] = useState<string | null>(() => {
    const h = versionHandoff;
    if (!h || h.slug !== slug || Date.now() - h.at > 15_000) return null;
    return colors.find((c) => colorKey(c.color) === colorKey(h.color))?.color ?? null;
  });
  const [colorPick, setColor] = useState(colorFromVersion ?? colors[0]?.color ?? "");
  // Al pasar de un producto a otro la página no se vuelve a montar: si el color
  // guardado no existe en este producto, usamos el primero disponible para que
  // siempre aparezcan sus tallas (antes quedaba vacío y mostraba "Única").
  const color = colors.some((c) => c.color === colorPick) ? colorPick : (colors[0]?.color ?? "");
  // Agrupa las variantes por talla "limpia" dentro del color elegido: la Calidad
  // A y la C de una misma talla se muestran como un solo botón, con el nombre de
  // la talla a secas y el inventario de ambas sumado. Orden: XS, S, M, L y al
  // final la talla única.
  const sizesForColor = useMemo(() => {
    const bySize = new Map<string, typeof variants[number][]>();
    for (const v of variants) {
      if ((v.color ?? "Único") !== color) continue;
      const label = sizeLabel(v.size);
      const group = bySize.get(label);
      if (group) group.push(v);
      else bySize.set(label, [v]);
    }
    return Array.from(bySize.values())
      .sort((a, b) => compareSizes(a[0]?.size, b[0]?.size))
      .map((group) => {
        const primary = group.find((v) => variantStock(v) > 0) ?? group[0];
        return {
          ...primary,
          size: displaySize(primary.size),
          inventory_levels: group.flatMap((v) => (v.inventory_levels ?? []) as any[]),
        };
      });
  }, [variants, color]);
  // Por defecto, la primera talla que la web puede vender (no una agotada).
  const firstSellable = useMemo(
    () =>
      sizesForColor.find(
        (v) =>
          computeAvailability(
            ((v.inventory_levels ?? []) as any[]).map((l) => ({
              on_hand: l.on_hand,
              reserved: l.reserved,
              name: l.locations?.name ?? "Bodega",
              kind: l.locations?.kind ?? "warehouse",
              city: l.locations?.city ?? null,
              lending: !!l.locations?.web_lending,
              safety: Number(l.locations?.web_safety_stock ?? 0),
            })),
          ).status !== "out",
      ) ?? sizesForColor[0],
    [sizesForColor],
  );
  const [variantId, setVariantId] = useState<string | null>(firstSellable?.id ?? null);
  const selected = resolveProductVariant(sizesForColor, variantId, (v) => variantStock(v) > 0);
  const saleState = useProductSale(data.id, selected);

  useReadyPageContext({
    page_type: "product",
    product_id: data.id,
    product_slug: data.slug,
    product_name: data.name,
    selected_variant: selected?.id,
    selected_size: selected?.size ?? undefined,
    selected_color: selected?.color ?? undefined,
  });

  const levels = ((selected?.inventory_levels ?? []) as any[]).map((l) => ({
    on_hand: l.on_hand as number,
    reserved: l.reserved as number,
    name: (l.locations?.name as string) ?? "Bodega",
    kind: (l.locations?.kind as string) ?? "warehouse",
    city: (l.locations?.city as string) ?? null,
    lending: !!l.locations?.web_lending,
    safety: Number(l.locations?.web_safety_stock ?? 0),
  }));
  const availability = computeAvailability(levels);
  const stock = availability.total;
  const onlineStock = availability.online;
  const storeWithStock = availability.stores[0];

  // Pista de medios unificada: imágenes + videos (sin fotos de ejemplo ajenas al producto)
  // Galería del color elegido: fotos de ese color + fotos sin color (de todos).
  // Si el color no tiene fotos asignadas se muestra la galería completa.
  const colorImages = useMemo(() => {
    const all = ((data as any).product_images ?? []) as { color?: string | null }[];
    const own = all.filter((i) => !i.color || colorKey(i.color) === colorKey(color));
    return own.length ? own : all;
  }, [data, color]);
  const baseMedia = buildMedia({ ...data, product_images: colorImages });
  // PNG sin fondo del producto (recorte guardado en sus looks) dentro de la galería
  const lookCutouts = useMemo(() => {
    const urls = new Set<string>();
    for (const l of ((looks ?? []) as any[])) {
      const u = (l.board as any)?.baseCutout;
      if (u) urls.add(u as string);
    }
    return Array.from(urls);
  }, [looks]);
  /** Datos que el probador virtual necesita: PNG de la prenda, zona y corte. */
  const tryOnGarment = useMemo(() => {
    const boards = ((looks ?? []) as any[]).map((l) => (l.board ?? {}) as any);
    const withCutout = boards.find((b) => b.baseCutout) ?? boards[0] ?? {};
    const slot = (LOOK_SLOTS as readonly string[]).includes(withCutout.baseSlot)
      ? (withCutout.baseSlot as LookSlot)
      : slotFromType((data as any).product_type ?? data.name);
    return {
      image: (withCutout.baseCutout as string | null) ?? lookCutouts[0] ?? data.hero_image_url,
      slot,
      fit: normalizeFit(withCutout.baseFit),
    };
  }, [looks, lookCutouts, data]);

  const mediaTrack = useMemo(
    () => [
      ...baseMedia,
      ...lookCutouts
        .filter((u) => !baseMedia.some((m) => m.url === u))
        .map((u) => ({ url: u, alt: `${data.name} sin fondo`, type: "image" as const })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data.id, color, lookCutouts, baseMedia.length],
  );
  // Bloques del recorrido (color y talla siempre presentes)
  const journey = buildJourney(data, colors.length > 1);
  const chapters = journey.map((b, i) => ({
    key: b.id,
    block: b,
    media: mediaForBlock(b, i, mediaTrack),
  }));

  // ── UI state ────────────────────────────────────────────────────────────
  const [sizeGuide, setSizeGuide] = useState(false);
  const [sizeFinder, setSizeFinder] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestPhone, setRequestPhone] = useState("");
  const [colorTouched, setColorTouched] = useState(Boolean(colorFromVersion));
  const [sizeTouched, setSizeTouched] = useState(false);
  const [videoOpen, setVideoOpen] = useState(false);
  const [lookOpen, setLookOpen] = useState(false);
  const [looksGallery, setLooksGallery] = useState(false);
  const [tryOnOpen, setTryOnOpen] = useState(false);
  const [confPanel, setConfPanel] = useState<ConfPanel>("compact");
  const [lookOverride, setLookOverride] = useState<LookRow | null>(null);
  const { data: tryOnSettings } = useQuery(tryOnSettingsQuery());
  const canTryOn = Boolean(tryOnSettings?.enabled && (user || tryOnSettings.guestEnabled) && lookCutouts.length > 0);
  const [descOpen, setDescOpen] = useState(false);
  const productVideo = ((data as any).product_videos ?? [])
    .slice()
    .sort((a: any, b: any) => a.position - b.position)[0] as { url: string } | undefined;
  // Profundidad del recorrido según el scroll: al subir se ocultan pasos,
  // pero las selecciones NO se pierden.
  const [depth, setDepth] = useState(0);
  const colorReady = colors.length <= 1 || colorTouched;
  const sizeVisible = colorReady && (colors.length <= 1 || depth >= 1);
  const sizeReady = colorReady && sizeTouched && Boolean(selected);
  const summaryVisible = sizeReady && depth >= 2;

  const journeyRef = useRef<HTMLDivElement>(null);
  const sizeAnchorRef = useRef<HTMLDivElement>(null);
  const chapterRefs = useRef<(HTMLElement | null)[]>([]);

  const scrollToChapter = (i: number) => {
    const el = chapterRefs.current[Math.min(i, chapterRefs.current.length - 1)];
    if (el) {
      const top = el.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top, behavior: "smooth" });
    }
  };

  useEffect(() => {
    const trackedChapters = [1, 2]
      .map((level) => ({ level, element: chapterRefs.current[level] }))
      .filter((entry): entry is { level: number; element: HTMLElement } => Boolean(entry.element));

    const updateProgress = () => {

      let nextDepth = 0;
      for (const { level, element } of trackedChapters) {
        if (element.getBoundingClientRect().top <= window.innerHeight * 0.7) nextDepth = level;
      }
      setDepth(nextDepth);
    };

    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
    return () => {
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, [chapters.length]);

  const buyItem = () => {
    if (!selected) return null;
    return {
      variantId: selected.id,
      productId: data.id,
      productSlug: data.slug,
      productName: data.name,
      variantLabel: [selected.color, selected.size].filter(Boolean).join(" · ") || "Único",
      priceCop: selected.price_cop,
      priceUsd: selected.price_usd ?? null,
      imageUrl: data.hero_image_url,
      qty: 1,
    };
  };

  const buyNow = () => {
    const item = buyItem();
    if (item) openCheckout(item);
  };

  const queryClient = useQueryClient();
  const addToCart = async (silent = false) => {
    if (!selected) return false;
    const ok = await cart.add({
      variantId: selected.id,
      productId: data.id,
      productSlug: data.slug,
      productName: data.name,
      variantLabel: [selected.color, selected.size].filter(Boolean).join(" · ") || "Único",
      priceCop: selected.price_cop,
      priceUsd: selected.price_usd ?? null,
      imageUrl: data.hero_image_url,
      qty: 1,
    });
    if (!ok) {
      void queryClient.invalidateQueries({ queryKey: ["storefront", "product"] });
      return false;
    }
    if (!silent) toast.success("Agregado a la bolsa");
    return true;
  };

  const pickColor = (c: string) => {
    setColor(c);
    const candidates = variants.filter((v) => (v.color ?? "Único") === c);
    const first = candidates.find((v) => variantStock(v) > 0) ?? candidates[0];
    setVariantId(first?.id ?? null);
  };

  /** Selección desde "Encuentra tu talla": busca la variante de esa talla. */
  const pickSizeByLabel = (size: string) => {
    const norm = sizeLabel(size);
    const match =
      sizesForColor.find((v) => sizeLabel(v.size) === norm) ??
      variants.find((v) => sizeLabel(v.size) === norm);
    if (!match) return;
    if ((match.color ?? "Único") !== color) {
      setColor(match.color ?? "Único");
      setColorTouched(true);
    }
    setVariantId(match.id);
    setSizeTouched(true);
    toast.success(`Talla ${displaySize(match.size)} seleccionada`);
  };

  const materialChips = (data.materials ?? "")
    .split(/[·,\n]/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 4);

  const mobileSizes = sizesForColor.map((v) => {
    const av = computeAvailability(
      ((v.inventory_levels ?? []) as any[]).map((l) => ({
        on_hand: l.on_hand,
        reserved: l.reserved,
        name: l.locations?.name ?? "Bodega",
        kind: l.locations?.kind ?? "warehouse",
        city: l.locations?.city ?? null,
            lending: !!l.locations?.web_lending,
            safety: Number(l.locations?.web_safety_stock ?? 0),
      })),
    );
    return { id: v.id, label: v.size ?? "Único", disabled: av.status === "out", storeOnly: av.status === "store" };
  });

  // ── + LOOK: capa paralela de cross-sell ────────────────────────────────
  const lookItems = (related?.items ?? []) as any[];
  const activeLook = useMemo(() => {
    const list = ((looks ?? []) as any[]).filter(
      (l) => !l.colors?.length || l.colors.includes(color),
    );
    return (list[0] ?? null) as LookRow | null;
  }, [looks, color]);
  const shownLook = lookOverride ?? activeLook;
  const lookPieces = (activeLook?.product_look_items ?? []).filter(
    (i: any) => i.products && i.products.status === "published",
  ).length;

  const addLookToBag = async (
    pieces: { productId: string; slug: string; name: string; variantId: string; label: string; price: number; image: string | null }[],
    ratio: number,
  ) => {
    const adds: Promise<boolean>[] = [];
    if (selected) {
      adds.push(cart.add({
        variantId: selected.id,
        productId: data.id,
        productSlug: data.slug,
        productName: data.name,
        variantLabel: [selected.color, selected.size].filter(Boolean).join(" · ") || "Único",
        priceCop: Math.round(selected.price_cop * ratio),
        lookRatio: ratio,
        imageUrl: data.hero_image_url,
        qty: 1,
      }));
    }
    pieces.forEach((p) => {
      adds.push(cart.add({
        variantId: p.variantId,
        productId: p.productId,
        productSlug: p.slug,
        productName: p.name,
        variantLabel: p.label,
        priceCop: Math.round(p.price * ratio),
        lookRatio: ratio,
        imageUrl: p.image,
        qty: 1,
      }));
    });
    const results = await Promise.all(adds);
    setLookOpen(false);
    if (results.some((r) => !r)) { void queryClient.invalidateQueries({ queryKey: ["storefront"] }); return; }
    toast.success("Look agregado a la bolsa");
  };

  /** Agrega directo la combinación (match) elegida en la galería de looks. */
  const addMatchToBag = (look: LookRow, items: any[]) => {
    const ratio = look.discount_pct ? 1 - look.discount_pct / 100 : 1;
    const pieces = items
      .map((i) => {
        const p = i.products;
        if (!p) return null;
        const vs = (p.product_variants ?? []).filter(
          (v: any) =>
            v.active &&
            ((v.inventory_levels ?? []) as any[]).reduce(
              (s: number, l: any) => s + webSellable(l),
              0,
            ) > 0,
        );
        const v = vs[0];
        if (!v) return null;
        return {
          productId: p.id,
          slug: p.slug,
          name: p.name,
          variantId: v.id,
          label: [v.color, v.size].filter(Boolean).join(" · ") || "Único",
          price: v.price_cop as number,
          image: p.hero_image_url as string | null,
        };
      })
      .filter(Boolean) as Parameters<typeof addLookToBag>[0];
    if (!pieces.length) {
      toast.error("Las piezas de este look no están disponibles");
      return;
    }
    setLooksGallery(false);
    addLookToBag(pieces, ratio);
  };

  /** Agrega la pieza base + la prenda elegida en el carrusel del compositor. */
  const addPairToBag = (other: any) => addMatchToBag({ discount_pct: null } as any, [{ products: other }]);


  const lookbookOn = Boolean((data as any).lookbook_enabled);

  // Versiones del mismo modelo (mismo version_group): selector tipo "Sol · Óptica".
  const navigate = useNavigate();
  const { data: versionRows } = useQuery(productVersionsQuery((data as any).version_group));
  const versions = useMemo(() => {
    const rows = (versionRows ?? []) as any[];
    if (rows.length < 2) return [] as { slug: string; label: string; current: boolean }[];
    return rows
      .map((r) => ({ slug: r.slug as string, label: (r.version_label || r.product_type || r.name) as string, current: r.id === data.id }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [versionRows, data.id]);
  // Precarga las otras versiones para que el cambio sea inmediato.
  useEffect(() => {
    versions.filter((v) => !v.current).forEach((v) => { void queryClient.prefetchQuery(productBySlugQuery(v.slug)); });
  }, [versions, queryClient]);
  const pickVersion = (targetSlug: string) => {
    if (targetSlug === slug) return;
    versionHandoff = { slug: targetSlug, color, at: Date.now() };
    void navigate({ to: "/producto/$slug", params: { slug: targetSlug }, resetScroll: false });
  };
  const lookbookConfig = (() => {
    const base = normalizeLookbookConfig((data as any).lookbook_config);
    if (base.videoUrl) return base;
    const vids = ([...((data as any).product_videos ?? [])] as any[]).sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0),
    );
    return vids[0]?.url ? { ...base, videoUrl: vids[0].url as string } : base;
  })();

  return { data, slug, cart, money, user, related, looks, closetIds, closetPieces, combineBase, setCombineBase, variants, colors, color, setColor, sizesForColor, variantId, setVariantId, selected, saleState, availability, stock, onlineStock, storeWithStock, lookCutouts, tryOnGarment, mediaTrack, journey, chapters, sizeGuide, setSizeGuide, sizeFinder, setSizeFinder, requestOpen, setRequestOpen, requestPhone, setRequestPhone, colorTouched, setColorTouched, sizeTouched, setSizeTouched, videoOpen, setVideoOpen, lookOpen, setLookOpen, looksGallery, setLooksGallery, tryOnOpen, setTryOnOpen, confPanel, setConfPanel, lookOverride, setLookOverride, canTryOn, descOpen, setDescOpen, productVideo, depth, setDepth, colorReady, sizeVisible, sizeReady, summaryVisible, scrollToChapter, buyNow, addToCart, pickColor, pickSizeByLabel, materialChips, mobileSizes, lookItems, activeLook, shownLook, lookPieces, addLookToBag, addMatchToBag, addPairToBag, lookbookOn, lookbookConfig, versions, pickVersion };
}

export type ProductPageVM = ReturnType<typeof useProductPage>;
