import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sparkles, Compass, MonitorSmartphone, ShoppingBag, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Ev = {
  id: string;
  name: string;
  session_id: string | null;
  path: string | null;
  created_at: string;
  referrer: string | null;
  referrer_host: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  device: string | null;
  city: string | null;
  country: string | null;
};

function sourceLabel(e: Pick<Ev, "utm_source" | "referrer_host">) {
  if (e.utm_source) return capital(e.utm_source);
  const host = (e.referrer_host ?? "").replace(/^www\./, "");
  if (!host) return "Directo";
  if (host.includes("instagram")) return "Instagram";
  if (host.includes("facebook")) return "Facebook";
  if (host.includes("google")) return "Google";
  if (host.includes("tiktok")) return "TikTok";
  return capital(host);
}
function capital(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function longDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "long", year: "numeric" });
}

export function ConversionSummary({
  customerId,
  orderCreatedAt,
  orderNumber,
  orderSessionId,
}: {
  customerId: string | null | undefined;
  orderCreatedAt: string;
  orderNumber?: string | null;
  orderSessionId?: string | null;
}) {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "conversion", customerId, orderSessionId, orderCreatedAt],
    enabled: Boolean(customerId || orderSessionId),
    queryFn: async () => {
      const filter = customerId && orderSessionId
        ? `user_id.eq.${customerId},session_id.eq.${orderSessionId}`
        : customerId
          ? `user_id.eq.${customerId}`
          : `session_id.eq.${orderSessionId}`;
      const eventsQuery = supabase
        .from("analytics_events")
        .select("id, name, session_id, path, created_at, referrer, referrer_host, utm_source, utm_medium, utm_campaign, device, city, country")
        .or(filter)
        .order("created_at", { ascending: true })
        .limit(1000);
      const ordersQuery = customerId
        ? supabase.from("orders").select("id, created_at").eq("customer_id", customerId).order("created_at", { ascending: true }).limit(200)
        : Promise.resolve({ data: [] as { id: string; created_at: string }[] });
      const [{ data: events }, { data: orders }] = await Promise.all([eventsQuery, ordersQuery]);
      return { events: (events ?? []) as Ev[], orders: orders ?? [] };
    },
  });

  const summary = useMemo(() => {
    const events = data?.events ?? [];
    const orderTime = new Date(orderCreatedAt).getTime();
    const before = events.filter((e) => new Date(e.created_at).getTime() <= orderTime + 60_000);
    const sessions = new Set(before.map((e) => e.session_id ?? e.id)).size;
    const first = before[0];
    const last = before[before.length - 1];
    const days = first
      ? Math.max(0, Math.round((orderTime - new Date(first.created_at).getTime()) / 86_400_000))
      : 0;
    const orderIndex =
      (data?.orders ?? []).findIndex((o) => new Date(o.created_at).getTime() >= orderTime - 1000) + 1;
    return {
      sessions,
      first,
      last,
      days,
      orderIndex: orderIndex > 0 ? orderIndex : data?.orders?.length ?? 1,
      totalOrders: data?.orders?.length ?? 0,
      events: before,
    };
  }, [data, orderCreatedAt]);

  if (!customerId && !orderSessionId) {
    return (
      <section className="bg-white border border-ink/10 rounded-2xl">
        <header className="px-5 py-4 border-b border-ink/5 flex items-center gap-2 text-ink">
          <Sparkles className="size-4 text-moss" />
          <h2 className="text-sm font-medium">Resumen de conversión</h2>
        </header>
        <div className="px-5 py-4 text-sm text-moss/60">
          Este pedido se hizo como invitada, sin historial de navegación asociado.
        </div>
      </section>
    );
  }

  const ordinal = summary.orderIndex === 1 ? "1º" : `${summary.orderIndex}º`;

  return (
    <>
      <section className="bg-white border border-ink/10 rounded-2xl">
        <header className="px-5 py-4 border-b border-ink/5 flex items-center gap-2 text-ink">
          <Sparkles className="size-4 text-moss" />
          <h2 className="text-sm font-medium">Resumen de conversión</h2>
        </header>
        <div className="px-5 py-4">
          {isLoading ? (
            <p className="text-sm text-moss/60 flex items-center gap-2"><Loader2 className="size-3.5 animate-spin" /> Cargando…</p>
          ) : (
            <ul className="space-y-3 text-sm text-ink/85">
              <li className="flex items-start gap-2.5">
                <ShoppingBag className="size-4 text-moss shrink-0 mt-0.5" />
                Este es su pedido número {ordinal}
              </li>
              <li className="flex items-start gap-2.5">
                <Compass className="size-4 text-moss shrink-0 mt-0.5" />
                {summary.first
                  ? `Primera sesión desde ${sourceLabel(summary.first)}`
                  : "Sin sesiones registradas"}
              </li>
              <li className="flex items-start gap-2.5">
                <MonitorSmartphone className="size-4 text-moss shrink-0 mt-0.5" />
                {summary.sessions} {summary.sessions === 1 ? "sesión" : "sesiones"} en {summary.days}{" "}
                {summary.days === 1 ? "día" : "días"}
              </li>
            </ul>
          )}
          {summary.first && (
            <button
              onClick={() => setOpen(true)}
              className="mt-4 text-sm text-ink underline underline-offset-4 decoration-ink/30"
            >
              Ver detalles de conversión
            </button>
          )}
        </div>
      </section>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-xl max-h-[85vh] overflow-y-auto bg-white rounded-2xl border border-ink/10"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between px-6 py-4 border-b border-ink/10 sticky top-0 bg-white">
              <h3 className="text-base text-ink">Detalles de la conversión</h3>
              <button onClick={() => setOpen(false)} className="text-moss/60 hover:text-ink"><X className="size-4" /></button>
            </header>

            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4 rounded-xl bg-ink/5 p-5">
                <div>
                  <p className="text-xs text-moss/70">Total de sesiones</p>
                  <p className="text-3xl text-ink">{summary.sessions}</p>
                </div>
                <div>
                  <p className="text-xs text-moss/70">Días hasta la conversión</p>
                  <p className="text-3xl text-ink">{summary.days}</p>
                </div>
              </div>

              <ul className="divide-y divide-ink/10">
                {summary.first && (
                  <DetailRow
                    title={`Primera sesión desde ${sourceLabel(summary.first)}`}
                    date={longDate(summary.first.created_at)}
                    note={summary.first.utm_campaign ? `Campaña ${summary.first.utm_campaign}` : summary.first.referrer || "Entrada directa"}
                  />
                )}
                {summary.sessions > 1 && (
                  <DetailRow
                    title={`Volvió ${summary.sessions - 1} ${summary.sessions - 1 === 1 ? "vez" : "veces"}`}
                    date={
                      summary.last
                        ? `${longDate(summary.first!.created_at)} – ${longDate(summary.last.created_at)}`
                        : ""
                    }
                  />
                )}
                <DetailRow
                  title={
                    summary.last
                      ? `Realizó la compra tras una visita desde ${sourceLabel(summary.last)}`
                      : "Realizó la compra"
                  }
                  date={longDate(orderCreatedAt)}
                  note={orderNumber ? `Pedido #${orderNumber}` : undefined}
                />
              </ul>

              <div>
                <p className="text-[11px] uppercase tracking-widest text-moss/60 mb-2">Últimas páginas vistas</p>
                <ul className="space-y-1.5 text-sm text-moss">
                  {summary.events.slice(-12).reverse().map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3">
                      <span className="truncate text-ink/80">{e.path || e.name}</span>
                      <span className="text-[11px] text-moss/60 whitespace-nowrap">
                        {new Date(e.created_at).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                      </span>
                    </li>
                  ))}
                  {summary.events.length === 0 && <li className="text-moss/60">Sin actividad registrada.</li>}
                </ul>
              </div>
            </div>

            <footer className="px-6 py-4 border-t border-ink/10 flex justify-end sticky bottom-0 bg-white">
              <button onClick={() => setOpen(false)} className="px-4 py-2 rounded-full border border-ink/15 text-xs uppercase tracking-widest text-moss hover:text-ink">
                Cerrar
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

function DetailRow({ title, date, note }: { title: string; date: string; note?: string }) {
  return (
    <li className="py-4">
      <p className="text-sm text-ink">{title}</p>
      <p className="text-sm text-moss/70">{date}</p>
      {note && <p className="text-xs text-moss/60 mt-0.5 truncate">{note}</p>}
    </li>
  );
}
