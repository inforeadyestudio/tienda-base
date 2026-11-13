import { useSyncExternalStore } from "react";
import { track } from "@/lib/analytics";

export type CartItem = {
  variantId: string;
  productId: string;
  productSlug: string;
  productName: string;
  variantLabel: string;
  priceCop: number;
  /** Precio en dólares guardado en la variante; si existe, manda en vistas internacionales. */
  priceUsd?: number | null;
  imageUrl: string | null;
  qty: number;
  /** Regalo: id del ítem de la lista de regalos que se está comprando */
  giftItemId?: string;
  giftListId?: string;
  giftListSlug?: string;
  giftOwnerName?: string;
  /** Descuento del look aplicado (0-1); el refresco de precios lo conserva. */
  lookRatio?: number;
  /** Precio anterior (Sale) vigente en la base; solo se muestra si supera el actual. */
  compareCop?: number | null;
  compareUsd?: number | null;
};

/** Precio unitario en dólares: solo el guardado en la variante. Nunca se convierte desde pesos (0 = sin precio USD). */
export function itemUsd(item: CartItem, _rate?: number) {
  return typeof item.priceUsd === "number" && item.priceUsd > 0 ? item.priceUsd : 0;
}

/** Actualiza precios del carrito con los vigentes en la base y quita piezas inactivas. */
export async function refreshCartPrices() {
  const current = read();
  const ids = current.map((i) => i.variantId).filter((id) => !id.endsWith("-look"));
  if (!ids.length) return;
  const { supabase } = await import("@/integrations/supabase/client");
  const { data, error } = await supabase.from("product_variants").select("id, price_cop, price_usd, compare_at_cop, compare_at_usd, active, products!inner(status)").in("id", ids);
  if (error || !data) return;
  const byId = new Map(data.map((v: any) => [v.id, v]));
  let changed = false;
  const next = current.filter((i) => {
    if (i.variantId.endsWith("-look")) return true;
    const v: any = byId.get(i.variantId);
    if (!v || !v.active || v.products?.status !== "published") { changed = true; return false; }
    return true;
  }).map((i) => {
    const v: any = byId.get(i.variantId);
    if (!v) return i;
    const priceUsd = Number(v.price_usd) > 0 ? Number(v.price_usd) : null;
    // El servidor cobra el precio real de la variante; el descuento de look aún no se valida allá,
    // así que el checkout usa precio completo para que el cobro coincida y el pedido se cree.
    const cop = Number(v.price_cop);
    const usd = priceUsd;
    const compareCop = Number(v.compare_at_cop) > 0 ? Number(v.compare_at_cop) : null;
    const compareUsd = Number(v.compare_at_usd) > 0 ? Number(v.compare_at_usd) : null;
    if (cop !== i.priceCop || usd !== (i.priceUsd ?? null) || compareCop !== (i.compareCop ?? null) || compareUsd !== (i.compareUsd ?? null)) { changed = true; return { ...i, priceCop: cop, priceUsd: usd, compareCop, compareUsd }; }
    return i;
  });
  if (changed) write(next);
}

const KEY = "tb-cart-v1";
const listeners = new Set<() => void>();
let cache: CartItem[] = [];
let hydrated = false;
const EMPTY: CartItem[] = [];
const getServerSnapshot = () => EMPTY;

function read(): CartItem[] {
  if (typeof window === "undefined") return cache;
  if (!hydrated) {
    try {
      const raw = window.localStorage.getItem(KEY);
      cache = raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      cache = [];
    }
    hydrated = true;
  }
  return cache;
}

function write(items: CartItem[]) {
  if (typeof window === "undefined") return;
  cache = items;
  hydrated = true;
  window.localStorage.setItem(KEY, JSON.stringify(items));
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export const CART_ADDED_EVENT = "tb-cart-added";

export function readCart(): CartItem[] {
  return read();
}

/** Revisa en vivo el stock vendible antes de agregar. Si la red falla, deja agregar (el checkout valida con candado). */
async function hasLiveStock(item: CartItem): Promise<boolean> {
  if (item.variantId.endsWith("-look")) return true;
  try {
    const [{ checkVariantStock }, { canAddToCart }] = await Promise.all([
      import("@/lib/tienda/stock.functions"),
      import("@/lib/tienda/stock-check"),
    ]);
    const { levels } = await checkVariantStock({ data: { variantIds: [item.variantId] } });
    const inCart = read().find((i) => i.variantId === item.variantId)?.qty ?? 0;
    if (canAddToCart(levels[item.variantId], inCart, item.qty).ok) return true;
    const { toast } = await import("sonner");
    toast.error("Esta talla se acaba de agotar");
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(STOCK_SOLD_OUT_EVENT, { detail: item }));
    return false;
  } catch {
    return true;
  }
}

export const STOCK_SOLD_OUT_EVENT = "tb-stock-sold-out";

/** Agrega al carrito tras revisar el stock en vivo. Devuelve false si la talla se agotó. */
export async function addToCart(item: CartItem): Promise<boolean> {
  if (!(await hasLiveStock(item))) return false;
  addToCartUnchecked(item);
  return true;
}

function addToCartUnchecked(item: CartItem) {
  const current = read();
  const existing = current.find((i) => i.variantId === item.variantId);
  if (existing) {
    existing.qty += item.qty;
    write([...current]);
  } else {
    write([...current, item]);
  }
  announce(item);
}

export function setCartQty(variantId: string, qty: number) {
  const current = read();
  if (qty <= 0) write(current.filter((i) => i.variantId !== variantId));
  else write(current.map((i) => (i.variantId === variantId ? { ...i, qty } : i)));
}

export function removeFromCart(variantId: string) {
  setCartQty(variantId, 0);
}

function announce(item: CartItem) {
  if (typeof window === "undefined") return;
  track("selection_added", { variant: item.variantId, qty: item.qty });
  window.dispatchEvent(new CustomEvent<CartItem>(CART_ADDED_EVENT, { detail: item }));
}

export function useCart() {
  const items = useSyncExternalStore(subscribe, read, getServerSnapshot);

  const add = (item: CartItem) => addToCart(item);

  const setQty = (variantId: string, qty: number) => {
    const current = read();
    if (qty <= 0) {
      write(current.filter((i) => i.variantId !== variantId));
    } else {
      write(current.map((i) => (i.variantId === variantId ? { ...i, qty } : i)));
    }
  };

  const remove = (variantId: string) => setQty(variantId, 0);
  const clear = () => write([]);

  const subtotal = items.reduce((sum, i) => sum + i.priceCop * i.qty, 0);
  const count = items.reduce((sum, i) => sum + i.qty, 0);

  return { items, add, setQty, remove, clear, subtotal, count };
}