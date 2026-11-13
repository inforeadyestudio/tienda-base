// Diseño (editable desde Claude). Datos y acciones llegan en `vm`; no calcules precios ni stock aquí.
import { createFileRoute, Link } from "@tanstack/react-router";
import { formatDate } from "@/lib/format";
import { ArrowRight } from "lucide-react";
import { Card, StatCard } from "@/components/cuenta/ui";
import { ClosetSection } from "@/components/closet/closet-section";
import heroEditorial from "@/assets/cuenta/hero-editorial.jpg";
import tryon1 from "@/assets/cuenta/tryon-1.jpg";
import tryon2 from "@/assets/cuenta/tryon-2.jpg";
import order1 from "@/assets/cuenta/order-1.jpg";
import envelopeBg from "@/assets/envelope-bg.png";
import cheetahIcon from "@/assets/cuenta/profile-cheetah.png";
import elephantIcon from "@/assets/cuenta/profile-elephant.png";
import zebraIcon from "@/assets/cuenta/profile-zebra.png";
import heronIcon from "@/assets/cuenta/profile-heron.png";
import envelopeLeopard from "@/assets/cuenta/profile-envelope-leopard.png";
import ordersLeopard from "@/assets/cuenta/profile-orders-leopard.png";
import { TryOnResultImage } from "@/components/tryon/result-image";
import type { AccountHomeVM } from "@/logic/account/use-account-home";
function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Buenos días";
  if (h < 19) return "Buenas tardes";
  return "Buenas noches";
}

