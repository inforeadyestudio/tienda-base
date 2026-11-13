// Lógica (Claude NO modifica este archivo). El diseño recibe el resultado como `vm`.
import { quickAddProductsQuery } from "@/lib/queries";
import { CartLinePrice, useCartSavings } from "@/components/storefront/product-sale";
import { webSellable } from "@/lib/web-stock";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { itemUsd, refreshCartPrices, useCart, type CartItem } from "@/lib/cart";
import { openCheckout } from "@/lib/checkout/engine";
import { quoteShipping, shippingItemsQuery, shippingSettingsQuery } from "@/lib/store-settings";
import { copToUsd, isColombia, isPanama, useLocale, usePrice } from "@/lib/locale";
import { intlSettingsQuery, intlShippingUsd, panamaShippingCop, itemsWeightKg } from "@/lib/international";
import { useSession } from "@/lib/auth-hooks";
import { compareSizes, displaySize } from "@/lib/size-order";

export function available(v: any) {
  return ((v.inventory_levels ?? []) as any[]).reduce(
    (sum: number, level: any) => sum + webSellable(level), 0,
  );
}

export function useCartDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (value: boolean) => void }) {
  const money = usePrice();
  const { items, setQty, remove, add, subtotal, count } = useCart();
  const savings = useCartSavings(items);
  const { data: pool } = useQuery({ ...quickAddProductsQuery(), enabled: open });
  const { data: shippingSettings } = useQuery(shippingSettingsQuery());
  const { data: shippingItems } = useQuery(shippingItemsQuery(items));
  const { data: intl } = useQuery(intlSettingsQuery());
  const locale = useLocale();
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [quick, setQuick] = useState<any | null>(null);
  const [color, setColor] = useState<string | null>(null);
  const [variantId, setVariantId] = useState<string | null>(null);

  useEffect(() => { if (open) void refreshCartPrices(); }, [open]);
  useEffect(() => {
    if (!open) {
      setQuick(null);
      setShowRecommendations(false);
    }
  }, [open]);

  const variants = useMemo(() => ((quick?.product_variants ?? []) as any[]).filter((v) => v.active), [quick]);
  const colors = useMemo(() => Array.from(new Set(variants.map((v) => v.color).filter(Boolean))) as string[], [variants]);
  // Una sola opción por talla (sin el dato de calidad), con las disponibles primero.
  const sizes = useMemo(() => {
    const bySize = new Map<string, any>();
    for (const v of variants) {
      if (color && v.color !== color) continue;
      const label = displaySize(v.size);
      const prev = bySize.get(label);
      if (!prev || (available(prev) <= 0 && available(v) > 0)) bySize.set(label, v);
    }
    return Array.from(bySize.values()).sort((a, b) => compareSizes(a.size, b.size));
  }, [variants, color]);
  const suggestions = ((pool ?? []) as any[]).filter((product) => !items.some((item) => item.productId === product.id)).slice(0, 3);
  const { user } = useSession();
  const rate = intl?.usdRate ?? 4000;
  const international = locale.isInternational && intl?.enabled !== false;
  const freeMinimum = international
    ? (intl?.shipping.freeFromUsd ?? 0) * rate
    : shippingSettings?.freeShipping.minimumCop ?? 350_000;
  const remaining = Math.max(0, freeMinimum - subtotal);
  const progress = freeMinimum > 0 ? Math.min(100, (subtotal / freeMinimum) * 100) : 100;
  const shippingQuote = shippingSettings ? quoteShipping(shippingSettings, subtotal, shippingItems ?? items.map((item) => ({ productId: item.productId, qty: item.qty })), locale.country, "", { signedIn: !!user }) : null;
  const intlQuote = international && intl ? intlShippingUsd(intl, locale.country, copToUsd(subtotal, rate), itemsWeightKg(shippingItems as any)) : null;
  const subtotalUsd = items.reduce((sum, item) => sum + itemUsd(item, rate) * item.qty, 0);
  const shipping = items.length === 0 ? 0 : intlQuote ? intlQuote.costUsd * rate : isPanama(locale.country) ? (intl ? panamaShippingCop(intl, subtotal, itemsWeightKg(shippingItems as any)).cost : 0) : shippingQuote?.cost ?? 18_000;
  const shippingUsd = shipping === 0 ? 0 : intlQuote ? intlQuote.costUsd : copToUsd(shipping, rate);
  // Solo Colombia tiene envío gratis; Panamá y otros países siempre pagan tarifa internacional.
  const canEarnFreeShipping = isColombia(locale.country) && shippingSettings?.freeShipping.enabled !== false;

  const selectRecommendation = (product: any) => {
    const productVariants = ((product.product_variants ?? []) as any[]).filter((v) => v.active && available(v) > 0);
    const firstColor = productVariants.find((v) => v.color)?.color ?? null;
    setQuick(product);
    setColor(firstColor);
    setVariantId(productVariants.length === 1 ? productVariants[0].id : null);
  };

  const addRecommendation = () => {
    const variant = variants.find((item) => item.id === variantId);
    if (!quick || !variant) return;
    const item: CartItem = {
      variantId: variant.id,
      productId: quick.id,
      productSlug: quick.slug,
      productName: quick.name,
      variantLabel: [variant.color, displaySize(variant.size)].filter(Boolean).join(" · "),
      priceCop: variant.price_cop,
      priceUsd: variant.price_usd ?? null,
      imageUrl: quick.hero_image_url ?? null,
      qty: 1,
    };
    add(item);
    setQuick(null);
  };

  const goToCheckout = () => { openCheckout(); onOpenChange(false); };
  return { open, onOpenChange, money, items, setQty, remove, add, subtotal, count, savings, pool, shippingSettings, shippingItems, intl, locale, showRecommendations, setShowRecommendations, quick, setQuick, color, setColor, variantId, setVariantId, variants, colors, sizes, suggestions, user, rate, international, freeMinimum, remaining, progress, shippingQuote, intlQuote, subtotalUsd, shipping, shippingUsd, canEarnFreeShipping, selectRecommendation, addRecommendation, goToCheckout };
}

export type CartDrawerVM = ReturnType<typeof useCartDrawer>;
