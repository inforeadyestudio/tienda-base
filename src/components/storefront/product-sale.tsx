import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Clock3, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLocale, usePrice } from "@/lib/locale";
import { saleSettingsQuery } from "@/lib/store-settings";
import { hasSalePrice, saleSecondsLeft, type SaleVariant } from "@/lib/product-sale";
import { cn } from "@/lib/utils";

export function ProductSalePrice({ variant, className }: { variant: SaleVariant; className?: string }) {
  const { currency } = useLocale();
  const money = usePrice();
  const sale = hasSalePrice(variant, currency);
  return <div className={cn("flex flex-wrap items-baseline gap-x-3 gap-y-1 font-nm", className)}>
    {sale && <span className="text-sm opacity-50"><span className="sr-only">Antes: </span><del className="decoration-1">{money(variant.compare_at_cop, variant.compare_at_usd)}</del></span>}
    <span className="text-xl font-medium">{sale && <span className="sr-only">Ahora: </span>}{money(variant.price_cop, variant.price_usd)}</span>
  </div>;
}

export type SaleNoticeState = { seconds: number; viewers: number | null };
export function useProductSale(productId: string, variant: SaleVariant | undefined): SaleNoticeState {
  const { currency } = useLocale();
  const { data: settings } = useQuery({ ...saleSettingsQuery(), refetchInterval: 60_000 });
  const [now, setNow] = useState<number | null>(null);
  const [viewers, setViewers] = useState<number | null>(null);
  const discounted = hasSalePrice(variant, currency);
  useEffect(() => {
    if (!discounted || !settings?.enabled || !settings.endsAt) return;
    const tick = () => setNow(Date.now());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [discounted, settings?.enabled, settings?.endsAt]);
  const seconds = discounted && settings?.enabled && now !== null ? saleSecondsLeft(settings.endsAt, now) : 0;
  const trackViewers = seconds > 0 && settings?.showViewers === true;
  useEffect(() => {
    setViewers(null);
    if (!trackViewers) return;
    let alive = true;
    const key = crypto.randomUUID();
    const channel = supabase.channel(`product-sale:${productId}`, { config: { presence: { key } } });
    channel.on("presence", { event: "sync" }, () => {
      if (alive) setViewers(Object.keys(channel.presenceState()).length);
    }).subscribe(async (status) => {
      if (status === "SUBSCRIBED" && alive) await channel.track({ viewing: true });
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        if (alive) setViewers(null);
      }
    });
    return () => { alive = false; void supabase.removeChannel(channel); };
  }, [productId, trackViewers]);
  return { seconds, viewers: trackViewers ? viewers : null };
}

export function ProductSaleNotice({ state, className }: { state: SaleNoticeState; className?: string }) {
  if (state.seconds <= 0) return null;
  const values = [Math.floor(state.seconds / 86400), Math.floor(state.seconds / 3600) % 24, Math.floor(state.seconds / 60) % 60, state.seconds % 60];
  return <div className={cn("space-y-2 border-t border-current/15 py-3 text-inherit", className)}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2 font-nm text-xs"><Clock3 className="size-3.5" /> El Sale termina en</span>
      <div className="flex gap-3" role="timer" aria-label="Tiempo restante del Sale">
        {values.map((value, i) => <div key={i} className="min-w-6 text-center"><span className="block font-nm text-lg leading-none tabular-nums">{String(value).padStart(2, "0")}</span><span className="mt-1 block text-[9px] opacity-60">{["días", "horas", "min", "seg"][i]}</span></div>)}
      </div>
    </div>
    {state.viewers !== null && state.viewers > 0 && <p className="flex items-center gap-2 text-[11px] opacity-70"><Eye className="size-3.5" />{state.viewers} {state.viewers === 1 ? "visitante viendo esta pieza" : "visitantes viendo esta pieza"}</p>}
  </div>;
}
/** Precio de una línea del carrito con el anterior tachado si hay Sale en la moneda activa. */
export function CartLinePrice({ item, className }: { item: { qty: number; priceCop: number; priceUsd?: number | null; compareCop?: number | null; compareUsd?: number | null }; className?: string }) {
  const { currency } = useLocale();
  const money = usePrice();
  const usd = currency === "USD";
  const sale = usd ? (item.compareUsd ?? 0) > (item.priceUsd ?? 0) && (item.priceUsd ?? 0) > 0 : (item.compareCop ?? 0) > item.priceCop;
  return <span className={cn("flex flex-col items-end tabular-nums", className)}>
    {sale && <del className="text-[11px] opacity-50 decoration-1"><span className="sr-only">Antes: </span>{money((item.compareCop ?? 0) * item.qty, item.compareUsd ? item.compareUsd * item.qty : null)}</del>}
    <span className="text-sm">{money(item.priceCop * item.qty, item.priceUsd ? item.priceUsd * item.qty : null)}</span>
  </span>;
}

/** Ahorro total del carrito en la moneda activa (0 si no hay Sale). */
export function useCartSavings(items: { qty: number; priceCop: number; priceUsd?: number | null; compareCop?: number | null; compareUsd?: number | null }[]) {
  const { currency } = useLocale();
  const usd = currency === "USD";
  let cop = 0, dollars = 0;
  for (const i of items) {
    if (usd) { if ((i.compareUsd ?? 0) > (i.priceUsd ?? 0) && (i.priceUsd ?? 0) > 0) dollars += ((i.compareUsd ?? 0) - (i.priceUsd ?? 0)) * i.qty; }
    else if ((i.compareCop ?? 0) > i.priceCop) cop += ((i.compareCop ?? 0) - i.priceCop) * i.qty;
  }
  return { cop, usd: dollars, any: usd ? dollars > 0 : cop > 0 };
}
