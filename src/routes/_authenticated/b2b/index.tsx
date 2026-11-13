import { optimizedImageUrl } from "@/lib/media";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronRight, ChevronLeft, Truck, MessageCircle, Sparkles, Leaf, ArrowRight, CalendarDays } from "lucide-react";
import { B2BTopBar } from "@/components/b2b/b2b-topbar";
import { formatMoney, useB2BSettings, useMyB2BOrders, useMyB2BStats } from "@/lib/b2b/portal";
import { openB2BCart, useB2BCart } from "@/lib/b2b/cart";

export const Route = createFileRoute("/_authenticated/b2b/")({
  head: () => ({
    meta: [
      { title: "B2B Portal · Tu Marca" },
      { name: "description", content: "Portal mayorista para boutiques — colecciones, pedidos y proyecciones." },
      { property: "og:title", content: "B2B Portal · Tu Marca" },
      { property: "og:description", content: "Portal mayorista para boutiques — colecciones, pedidos y proyecciones." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: B2BDashboard,
});

function B2BDashboard() {
  const { data: settings } = useB2BSettings();
  const { data: stats } = useMyB2BStats();
  const currency = settings?.currency ?? "USD";

  return (
    <div className="flex-1 flex flex-col">
      <B2BTopBar />
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-4 md:gap-6 p-4 md:p-6">
        <div className="space-y-4 md:space-y-6 min-w-0">
          <HeroCarousel />
          <div className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-4 md:gap-6">
            <CategoryMix stats={stats} />
            <TopReferences stats={stats} />
            <SizeDistribution stats={stats} />
          </div>
          <Lookbook />
        </div>
        <div className="space-y-4 md:space-y-6">
          <CurrentOrder currency={currency} />
          <ShipCalendar />
          <KeyDates />
        </div>
      </div>
      <Footer />
    </div>
  );
}

function HeroCarousel() {
  const { data: settings } = useB2BSettings();
  const slides = (settings?.slides ?? []).filter((s) => s.active && s.imageUrl);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setI((v) => (v + 1) % slides.length), 6000);
    return () => clearInterval(t);
  }, [slides.length]);

  if (!slides.length) {
    return (
      <div className="rounded-3xl border border-dashed border-ink/20 bg-white/50 aspect-[16/6.2] flex flex-col items-center justify-center text-center px-8">
        <p className="text-[12px] text-ink/50">Aún no hay imágenes de portada.</p>
        <p className="text-[11px] text-ink/40 mt-1">Se configuran desde Admin → B2B → Portada.</p>
      </div>
    );
  }

  const s = slides[Math.min(i, slides.length - 1)]!;
  return (
    <div className="relative rounded-3xl overflow-hidden bg-[#ebe1cd] aspect-[4/3] sm:aspect-[16/6.2]">
      <img src={optimizedImageUrl(s.imageUrl, 1400)} fetchPriority="high" decoding="async" alt={s.title} className="absolute inset-0 w-full h-full object-cover" />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8">
        {s.eyebrow && <div className="text-[10px] tracking-[0.25em] text-ink/70 mb-3">{s.eyebrow}</div>}
        <h1 className="font-serif italic text-4xl sm:text-6xl md:text-7xl leading-[0.95] text-ink">{s.title}</h1>
        {s.subtitle && <p className="font-serif italic text-base sm:text-lg text-ink/70 mt-3">{s.subtitle}</p>}
        <Link to="/b2b/colecciones" className="mt-5 bg-ink text-ivory text-[11px] tracking-[0.2em] px-6 py-3 hover:bg-moss transition-colors">
          {(s.ctaLabel || "EXPLORAR COLECCIÓN").toUpperCase()}
        </Link>
      </div>
      {slides.length > 1 && (
        <>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 text-[10px] tracking-widest text-ink/60">
            <span className="text-ink">{String(i + 1).padStart(2, "0")}</span>
            <span className="w-8 h-px bg-ink/30" />
            <span>{String(slides.length).padStart(2, "0")}</span>
          </div>
          <div className="absolute bottom-3 right-6 flex gap-2">
            <button onClick={() => setI((v) => (v - 1 + slides.length) % slides.length)} aria-label="Anterior" className="w-9 h-9 rounded-full border border-ink/20 bg-white/60 hover:bg-white flex items-center justify-center"><ChevronLeft className="size-4" /></button>
            <button onClick={() => setI((v) => (v + 1) % slides.length)} aria-label="Siguiente" className="w-9 h-9 rounded-full border border-ink/20 bg-white/60 hover:bg-white flex items-center justify-center"><ChevronRight className="size-4" /></button>
          </div>
        </>
      )}
    </div>
  );
}

function Card({ label, title, children, to }: { label: string; title?: string; children: React.ReactNode; to?: "/b2b/productos" | "/b2b/proyecciones" | "/b2b/pedidos" }) {
  return (
    <div className="bg-white rounded-3xl border border-ink/8 p-4 md:p-6 flex flex-col min-w-0">
      <div className="text-[10px] tracking-[0.2em] text-ink/50">{label}</div>
      {title && <div className="text-[11px] text-ink/50 mt-0.5">{title}</div>}
      <div className="flex-1 mt-4">{children}</div>
      {to && (
        <Link to={to} className="mt-4 text-[11px] text-ink/70 hover:text-ink flex items-center gap-1 pt-3 border-t border-ink/8">
          Ver detalle <ArrowRight className="size-3" />
        </Link>
      )}
    </div>
  );
}

type Stats = ReturnType<typeof useMyB2BStats>["data"];

function Empty({ text }: { text: string }) {
  return <p className="text-[12px] text-ink/45">{text}</p>;
}

function CategoryMix({ stats }: { stats: Stats }) {
  const rows = stats?.categories ?? [];
  const total = rows.reduce((s, r) => s + r.units, 0);
  const colors = ["#5a4433", "#8a6f4e", "#b39670", "#cdb28a", "#e2cca8"];
  return (
    <Card label="ANÁLISIS DE TU COMPRA" title="Unidades por categoría" to="/b2b/proyecciones">
      {!total ? <Empty text="Aquí verás tu mezcla apenas apruebes tu primer pedido." /> : (
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <div className="relative shrink-0" style={{ width: 128, height: 128 }}>
            <Donut values={rows.map((r) => (r.units / total) * 100)} colors={colors} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-[8px] tracking-[0.2em] text-ink/50">TOTAL UNIDADES</div>
              <div className="font-serif italic text-2xl mt-0.5">{total}</div>
            </div>
          </div>
          <ul className="flex-1 w-full min-w-0 space-y-1.5 text-[11px]">
            {rows.slice(0, 5).map((r, i) => (
              <li key={r.label} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: colors[i % colors.length] }} />
                <span className="flex-1 text-ink/70 truncate">{r.label}</span>
                <span className="text-ink/60 tabular-nums">{Math.round((r.units / total) * 100)}% ({r.units})</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function Donut({ values, colors }: { values: number[]; colors: string[] }) {
  const R = 54, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
      <circle cx="64" cy="64" r={R} fill="none" stroke="#f0e6d2" strokeWidth="14" />
      {values.map((s, i) => {
        const len = (s / 100) * C;
        const el = <circle key={i} cx="64" cy="64" r={R} fill="none" stroke={colors[i % colors.length]} strokeWidth="14" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} />;
        offset += len;
        return el;
      })}
    </svg>
  );
}

function TopReferences({ stats }: { stats: Stats }) {
  const items = stats?.top ?? [];
  return (
    <Card label="TUS TOP REFERENCIAS" title="Más pedidas por tu boutique" to="/b2b/productos">
      {!items.length ? <Empty text="Todavía no hay referencias en tu histórico." /> : (
        <ul className="space-y-3">
          {items.map((it, i) => (
            <li key={it.sku + i} className="flex items-center gap-3">
              <span className="text-[10px] text-ink/40 tabular-nums w-3">{i + 1}</span>
              <div className="w-11 h-11 rounded-lg overflow-hidden bg-[#f0e6d2] shrink-0">
                {it.image && <img src={optimizedImageUrl(it.image, 400)} alt={it.name} className="w-full h-full object-cover" loading="lazy" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[12px] leading-none truncate">{it.name}</div>
                <div className="text-[10px] text-ink/50 mt-1">{it.sku}</div>
              </div>
              <div className="text-[11px] text-ink/60 tabular-nums">{it.units} uds</div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SizeDistribution({ stats }: { stats: Stats }) {
  const rows = stats?.sizes ?? [];
  const max = Math.max(1, ...rows.map((r) => r.units));
  return (
    <Card label="DISTRIBUCIÓN DE TALLAS" title="Según tus pedidos" to="/b2b/pedidos">
      {!rows.length ? <Empty text="Sin datos de tallas por ahora." /> : (
        <div className="space-y-2.5">
          {rows.slice(0, 6).map((r) => (
            <div key={r.label}>
              <div className="flex justify-between text-[11px] mb-1"><span>{r.label}</span><span className="text-ink/55">{r.units}</span></div>
              <div className="h-2.5 rounded-full bg-[#f0e6d2] overflow-hidden"><div className="h-full bg-[#a8926a]" style={{ width: `${(r.units / max) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function Lookbook() {
  const { data: settings } = useB2BSettings();
  const imgs = settings?.lookbook ?? [];
  if (!imgs.length) return null;
  return (
    <div className="bg-white rounded-3xl border border-ink/8 p-4 md:p-6">
      <div className="text-[10px] tracking-[0.2em] text-ink/50">LOOKBOOK</div>
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-1.5 mt-4">
        {imgs.map((src, i) => (
          <div key={src + i} className="aspect-[3/4] rounded-md overflow-hidden bg-[#f0e6d2]">
            <img src={optimizedImageUrl(src, 600)} alt="" className="w-full h-full object-cover" loading="lazy" />
          </div>
        ))}
      </div>
    </div>
  );
}

function CurrentOrder({ currency }: { currency: "USD" | "COP" }) {
  const items = useB2BCart();
  const units = items.reduce((s, i) => s + i.qty, 0);
  const total = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  return (
    <div className="bg-white rounded-3xl border border-ink/8 p-5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] tracking-[0.2em] text-ink/50">PEDIDO ACTUAL</span>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#f0e6d2] text-ink/70">{units ? "Preventa" : "Vacío"}</span>
      </div>
      <div className="font-serif italic text-3xl mt-2">{formatMoney(total, currency)}</div>
      <div className="text-[11px] text-ink/60 mt-1">{units} unidades · {items.length} referencias</div>
      {items.length > 0 && (
        <div className="flex gap-1.5 mt-4">
          {items.slice(0, 4).map((t) => (
            <div key={t.variantId} className="w-11 h-11 rounded-lg overflow-hidden bg-[#f0e6d2]">
              {t.imageUrl && <img src={optimizedImageUrl(t.imageUrl, 400)} alt="" className="w-full h-full object-cover" loading="lazy" />}
            </div>
          ))}
          {items.length > 4 && <div className="w-11 h-11 rounded-lg bg-[#f0e6d2] text-[10px] text-ink/60 flex items-center justify-center">+{items.length - 4}</div>}
        </div>
      )}
      <button onClick={openB2BCart} disabled={!units} className="w-full mt-4 bg-ink text-ivory text-[12px] py-3 rounded-full hover:bg-moss disabled:opacity-40">Ver y aprobar pedido</button>
      <Link to="/b2b/productos" className="block text-center w-full mt-2 border border-ink/15 text-[12px] py-3 rounded-full hover:bg-ink/5">Seguir agregando</Link>
    </div>
  );
}

/** Calendario con las fechas estimadas de envío y llegada de los pedidos del cliente. */
function ShipCalendar() {
  const { data: orders } = useMyB2BOrders();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  const events = (orders ?? [])
    .filter((o: any) => o.b2b_ship_eta && !["delivered", "cancelled", "refunded"].includes(o.status))
    .map((o: any) => {
      const ship = new Date(o.b2b_ship_eta + "T12:00:00");
      const arrive = new Date(ship); arrive.setDate(arrive.getDate() + 5); // tránsito estimado 5 días
      return { number: o.number, ship, arrive, status: o.status };
    });

  const y = month.getFullYear(), m = month.getMonth();
  const first = new Date(y, m, 1);
  const startOffset = (first.getDay() + 6) % 7; // lunes primero
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(startOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const sameDay = (a: Date, d: number) => a.getFullYear() === y && a.getMonth() === m && a.getDate() === d;
  const today = new Date();

  return (
    <div className="bg-white rounded-3xl border border-ink/8 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <div className="text-[10px] tracking-[0.2em] text-ink/50 flex items-center gap-2"><CalendarDays className="size-3.5" /> CALENDARIO DE ENVÍOS</div>
        <div className="flex gap-1">
          <button onClick={() => setMonth(new Date(y, m - 1, 1))} aria-label="Mes anterior" className="w-7 h-7 rounded-full border border-ink/15 flex items-center justify-center hover:bg-ink/5"><ChevronLeft className="size-3.5" /></button>
          <button onClick={() => setMonth(new Date(y, m + 1, 1))} aria-label="Mes siguiente" className="w-7 h-7 rounded-full border border-ink/15 flex items-center justify-center hover:bg-ink/5"><ChevronRight className="size-3.5" /></button>
        </div>
      </div>
      <p className="mt-2 font-serif italic text-lg text-ink capitalize">{month.toLocaleDateString("es-CO", { month: "long", year: "numeric" })}</p>
      <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[9px] tracking-widest text-ink/40">
        {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d == null) return <div key={i} />;
          const ships = events.filter((e) => sameDay(e.ship, d));
          const arrives = events.filter((e) => sameDay(e.arrive, d));
          const isToday = sameDay(today, d);
          return (
            <div key={i} title={[...ships.map((e) => `Sale ${e.number}`), ...arrives.map((e) => `Llega ${e.number} (est.)`)].join("\n") || undefined}
              className={"aspect-square rounded-lg flex flex-col items-center justify-center text-[11px] " +
                (isToday ? "ring-1 ring-ink/30 " : "") +
                (ships.length ? "bg-ink text-ivory " : arrives.length ? "bg-moss/20 text-ink " : "text-ink/60")}>
              {d}
              {(ships.length > 0 || arrives.length > 0) && <span className={"w-1 h-1 rounded-full mt-0.5 " + (ships.length ? "bg-ivory" : "bg-moss")} />}
            </div>
          );
        })}
      </div>
      <div className="mt-3 space-y-1.5 text-[11px] text-ink/60">
        <p className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded bg-ink" /> Fecha estimada de envío</p>
        <p className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded bg-moss/30" /> Llegada estimada (5 días de tránsito)</p>
      </div>
      {events.length > 0 && (
        <ul className="mt-3 pt-3 border-t border-ink/8 space-y-1.5">
          {events.slice(0, 4).map((e) => (
            <li key={e.number} className="text-[11px] text-ink/70 flex justify-between gap-2">
              <span className="font-medium text-ink">{e.number}</span>
              <span>sale {e.ship.toLocaleDateString("es-CO", { day: "numeric", month: "short" })} · llega ~{e.arrive.toLocaleDateString("es-CO", { day: "numeric", month: "short" })}</span>
            </li>
          ))}
        </ul>
      )}
      {events.length === 0 && <p className="mt-3 text-[11px] text-ink/45">Cuando tus pedidos tengan fecha estimada de envío, aparecerán aquí.</p>}
    </div>
  );
}

function KeyDates() {
  const { data: settings } = useB2BSettings();
  const dates = settings?.keyDates ?? [];
  if (!dates.length) return null;
  return (
    <div className="bg-white rounded-3xl border border-ink/8 p-5">
      <div className="text-[10px] tracking-[0.2em] text-ink/50">FECHAS CLAVE</div>
      <ul className="mt-4 space-y-4 relative">
        <div className="absolute left-[5px] top-2 bottom-2 w-px bg-ink/10" />
        {dates.map((d) => (
          <li key={d.id} className="flex items-center gap-3 relative">
            <span className="w-3 h-3 rounded-full border-2 border-white z-10" style={{ background: d.color || "#c2b28a" }} />
            <span className="flex-1 text-[12px] text-ink/80">{d.label}</span>
            <span className="text-[10px] text-ink/50 tabular-nums tracking-wider">{d.date}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Footer() {
  const items = [
    { i: Truck, t: "Envíos internacionales", s: "2 a 5 días hábiles" },
    { i: MessageCircle, t: "Atención personalizada", s: "Tu asesora Tu Marca" },
    { i: Sparkles, t: "Materiales & cuidados", s: "Información técnica" },
    { i: Leaf, t: "Sostenibilidad", s: "Compromiso Tu Marca" },
  ];
  return (
    <footer className="mt-2 border-t border-ink/8 grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6 px-4 md:px-6 py-6">
      {items.map((it) => (
        <div key={it.t} className="flex items-center gap-3">
          <it.i className="size-5 text-ink/60" />
          <div>
            <div className="text-[11px] text-ink">{it.t}</div>
            <div className="text-[10px] text-ink/50 mt-0.5">{it.s}</div>
          </div>
        </div>
      ))}
    </footer>
  );
}
