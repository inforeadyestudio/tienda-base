import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatUSD } from "@/lib/format";
import { SITE_ORIGIN } from "@/lib/site";

import {
  Bold, Calendar, Download, ChevronDown, DollarSign, HelpCircle, Image as ImageIcon,
  Info, Italic, Layers, Link as LinkIcon, Link2, List, ListOrdered, Plus,
  Route as RouteIcon, Ruler, Search, Star, Strikethrough, Trash2, Underline, Upload, Video, X,
} from "lucide-react";
import { CoatHanger } from "@phosphor-icons/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { optimizeImageFile, optimizeVideoFile, uploadOptions } from "@/lib/media";
import {
  LookBoard, LOOK_BASE_KEY,
  type BoardBase, type BoardMatch, type BoardPiece,
} from "@/components/admin/look-board";
import { DEFAULT_TRANSFORM, LOOK_SLOTS, normalizeFit, normalizeTransform, slotFromType } from "@/lib/looks/board";
import { normalizeLookbookConfig, type LookbookConfig } from "@/components/storefront/lookbook-product";
import { captureVideoPoster } from "@/lib/media";
import { ensureProductType, productTypesQuery } from "@/lib/product-types";
import { ProductReviewsEditor } from "@/components/admin/product-reviews-editor";

type ProductImage = { id: string; url: string; position: number; alt: string | null; color?: string | null };
type ProductVideo = { id: string; url: string; position: number; size_mb: number };
type ProductFaq = { id?: string; question: string; answer: string; position: number };
type JourneyKind = "selection" | "info" | "media" | "recommendation";
type JourneyRow = {
  id?: string;
  kind: JourneyKind;
  slot: string | null;
  title: string;
  subtitle: string;
  body: string;
  required: boolean;
  selectable: boolean;
  affects: { gallery?: boolean; sku?: boolean; price?: boolean; inventory?: boolean };
  media: string[];
};

const JOURNEY_KINDS: { key: JourneyKind; label: string }[] = [
  { key: "selection", label: "Selección" },
  { key: "info", label: "Información" },
  { key: "media", label: "Media" },
  { key: "recommendation", label: "Recomendación" },
];

const defaultJourney = (): JourneyRow[] => [
  {
    kind: "selection", slot: "color", title: "Color", subtitle: "Elige tu tono", body: "",
    required: true, selectable: true, affects: { gallery: true, sku: true }, media: [],
  },
  {
    kind: "selection", slot: "size", title: "Talla", subtitle: "Elige tu talla", body: "",
    required: true, selectable: true, affects: { sku: true, inventory: true }, media: [],
  },
];
type RelatedItem = { id: string; name: string; slug: string; hero_image_url: string | null };
type RelatedKind = "related" | "cross_sell" | "upsell";
type ProductVariant = {
  id?: string;
  sku: string;
  size: string;
  color: string;
  color_hex: string;
  barcode: string;
  price_cop: string;
  compare_at_cop: string;
  cost_cop: string;
  price_usd: string;
  compare_at_usd: string;
  cost_usd: string;
  tariff_code: string;
  active: boolean;
  stock?: number | null;
};

type ProductForm = {
  name: string;
  slug: string;
  name_en: string;
  description: string;
  description_en: string;
  story: string;
  story_en: string;
  materials: string;
  composition: string;
  care: string;
  status: "draft" | "published" | "archived";
  available_national: boolean;
  available_international: boolean;
  available_pos_cali: boolean;
  available_pos_bogota: boolean;
  product_type: string;
  reference_code: string;
  version_group: string;
  version_label: string;
  tags: string;
};

const emptyForm: ProductForm = {
  name: "",
  slug: "",
  name_en: "",
  description: "",
  description_en: "",
  story: "",
  story_en: "",
  materials: "",
  composition: "",
  care: "",
  status: "draft",
  available_national: true,
  available_international: false,
  available_pos_cali: false,
  available_pos_bogota: false,
  product_type: "",
  reference_code: "",
  version_group: "",
  version_label: "",
  tags: "",
};

const emptyVariant = (): ProductVariant => ({
  sku: "",
  size: "",
  color: "",
  color_hex: "",
  barcode: "",
  price_cop: "0",
  compare_at_cop: "",
  cost_cop: "",
  price_usd: "",
  compare_at_usd: "",
  cost_usd: "",
  tariff_code: "",
  active: true,
});

type FitSizeRow = { size: string; bust: string; waist: string; hip: string; length: string };

type FitSpecForm = {
  garment_type: "bottom" | "top" | "dress" | "outerwear" | "other";
  fit_type: "slim" | "regular" | "relaxed" | "oversized";
  stretch_level: "none" | "low" | "medium" | "high";
  model_size: string;
  model_height: string;
  fit_notes: string;
  rows: FitSizeRow[];
};

const emptyFitSpec = (): FitSpecForm => ({
  garment_type: "other",
  fit_type: "regular",
  stretch_level: "low",
  model_size: "",
  model_height: "",
  fit_notes: "",
  rows: [],
});

const emptyFitRow = (): FitSizeRow => ({ size: "", bust: "", waist: "", hip: "", length: "" });

/** "84-88" o "86" → [min, max]; vacío → null. */
function parseRange(value: string): [number, number] | null {
  const nums = value
    .split(/[-–a,]/)
    .map((n) => Number(n.trim().replace(",", ".")))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (!nums.length) return null;
  return [nums[0]!, nums[1] ?? nums[0]!];
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function plainText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])>/gi, ". ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, ".")
    .replace(/\.{2,}/g, ".")
    .trim();
}

function summarize(html: string, max = 160) {
  const text = plainText(html);
  if (!text) return "";
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastStop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(", "), cut.lastIndexOf(" "));
  return `${cut.slice(0, lastStop > 60 ? lastStop : max).trim().replace(/[.,]$/, "")}…`;
}

const STOP_WORDS = new Set(["para", "con", "sin", "una", "unos", "unas", "los", "las", "del", "que", "por", "más", "muy", "este", "esta", "como", "sus", "the", "and", "and"]);

function keywordSummary(value: string, max = 6) {
  const text = plainText(value).toLowerCase();
  const seen = new Set<string>();
  const words: string[] = [];
  for (const raw of text.split(/[^a-záéíóúñü0-9%]+/)) {
    const word = raw.trim();
    if (word.length < 4 || STOP_WORDS.has(word) || seen.has(word)) continue;
    seen.add(word);
    words.push(word);
    if (words.length >= max) break;
  }
  return words;
}



function nullableNumber(value: string) {
  const clean = value.trim();
  return clean ? Number(clean) : null;
}

function requiredNumber(value: string) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function storagePathFromUrl(url: string) {
  return url.split("/product-media/").pop();
}

type LookPieceForm = BoardPiece;

type LookForm = {
  key: string;
  id?: string;
  title: string;
  imageUrl: string;
  discountPct: string;
  specialPriceCop: string;
  startsAt: string;
  endsAt: string;
  colors: string[];
  active: boolean;
  items: LookPieceForm[];
  matches: BoardMatch[];
  base: BoardBase;
};

const emptyBase = (): BoardBase => ({
  name: "",
  heroUrl: null,
  cutoutUrl: "",
  slot: "full",
  transform: { ...DEFAULT_TRANSFORM },
});

const emptyLook = (): LookForm => ({
  key: crypto.randomUUID(),
  title: "Completa el look",
  imageUrl: "",
  discountPct: "",
  specialPriceCop: "",
  startsAt: "",
  endsAt: "",
  colors: [],
  active: true,
  items: [],
  matches: [],
  base: emptyBase(),
});

