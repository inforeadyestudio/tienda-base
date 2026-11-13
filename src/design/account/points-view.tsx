// Diseño (editable desde Claude). Datos y acciones llegan en `vm`; no calcules precios ni stock aquí.
import { PointsKardex } from "@/components/loyalty/points-kardex";
import { PageHeader } from "@/components/cuenta/ui";
import { type PointsPageVM } from "@/logic/account/use-points-page";
const BENEFITS = [
  { title: "Previews exclusivas", desc: "Ve la colección antes que nadie." },
  { title: "Envíos preferenciales", desc: "Prioridad en despacho y entrega." },
  { title: "Acceso a eventos", desc: "Invitaciones a lanzamientos privados." },
  { title: "Piezas limitadas", desc: "Reserva de ediciones cortas." },
];

export function PointsView({ vm }: { vm: PointsPageVM }) {
  const { user, points, missing, progress } = vm;
  return (
    <>
      <PageHeader title="Tu Marca Circle" subtitle="Más que puntos, experiencias." />

      <section className="rounded-2xl border border-ink/5 bg-white/60 p-6">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="font-nm text-6xl leading-none">{points}</p>
            <p className="mt-1 text-[11px] text-moss">puntos acumulados</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-moss">Te faltan <span className="font-medium text-ink">{missing} pts</span></p>
            <p className="text-[10px] text-moss/70">para el siguiente nivel</p>
            <div className="mt-2 h-1 w-40 overflow-hidden rounded-full bg-cream">
              <div className="h-full bg-clay" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {BENEFITS.map((b) => (
          <div key={b.title} className="rounded-2xl border border-ink/5 bg-white/60 p-5">
            <div className="mb-3 h-8 w-8 rounded-full bg-cream" />
            <p className="font-nm text-lg leading-tight">{b.title}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-moss/80">{b.desc}</p>
          </div>
        ))}
      </section>

      {user?.id && (
        <section className="rounded-2xl border border-ink/5 bg-white/60 p-6">
          <p className="font-nm text-lg mb-3">Historial de puntos</p>
          <PointsKardex userId={user.id} />
        </section>
      )}
    </>
  );
}