export function AccountHomeView({ vm }: { vm: AccountHomeVM }) {
  const { user, modules, isStaff, orders, hero, points, wishlistCount, messages, tryOnResults, unreadCount, missing, progress, firstName } = vm;
  return (
    <>
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="flex flex-col justify-center lg:pl-2 min-w-0">
          <p className="font-nm italic text-xl lg:text-2xl text-ink/80">{getGreeting()},</p>
          <h2 className="font-brown-sugar text-[3rem] sm:text-[4rem] lg:text-[6rem] leading-none mt-1 lg:mt-2 truncate text-ink/80">{firstName || "amiga"}</h2>
          <p className="text-moss text-sm mt-4 lg:mt-6 max-w-xs leading-relaxed">
            Welcome to your wild corner.
            <br />Where style runs free, stories gather and the jungle feels like home.
          </p>
          {isStaff && (
            <Link to="/admin" className="mt-4 lg:mt-6 text-[11px] uppercase tracking-[0.2em] text-moss hover:text-ink w-fit">
              Ir al admin →
            </Link>
          )}
        </div>
        <div className="relative rounded-3xl overflow-hidden aspect-[4/3] sm:aspect-[16/10] bg-[#2f2822]">
          <img src={hero.image_url || heroEditorial} alt="Editorial Tu Marca" className="absolute inset-0 w-full h-full object-cover" width={1280} height={800} />
          <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/20 to-transparent" />
          <div className="absolute inset-0 flex items-center px-6 lg:px-10">
            <div className="text-ivory">
              <p className="font-serif italic text-2xl lg:text-3xl leading-tight max-w-xs">
                {hero.line1}<br />{hero.line2}
              </p>
              <a href={hero.cta_to || "/cuenta/inspiraciones"} className="mt-4 lg:mt-6 inline-block border border-ivory/50 text-ivory text-[10px] tracking-[0.25em] uppercase px-4 py-2.5 lg:px-5 lg:py-3 hover:bg-ivory hover:text-ink transition">
                {hero.cta_label}
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <Link to="/cuenta/wishlist"><StatCard iconUrl={cheetahIcon} iconAlt="Leopardo" value={String(wishlistCount)} label="prendas favoritas" sub="En tu wishlist" /></Link>
        <Link to="/cuenta/pedidos">
          <StatCard
            iconUrl={elephantIcon}
            iconAlt="Elefante"
            value={String(orders?.filter((o) => o.status !== "delivered" && o.status !== "cancelled").length ?? 0)}
            label="pedidos en camino"
            sub="Ver seguimiento"
          />
        </Link>
        <Link to="/cuenta/puntos"><StatCard iconUrl={zebraIcon} iconAlt="Cebra" value={String(points)} label="Wild Circle" sub="Ver beneficios" /></Link>
        <Link to="/cuenta/inbox"><StatCard iconUrl={heronIcon} iconAlt="Garza" value={String(unreadCount)} label="mensajes nuevos" sub="En tu inbox privado" /></Link>
      </section>

      {user && modules?.closet && <ClosetSection userId={user.id} />}

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link to="/cuenta/try-on">
          <Card title="Probar nuevos looks" subtitle="Virtual Try-On" footer="Comenzar Try-On">
            <div className="flex gap-2 items-center justify-center h-full min-h-[40vw] md:min-h-[12rem]">
              <div className="w-20 aspect-[3/4] rounded-xl overflow-hidden">
                <TryOnResultImage src={tryOnResults[0]?.output_url ?? tryon1} fallbackSrc={tryon1} alt="Tu prueba reciente" className="w-full h-full object-cover" />
              </div>
              <div className="w-24 aspect-[3/4] rounded-xl bg-cream flex items-center justify-center text-center px-2">
                <p className="text-[10px] text-moss leading-tight">Prueba tus looks con tus prendas favoritas.</p>
              </div>
              <div className="w-20 aspect-[3/4] rounded-xl overflow-hidden">
                <TryOnResultImage src={tryOnResults[1]?.output_url ?? tryon2} fallbackSrc={tryon2} alt="Tu prueba reciente" className="w-full h-full object-cover" />
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/cuenta/inbox">
          <Card title="Inbox Privado" subtitle="Mensajes exclusivos para ti." footer="Ver todos los mensajes">
            <div
              className="rounded-2xl text-center relative bg-cream bg-no-repeat bg-center bg-contain aspect-[3/2] flex flex-col items-center justify-center px-6"
              style={{ backgroundImage: `url(${envelopeBg})` }}
            >
              {unreadCount > 0 && (
                <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-clay text-ivory text-[10px] flex items-center justify-center">{unreadCount}</span>
              )}
              <img
                src={envelopeLeopard}
                alt="Leopardo"
                className="w-24 h-auto object-contain mb-1 opacity-90"
              />
              <p className="font-serif italic text-xl">{messages[0]?.title ?? "Acceso anticipado"}</p>
              <p className="text-[11px] text-moss mt-2 leading-relaxed">
                {messages[0]?.campaign_name ?? "Colección Back to Selva"}<br />{messages[0] ? new Date(messages[0].created_at).toLocaleDateString("es-CO", { day: "numeric", month: "short" }) : "48 horas antes que todos."}
              </p>
            </div>
          </Card>
        </Link>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link to="/cuenta/pedidos">
          <Card title="Orders" subtitle="Sigue el estado de tus pedidos." footer="Ver todos mis pedidos">
            {(orders?.length ?? 0) === 0 ? (
              <div className="flex flex-col items-center justify-center py-4 text-center">
                <img
                  src={ordersLeopard}
                  alt="Leopardo"
                  className="w-40 h-auto object-contain opacity-90 mb-3"
                />
                <p className="text-xs text-moss/70">Todavía no hay movimiento por aquí.</p>
              </div>
            ) : (
              <ul className="space-y-3">
                {orders!.slice(0, 2).map((o) => (
                  <li key={o.id} className="flex items-center gap-3">
                    <div className="w-12 h-14 rounded-lg overflow-hidden bg-cream">
                      <img src={order1} alt="Pedido" loading="lazy" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">Pedido {o.number}</p>
                      <p className="text-[10px] text-moss/70">{formatDate(o.created_at)}</p>
                      <p className="text-[10px] mt-0.5 text-moss">{o.status}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-moss" strokeWidth={1.5} />
                  </li>
                ))}
                <li className="flex justify-center pt-1">
                  <img src={ordersLeopard} alt="Leopardo" className="w-12 h-auto object-contain opacity-70" />
                </li>
              </ul>
            )}
          </Card>
        </Link>

        <Link to="/cuenta/puntos">
          <Card title="Wild Circle" subtitle="Más que puntos: beneficios, experiencias y acceso especial." footer="Ver todos los beneficios">
            <div className="flex items-end justify-between">
              <div>
                <p className="font-nm text-5xl leading-none">{points}</p>
                <p className="text-[10px] text-moss mt-1">puntos acumulados</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-moss">Te faltan <span className="text-ink font-medium">{missing} pts</span></p>
                <p className="text-[10px] text-moss/70">para el siguiente nivel</p>
                <div className="mt-2 w-24 h-1 rounded-full bg-cream overflow-hidden">
                  <div className="h-full bg-clay" style={{ width: `${progress}%` }} />
                </div>
              </div>
            </div>
          </Card>
        </Link>
      </section>
    </>
  );
}