export function ProductEditorModal({
  productId,
  onClose,
  onSaved,
  onDeleted,
}: {
  productId?: string;
  onClose: () => void;
  onSaved?: () => void;
  onDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [selectedCollections, setSelectedCollections] = useState<string[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([emptyVariant()]);
  const [faqs, setFaqs] = useState<ProductFaq[]>([]);
  const [images, setImages] = useState<ProductImage[]>([]);
  // Colores de las variantes, para asignar cada foto a un color.
  const variantColors = useMemo(() => {
    const seen = new Map<string, string>();
    for (const v of variants) {
      const c = (v.color ?? "").trim();
      if (c && !seen.has(c.toLowerCase())) seen.set(c.toLowerCase(), c);
    }
    return Array.from(seen.values());
  }, [variants]);
  const setImageColor = async (image: ProductImage, color: string | null) => {
    setImages((current) => current.map((i) => (i.id === image.id ? { ...i, color } : i)));
    const { error } = await supabase.from("product_images").update({ color }).eq("id", image.id);
    if (error) {
      toast.error("No se pudo guardar el color de la foto");
      setImages((current) => current.map((i) => (i.id === image.id ? { ...i, color: image.color ?? null } : i)));
    }
  };
  const [videos, setVideos] = useState<ProductVideo[]>([]);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<File[]>([]);
  const [slugTouched, setSlugTouched] = useState(false);
  const [shortTouched, setShortTouched] = useState(false);
  const [trm, setTrm] = useState<number | null>(null);
  const [pendingVideo, setPendingVideo] = useState<File | null>(null);
  const [videoAsCover, setVideoAsCover] = useState(false);
  const [removedVariantIds, setRemovedVariantIds] = useState<string[]>([]);
  const [pickedVariants, setPickedVariants] = useState<number[]>([]);
  const [genSizes, setGenSizes] = useState("");
  const [genColors, setGenColors] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkField, setBulkField] = useState<"price_cop" | "cost_cop" | "price_usd" | "cost_usd">("price_cop");
  const [related, setRelated] = useState<RelatedItem[]>([]);
  const [fitSpec, setFitSpec] = useState<FitSpecForm>(emptyFitSpec());
  const [relatedKind, setRelatedKind] = useState<RelatedKind>("related");
  const [relatedQuery, setRelatedQuery] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [locale, setLocale] = useState<"nacional" | "internacional">("nacional");
  const [journey, setJourney] = useState<JourneyRow[]>(defaultJourney());
  const [looks, setLooks] = useState<LookForm[]>([]);
  const [lookQuery, setLookQuery] = useState("");
  const [section, setSection] = useState<"info" | "variantes" | "fit" | "faqs" | "seo" | "relacionados" | "recorrido" | "looks" | "lookbook" | "resenas">("info");
  const [lookbookEnabled, setLookbookEnabled] = useState(false);
  const [lookbook, setLookbook] = useState<LookbookConfig>(normalizeLookbookConfig({}));
  const [pendingLookbookVideo, setPendingLookbookVideo] = useState<File | null>(null);
  const [pendingLookbookPoster, setPendingLookbookPoster] = useState<File | null>(null);

  const isEditing = Boolean(productId);

  const { data: collections } = useQuery({
    queryKey: ["admin", "collections", "modal-min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("collections").select("id, title").order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: product, isLoading } = useQuery({
    queryKey: ["admin-product-editor", productId],
    enabled: isEditing,
    queryFn: async () => {
      const currentId = productId;
      if (!currentId) throw new Error("Producto inválido");
      const { data, error } = await supabase
        .from("products")
        .select(`
           id, slug, name, name_en, description, description_en, story, story_en, materials, composition, care, status, hero_image_url,
          available_national, available_international, available_pos_cali, available_pos_bogota,
          product_type, reference_code, version_group, version_label, tags, fit_spec, lookbook_enabled, lookbook_config,
          collection_products(collection_id),
          product_images(id, url, position, alt, color),
          product_videos(id, url, position, size_mb),
          product_faqs(id, question, answer, position),
          product_journey_blocks(id, position, kind, slot, title, subtitle, body, required, selectable, affects, media, config),
           product_variants(id, sku, size, color, color_hex, barcode, price_cop, compare_at_cop, cost_cop, price_usd, compare_at_usd, cost_usd, tariff_code, active, inventory_levels(on_hand, reserved))
        `)
        .eq("id", currentId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: relatedRows } = useQuery({
    queryKey: ["admin-product-related", productId],
    enabled: isEditing,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_related")
        .select("related_id, kind, position, products:related_id(id, name, slug, hero_image_url)")
        .eq("product_id", productId!)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: searchResults } = useQuery({
    queryKey: ["admin-product-related-search", relatedQuery, productId],
    enabled: relatedQuery.trim().length > 1,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, slug, hero_image_url")
        .ilike("name", `%${relatedQuery.trim()}%`)
        .limit(10);
      if (error) throw error;
      return (data ?? []).filter((p) => p.id !== productId);
    },
  });

  /** Catálogo completo para el buscador del tablero de looks. */
  const { data: lookCatalog } = useQuery({
    queryKey: ["admin-look-catalog", productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, hero_image_url, product_type")
        .order("name")
        .limit(400);
      if (error) throw error;
      return (data ?? []).filter((p) => p.id !== productId);
    },
  });

  /** PNG (recorte) ya creado para cada producto en cualquier look. */
  const { data: cutoutByProduct } = useQuery({
    queryKey: ["admin-look-cutouts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_look_items")
        .select("product_id, cutout_url")
        .not("cutout_url", "is", null)
        .limit(1000);
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of (data ?? []) as any[]) {
        if (row.product_id && row.cutout_url && !map[row.product_id]) map[row.product_id] = row.cutout_url;
      }
      return map;
    },
  });

  const lookSearch = (lookCatalog ?? []).filter((p) =>
    lookQuery.trim().length < 1 ? true : p.name.toLowerCase().includes(lookQuery.trim().toLowerCase()),
  );

  useEffect(() => {
    if (!relatedRows) return;
    setRelated(relatedRows.map((r: any) => r.products).filter(Boolean));
    const firstKind = (relatedRows[0] as any)?.kind as RelatedKind | undefined;
    if (firstKind) setRelatedKind(firstKind);
  }, [relatedRows]);

  const { data: lookRows } = useQuery({
    queryKey: ["admin-product-looks", productId],
    enabled: isEditing,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_looks")
        .select(
          "id, title, image_url, position, discount_pct, special_price_cop, starts_at, ends_at, colors, active, board, product_look_items(id, position, combo_image_url, cutout_url, slot, transform, generic_label, generic_type, products:product_id(id, name, hero_image_url, product_type)), product_look_matches(id, label, position, product_look_match_items(item_id))",
        )
        .eq("product_id", productId!)
        .order("position");
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!lookRows) return;
    setLooks(
      (lookRows as any[]).map((l) => {
        const board = (l.board ?? {}) as any;
        const items: LookPieceForm[] = ((l.product_look_items ?? []) as any[])
          .slice()
          .sort((a, b) => a.position - b.position)
          .map((i) => ({
            key: i.id,
            id: i.id,
            productId: i.products?.id ?? null,
            name: i.products?.name ?? i.generic_label ?? "Pieza",
            heroUrl: i.products?.hero_image_url ?? null,
            comboImageUrl: i.combo_image_url ?? "",
            cutoutUrl: i.cutout_url ?? "",
            slot: (LOOK_SLOTS as readonly string[]).includes(i.slot) ? i.slot : slotFromType(i.products?.product_type),
            transform: normalizeTransform(i.transform),
            genericLabel: i.generic_label ?? "",
            genericType: i.generic_type ?? "",
          }));
        return {
          key: l.id,
          id: l.id,
          title: l.title ?? "",
          imageUrl: l.image_url ?? "",
          discountPct: l.discount_pct == null ? "" : String(l.discount_pct),
          specialPriceCop: l.special_price_cop == null ? "" : String(l.special_price_cop),
          startsAt: l.starts_at ? String(l.starts_at).slice(0, 10) : "",
          endsAt: l.ends_at ? String(l.ends_at).slice(0, 10) : "",
          colors: l.colors ?? [],
          active: l.active,
          items,
          matches: ((l.product_look_matches ?? []) as any[])
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((m) => ({
              key: m.id,
              id: m.id,
              label: m.label ?? "",
              pieceKeys: ((m.product_look_match_items ?? []) as any[]).map((mi) =>
                mi.item_id === null ? LOOK_BASE_KEY : mi.item_id,
              ),
            })),
          base: {
            name: "",
            heroUrl: null,
            cutoutUrl: board.baseCutout ?? "",
            slot: (LOOK_SLOTS as readonly string[]).includes(board.baseSlot) ? board.baseSlot : "full",
            fit: normalizeFit(board.baseFit),
            transform: normalizeTransform(board.baseTransform),
          },
        } satisfies LookForm;
      }),
    );
  }, [lookRows]);

  useEffect(() => {
    if (!isEditing) {
      setForm(emptyForm);
      setSelectedCollections([]);
      setVariants([emptyVariant()]);
      setFaqs([]);
      setImages([]);
      setVideos([]);
      setHeroUrl(null);
      setPendingImages([]);
      setPendingVideo(null);
      setRemovedVariantIds([]);
      setRelated([]);
      setRelatedKind("related");
      setJourney(defaultJourney());
      setLookbookEnabled(false);
      setLookbook(normalizeLookbookConfig({}));
      setPendingLookbookVideo(null);
      setPendingLookbookPoster(null);
      return;
    }
    if (!product) return;
    setForm({
      name: product.name ?? "",
      slug: product.slug ?? "",
      name_en: product.name_en ?? "",
      description: product.description ?? "",
      description_en: product.description_en ?? "",
      story: product.story ?? "",
      story_en: product.story_en ?? "",
      materials: product.materials ?? "",
      composition: product.composition ?? "",
      care: product.care ?? "",
      status: product.status,
      available_national: product.available_national,
      available_international: product.available_international,
      available_pos_cali: product.available_pos_cali,
      available_pos_bogota: product.available_pos_bogota,
      product_type: product.product_type ?? "",
      reference_code: product.reference_code ?? "",
      version_group: (product as any).version_group ?? "",
      version_label: (product as any).version_label ?? "",
      tags: (product.tags ?? []).join(", "),
    });
    setSelectedCollections((product.collection_products ?? []).map((item) => item.collection_id));
    const spec = (product.fit_spec ?? {}) as any;
    setFitSpec({
      garment_type: spec.garment_type ?? "other",
      fit_type: spec.fit_type ?? "regular",
      stretch_level: spec.stretch_level ?? "low",
      model_size: spec.model_size ?? "",
      model_height: spec.model_measurements?.height_cm ? String(spec.model_measurements.height_cm) : "",
      fit_notes: spec.fit_notes ?? "",
      rows: Array.isArray(spec.measurements_by_size)
        ? spec.measurements_by_size.map((r: any) => ({
            size: r.size ?? "",
            bust: Array.isArray(r.bust) ? r.bust.join("-") : "",
            waist: Array.isArray(r.waist) ? r.waist.join("-") : "",
            hip: Array.isArray(r.hip) ? r.hip.join("-") : "",
            length: r.length != null ? String(r.length) : "",
          }))
        : [],
    });
    setVariants(
      (product.product_variants ?? []).length
        ? (product.product_variants ?? []).map((variant) => ({
            id: variant.id,
            sku: variant.sku ?? "",
            size: variant.size ?? "",
            color: variant.color ?? "",
            color_hex: variant.color_hex ?? "",
            barcode: variant.barcode ?? "",
            price_cop: String(variant.price_cop ?? 0),
            compare_at_cop: variant.compare_at_cop == null ? "" : String(variant.compare_at_cop),
            cost_cop: variant.cost_cop == null ? "" : String(variant.cost_cop),
            price_usd: variant.price_usd == null ? "" : String(variant.price_usd),
            compare_at_usd: variant.compare_at_usd == null ? "" : String(variant.compare_at_usd),
            cost_usd: variant.cost_usd == null ? "" : String(variant.cost_usd),
            tariff_code: variant.tariff_code ?? "",
            active: variant.active,
            stock: ((variant as any).inventory_levels ?? []).reduce(
              (sum: number, l: any) => sum + (l.on_hand ?? 0) - (l.reserved ?? 0),
              0,
            ),
          }))
        : [emptyVariant()],
    );
    setFaqs(((product.product_faqs ?? []) as ProductFaq[]).sort((a, b) => a.position - b.position));
    const blocks = ((product as any).product_journey_blocks ?? []) as any[];
    setJourney(
      blocks.length
        ? blocks
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((b) => ({
              id: b.id,
              kind: (b.kind ?? "info") as JourneyKind,
              slot: b.slot ?? null,
              title: b.title ?? "",
              subtitle: b.subtitle ?? "",
              body: b.body ?? "",
              required: Boolean(b.required),
              selectable: Boolean(b.selectable),
              affects: (b.affects ?? {}) as JourneyRow["affects"],
              media: Array.isArray(b.media) ? b.media : [],
            }))
        : defaultJourney(),
    );
    setImages(((product.product_images ?? []) as ProductImage[]).sort((a, b) => a.position - b.position));
    setVideos(((product.product_videos ?? []) as ProductVideo[]).sort((a, b) => a.position - b.position));
    setVideoAsCover(((product.product_videos ?? []) as ProductVideo[]).some((video) => video.position < 0));
    setHeroUrl(product.hero_image_url ?? null);
    setPendingImages([]);
    setPendingVideo(null);
    setRemovedVariantIds([]);
    setLookbookEnabled(Boolean((product as any).lookbook_enabled));
    setLookbook(normalizeLookbookConfig((product as any).lookbook_config));
    setPendingLookbookVideo(null);
    setPendingLookbookPoster(null);
  }, [isEditing, product]);

  const totalImages = images.length + pendingImages.length;
  const title = isEditing ? "Editar producto" : "Nuevo producto";
  const canSave = useMemo(() => form.name.trim().length > 0, [form.name]);

  const addPendingImages = (files: FileList | null) => {
    const accepted = Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
    if (!accepted.length) return;
    if (images.length + pendingImages.length + accepted.length > 10) {
      toast.error("Máximo 10 fotos por producto");
      return;
    }
    setPendingImages((current) => [...current, ...accepted]);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const setPendingProductVideo = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast.error("El archivo debe ser un video");
      return;
    }
    const sizeMb = file.size / (1024 * 1024);
    if (sizeMb > 300) {
      toast.error("El video supera los 300 MB");
      return;
    }
    if (sizeMb > 12) toast.info("El video se comprimirá automáticamente a 1080p al guardar");
    setPendingVideo(file);
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const uploadPendingImages = async (savedId: string, currentHero: string | null) => {
    const uploaded: ProductImage[] = [];
    for (const file of pendingImages) {
      const optimized = await optimizeImageFile(file);
      // La extensión sale del tipo real del archivo: nombres sin extensión o raros no deben bloquear la subida.
      const mimeExt: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/avif": "avif", "image/heic": "heic", "image/heif": "heif" };
      const nameExt = optimized.name.includes(".") ? optimized.name.split(".").pop()!.toLowerCase() : "";
      const ext = mimeExt[optimized.type] ?? (["jpg", "jpeg", "png", "webp", "gif", "avif", "heic", "heif"].includes(nameExt) ? nameExt : "jpg");
      const path = `${savedId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("product-media")
        .upload(path, optimized, uploadOptions(optimized));
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("product-media").getPublicUrl(path);
      const { data: inserted, error } = await supabase
        .from("product_images")
        .insert({ product_id: savedId, url: urlData.publicUrl, position: images.length + uploaded.length })
        .select("id, url, position, alt")
        .single();
      if (error) throw error;
      uploaded.push(inserted);
    }
    if (!currentHero && uploaded[0]) {
      await supabase.from("products").update({ hero_image_url: uploaded[0].url }).eq("id", savedId);
    }
  };

  const uploadPendingVideo = async (savedId: string) => {
    if (!pendingVideo) return;
    for (const video of videos) {
      const path = storagePathFromUrl(video.url);
      const posterPath = storagePathFromUrl(video.url.replace(/(\.[a-z0-9]+)(\?|$)/i, ".poster.webp$2"));
      const paths = [path, posterPath].filter((item): item is string => Boolean(item));
      if (paths.length) await supabase.storage.from("product-media").remove(paths);
    }
    await supabase.from("product_videos").delete().eq("product_id", savedId);
    let fileToUpload = pendingVideo;
    if (pendingVideo.size > 12 * 1024 * 1024) {
      const toastId = toast.loading("Comprimiendo video a 1080p… 0%");
      fileToUpload = await optimizeVideoFile(pendingVideo, (fraction) => {
        toast.loading(`Comprimiendo video a 1080p… ${Math.round(fraction * 100)}%`, { id: toastId });
      });
      toast.dismiss(toastId);
      if (fileToUpload !== pendingVideo) {
        const before = Math.round(pendingVideo.size / (1024 * 1024));
        const after = Math.round(fileToUpload.size / (1024 * 1024) * 10) / 10;
        toast.success(`Video optimizado: ${before} MB → ${after} MB`);
      }
    }
    const ext = fileToUpload.name.split(".").pop()?.toLowerCase() || "mp4";
    const stamp = Date.now();
    const path = `${savedId}/video-${stamp}.${ext}`;
    const { error: uploadError } = await supabase.storage.from("product-media").upload(path, fileToUpload, { contentType: fileToUpload.type, cacheControl: "31536000" });
    if (uploadError) throw uploadError;
    const { data: urlData } = supabase.storage.from("product-media").getPublicUrl(path);
    const poster = await captureVideoPoster(fileToUpload).catch(() => null);
    if (poster) {
      const posterPath = `${savedId}/video-${stamp}.poster.webp`;
      const { error: posterError } = await supabase.storage.from("product-media").upload(posterPath, poster, uploadOptions(poster));
      if (posterError) toast.warning("El video se guardó, pero no se pudo crear su imagen de espera");
    }
    const sizeMb = Math.round((fileToUpload.size / (1024 * 1024)) * 100) / 100;
    const { error } = await supabase.from("product_videos").insert({ product_id: savedId, url: urlData.publicUrl, size_mb: sizeMb, position: videoAsCover ? -1 : 0 });
    if (error) throw error;
  };

  /** Sube el video del lookbook y su portada; devuelve la configuración final. */
  const persistLookbook = async (savedId: string): Promise<LookbookConfig> => {
    let videoUrl = lookbook.videoUrl ?? null;
    let posterUrl = lookbook.posterUrl ?? null;

    if (pendingLookbookVideo) {
      let lookbookFile = pendingLookbookVideo;
      if (pendingLookbookVideo.size > 12 * 1024 * 1024) {
        const toastId = toast.loading("Comprimiendo video del lookbook… 0%");
        lookbookFile = await optimizeVideoFile(pendingLookbookVideo, (fraction) => {
          toast.loading(`Comprimiendo video del lookbook… ${Math.round(fraction * 100)}%`, { id: toastId });
        });
        toast.dismiss(toastId);
      }
      const ext = lookbookFile.name.split(".").pop()?.toLowerCase() || "mp4";
      const path = `${savedId}/lookbook-${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from("product-media")
        .upload(path, lookbookFile, { contentType: lookbookFile.type, cacheControl: "31536000" });
      if (error) throw error;
      videoUrl = supabase.storage.from("product-media").getPublicUrl(path).data.publicUrl;

      if (!pendingLookbookPoster) {
        const auto = await captureVideoPoster(lookbookFile).catch(() => null);
        if (auto) {
          const posterPath = `${savedId}/lookbook-poster-${Date.now()}.webp`;
          const { error: posterError } = await supabase.storage
            .from("product-media")
            .upload(posterPath, auto, uploadOptions(auto));
          if (!posterError) {
            posterUrl = supabase.storage.from("product-media").getPublicUrl(posterPath).data.publicUrl;
          }
        }
      }
    }

    if (pendingLookbookPoster) {
      const optimized = await optimizeImageFile(pendingLookbookPoster);
      const posterPath = `${savedId}/lookbook-poster-${Date.now()}.${optimized.name.split(".").pop()?.toLowerCase() || "webp"}`;
      const { error } = await supabase.storage.from("product-media").upload(posterPath, optimized, uploadOptions(optimized));
      if (error) throw error;
      posterUrl = supabase.storage.from("product-media").getPublicUrl(posterPath).data.publicUrl;
    }

    const next: LookbookConfig = { ...lookbook, videoUrl, posterUrl };
    setLookbook(next);
    setPendingLookbookVideo(null);
    setPendingLookbookPoster(null);
    return next;
  };



  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!canSave) {
      toast.error("Agrega el nombre del producto");
      return;
    }
    setSaving(true);
    try {
      const productPayload = {
        name: form.name.trim(),
        slug: form.slug.trim() || slugify(form.name),
        name_en: form.name_en.trim() || null,
        description: form.description.trim() || null,
        description_en: form.description_en.trim() || null,
        story: form.story.trim() || null,
        story_en: form.story_en.trim() || null,
        materials: form.materials.trim() || null,
        composition: form.composition.trim() || null,
        care: form.care.trim() || null,
        status: form.status,
        hero_image_url: heroUrl,
        available_national: form.available_national,
        available_international: form.available_international,
        available_pos_cali: form.available_pos_cali,
        available_pos_bogota: form.available_pos_bogota,
        product_type: form.product_type.trim() || null,
        reference_code: form.reference_code.trim() || null,
        version_group: form.version_group.trim() || null,
        version_label: form.version_label.trim() || null,
        tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        fit_spec: {
          garment_type: fitSpec.garment_type,
          fit_type: fitSpec.fit_type,
          stretch_level: fitSpec.stretch_level,
          model_size: fitSpec.model_size.trim() || null,
          model_measurements: fitSpec.model_height.trim()
            ? { height_cm: Number(fitSpec.model_height) || null }
            : null,
          fit_notes: fitSpec.fit_notes.trim() || null,
          measurements_by_size: fitSpec.rows
            .filter((r) => r.size.trim())
            .map((r) => ({
              size: r.size.trim().toUpperCase(),
              bust: parseRange(r.bust),
              waist: parseRange(r.waist),
              hip: parseRange(r.hip),
              length: r.length.trim() ? Number(r.length) : null,
            })),
        },
        lookbook_enabled: lookbookEnabled,
      };

      let savedId = productId;
      if (savedId) {
        const { error } = await supabase.from("products").update(productPayload).eq("id", savedId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("products").insert(productPayload).select("id").single();
        if (error) throw error;
        savedId = data.id;
      }

      if (!savedId) throw new Error("No se pudo guardar el producto");

      if (!pendingVideo && videos.length) {
        const { error: videoPositionError } = await supabase
          .from("product_videos")
          .update({ position: videoAsCover ? -1 : 0 })
          .eq("product_id", savedId);
        if (videoPositionError) throw videoPositionError;
      }

      const lookbookConfig = await persistLookbook(savedId);
      const { error: lookbookError } = await supabase
        .from("products")
        .update({ lookbook_config: lookbookConfig as any })
        .eq("id", savedId);
      if (lookbookError) throw lookbookError;


      await supabase.from("collection_products").delete().eq("product_id", savedId);
      if (selectedCollections.length) {
        const { error } = await supabase.from("collection_products").insert(
          selectedCollections.map((collection_id, position) => ({ collection_id, product_id: savedId, position })),
        );
        if (error) throw error;
      }

      let cleanedVariants = variants.filter((variant) => variant.sku.trim() || variant.price_cop.trim() || variant.price_usd.trim());
      // Variante de relleno (sin talla) creada al guardar sin tallas: se elimina cuando ya hay tallas reales, si no tiene stock ni ventas.
      if (cleanedVariants.some((v) => v.size.trim())) {
        const blanks = cleanedVariants.filter((v) => !v.size.trim() && !v.color.trim());
        const dropIds: string[] = [];
        for (const b of blanks) {
          if (!b.id) { dropIds.push(""); continue; }
          const [{ count: inv }, { count: ord }] = await Promise.all([
            supabase.from("inventory_levels").select("variant_id", { count: "exact", head: true }).eq("variant_id", b.id).neq("on_hand", 0),
            supabase.from("order_items").select("id", { count: "exact", head: true }).eq("variant_id", b.id),
          ]);
          if (!inv && !ord) {
            const { error } = await supabase.from("product_variants").delete().eq("id", b.id);
            if (!error) dropIds.push(b.id);
          }
        }
        cleanedVariants = cleanedVariants.filter((v) => !(blanks.includes(v) && (!v.id || dropIds.includes(v.id))));
      }
      const variantsToSave = cleanedVariants.length ? cleanedVariants : [{ ...emptyVariant(), sku: `${slugify(form.name) || "producto"}-${Date.now().toString(36)}` }];
      if (removedVariantIds.length) {
        const { error } = await supabase.from("product_variants").delete().in("id", removedVariantIds);
        if (error) throw error;
      }
      const missingUsd = variantsToSave.filter((variant) => variant.active && !(Number(variant.price_usd) > 0));
      if (missingUsd.length) toast.warning(`Sin precio en USD: ${missingUsd.map((v) => v.size || v.sku || "una talla").join(", ")}. No se venderá fuera de Colombia hasta agregarlo.`);
      let createdVariants = 0;
      for (const variant of variantsToSave) {
        const variantPayload = {
          product_id: savedId,
          sku: variant.sku.trim() || `${slugify(form.name) || "producto"}-${Date.now().toString(36)}`,
          size: variant.size.trim() || null,
          color: variant.color.trim() || null,
          color_hex: variant.color_hex.trim() || null,
          barcode: variant.barcode.trim() || variant.sku.trim() || null,
          price_cop: requiredNumber(variant.price_cop),
          compare_at_cop: nullableNumber(variant.compare_at_cop),
          cost_cop: nullableNumber(variant.cost_cop),
          price_usd: nullableNumber(variant.price_usd),
          compare_at_usd: nullableNumber(variant.compare_at_usd),
          cost_usd: nullableNumber(variant.cost_usd),
          tariff_code: variant.tariff_code.trim() || null,
          active: variant.active,
        };
        if (variant.id) {
          const { error } = await supabase.from("product_variants").update(variantPayload).eq("id", variant.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("product_variants").insert(variantPayload);
          if (error) throw error;
          createdVariants++;
        }
      }
      // R-Count solo recibe ítems nuevos: cambios de precio u otros datos no se sincronizan.
      if (createdVariants > 0) {
        void import("@/lib/rcount.functions")
          .then(({ syncRCountItems }) => syncRCountItems({ data: { productId: savedId as string } }))
          .then((r) => (r.ok ? toast.success(r.message) : toast.warning(r.message)))
          .catch((e) => toast.warning(`R-Count: ${e instanceof Error ? e.message : "no se pudo sincronizar"}`));
      }

      await supabase.from("product_faqs").delete().eq("product_id", savedId);
      const faqRows = faqs
        .map((faq, position) => ({ product_id: savedId, question: faq.question.trim(), answer: faq.answer.trim(), position }))
        .filter((faq) => faq.question && faq.answer);
      if (faqRows.length) {
        const { error } = await supabase.from("product_faqs").insert(faqRows);
        if (error) throw error;
      }

      await uploadPendingImages(savedId, heroUrl);
      await uploadPendingVideo(savedId);

      await supabase.from("product_journey_blocks").delete().eq("product_id", savedId);
      const journeyRows = journey
        .map((b, position) => ({
          product_id: savedId,
          position,
          kind: b.kind,
          slot: b.slot,
          title: b.title.trim() || (b.slot === "color" ? "Color" : b.slot === "size" ? "Talla" : "Bloque"),
          subtitle: b.subtitle.trim() || null,
          body: b.body.trim() || null,
          required: b.slot ? true : b.required,
          selectable: b.slot ? true : b.selectable,
          affects: b.affects,
          media: b.media,
        }));
      if (journeyRows.length) {
        const { error } = await supabase.from("product_journey_blocks").insert(journeyRows);
        if (error) throw error;
      }

      await supabase.from("product_related").delete().eq("product_id", savedId);
      if (related.length) {
        const { error } = await supabase.from("product_related").insert(
          related.map((r, position) => ({ product_id: savedId, related_id: r.id, kind: relatedKind, position })),
        );
        if (error) throw error;
      }

      await supabase.from("product_looks").delete().eq("product_id", savedId);
      for (const [position, look] of looks.entries()) {
        const { data: inserted, error } = await supabase
          .from("product_looks")
          .insert({
            product_id: savedId,
            title: look.title.trim() || "Completa el look",
            image_url: look.imageUrl.trim() || null,
            position,
            discount_pct: nullableNumber(look.discountPct),
            special_price_cop: nullableNumber(look.specialPriceCop),
            starts_at: look.startsAt ? new Date(look.startsAt).toISOString() : null,
            ends_at: look.endsAt ? new Date(look.endsAt).toISOString() : null,
            colors: look.colors,
            active: look.active,
            board: {
              baseCutout: look.base.cutoutUrl.trim() || null,
              baseSlot: look.base.slot,
              baseFit: look.base.fit ?? null,
              baseTransform: look.base.transform,
            } as any,
          })
          .select("id")
          .single();
        if (error) throw error;
        const keyToId = new Map<string, string>();
        if (look.items.length) {
          const { data: insertedItems, error: itemsError } = await supabase
            .from("product_look_items")
            .insert(
              look.items.map((it, i) => ({
                look_id: inserted.id,
                product_id: it.productId,
                position: i,
                combo_image_url: it.comboImageUrl.trim() || null,
                cutout_url: it.cutoutUrl.trim() || null,
                slot: it.slot,
                transform: it.transform as any,
                generic_label: it.productId ? null : it.genericLabel.trim() || it.name,
                generic_type: it.productId ? null : it.genericType.trim() || null,
              })),
            )
            .select("id");
          if (itemsError) throw itemsError;
          (insertedItems ?? []).forEach((row, i) => {
            const piece = look.items[i];
            if (piece) keyToId.set(piece.key, row.id);
          });
        }

        for (const [mi, match] of look.matches.entries()) {
          const ids = match.pieceKeys
            .filter((k) => k !== LOOK_BASE_KEY)
            .map((k) => keyToId.get(k))
            .filter((v): v is string => Boolean(v));
          if (ids.length < 1) continue;
          const { data: insertedMatch, error: matchError } = await supabase
            .from("product_look_matches")
            .insert({ look_id: inserted.id, label: match.label.trim() || null, position: mi })
            .select("id")
            .single();
          if (matchError) throw matchError;
          const { error: linkError } = await supabase
            .from("product_look_match_items")
            .insert(ids.map((item_id) => ({ match_id: insertedMatch.id, item_id })));
          if (linkError) throw linkError;
        }
      }

      toast.success("Producto guardado");
      qc.invalidateQueries({ queryKey: ["admin", "products"] });
      qc.invalidateQueries({ queryKey: ["admin-product-editor", savedId] });
      qc.invalidateQueries({ queryKey: ["admin-product-related", savedId] });
      qc.invalidateQueries({ queryKey: ["admin-product-looks", savedId] });
      onSaved?.();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el producto");
    } finally {
      setSaving(false);
    }
  };

  const removeImage = async (image: ProductImage) => {
    if (!productId) return;
    const { error } = await supabase.from("product_images").delete().eq("id", image.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    const path = storagePathFromUrl(image.url);
    if (path) await supabase.storage.from("product-media").remove([path]);
    const next = images.filter((item) => item.id !== image.id);
    setImages(next);
    if (heroUrl === image.url) {
      const nextHero = next[0]?.url ?? null;
      setHeroUrl(nextHero);
      await supabase.from("products").update({ hero_image_url: nextHero }).eq("id", productId);
    }
  };

  const removeVideo = async (video: ProductVideo) => {
    if (!productId) return;
    const { error } = await supabase.from("product_videos").delete().eq("id", video.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    const path = storagePathFromUrl(video.url);
    const posterPath = storagePathFromUrl(video.url.replace(/(\.[a-z0-9]+)(\?|$)/i, ".poster.webp$2"));
    const paths = [path, posterPath].filter((item): item is string => Boolean(item));
    if (paths.length) await supabase.storage.from("product-media").remove(paths);
    setVideos((current) => current.filter((item) => item.id !== video.id));
    setVideoAsCover(false);
  };

  const deleteProduct = async () => {
    if (!productId) return;
    if (!confirm("¿Eliminar este producto? Esta acción no se puede deshacer.")) return;
    setDeleting(true);
    const files = [...images.map((image) => image.url), ...videos.map((video) => video.url)];
    const { error } = await supabase.from("products").delete().eq("id", productId);
    if (error) {
      setDeleting(false);
      toast.error(error.message);
      return;
    }
    const paths = files.map(storagePathFromUrl).filter((path): path is string => Boolean(path));
    if (paths.length) await supabase.storage.from("product-media").remove(paths);
    toast.success("Producto eliminado");
    qc.invalidateQueries({ queryKey: ["admin", "products"] });
    onDeleted?.();
    onClose();
  };

  const sections = [
    { key: "info", label: "Información", icon: Info },
    { key: "variantes", label: "Variantes y precios", icon: DollarSign },
    { key: "fit", label: "Fit y tallas", icon: Ruler },
    { key: "recorrido", label: "Recorrido", icon: RouteIcon },
    { key: "lookbook", label: "Lookbook", icon: Video },
    { key: "relacionados", label: "Relacionados", icon: Link2 },
    { key: "looks", label: "Looks", icon: CoatHanger },
    { key: "resenas", label: "Reseñas", icon: Star },
    { key: "seo", label: "SEO", icon: Search },
    { key: "faqs", label: "FAQs", icon: HelpCircle },
  ] as const;

  const pendingPreviews = useMemo(() => pendingImages.map((file) => ({ file, url: URL.createObjectURL(file) })), [pendingImages]);
  useEffect(() => () => pendingPreviews.forEach((p) => URL.revokeObjectURL(p.url)), [pendingPreviews]);

  useEffect(() => {
    let alive = true;
    fetch("https://open.er-api.com/v6/latest/USD")
      .then((r) => r.json())
      .then((d) => {
        const rate = Number(d?.rates?.COP);
        if (alive && Number.isFinite(rate) && rate > 0) setTrm(rate);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const firstVariant = variants[0] ?? emptyVariant();
  const suggestedUsd = useMemo(() => {
    const cop = Number(firstVariant.price_cop);
    if (!trm || !Number.isFinite(cop) || cop <= 0) return "";
    return String(Math.round(cop / trm));
  }, [firstVariant.price_cop, trm]);
  const featureWords = useMemo(() => keywordSummary(form.materials), [form.materials]);

  const updateFirstVariant = (patch: Partial<ProductVariant>) =>
    setVariants((current) => current.map((item, index) => (index === 0 ? { ...item, ...patch } : item)));
  const activeCurrency = locale === "nacional" ? "COP" : "USD";
  const priceValue = locale === "nacional" ? firstVariant.price_cop : firstVariant.price_usd;
  const compareValue = locale === "nacional" ? firstVariant.compare_at_cop : firstVariant.compare_at_usd;

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="admin-scope fixed inset-0 z-[200] bg-ink/45 p-3 backdrop-blur-sm lg:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={onClose}
    >
      <form
        onSubmit={save}
        onMouseDown={(event) => event.stopPropagation()}
        className="mx-auto flex h-full max-h-[calc(100dvh-1.5rem)] w-full max-w-[1400px] flex-col overflow-hidden rounded-3xl bg-ivory shadow-2xl lg:max-h-[calc(100dvh-3rem)]"
      >
        {/* Header */}
        <header className="relative flex flex-col gap-4 border-b border-ink/[0.06] bg-[#f6f6f4] px-5 pt-6 pb-5 sm:flex-row sm:items-start sm:justify-between sm:px-8">
          <div className="min-w-0 pr-10 sm:pr-0">
            <p className="text-xs text-ink/50">Catálogo</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-ink sm:text-[28px]">{title}</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isEditing && (
              <button
                type="button"
                disabled={deleting}
                onClick={deleteProduct}
                className="rounded-full border border-ink/10 bg-white px-4 py-2 text-sm text-ink/70 transition hover:text-destructive"
              >
                {deleting ? "Eliminando…" : "Eliminar"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-ink/10 bg-white px-5 py-2 text-sm text-ink/80 transition hover:bg-ink/[0.03]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving || !canSave || isLoading}
              className="rounded-full bg-ink px-5 py-2 text-sm font-medium text-white transition hover:bg-ink/90 disabled:opacity-50"
            >
              {saving ? "Guardando…" : "Guardar producto"}
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="absolute right-4 top-5 rounded-full p-1.5 text-ink/50 sm:static sm:ml-1 hover:bg-ink/[0.05] hover:text-ink"
            >
              <X className="size-4" />
            </button>
          </div>
        </header>

        {/* Tabs bar */}
        <div className="flex items-center gap-6 overflow-x-auto whitespace-nowrap border-b border-ink/[0.06] bg-[#f6f6f4] px-5 [scrollbar-width:none] sm:px-8">
          {sections.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSection(key as typeof section)}
              className={`relative flex shrink-0 items-center gap-2 py-3.5 text-sm transition ${
                section === key ? "text-ink" : "text-ink/50 hover:text-ink/80"
              }`}
            >
              <Icon className="size-4" strokeWidth={1.75} />
              {label}
              {section === key && <span className="absolute inset-x-0 -bottom-px h-px bg-ink" />}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-8">
          {isLoading ? (
            <div className="py-20 text-center text-sm text-ink/50">Cargando producto…</div>
          ) : (
            <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => addPendingImages(event.target.files)} />
          )}
          <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(event) => setPendingProductVideo(event.target.files?.[0] ?? null)} />

          {!isLoading && section === "info" && (
            <div className="grid grid-cols-12 gap-6">
              {/* LEFT: Media */}
              <aside className="col-span-12 lg:col-span-3 space-y-6">
                <div>
                  <p className="mb-2 text-xs text-ink/60">Fotos de portada</p>
                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-ink/15 bg-white text-ink/60 transition hover:border-ink/30 hover:text-ink"
                  >
                    {heroUrl || pendingPreviews[0] ? (
                      <img src={heroUrl ?? pendingPreviews[0]!.url} alt="" className="h-full w-full rounded-2xl object-cover" />
                    ) : (
                      <>
                        <Upload className="size-5" strokeWidth={1.75} />
                        <p className="text-sm">Subir imagen</p>
                        <p className="text-xs text-ink/40">o arrastra y suelta</p>
                        <p className="text-[10px] text-ink/40">JPG, PNG o WEBP. Máx. 10MB</p>
                      </>
                    )}
                  </button>
                  {pendingImages.length > 0 && (
                    <p className="mt-2 text-[11px] text-ink/50">{pendingImages.length} foto(s) pendiente(s) · se suben al guardar</p>
                  )}
                </div>
                <div>
                  <p className="mb-1 text-xs text-ink/60">Galería</p>
                  {variantColors.length > 1 && (
                    <p className="mb-2 text-[11px] text-ink/45">Elige el color de cada foto: en la tienda se ven solo las fotos del color seleccionado.</p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: Math.max(6, images.length + pendingPreviews.length) }).map((_, i) => {
                      const image = images[i];
                      const pending = image ? null : pendingPreviews[i - images.length];
                      if (image) {
                        return (
                          <div key={image.id} className={`group relative aspect-square overflow-hidden rounded-xl border ${heroUrl === image.url ? "border-ink" : "border-ink/10"} bg-white`}>
                            <img src={image.url} alt="" className="h-full w-full object-cover" />
                            {variantColors.length > 1 && (
                              <select
                                value={image.color ?? ""}
                                onChange={(event) => void setImageColor(image, event.target.value || null)}
                                aria-label="Color de esta foto"
                                className="absolute left-1.5 top-1.5 z-10 max-w-[80%] truncate rounded-full border border-ink/10 bg-white/95 px-2 py-0.5 text-[10px] text-ink shadow-sm"
                              >
                                <option value="">Todos los colores</option>
                                {variantColors.map((c) => (
                                  <option key={c} value={c}>{c}</option>
                                ))}
                                {image.color && !variantColors.some((c) => c.toLowerCase() === image.color!.toLowerCase()) && (
                                  <option value={image.color}>{image.color} (sin variante)</option>
                                )}
                              </select>
                            )}
                            <div className="absolute inset-0 flex items-end justify-between gap-1 bg-gradient-to-t from-black/50 to-transparent p-1.5 transition [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
                              <button type="button" onClick={() => setHeroUrl(image.url)} className="rounded-full bg-white/90 px-2 py-0.5 text-[10px]">Portada</button>
                              <span className="flex gap-1">
                                <button type="button" onClick={() => downloadProductImage(image.url, `${form.slug || "producto"}-${i + 1}`)} aria-label="Descargar foto" className="rounded-full bg-white/90 p-1"><Download className="size-3" /></button>
                                <button type="button" onClick={() => removeImage(image)} aria-label="Eliminar foto" className="rounded-full bg-white/90 p-1"><Trash2 className="size-3" /></button>
                              </span>
                            </div>
                          </div>
                        );
                      }
                      if (pending) {
                        return (
                          <div key={pending.url} className="group relative aspect-square overflow-hidden rounded-xl border border-dashed border-ink/25 bg-white">
                            <img src={pending.url} alt="" className="h-full w-full object-cover opacity-90" />
                            <span className="absolute left-1.5 top-1.5 rounded-full bg-white/90 px-2 py-0.5 text-[9px] uppercase tracking-wide text-ink/70">Pendiente</span>
                            <button
                              type="button"
                              onClick={() => setPendingImages((current) => current.filter((f) => f !== pending.file))}
                              className="absolute right-1.5 top-1.5 rounded-full bg-white/90 p-1 transition [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        );
                      }
                      return (
                        <div key={`empty-${i}`} className="flex aspect-square items-center justify-center rounded-xl border border-dashed border-ink/10 bg-white">
                          <ImageIcon className="size-5 text-ink/20" strokeWidth={1.5} />
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={totalImages >= 10}
                    className="mt-2 w-full rounded-xl border border-ink/10 bg-white py-2.5 text-sm text-ink/70 transition hover:bg-ink/[0.03]"
                  >
                    Añadir más fotos
                  </button>
                </div>
                <div>
                  <p className="mb-2 text-xs text-ink/60">Video del producto</p>
                  <button
                    type="button"
                    onClick={() => videoInputRef.current?.click()}
                    className="flex aspect-video w-full flex-col items-center justify-center gap-1.5 rounded-2xl border border-dashed border-ink/15 bg-white text-ink/60 transition hover:border-ink/30 hover:text-ink"
                  >
                    {videos[0] ? (
                      <video src={videos[0].url} className="h-full w-full rounded-2xl object-cover" />
                    ) : pendingVideo ? (
                      <p className="px-3 text-center text-xs">Pendiente: {pendingVideo.name}</p>
                    ) : (
                      <>
                        <Video className="size-5" strokeWidth={1.75} />
                        <p className="text-sm">Subir video</p>
                        <p className="text-xs text-ink/40">o arrastra y suelta</p>
                        <p className="text-[10px] text-ink/40">MP4. Máx. 100MB</p>
                      </>
                    )}
                  </button>
                  {(videos[0] || pendingVideo) && (
                    <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-xs text-ink/70">
                      <span>
                        <span className="block font-medium text-ink">Usar video como portada</span>
                        <span className="mt-0.5 block text-[10px] text-ink/45">Si está apagado, aparece después de la primera foto.</span>
                      </span>
                      <input
                        type="checkbox"
                        checked={videoAsCover}
                        onChange={(event) => setVideoAsCover(event.target.checked)}
                        className="size-4 accent-ink"
                      />
                    </label>
                  )}
                </div>
              </aside>

              {/* CENTER: Main info */}
              <section className="col-span-12 lg:col-span-6 space-y-6">
                <Card>
                  <CardTitle>Información principal</CardTitle>
                  <div className="mt-4 space-y-4">
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-ink/60">Nombre del producto *</label>
                        <div className="flex items-center gap-1 text-xs text-ink/50" role="group" aria-label="Idioma de la descripción">
                          <Button type="button" size="sm" variant={locale === "nacional" ? "default" : "outline"} onClick={() => setLocale("nacional")}>Español</Button>
                          <Button type="button" size="sm" variant={locale === "internacional" ? "default" : "outline"} onClick={() => setLocale("internacional")}>Inglés</Button>
                        </div>
                      </div>
                      <TextInput
                        value={locale === "nacional" ? form.name : form.name_en}
                        onChange={(value) =>
                          locale === "nacional"
                            ? setForm((current) => ({ ...current, name: value, slug: slugTouched ? current.slug : slugify(value) }))
                            : setForm((current) => ({ ...current, name_en: value }))
                        }
                      />
                    </div>
                    <div>
                      <label className="text-xs text-ink/60">Slug (URL)</label>
                      <TextInput
                        value={form.slug}
                        onChange={(value) => {
                          setSlugTouched(true);
                          setForm((current) => ({ ...current, slug: slugify(value) }));
                        }}
                      />
                      <div className="mt-1.5 flex items-center justify-between text-xs">
                        <span className="text-ink/50">{SITE_ORIGIN.replace(/^https?:\/\/(www\.)?/, "")}/producto/{form.slug || "..."}</span>
                        {slugTouched && (
                          <button
                            type="button"
                            onClick={() => {
                              setSlugTouched(false);
                              setForm((current) => ({ ...current, slug: slugify(current.name) }));
                            }}
                            className="text-ink/70 hover:text-ink"
                          >
                            Usar el nombre
                          </button>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-ink/60">Descripción completa</label>
                      <RichEditor
                        value={locale === "nacional" ? form.story : form.story_en}
                        onChange={(value) =>
                          setForm((current) => ({
                            ...current,
                            ...(locale === "nacional"
                              ? { story: value, ...(shortTouched ? {} : { description: summarize(value, 160) }) }
                              : { story_en: value, description_en: summarize(value, 160) }),
                          }))
                        }
                        placeholder="Cuenta la historia de tu producto, materiales, proceso y detalles importantes..."
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-xs text-ink/60">Descripción corta</label>
                        <span className="text-[10px] uppercase tracking-wide text-ink/40">
                          {shortTouched ? "Editada a mano" : "Resumen automático"}
                        </span>
                      </div>
                      <TextInput
                        value={locale === "nacional" ? form.description : form.description_en}
                        onChange={(value) => {
                          if (locale === "nacional") {
                            setShortTouched(true);
                            setForm((current) => ({ ...current, description: value }));
                          } else {
                            setForm((current) => ({ ...current, description_en: value }));
                          }
                        }}
                        maxLength={160}
                      />
                      <div className="mt-1 flex items-center justify-between text-xs text-ink/40">
                        {shortTouched && locale === "nacional" ? (
                          <button
                            type="button"
                            onClick={() => {
                              setShortTouched(false);
                              setForm((current) => ({ ...current, description: summarize(current.story, 160) }));
                            }}
                            className="text-ink/60 hover:text-ink"
                          >
                            Volver al resumen automático
                          </button>
                        ) : (
                          <span>Se genera con la descripción completa</span>
                        )}
                        <span>{(locale === "nacional" ? form.description : form.description_en).length}/160</span>
                      </div>
                    </div>
                  </div>
                </Card>

                <Card>
                  <div className="flex items-center justify-between">
                    <CardTitle>Características</CardTitle>
                    <button
                      type="button"
                      onClick={() => setForm((current) => ({ ...current, materials: current.materials + (current.materials ? "\n" : "") + "• " }))}
                      className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-3 py-1.5 text-xs text-ink/80 hover:bg-ink/[0.03]"
                    >
                      <Plus className="size-3.5" /> Añadir característica
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-ink/50">Añade los detalles que ayudan a tus clientas a elegir mejor.</p>
                  <textarea
                    value={form.materials}
                    onChange={(event) => setForm((current) => ({ ...current, materials: event.target.value }))}
                    rows={4}
                    placeholder="Ej: 100% lino colombiano · Teñido natural · Corte oversize"
                    className="mt-3 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-ink/40"
                  />
                  <label className="mt-4 block text-xs text-ink/60" htmlFor="product-composition">Composición textil</label>
                  <textarea id="product-composition" value={form.composition} onChange={(event) => setForm((current) => ({ ...current, composition: event.target.value }))} rows={2} placeholder="Ej: 80% algodón, 20% poliéster" className="mt-1 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-ink/40" />
                  {featureWords.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[10px] uppercase tracking-wide text-ink/40">Resumen en palabras</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {featureWords.map((word) => (
                          <span key={word} className="rounded-full border border-ink/10 bg-ink/[0.03] px-2.5 py-1 text-[11px] text-ink/70">
                            {word}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                </Card>

              </section>

              {/* RIGHT: Sidebar */}
              <aside className="col-span-12 lg:col-span-3 space-y-6">
                <Card>
                  <CardTitle>Estado y publicación</CardTitle>
                  <div className="mt-4 space-y-4">
                    <div>
                      <label className="text-xs text-ink/60">Estado</label>
                      <div className="relative mt-1">
                        <select
                          value={form.status}
                          onChange={(event) => setForm((current) => ({ ...current, status: event.target.value as ProductForm["status"] }))}
                          className="w-full appearance-none rounded-xl border border-ink/10 bg-white py-2.5 pl-3 pr-9 text-sm outline-none focus:border-ink/40"
                        >
                          <option value="draft">Borrador</option>
                          <option value="published">Activo</option>
                          <option value="archived">Archivado</option>
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink/40" />
                        {form.status === "published" && (
                          <span className="pointer-events-none absolute left-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5 rounded-full bg-[#d7ecc8] px-2 py-0.5 text-xs text-[#2b5b1a]">
                            Activo
                          </span>
                        )}
                      </div>
                    </div>
                    <div>
                      <p className="mb-2 text-xs text-ink/60">Visible en</p>
                      <CheckRow label="Tienda online (COL)" checked={form.available_national} onChange={(v) => setForm((c) => ({ ...c, available_national: v }))} />
                      <CheckRow label="Tienda internacional (USD)" checked={form.available_international} onChange={(v) => setForm((c) => ({ ...c, available_international: v }))} />
                      <CheckRow label="POS Eventos" checked={form.available_pos_cali} onChange={(v) => setForm((c) => ({ ...c, available_pos_cali: v }))} />
                    </div>
                    <div>
                      <label className="text-xs text-ink/60">Fecha de publicación</label>
                      <div className="relative mt-1">
                        <input type="text" placeholder="Seleccionar fecha" className="w-full rounded-xl border border-ink/10 bg-white py-2.5 pl-3 pr-9 text-sm text-ink/70 outline-none focus:border-ink/40" />
                        <Calendar className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink/40" />
                      </div>
                    </div>
                  </div>
                </Card>


                <Card>
                  <CardTitle>Organización</CardTitle>
                  <div className="mt-4 space-y-3">
                    <ProductTypeField
                      value={form.product_type}
                      onChange={(value) => setForm((current) => ({ ...current, product_type: value }))}
                    />

                    <div>
                      <label className="text-xs text-ink/60">Referencia</label>
                      <TextInput value={form.reference_code} onChange={(v) => setForm((c) => ({ ...c, reference_code: v }))} />
                    </div>
                    <div className="rounded-xl border border-ink/10 p-3">
                      <p className="text-xs font-medium text-ink/70">Versiones del modelo</p>
                      <p className="mt-0.5 text-[11px] text-ink/50">
                        Los productos con el mismo grupo aparecen como versiones (ej. Sol · Óptica) y la clienta cambia entre ellos sin salir de la ficha, conservando el color.
                      </p>
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-ink/60">Grupo</label>
                          <TextInput value={form.version_group} onChange={(v) => setForm((c) => ({ ...c, version_group: v }))} placeholder="Ej. LU108" />
                        </div>
                        <div>
                          <label className="text-xs text-ink/60">Nombre de esta versión</label>
                          <TextInput value={form.version_label} onChange={(v) => setForm((c) => ({ ...c, version_label: v }))} placeholder="Ej. Sol" />
                        </div>
                      </div>
                      {!form.version_group.trim() && form.reference_code.trim() && (
                        <button
                          type="button"
                          onClick={() => setForm((c) => ({ ...c, version_group: c.reference_code.trim() }))}
                          className="mt-2 text-[11px] text-ink/60 underline hover:text-ink"
                        >
                          Usar la referencia ({form.reference_code.trim()}) como grupo
                        </button>
                      )}
                      <VersionSiblings group={form.version_group} productId={productId} />
                    </div>
                    <div>
                      <label className="text-xs text-ink/60">Etiquetas (separadas por coma)</label>
                      <TextInput value={form.tags} onChange={(v) => setForm((c) => ({ ...c, tags: v }))} />
                    </div>
                  </div>
                </Card>

                <Card>
                  <CardTitle>Canales de venta</CardTitle>
                  <div className="mt-4 space-y-2">
                    <CheckRow label="Tienda online (COL)" checked={form.available_national} onChange={(v) => setForm((c) => ({ ...c, available_national: v }))} />
                    <CheckRow label="Tienda internacional (USD)" checked={form.available_international} onChange={(v) => setForm((c) => ({ ...c, available_international: v }))} />
                    <CheckRow label="POS Eventos" checked={form.available_pos_cali} onChange={(v) => setForm((c) => ({ ...c, available_pos_cali: v }))} />
                  </div>
                </Card>

                <Card>
                  <CardTitle>Colecciones</CardTitle>
                  <div className="mt-4 space-y-2">
                    {(collections ?? []).map((collection) => (
                      <CheckRow
                        key={collection.id}
                        label={collection.title}
                        checked={selectedCollections.includes(collection.id)}
                        onChange={(checked) =>
                          setSelectedCollections((current) =>
                            checked ? [...current, collection.id] : current.filter((id) => id !== collection.id)
                          )
                        }
                      />
                    ))}
                    {(collections ?? []).length === 0 && <p className="text-sm text-ink/50">Aún no hay colecciones.</p>}
                  </div>
                </Card>
              </aside>
            </div>
          )}

          {!isLoading && section === "variantes" && (
            <div className="grid grid-cols-12 gap-6">
              <section className="col-span-12 space-y-6 lg:col-span-8">
                <Card>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle>Variantes</CardTitle>
                    <button
                      type="button"
                      onClick={() => setVariants((current) => [...current, emptyVariant()])}
                      className="flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-4 py-2 text-xs text-ink/80 hover:bg-ink/[0.03]"
                    >
                      <Plus className="size-3.5" /> Agregar variante
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl bg-cream/50 p-3">
                    <div className="min-w-[220px] flex-1">
                      <label className="text-[10px] uppercase tracking-wider text-ink/50">SKU principal</label>
                      <TextInput value={firstVariant.sku} onChange={(v) => updateFirstVariant({ sku: v })} />
                    </div>
                    <p className="pb-2 text-xs text-ink/50">Es el SKU de la primera variante.</p>
                  </div>

                  {/* Generador rápido */}
                  <div className="mt-4 grid grid-cols-1 gap-2 rounded-2xl border border-dashed border-ink/15 bg-white p-3 md:grid-cols-[1fr_1fr_auto]">
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-ink/50">Tallas (coma)</label>
                      <TextInput value={genSizes} onChange={setGenSizes} />
                    </div>
                    <div>
                      <label className="text-[10px] uppercase tracking-wider text-ink/50">Colores (coma)</label>
                      <TextInput value={genColors} onChange={setGenColors} />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const sizes = genSizes.split(",").map((s) => s.trim()).filter(Boolean);
                        const colors = genColors.split(",").map((s) => s.trim()).filter(Boolean);
                        if (!sizes.length && !colors.length) return;
                        const sizeList = sizes.length ? sizes : [""];
                        const colorList = colors.length ? colors : [""];
                        setVariants((current) => {
                          const base = current.filter((v) => v.sku.trim() || v.size.trim() || v.color.trim() || v.price_cop.trim());
                          const seen = new Set(base.map((v) => `${v.size.trim().toLowerCase()}|${v.color.trim().toLowerCase()}`));
                          const model = base[0] ?? current[0] ?? emptyVariant();
                          const prefix = (slugify(form.name) || "sku").toUpperCase().slice(0, 10);
                          const extra: ProductVariant[] = [];
                          for (const size of sizeList) {
                            for (const color of colorList) {
                              const key = `${size.toLowerCase()}|${color.toLowerCase()}`;
                              if (seen.has(key)) continue;
                              seen.add(key);
                              extra.push({
                                ...emptyVariant(),
                                size,
                                color,
                                sku: [prefix, size, color].filter(Boolean).join("-").toUpperCase(),
                                price_cop: model.price_cop,
                                cost_cop: model.cost_cop,
                                price_usd: model.price_usd,
                                cost_usd: model.cost_usd,
                              });
                            }
                          }
                          return [...base, ...extra];
                        });
                        setGenSizes("");
                        setGenColors("");
                      }}
                      className="self-end rounded-full bg-ink px-4 py-2.5 text-xs text-ivory"
                    >
                      Generar combinaciones
                    </button>
                  </div>

                  {/* Acciones masivas */}
                  {pickedVariants.length > 0 && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-ink/10 bg-ink/[0.03] p-2.5 text-xs">
                      <span className="text-ink/70">{pickedVariants.length} seleccionadas</span>
                      <select
                        value={bulkField}
                        onChange={(e) => setBulkField(e.target.value as typeof bulkField)}
                        className="rounded-full border border-ink/10 bg-white px-3 py-1.5 outline-none"
                      >
                        <option value="price_cop">Precio COP</option>
                        <option value="cost_cop">Costo COP</option>
                        <option value="price_usd">Precio USD</option>
                        <option value="cost_usd">Costo USD</option>
                      </select>
                      <input
                        value={bulkValue}
                        onChange={(e) => setBulkValue(e.target.value)}
                        inputMode="numeric"
                        placeholder="Valor"
                        className="w-28 rounded-full border border-ink/10 bg-white px-3 py-1.5 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!bulkValue.trim()) return;
                          setVariants((current) => current.map((it, i) => (pickedVariants.includes(i) ? { ...it, [bulkField]: bulkValue.trim() } : it)));
                          setBulkValue("");
                        }}
                        className="rounded-full bg-ink px-3 py-1.5 text-ivory"
                      >
                        Aplicar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setVariants((current) => [...current, ...pickedVariants.map((i) => ({ ...current[i]!, id: undefined, sku: `${current[i]!.sku}-COPIA` }))]);
                          setPickedVariants([]);
                        }}
                        className="rounded-full border border-ink/15 bg-white px-3 py-1.5"
                      >
                        Duplicar
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setRemovedVariantIds((ids) => [...ids, ...pickedVariants.map((i) => variants[i]?.id).filter((id): id is string => Boolean(id))]);
                          setVariants((current) => {
                            const next = current.filter((_, i) => !pickedVariants.includes(i));
                            return next.length ? next : [emptyVariant()];
                          });
                          setPickedVariants([]);
                        }}
                        className="rounded-full border border-ink/15 bg-white px-3 py-1.5 text-destructive"
                      >
                        Eliminar
                      </button>
                    </div>
                  )}

                  {/* Tabla */}
                  <div className="mt-3 overflow-x-auto">
                     <table className="w-full table-fixed min-w-[980px] text-sm">
                      <thead>
                        <tr className="text-left text-[10px] uppercase tracking-wider text-ink/45">
                          <th className="w-8 pb-2">
                            <input
                              type="checkbox"
                              checked={pickedVariants.length === variants.length && variants.length > 0}
                              onChange={(e) => setPickedVariants(e.target.checked ? variants.map((_, i) => i) : [])}
                            />
                          </th>
                          <th className="pb-2 pr-2">SKU</th>
                          <th className="pb-2 pr-2">Talla</th>
                          <th className="pb-2 pr-2">Color</th>
                          <th className="pb-2 pr-2">Precio COP</th>
                          <th className="pb-2 pr-2">Costo COP</th>
                          <th className="pb-2 pr-2">Precio USD</th>
                          <th className="pb-2 pr-2">Costo USD</th>
                          <th className="pb-2 pr-2">Partida arancelaria</th>
                           <th className="w-16 pb-2 pr-2 text-right">Cant.</th>
                          <th className="w-8 pb-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {variants.map((variant, index) => {
                          const set = (patch: Partial<ProductVariant>) =>
                            setVariants((c) => c.map((it, i) => (i === index ? { ...it, ...patch } : it)));
                          const cell = "w-full rounded-lg border border-ink/10 bg-white px-2 py-1.5 text-sm outline-none focus:border-ink/40";
                          return (
                            <tr key={variant.id ?? index} className="align-middle">
                              <td className="py-1 pr-2">
                                <input
                                  type="checkbox"
                                  checked={pickedVariants.includes(index)}
                                  onChange={(e) =>
                                    setPickedVariants((c) => (e.target.checked ? [...c, index] : c.filter((i) => i !== index)))
                                  }
                                />
                              </td>
                              <td className="py-1 pr-2"><input className={cell} value={variant.sku} onChange={(e) => set({ sku: e.target.value })} /></td>
                              <td className="py-1 pr-2"><input className={`${cell} w-20`} value={variant.size} onChange={(e) => set({ size: e.target.value })} /></td>
                              <td className="py-1 pr-2"><input className={`${cell} w-24`} value={variant.color} onChange={(e) => set({ color: e.target.value })} /></td>
                              <td className="py-1 pr-2"><input className={`${cell} w-24`} inputMode="numeric" value={variant.price_cop} onChange={(e) => set({ price_cop: e.target.value })} /></td>
                              <td className="py-1 pr-2"><input className={`${cell} w-24`} inputMode="numeric" value={variant.cost_cop} onChange={(e) => set({ cost_cop: e.target.value })} /></td>
                              <td className="py-1 pr-2"><input className={`${cell} w-20`} inputMode="numeric" value={variant.price_usd} onChange={(e) => set({ price_usd: e.target.value })} /></td>
                              <td className="py-1 pr-2"><input className={`${cell} w-20`} inputMode="numeric" value={variant.cost_usd} onChange={(e) => set({ cost_usd: e.target.value })} /></td>
                              <td className="py-1 pr-2"><input aria-label={`Partida arancelaria ${variant.sku}`} className={`${cell} w-32`} value={variant.tariff_code} onChange={(e) => set({ tariff_code: e.target.value })} /></td>
                               <td className="py-1 pr-2 text-right">
                                 <span
                                   title={variant.id ? "Unidades disponibles en todas las bodegas (se edita desde Inventario)" : "Se crea al guardar"}
                                   className={`inline-block min-w-10 rounded-lg px-2 py-1.5 text-sm tabular-nums ${
                                     variant.stock == null
                                       ? "text-ink/35"
                                       : variant.stock <= 0
                                         ? "bg-red-50 text-red-600"
                                         : "bg-cream/70 text-ink"
                                   }`}
                                 >
                                   {variant.stock == null ? "—" : variant.stock}
                                 </span>
                               </td>
                              <td className="py-1">
                                <button
                                  type="button"
                                  disabled={variants.length === 1}
                                  onClick={() => {
                                    if (variant.id) setRemovedVariantIds((c) => [...c, variant.id as string]);
                                    setVariants((c) => c.filter((_, i) => i !== index));
                                    setPickedVariants([]);
                                  }}
                                  className="rounded-full p-1 text-ink/40 hover:text-destructive disabled:opacity-30"
                                >
                                  <Trash2 className="size-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              </section>

              <aside className="col-span-12 space-y-6 lg:col-span-4">
                <Card>
                  <CardTitle>Precios y márgenes</CardTitle>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-ink/60">Precio COP *</label>
                      <TextInput value={firstVariant.price_cop} onChange={(v) => updateFirstVariant({ price_cop: v })} />
                    </div>
                    <div>
                      <label className="text-xs text-ink/60">Precio USD *</label>
                      <TextInput
                        value={firstVariant.price_usd}
                        onChange={(v) => updateFirstVariant({ price_usd: v })}
                        placeholder={suggestedUsd || undefined}
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-ink/50">
                    {suggestedUsd
                      ? `Sugerido ${suggestedUsd} USD con la TRM de hoy (${Math.round(trm ?? 0).toLocaleString("es-CO")} COP). Escríbelo: no se llena solo y no se convierte desde pesos.`
                      : "Obligatorio: es el precio que pagan los clientes fuera de Colombia. No se convierte desde pesos."}
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-ink/60">Costo COP</label>
                      <TextInput value={firstVariant.cost_cop} onChange={(v) => updateFirstVariant({ cost_cop: v })} />
                      {trm && Number(firstVariant.cost_cop) > 0 && (
                        <p className="mt-1 text-xs text-ink/50">
                          ≈ {Math.round(Number(firstVariant.cost_cop) / trm).toLocaleString("es-CO")} USD con la TRM de hoy
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="text-xs text-ink/60">Costo USD</label>
                      <TextInput value={firstVariant.cost_usd} onChange={(v) => updateFirstVariant({ cost_usd: v })} />
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    <MarginBox label="Margen COP" price={firstVariant.price_cop} cost={firstVariant.cost_cop} currency="COP" />
                    <MarginBox label="Margen USD" price={firstVariant.price_usd} cost={firstVariant.cost_usd} currency="USD" />
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-sm text-ink/80">
                    <input
                      type="checkbox"
                      checked={Boolean(firstVariant.compare_at_cop) || Boolean(firstVariant.compare_at_usd)}
                      onChange={(event) => {
                        if (!event.target.checked) updateFirstVariant({ compare_at_cop: "", compare_at_usd: "" });
                        else updateFirstVariant({ compare_at_cop: firstVariant.compare_at_cop || firstVariant.price_cop });
                      }}
                      className="size-4 rounded border-ink/20"
                    />
                    En descuento
                  </label>
                  {(Boolean(firstVariant.compare_at_cop) || Boolean(firstVariant.compare_at_usd)) && (
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-ink/50">Original COP</label>
                        <TextInput value={firstVariant.compare_at_cop} onChange={(v) => updateFirstVariant({ compare_at_cop: v })} />
                      </div>
                      <div>
                        <label className="text-[10px] uppercase tracking-wider text-ink/50">Original USD</label>
                        <TextInput value={firstVariant.compare_at_usd} onChange={(v) => updateFirstVariant({ compare_at_usd: v })} />
                      </div>
                    </div>
                  )}
                </Card>
              </aside>
            </div>
          )}


          {!isLoading && section === "fit" && (
            <div className="space-y-4">
              <Card>
                <CardTitle>Cómo queda esta pieza</CardTitle>
                <p className="mt-1 text-xs text-ink/55">
                  Con estos datos, "Encuentra tu talla" recomienda una talla concreta en la página de producto.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <FitSelect
                    label="Tipo de prenda"
                    value={fitSpec.garment_type}
                    onChange={(v) => setFitSpec((c) => ({ ...c, garment_type: v as FitSpecForm["garment_type"] }))}
                    options={[
                      ["top", "Superior"],
                      ["bottom", "Inferior"],
                      ["dress", "Vestido / enterizo"],
                      ["outerwear", "Abrigo"],
                      ["other", "Otro"],
                    ]}
                  />
                  <FitSelect
                    label="Silueta"
                    value={fitSpec.fit_type}
                    onChange={(v) => setFitSpec((c) => ({ ...c, fit_type: v as FitSpecForm["fit_type"] }))}
                    options={[
                      ["slim", "Ajustada"],
                      ["regular", "Regular"],
                      ["relaxed", "Relajada"],
                      ["oversized", "Oversize"],
                    ]}
                  />
                  <FitSelect
                    label="Elasticidad"
                    value={fitSpec.stretch_level}
                    onChange={(v) => setFitSpec((c) => ({ ...c, stretch_level: v as FitSpecForm["stretch_level"] }))}
                    options={[
                      ["none", "Sin elasticidad"],
                      ["low", "Poca"],
                      ["medium", "Media"],
                      ["high", "Alta"],
                    ]}
                  />
                  <div>
                    <label className="text-xs text-ink/60">Talla de la modelo</label>
                    <TextInput value={fitSpec.model_size} onChange={(v) => setFitSpec((c) => ({ ...c, model_size: v }))} />
                  </div>
                  <div>
                    <label className="text-xs text-ink/60">Altura de la modelo (cm)</label>
                    <TextInput value={fitSpec.model_height} onChange={(v) => setFitSpec((c) => ({ ...c, model_height: v }))} />
                  </div>
                  <div className="md:col-span-3">
                    <label className="text-xs text-ink/60">Nota de fit (se muestra a la clienta)</label>
                    <TextInput
                      value={fitSpec.fit_notes}
                      onChange={(v) => setFitSpec((c) => ({ ...c, fit_notes: v }))}
                    />
                  </div>
                </div>
              </Card>

              <Card>
                <CardTitle>Medidas por talla (cm)</CardTitle>
                <p className="mt-1 text-xs text-ink/55">Usa rangos como 84-88 o un valor único.</p>
                <div className="mt-4 space-y-2">
                  {fitSpec.rows.map((row, index) => (
                    <div key={index} className="grid grid-cols-2 gap-2 rounded-2xl border border-ink/10 bg-white p-3 md:grid-cols-6">
                      <VariantField
                        label="Talla"
                        value={row.size}
                        onChange={(v) => setFitSpec((c) => ({ ...c, rows: c.rows.map((r, i) => (i === index ? { ...r, size: v } : r)) }))}
                      />
                      <VariantField
                        label="Busto"
                        value={row.bust}
                        onChange={(v) => setFitSpec((c) => ({ ...c, rows: c.rows.map((r, i) => (i === index ? { ...r, bust: v } : r)) }))}
                      />
                      <VariantField
                        label="Cintura"
                        value={row.waist}
                        onChange={(v) => setFitSpec((c) => ({ ...c, rows: c.rows.map((r, i) => (i === index ? { ...r, waist: v } : r)) }))}
                      />
                      <VariantField
                        label="Cadera"
                        value={row.hip}
                        onChange={(v) => setFitSpec((c) => ({ ...c, rows: c.rows.map((r, i) => (i === index ? { ...r, hip: v } : r)) }))}
                      />
                      <VariantField
                        label="Largo"
                        value={row.length}
                        onChange={(v) => setFitSpec((c) => ({ ...c, rows: c.rows.map((r, i) => (i === index ? { ...r, length: v } : r)) }))}
                      />
                      <button
                        type="button"
                        onClick={() => setFitSpec((c) => ({ ...c, rows: c.rows.filter((_, i) => i !== index) }))}
                        className="self-end text-xs text-ink/50 hover:text-destructive"
                      >
                        Quitar
                      </button>
                    </div>
                  ))}
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setFitSpec((c) => ({ ...c, rows: [...c.rows, emptyFitRow()] }))}
                      className="rounded-full border border-ink/15 px-4 py-2 text-xs hover:border-ink"
                    >
                      <Plus className="mr-1 inline size-3.5" /> Agregar talla
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFitSpec((c) => {
                          const sizes = Array.from(
                            new Set(variants.map((v) => v.size.trim().toUpperCase()).filter(Boolean)),
                          );
                          const existing = new Set(c.rows.map((r) => r.size.trim().toUpperCase()));
                          return {
                            ...c,
                            rows: [...c.rows, ...sizes.filter((s) => !existing.has(s)).map((s) => ({ ...emptyFitRow(), size: s }))],
                          };
                        })
                      }
                      className="rounded-full border border-ink/15 px-4 py-2 text-xs hover:border-ink"
                    >
                      Traer tallas de las variantes
                    </button>
                  </div>
                </div>
              </Card>
            </div>
          )}


          {!isLoading && section === "seo" && (
            <Card>
              <CardTitle>SEO</CardTitle>
              <p className="mt-1 text-xs text-ink/50">Optimiza cómo aparece este producto en buscadores.</p>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="text-xs text-ink/60">Título SEO</label>
                  <TextInput value={form.name} onChange={(v) => setForm((c) => ({ ...c, name: v }))} />
                </div>
                <div>
                  <label className="text-xs text-ink/60">Meta descripción</label>
                  <textarea value={form.description} onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))} rows={3} className="mt-1 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-ink/40" />
                </div>
              </div>
            </Card>
          )}

          {!isLoading && section === "recorrido" && (
            <Card>
              <CardTitle>Recorrido del producto</CardTitle>
              <p className="mt-1 text-xs text-ink/50">
                Bloques que la clienta va recorriendo en la página. Color y talla son obligatorios para comprar; el resto son
                capítulos editoriales que nunca bloquean la compra.
              </p>
              <div className="mt-4 space-y-3">
                {journey.map((block, index) => {
                  const fixed = Boolean(block.slot);
                  const upd = (patch: Partial<JourneyRow>) =>
                    setJourney((c) => c.map((b, i) => (i === index ? { ...b, ...patch } : b)));
                  const move = (dir: -1 | 1) =>
                    setJourney((c) => {
                      const next = [...c];
                      const target = index + dir;
                      if (target < 0 || target >= next.length) return c;
                      [next[index], next[target]] = [next[target], next[index]];
                      return next;
                    });
                  return (
                    <div key={block.id ?? `${block.slot ?? "b"}-${index}`} className="rounded-2xl border border-ink/10 bg-white p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-xs text-ink/60">
                          {String(index + 1).padStart(2, "0")}
                          {fixed && <span className="ml-2 rounded-full bg-ink/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-ink/60">Obligatorio</span>}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-ink/50">
                          <button type="button" onClick={() => move(-1)} className="hover:text-ink">↑</button>
                          <button type="button" onClick={() => move(1)} className="hover:text-ink">↓</button>
                          {!fixed && (
                            <button type="button" onClick={() => setJourney((c) => c.filter((_, i) => i !== index))} className="hover:text-destructive">
                              Quitar
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="grid gap-2 sm:grid-cols-2">
                        <TextInput value={block.title} onChange={(v) => upd({ title: v })} />
                        <TextInput value={block.subtitle} onChange={(v) => upd({ subtitle: v })} />
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {JOURNEY_KINDS.map((k) => (
                          <button
                            key={k.key}
                            type="button"
                            disabled={fixed}
                            onClick={() => upd({ kind: k.key, selectable: k.key === "selection" })}
                            className={`rounded-full border px-3 py-1.5 text-xs transition ${
                              block.kind === k.key ? "border-ink bg-ink text-white" : "border-ink/15 bg-white text-ink/70 hover:border-ink/30"
                            } ${fixed ? "opacity-60" : ""}`}
                          >
                            {k.label}
                          </button>
                        ))}
                      </div>

                      {block.kind !== "selection" && (
                        <textarea
                          value={block.body}
                          onChange={(e) => upd({ body: e.target.value })}
                          rows={3}
                          placeholder="Texto del bloque (ej. wide leg / relaxed)"
                          className="mt-3 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-ink/40"
                        />
                      )}

                      {!fixed && (
                        <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink/70">
                          <label className="flex items-center gap-1.5">
                            <input type="checkbox" checked={block.required} onChange={(e) => upd({ required: e.target.checked })} />
                            Obligatorio para comprar
                          </label>
                          <label className="flex items-center gap-1.5">
                            <input type="checkbox" checked={block.selectable} onChange={(e) => upd({ selectable: e.target.checked })} />
                            Seleccionable
                          </label>
                        </div>
                      )}

                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-ink/70">
                        {(["gallery", "sku", "price", "inventory"] as const).map((key) => (
                          <label key={key} className="flex items-center gap-1.5">
                            <input
                              type="checkbox"
                              checked={Boolean(block.affects[key])}
                              onChange={(e) => upd({ affects: { ...block.affects, [key]: e.target.checked } })}
                            />
                            {key === "gallery" ? "Cambia galería" : key === "sku" ? "Cambia SKU" : key === "price" ? "Cambia precio" : "Cambia inventario"}
                          </label>
                        ))}
                      </div>

                      {(images.length > 0 || videos.length > 0) && (
                        <div className="mt-3">
                          <p className="mb-2 text-xs text-ink/60">Medio de este bloque</p>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => upd({ media: [] })}
                              className={`rounded-lg border px-3 py-1.5 text-xs ${block.media.length === 0 ? "border-ink bg-ink text-white" : "border-ink/15 bg-white text-ink/60"}`}
                            >
                              Automático
                            </button>
                            {images.map((img) => (
                              <button
                                key={img.id}
                                type="button"
                                onClick={() => upd({ media: [img.url] })}
                                className={`size-12 overflow-hidden rounded-lg border ${block.media[0] === img.url ? "border-ink" : "border-ink/15"}`}
                              >
                                <img src={img.url} alt="" className="size-full object-cover" />
                              </button>
                            ))}
                            {videos.map((v) => (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => upd({ media: [v.url] })}
                                className={`grid size-12 place-items-center rounded-lg border ${block.media[0] === v.url ? "border-ink bg-ink text-white" : "border-ink/15 bg-white text-ink/60"}`}
                              >
                                <Video className="size-4" />
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() =>
                  setJourney((c) => [
                    ...c,
                    { kind: "info", slot: null, title: "", subtitle: "", body: "", required: false, selectable: false, affects: {}, media: [] },
                  ])
                }
                className="mt-4 flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm text-ink/80 hover:bg-ink/[0.03]"
              >
                <Plus className="size-4" /> Agregar bloque
              </button>
            </Card>
          )}

          {!isLoading && section === "faqs" && (
            <Card>
              <CardTitle>FAQs del producto</CardTitle>
              <div className="mt-4 space-y-3">
                {faqs.map((faq, index) => (
                  <div key={faq.id ?? index} className="rounded-2xl border border-ink/10 bg-white p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <p className="text-xs text-ink/60">Pregunta {index + 1}</p>
                      <button type="button" onClick={() => setFaqs((c) => c.filter((_, i) => i !== index))} className="text-xs text-ink/50 hover:text-destructive">Quitar</button>
                    </div>
                    <TextInput value={faq.question} onChange={(v) => setFaqs((c) => c.map((it, i) => i === index ? { ...it, question: v } : it))} />
                    <textarea value={faq.answer} onChange={(e) => setFaqs((c) => c.map((it, i) => i === index ? { ...it, answer: e.target.value } : it))} rows={3} className="mt-2 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-ink/40" />
                  </div>
                ))}
                {!faqs.length && <p className="rounded-2xl border border-dashed border-ink/15 bg-white p-6 text-center text-sm text-ink/50">Sin FAQs todavía.</p>}
              </div>
              <button type="button" onClick={() => setFaqs((c) => [...c, { question: "", answer: "", position: c.length }])} className="mt-4 flex items-center gap-1.5 rounded-full border border-ink/10 bg-white px-4 py-2 text-sm text-ink/80 hover:bg-ink/[0.03]">
                <Plus className="size-4" /> Agregar FAQ
              </button>
            </Card>
          )}

          {!isLoading && section === "resenas" && (
            isEditing && productId ? (
              <ProductReviewsEditor productId={productId} />
            ) : (
              <Card>
                <CardTitle>Reseñas</CardTitle>
                <p className="mt-2 text-sm text-ink/55">Guarda el producto antes de agregar reseñas.</p>
              </Card>
            )
          )}

          {!isLoading && section === "relacionados" && (
            <Card>
              <CardTitle>Productos relacionados</CardTitle>
              <p className="mt-1 text-xs text-ink/50">
                Selecciona qué productos aparecerán en la sección "relacionados" de la página de este producto. Si no eliges ninguno, se mostrarán productos aleatorios.
              </p>

              <div className="mt-4">
                <p className="mb-2 text-xs text-ink/60">Tipo de recomendación</p>
                <div className="flex flex-wrap gap-2">
                  {([
                    { key: "related", label: "Relacionados" },
                    { key: "cross_sell", label: "Cross selling (combina bien con)" },
                    { key: "upsell", label: "Upselling (versión superior)" },
                  ] as { key: RelatedKind; label: string }[]).map((opt) => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setRelatedKind(opt.key)}
                      className={`rounded-full border px-4 py-2 text-sm transition ${
                        relatedKind === opt.key ? "border-ink bg-ink text-white" : "border-ink/15 bg-white text-ink/70 hover:border-ink/30"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-6">
                <p className="mb-2 text-xs text-ink/60">Buscar productos para añadir</p>
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink/40" />
                  <input
                    value={relatedQuery}
                    onChange={(e) => setRelatedQuery(e.target.value)}
                    placeholder="Escribe al menos 2 letras…"
                    className="w-full rounded-xl border border-ink/10 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-ink/40"
                  />
                </div>
                {relatedQuery.trim().length > 1 && (
                  <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-ink/10 bg-white">
                    {(searchResults ?? []).length === 0 && (
                      <p className="px-3 py-4 text-sm text-ink/50">Sin resultados.</p>
                    )}
                    {(searchResults ?? []).map((p) => {
                      const already = related.some((r) => r.id === p.id);
                      return (
                        <button
                          type="button"
                          key={p.id}
                          disabled={already}
                          onClick={() => {
                            setRelated((c) => [...c, p]);
                            setRelatedQuery("");
                          }}
                          className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-ink/[0.03] disabled:opacity-40"
                        >
                          <div className="size-10 overflow-hidden rounded-lg bg-[#f6f6f4]">
                            {p.hero_image_url && <img src={p.hero_image_url} alt="" className="h-full w-full object-cover" />}
                          </div>
                          <span className="flex-1">{p.name}</span>
                          {already && <span className="text-xs text-ink/40">Añadido</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="mt-6">
                <p className="mb-2 text-xs text-ink/60">Seleccionados ({related.length})</p>
                {related.length === 0 ? (
                  <p className="rounded-2xl border border-dashed border-ink/15 bg-white p-6 text-center text-sm text-ink/50">
                    Sin selección. Se mostrarán productos aleatorios en la página del producto.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                    {related.map((r, i) => (
                      <div key={r.id} className="flex items-center gap-3 rounded-xl border border-ink/10 bg-white p-2">
                        <div className="size-12 overflow-hidden rounded-lg bg-[#f6f6f4]">
                          {r.hero_image_url && <img src={r.hero_image_url} alt="" className="h-full w-full object-cover" />}
                        </div>
                        <div className="min-w-0 flex-1 text-sm">
                          <p className="truncate">{r.name}</p>
                          <p className="text-xs text-ink/50">#{i + 1}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setRelated((c) => c.filter((it) => it.id !== r.id))}
                          className="rounded-full p-1.5 text-ink/50 hover:bg-ink/5 hover:text-destructive"
                          aria-label="Quitar"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}

          {!isLoading && section === "lookbook" && (
            <Card>
              <CardTitle>Lookbook</CardTitle>
              <p className="mt-1 text-xs text-ink/50">
                Convierte la página de este producto en una experiencia editorial con video controlado por el scroll.
                La página estándar se mantiene intacta cuando está desactivada.
              </p>

              <label className="mt-5 flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={lookbookEnabled}
                  onChange={(e) => setLookbookEnabled(e.target.checked)}
                  className="size-4"
                />
                Usar experiencia Lookbook
              </label>

              {lookbookEnabled && (
                <div className="mt-6 space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink/60">Video</p>
                      {(pendingLookbookVideo || lookbook.videoUrl) && (
                        <p className="mt-2 truncate text-xs text-ink/60">
                          {pendingLookbookVideo ? pendingLookbookVideo.name : lookbook.videoUrl}
                        </p>
                      )}
                      <input
                        type="file"
                        accept="video/*"
                        className="mt-2 block w-full text-xs"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          if (file && !file.type.startsWith("video/")) {
                            toast.error("El archivo debe ser un video");
                            return;
                          }
                          if (file && file.size / (1024 * 1024) > 40) {
                            toast.warning("Recomendado menos de 40 MB para que cargue rápido");
                          }
                          setPendingLookbookVideo(file);
                        }}
                      />
                      {lookbook.videoUrl && (
                        <button
                          type="button"
                          onClick={() => setLookbook((c) => ({ ...c, videoUrl: null }))}
                          className="mt-2 text-xs text-ink/50 underline"
                        >
                          Quitar video
                        </button>
                      )}
                    </div>

                    <div>
                      <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink/60">Portada</p>
                      {lookbook.posterUrl && (
                        <img src={lookbook.posterUrl} alt="Portada" className="mt-2 h-24 w-auto object-cover" />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="mt-2 block w-full text-xs"
                        onChange={(e) => setPendingLookbookPoster(e.target.files?.[0] ?? null)}
                      />
                      <p className="mt-1 text-[11px] text-ink/45">
                        Si no subes una, se genera automáticamente del primer cuadro del video.
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {(["desktopPosition", "mobilePosition"] as const).map((key) => (
                      <div key={key}>
                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink/60">
                          {key === "desktopPosition" ? "Encuadre computador" : "Encuadre celular"}
                        </p>
                        {(["x", "y"] as const).map((axis) => (
                          <label key={axis} className="mt-2 flex items-center gap-3 text-xs text-ink/60">
                            <span className="w-4 uppercase">{axis}</span>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={lookbook[key]?.[axis] ?? 50}
                              onChange={(e) =>
                                setLookbook((c) => ({
                                  ...c,
                                  [key]: { ...(c[key] ?? { x: 50, y: 50 }), [axis]: Number(e.target.value) },
                                }))
                              }
                              className="flex-1"
                            />
                            <span className="w-8 text-right">{lookbook[key]?.[axis] ?? 50}%</span>
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink/60">Duración del recorrido</p>
                    <div className="mt-2 flex gap-2">
                      {(["short", "medium", "long"] as const).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setLookbook((c) => ({ ...c, duration: d }))}
                          className={
                            "border px-3 py-1.5 text-xs " +
                            ((lookbook.duration ?? "medium") === d
                              ? "border-ink bg-ink text-ivory"
                              : "border-ink/20 text-ink/60")
                          }
                        >
                          {d === "short" ? "Corto" : d === "medium" ? "Medio" : "Largo"}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink/60">Características</p>
                    <p className="mt-1 text-[11px] text-ink/45">
                      Aparecen sueltas sobre el video. Si lo dejas vacío se usan los materiales del producto.
                    </p>
                    <div className="mt-3 space-y-2">
                      {(lookbook.features ?? []).map((f, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            value={f}
                            onChange={(e) =>
                              setLookbook((c) => {
                                const next = [...(c.features ?? [])];
                                next[i] = e.target.value;
                                return { ...c, features: next };
                              })
                            }
                            className="flex-1 border border-ink/20 bg-transparent px-2 py-1.5 text-xs"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setLookbook((c) => {
                                const next = [...(c.features ?? [])];
                                if (i === 0) return c;
                                [next[i - 1], next[i]] = [next[i], next[i - 1]];
                                return { ...c, features: next };
                              })
                            }
                            className="px-2 text-xs text-ink/50"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setLookbook((c) => ({ ...c, features: (c.features ?? []).filter((_, j) => j !== i) }))
                            }
                            className="px-2 text-ink/50"
                            aria-label="Quitar"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3"
                      onClick={() => setLookbook((c) => ({ ...c, features: [...(c.features ?? []), ""] }))}
                    >
                      <Plus className="mr-1 size-4" /> Agregar característica
                    </Button>
                  </div>

                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.14em] text-ink/60">Galería del lookbook</p>
                    <p className="mt-1 text-[11px] text-ink/45">
                      Usa las fotos que ya tiene el producto. Sin selección se muestran las primeras seis.
                    </p>
                    <div className="mt-3 grid grid-cols-3 gap-3 md:grid-cols-6">
                      {images.map((img) => {
                        const chosen = (lookbook.gallery ?? []).includes(img.url);
                        const order = (lookbook.gallery ?? []).indexOf(img.url);
                        return (
                          <button
                            key={img.id}
                            type="button"
                            onClick={() =>
                              setLookbook((c) => {
                                const list = [...(c.gallery ?? [])];
                                const at = list.indexOf(img.url);
                                if (at >= 0) list.splice(at, 1);
                                else list.push(img.url);
                                return { ...c, gallery: list };
                              })
                            }
                            className={
                              "relative aspect-[3/4] overflow-hidden border " +
                              (chosen ? "border-ink" : "border-transparent opacity-50")
                            }
                          >
                            <img src={img.url} alt="" className="size-full object-cover" />
                            {chosen && (
                              <span className="absolute left-1 top-1 bg-ink px-1.5 py-0.5 font-mono text-[10px] text-ivory">
                                {order + 1}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {form.slug && (
                    <a
                      href={`/producto/${form.slug}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block border border-ink px-4 py-2 text-xs uppercase tracking-[0.18em]"
                    >
                      Preview lookbook
                    </a>
                  )}
                </div>
              )}
            </Card>
          )}

          {!isLoading && section === "looks" && (
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 basis-72">
                  <CardTitle>Looks</CardTitle>
                  <p className="mt-1 text-xs text-ink/50">
                    Arma el tablero con las piezas que combinan con este producto.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => setLooks((c) => [...c, emptyLook()])}
                >
                  <Plus className="mr-1 size-4" /> Nuevo look
                </Button>
              </div>

              {looks.length === 0 && (
                <p className="mt-5 rounded-2xl border border-dashed border-ink/15 bg-white p-6 text-center text-sm text-ink/50">
                  Sin looks configurados.
                </p>
              )}

              <div className="mt-5 space-y-5">
                {looks.map((look, li) => {
                  const patch = (p: Partial<LookForm>) =>
                    setLooks((c) => c.map((l, i) => (i === li ? { ...l, ...p } : l)));
                  const availableColors = Array.from(
                    new Set(variants.map((v) => v.color?.trim()).filter(Boolean) as string[]),
                  );
                  return (
                    <div key={look.key} className="rounded-2xl border border-ink/10 bg-[#faf9f6] p-4">
                      <div className="flex items-center gap-3">
                        <input
                          value={look.title}
                          onChange={(e) => patch({ title: e.target.value })}
                          placeholder="Título del look"
                          className="flex-1 rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-ink/40"
                        />
                        <label className="flex items-center gap-2 text-xs text-ink/60">
                          <input
                            type="checkbox"
                            checked={look.active}
                            onChange={(e) => patch({ active: e.target.checked })}
                          />
                          Activo
                        </label>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            disabled={li === 0}
                            onClick={() =>
                              setLooks((c) => {
                                const n = [...c];
                                [n[li - 1], n[li]] = [n[li], n[li - 1]];
                                return n;
                              })
                            }
                            className="rounded-lg border border-ink/10 px-2 py-1 text-xs disabled:opacity-30"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            disabled={li === looks.length - 1}
                            onClick={() =>
                              setLooks((c) => {
                                const n = [...c];
                                [n[li + 1], n[li]] = [n[li], n[li + 1]];
                                return n;
                              })
                            }
                            className="rounded-lg border border-ink/10 px-2 py-1 text-xs disabled:opacity-30"
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            onClick={() => setLooks((c) => c.filter((_, i) => i !== li))}
                            className="rounded-lg p-1.5 text-ink/50 hover:bg-ink/5 hover:text-destructive"
                            aria-label="Eliminar look"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>


                      {availableColors.length > 0 && (
                        <div className="mt-3">
                          <p className="mb-1 text-xs text-ink/60">Mostrar solo para estos tonos (vacío = todos)</p>
                          <div className="flex flex-wrap gap-1.5">
                            {availableColors.map((c) => {
                              const on = look.colors.includes(c);
                              return (
                                <button
                                  key={c}
                                  type="button"
                                  onClick={() =>
                                    patch({ colors: on ? look.colors.filter((x) => x !== c) : [...look.colors, c] })
                                  }
                                  className={`rounded-full border px-3 py-1.5 text-xs ${
                                    on ? "border-ink bg-ink text-white" : "border-ink/15 bg-white text-ink/70"
                                  }`}
                                >
                                  {c}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
                        <div>
                        <p className="mb-2 text-xs text-ink/60">
                          Tablero del look ({look.items.length + 1} piezas) — arrastra cada prenda dentro de su zona,
                          selecciona dos o más y pulsa <strong>Match</strong>.
                        </p>
                        <LookBoard
                          productId={productId}
                          base={{ ...look.base, name: form.name || "Este producto", heroUrl: heroUrl }}
                          onBaseChange={(p) => patch({ base: { ...look.base, ...p } })}
                          pieces={look.items}
                          onPiecesChange={(items) => patch({ items })}
                          matches={look.matches}
                          onMatchesChange={(matches) => patch({ matches })}
                        />
                        </div>

                        <div className="xl:sticky xl:top-2 xl:self-start">
                        <p className="text-xs text-ink/60">Añadir productos al tablero</p>
                        <div className="relative mt-1.5">
                          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink/40" />
                          <input
                            value={lookQuery}
                            onChange={(e) => setLookQuery(e.target.value)}
                            placeholder="Buscar en todos los productos…"
                            className="w-full rounded-xl border border-ink/10 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-ink/40"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const label = window.prompt("¿Qué prenda del closet? Ej: jean azul claro");
                            if (!label?.trim()) return;
                            patch({
                              items: [
                                ...look.items,
                                {
                                  key: crypto.randomUUID(),
                                  productId: null,
                                  name: label.trim(),
                                  heroUrl: null,
                                  comboImageUrl: "",
                                  cutoutUrl: "",
                                  slot: slotFromType(label),
                                  transform: { ...DEFAULT_TRANSFORM },
                                  genericLabel: label.trim(),
                                  genericType: label.trim().toLowerCase(),
                                },
                              ],
                            });
                          }}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-dashed border-ink/20 px-3 py-1.5 text-xs text-ink/70 hover:bg-ink/[0.04]"
                        >
                          <Plus className="size-3.5" /> Añadir pieza de closet
                        </button>
                        <div className="mt-2 max-h-60 overflow-y-auto rounded-xl border border-ink/10 bg-white">
                          {lookSearch.length === 0 && (
                            <p className="px-3 py-4 text-sm text-ink/50">Sin resultados.</p>
                          )}
                          {lookSearch.map((p) => {
                            const png = cutoutByProduct?.[p.id] ?? "";
                            return (
                              <button
                                type="button"
                                key={p.id}
                                disabled={look.items.some((x) => x.productId === p.id)}
                                onClick={() => {
                                  patch({
                                    items: [
                                      ...look.items,
                                      {
                                        key: crypto.randomUUID(),
                                        productId: p.id,
                                        name: p.name,
                                        heroUrl: p.hero_image_url,
                                        comboImageUrl: "",
                                        cutoutUrl: png,
                                        slot: slotFromType((p as any).product_type ?? p.name),
                                        transform: { ...DEFAULT_TRANSFORM },
                                        genericLabel: "",
                                        genericType: "",
                                      },
                                    ],
                                  });
                                }}
                                className="flex w-full items-center gap-3 border-b border-ink/[0.06] px-3 py-2 text-left text-sm last:border-0 hover:bg-ink/[0.03] disabled:opacity-40"
                              >
                                <div className="size-9 overflow-hidden rounded-lg bg-[#f6f6f4]">
                                  {(png || p.hero_image_url) && (
                                    <img
                                      src={png || p.hero_image_url!}
                                      alt=""
                                      className={png ? "h-full w-full object-contain" : "h-full w-full object-cover"}
                                    />
                                  )}
                                </div>
                                <span className="flex-1 truncate">{p.name}</span>
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[10px] ${
                                    png ? "bg-moss/15 text-ink/70" : "bg-ink/[0.06] text-ink/50"
                                  }`}
                                >
                                  {png ? "PNG listo" : "sin PNG"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </form>
    </div>,
    document.body,
  );
}

/** Muestra con qué productos queda enlazado este grupo de versiones. */
function VersionSiblings({ group, productId }: { group: string; productId?: string }) {
  const key = group.trim();
  const { data } = useQuery({
    queryKey: ["admin", "product-versions", key, productId ?? "new"],
    enabled: Boolean(key),
    queryFn: async () => {
      let query = supabase.from("products").select("id, name, version_label, status").eq("version_group", key);
      if (productId) query = query.neq("id", productId);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });
  if (!key) return null;
  if (!data) return null;
  if (!data.length) return <p className="mt-2 text-[11px] text-ink/45">Aún no hay otro producto con este grupo.</p>;
  return (
    <div className="mt-2 space-y-1">
      <p className="text-[11px] text-ink/50">Enlazado con:</p>
      {data.map((p) => (
        <p key={p.id} className="text-[11px] text-ink/70">
          {p.name}
          {p.version_label ? ` · ${p.version_label}` : ""}
          {p.status !== "published" ? " (no publicado)" : ""}
        </p>
      ))}
    </div>
  );
}

function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-ink/[0.06] bg-white p-5">{children}</div>;
}

function CardTitle({ children }: { children: ReactNode }) {
  return <h3 className="text-base font-semibold tracking-tight text-ink">{children}</h3>;
}

function TextInput({ value, onChange, maxLength, placeholder }: { value: string; onChange: (v: string) => void; maxLength?: number; placeholder?: string }) {
  return TextInputBase({ value, onChange, maxLength, placeholder });
}

function MarginBox({ label, price, cost, currency }: { label: string; price: string; cost: string; currency: "COP" | "USD" }) {
  const p = Number(price);
  const c = Number(cost);
  const valid = Number.isFinite(p) && p > 0 && Number.isFinite(c) && c > 0 && cost.trim() !== "";
  const profit = valid ? p - c : 0;
  const pct = valid ? (profit / p) * 100 : 0;
  return (
    <div className="rounded-xl border border-ink/10 bg-ink/[0.02] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-ink/50">{label}</p>
      {valid ? (
        <>
          <p className={"text-sm font-medium " + (profit >= 0 ? "text-ink" : "text-red-600")}>{pct.toFixed(1)}%</p>
          <p className="text-[11px] text-ink/50">
            Utilidad: {currency === "COP" ? `$${Math.round(profit).toLocaleString("es-CO")}` : formatUSD(profit)}
          </p>
        </>
      ) : (
        <p className="text-sm text-ink/40">—</p>
      )}
    </div>
  );
}

function TextInputBase({ value, onChange, maxLength, placeholder }: { value: string; onChange: (v: string) => void; maxLength?: number; placeholder?: string }) {
  return (
    <input
      value={value}
      maxLength={maxLength}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
      className="mt-1 w-full rounded-xl border border-ink/10 bg-white px-3 py-2.5 text-sm outline-none focus:border-ink/40"
    />
  );
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 py-1 text-sm text-ink/80">
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`flex size-5 items-center justify-center rounded-md border transition ${
          checked ? "border-ink bg-ink text-white" : "border-ink/25 bg-white"
        }`}
      >
        {checked && <svg viewBox="0 0 12 12" className="size-3" fill="none"><path d="M2 6l3 3 5-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
      </button>
      {label}
    </label>
  );
}

function RichEditor({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="mt-1 overflow-hidden rounded-xl border border-ink/10 bg-white">
      <div className="flex items-center gap-1 border-b border-ink/[0.06] px-2 py-1.5 text-ink/60">
        <button type="button" className="flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-ink/5">Párrafo <ChevronDown className="size-3" /></button>
        <span className="mx-1 h-4 w-px bg-ink/10" />
        <button type="button" className="rounded-md p-1.5 hover:bg-ink/5"><Bold className="size-3.5" /></button>
        <button type="button" className="rounded-md p-1.5 hover:bg-ink/5"><Italic className="size-3.5" /></button>
        <button type="button" className="rounded-md p-1.5 hover:bg-ink/5"><Underline className="size-3.5" /></button>
        <button type="button" className="rounded-md p-1.5 hover:bg-ink/5"><Strikethrough className="size-3.5" /></button>
        <span className="mx-1 h-4 w-px bg-ink/10" />
        <button type="button" className="rounded-md p-1.5 hover:bg-ink/5"><List className="size-3.5" /></button>
        <button type="button" className="rounded-md p-1.5 hover:bg-ink/5"><ListOrdered className="size-3.5" /></button>
        <span className="mx-1 h-4 w-px bg-ink/10" />
        <button type="button" className="rounded-md p-1.5 hover:bg-ink/5"><LinkIcon className="size-3.5" /></button>
        <button type="button" className="flex items-center gap-1 rounded-md px-1.5 py-1 hover:bg-ink/5"><ImageIcon className="size-3.5" /><ChevronDown className="size-3" /></button>
      </div>
      <textarea
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        rows={7}
        maxLength={4000}
        className="w-full resize-none px-4 py-3 text-sm outline-none placeholder:text-ink/35"
      />
      <div className="flex justify-end px-3 pb-1.5 text-[10px] text-ink/40">{value.length}/4000</div>
    </div>
  );
}

function Section({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`space-y-4 ${wide ? "lg:col-span-2" : ""}`}>
      <h3 className="font-serif text-xl text-ink">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, value, onChange, textarea }: { label: string; value: string; onChange: (value: string) => void; textarea?: boolean }) {
  return (
    <div>
      <label className="text-xs uppercase tracking-widest text-moss/70">{label}</label>
      {textarea ? (
        <textarea value={value} onChange={(event) => onChange(event.target.value)} rows={4} className="mt-1 w-full rounded-2xl border border-ink/15 bg-white px-4 py-3 text-sm outline-none focus:border-ink" />
      ) : (
        <input value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-full border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ink" />
      )}
    </div>
  );
}

function VariantField({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: "text" | "number" }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest text-moss/70">{label}</label>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="mt-1 w-full rounded-full border border-ink/15 bg-ivory px-3 py-2 text-sm outline-none focus:border-ink" />
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <Button type="button" variant={value ? "default" : "outline"} onClick={() => onChange(!value)} className={`rounded-full ${value ? "bg-ink text-ivory hover:bg-ink/85" : "bg-white"}`}>
      {label}
    </Button>
  );
}

function CoverPicker({
  images,
  pendingImages,
  heroUrl,
  onPick,
  onUpload,
}: {
  images: ProductImage[];
  pendingImages: File[];
  heroUrl: string | null;
  onPick: (url: string) => void;
  onUpload: () => void;
}) {
  return (
    <div>
      <label className="text-xs uppercase tracking-widest text-moss/70">Foto de portada</label>
      <div className="mt-2 flex items-center gap-3">
        <div className="flex h-24 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-ink/15 bg-white">
          {heroUrl ? (
            <img src={heroUrl} alt="Portada" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="size-5 text-moss/40" />
          )}
        </div>
        <div className="flex flex-1 flex-wrap gap-2">
          {images.map((image) => (
            <button
              key={image.id}
              type="button"
              onClick={() => onPick(image.url)}
              className={`h-16 w-14 overflow-hidden rounded-xl border ${heroUrl === image.url ? "border-ink ring-1 ring-ink" : "border-ink/15"}`}
              aria-label="Elegir portada"
            >
              <img src={image.url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
          <Button type="button" variant="outline" onClick={onUpload} className="rounded-full">
            <Upload className="size-4" /> {images.length || pendingImages.length ? "Subir más" : "Subir foto"}
          </Button>
          {pendingImages.length > 0 && (
            <p className="w-full text-[10px] uppercase tracking-widest text-moss/60">Se subirán al guardar: {pendingImages.length}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PriceBlock({
  currency,
  price,
  compareAt,
  onPrice,
  onCompareAt,
}: {
  currency: "COP" | "USD";
  price: string;
  compareAt: string;
  onPrice: (value: string) => void;
  onCompareAt: (value: string) => void;
}) {
  const [discount, setDiscount] = useState(Boolean(compareAt));
  useEffect(() => {
    if (compareAt) setDiscount(true);
  }, [compareAt]);
  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[160px]">
          <label className="text-xs uppercase tracking-widest text-moss/70">Precio ({currency})</label>
          <input
            type="number"
            value={price}
            onChange={(event) => onPrice(event.target.value)}
            className="mt-1 w-full rounded-full border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ink"
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-xs uppercase tracking-widest text-moss/70">
          <input
            type="checkbox"
            checked={discount}
            onChange={(event) => {
              setDiscount(event.target.checked);
              if (!event.target.checked) onCompareAt("");
            }}
          />
          En descuento
        </label>
      </div>
      {discount && (
        <div className="mt-3">
          <label className="text-xs uppercase tracking-widest text-moss/70">Precio original ({currency}) · se muestra tachado</label>
          <input
            type="number"
            value={compareAt}
            onChange={(event) => onCompareAt(event.target.value)}
            placeholder="Ej: 320000"
            className="mt-1 w-full rounded-full border border-ink/15 bg-white px-4 py-2.5 text-sm outline-none focus:border-ink"
          />
          <p className="mt-1 text-[10px] uppercase tracking-widest text-moss/50">Debe ser mayor al precio actual para mostrarse tachado.</p>
        </div>
      )}
    </div>
  );
}

function FitSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <div>
      <label className="text-xs text-ink/60">{label}</label>
      <div className="relative mt-1">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm outline-none focus:border-ink"
        >
          {options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink/40" />
      </div>
    </div>
  );
}

function ProductTypeField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const qc = useQueryClient();
  const { data: types } = useQuery(productTypesQuery());
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const options = (types ?? []).filter((t) => t.active);
  const hasValue = value && !options.some((t) => t.name === value);

  async function create() {
    const clean = name.trim();
    if (!clean) return;
    setBusy(true);
    try {
      const canonical = await ensureProductType(clean);
      await qc.invalidateQueries({ queryKey: ["product-types"] });
      onChange(canonical);
      setName("");
      setCreating(false);
      toast.success("Tipo de prenda creado");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo crear el tipo");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <label className="text-xs text-ink/60">Tipo de prenda</label>
      <div className="relative mt-1">
        <select
          value={value || ""}
          onChange={(event) => onChange(event.target.value)}
          className="w-full appearance-none rounded-xl border border-ink/10 bg-white py-2.5 pl-3 pr-9 text-sm outline-none focus:border-ink/40"
        >
          <option value="">Sin tipo</option>
          {hasValue && <option value={value}>{value}</option>}
          {options.map((type) => (
            <option key={type.id} value={type.name}>{type.name}</option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-ink/40" />
      </div>
      {creating ? (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void create(); } }}
            placeholder="Nombre del tipo"
            className="w-full rounded-xl border border-ink/10 bg-white px-3 py-2 text-sm outline-none focus:border-ink/40"
          />
          <Button type="button" size="sm" onClick={() => void create()} disabled={busy}>Crear</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="mt-2 text-xs text-ink/60 underline underline-offset-4 hover:text-ink"
        >
          Crear nuevo tipo
        </button>
      )}
    </div>
  );
}

/** Descarga una foto del producto; en celular abre «Compartir» para guardarla en Fotos/Archivos. */
async function downloadProductImage(url: string, base: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const name = `${base}.${ext}`;
    const file = new File([blob], name, { type: blob.type });
    if (matchMedia("(pointer: coarse)").matches && navigator.canShare?.({ files: [file] })) {
      try { await navigator.share({ files: [file] }); return; }
      catch (e) { if ((e as DOMException).name === "AbortError") return; }
    }
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 30_000);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}
