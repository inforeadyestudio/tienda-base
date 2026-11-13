import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/cuenta/ui";
import insp1 from "@/assets/cuenta/insp-1.jpg";
import insp2 from "@/assets/cuenta/insp-2.jpg";
import insp3 from "@/assets/cuenta/insp-3.jpg";
import insp4 from "@/assets/cuenta/insp-4.jpg";

export const Route = createFileRoute("/_authenticated/cuenta/inspiraciones")({
  head: () => ({
    meta: [
      { title: "Inspiración · Tu Marca" },
      { name: "description", content: "Editoriales, lookbooks y detrás de cámaras seleccionados para tu estilo." },
    ],
  }),
  component: InspirationsPage,
});

const CARDS = [
  { title: "Back to Selva", sub: "Nueva colección", cta: "Descubrir", img: insp1 },
  { title: "Detrás de cámaras", sub: "El bordado", cta: "Ver más", img: insp2 },
  { title: "La historia", sub: "de esta colección", cta: "Ver video", img: insp3 },
  { title: "Lookbook", sub: "Ver todos los looks", cta: "Explorar", img: insp4 },
];

function InspirationsPage() {
  return (
    <>
      <PageHeader title="Inspiración" subtitle="Contenido seleccionado pensando en tu estilo." />
      <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {CARDS.map((c) => (
          <div key={c.title} className="relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-2xl bg-ink p-5 text-ivory">
            <img src={c.img} alt={c.title} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
            <div className="relative">
              <p className="font-nm text-xl leading-tight">{c.title}</p>
              <p className="text-[10px] opacity-80">{c.sub}</p>
              <p className="mt-3 text-[10px] uppercase tracking-[0.25em] underline underline-offset-4">{c.cta}</p>
            </div>
          </div>
        ))}
      </section>
    </>
  );
}
