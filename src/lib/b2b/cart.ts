import { useSyncExternalStore } from "react";

export type B2BCartItem = {
  variantId: string;
  productId: string;
  productName: string;
  variantLabel: string;
  sku: string;
  imageUrl: string | null;
  unitPrice: number;
  priceCop: number;
  qty: number;
  /** Prenda con stock en Ecommerce: se pide como Restock (pago al despacho). */
  restock?: boolean;
};

const KEY = "tb-b2b-cart-v1";
const listeners = new Set<() => void>();
let cache: B2BCartItem[] = [];
let hydrated = false;
const EMPTY: B2BCartItem[] = [];

function read(): B2BCartItem[] {
  if (typeof window === "undefined") return EMPTY;
  if (!hydrated) {
    try {
      const raw = window.localStorage.getItem(KEY);
      cache = raw ? (JSON.parse(raw) as B2BCartItem[]) : [];
    } catch {
      cache = [];
    }
    hydrated = true;
  }
  return cache;
}

function write(items: B2BCartItem[]) {
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

export function useB2BCart(): B2BCartItem[] {
  return useSyncExternalStore(subscribe, read, () => EMPTY);
}

export function addB2BItem(item: B2BCartItem) {
  const current = read();
  const existing = current.find((i) => i.variantId === item.variantId);
  if (existing) write(current.map((i) => (i.variantId === item.variantId ? { ...i, qty: i.qty + item.qty } : i)));
  else write([...current, item]);
}

export function setB2BQty(variantId: string, qty: number) {
  const current = read();
  if (qty <= 0) write(current.filter((i) => i.variantId !== variantId));
  else write(current.map((i) => (i.variantId === variantId ? { ...i, qty } : i)));
}

export function clearB2BCart() {
  write([]);
}

export const B2B_CART_OPEN_EVENT = "tb-b2b-cart-open";

export function openB2BCart() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(B2B_CART_OPEN_EVENT));
}
