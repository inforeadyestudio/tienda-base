import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Minutos que se apartan las prendas mientras la clienta paga. */
export const HOLD_MINUTES = 12;
const KEY = "tb-hold-token";

/** Token del apartado de este navegador; sobrevive al ir y volver de la pasarela. */
export function holdToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    let t = localStorage.getItem(KEY);
    if (!t) { t = crypto.randomUUID(); localStorage.setItem(KEY, t); }
    return t;
  } catch { return null; }
}

/** Tras crear el pedido, el siguiente checkout usa un apartado nuevo. */
export function resetHoldToken() {
  try { localStorage.removeItem(KEY); } catch { /* sin almacenamiento */ }
}

export async function extendHold(minutes = 20) {
  const t = holdToken();
  if (!t) return false;
  const { data } = await (supabase.rpc as any)("extend_checkout_hold", { _token: t, _minutes: minutes });
  return data === true;
}

export async function releaseHold() {
  const t = holdToken();
  if (t) await (supabase.rpc as any)("release_checkout_hold", { _token: t });
}

export type HoldState =
  | { status: "idle" | "holding" | "error" }
  | { status: "held"; seconds: number }
  | { status: "expired" }
  | { status: "unavailable"; variantId: string };

/** Aparta el carrito al entrar al paso de pago y lleva la cuenta regresiva. */
export function useCheckoutHold(active: boolean, items: { variantId: string; qty: number }[], international: boolean) {
  const [state, setState] = useState<HoldState>({ status: "idle" });
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [prepared, setPrepared] = useState(false);
  const sig = items.filter((i) => !i.variantId.endsWith("-look")).map((i) => `${i.variantId}:${i.qty}`).join(",");
  const latest = useRef(sig);
  latest.current = sig;

  const hold = useCallback(async () => {
    const t = holdToken();
    if (!t) { setState({ status: "error" }); return; }
    setState({ status: "holding" });
    const { data: orders, error: orderError } = await supabase.from("orders").select("id, reservations(status, expires_at)").eq("hold_token", t).eq("source", "ecom").in("status", ["draft", "reserved"]).order("created_at", { ascending: false }).limit(1);
    if (orderError) { setExpiresAt(null); setState({ status: "error" }); return; }
    const order = orders?.[0];
    if (order) {
      setPrepared(true);
      const active = order.reservations.filter(r => r.status === "active" && Date.parse(r.expires_at) > Date.now());
      if (active.length) setExpiresAt(Math.min(...active.map(r => Date.parse(r.expires_at))));
      else { setExpiresAt(null); setState({ status: "expired" }); }
      return;
    }
    setPrepared(false);
    const payload = latest.current.split(",").filter(Boolean).map((p) => { const [variant_id, qty] = p.split(":"); return { variant_id, qty: Number(qty) }; });
    const { data, error } = await (supabase.rpc as any)("hold_checkout_stock", { _token: t, _items: payload, _minutes: HOLD_MINUTES, _channel: international ? "online_intl" : "online" });
    if (error || !data) { setState({ status: "error" }); return; }
    if (!data.ok) { setExpiresAt(null); setState({ status: "unavailable", variantId: String(data.variant_id) }); return; }
    setExpiresAt(Date.parse(data.expires_at));
  }, [international]);

  useEffect(() => {
    if (!active || !sig) { setExpiresAt(null); setState({ status: "idle" }); return; }
    void hold();
  }, [active, sig, hold]);

  useEffect(() => {
    if (expiresAt === null) return;
    const tick = () => {
      const s = Math.max(0, Math.round((expiresAt - Date.now()) / 1000));
      setState(s > 0 ? { status: "held", seconds: s } : { status: "expired" });
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  /** Al ir a la pasarela se amplía el apartado para cubrir el pago. */
  const extend = useCallback(async () => {
    const ok = await extendHold(20);
    if (ok) setExpiresAt(Date.now() + 20 * 60_000);
    else { setExpiresAt(null); setState({ status: "expired" }); }
    return ok;
  }, []);

  const adoptPrepared = useCallback((expiry?: string) => {
    setPrepared(true);
    const end = expiry ? Date.parse(expiry) : NaN;
    setExpiresAt(Number.isFinite(end) ? end : null);
    if (!Number.isFinite(end) || end <= Date.now()) setState({ status: "expired" });
  }, []);

  return { state, prepared, adoptPrepared, renew: hold, extend };
}
