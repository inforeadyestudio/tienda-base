// Diseño (editable desde Claude). Datos y acciones llegan en `vm`; no calcules precios ni stock aquí.
import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, EmptyState } from "@/components/cuenta/ui";
import { TryOnPhotoManager } from "@/components/tryon/photo-manager";
import { TryOnResultImage } from "@/components/tryon/result-image";
import { type TryOnPageVM } from "@/logic/account/use-try-on-page";


export function TryOnView({ vm }: { vm: TryOnPageVM }) {
  const { user, settings, results } = vm;
  return (
    <>
      <PageHeader
        title="Virtual Try-On"
        subtitle="Sube tus fotos y pruébate las prendas de la colección desde cualquier página de producto."
      />

      {!settings?.enabled && (
        <p className="mb-5 rounded-2xl border border-ink/10 bg-white/60 p-4 text-sm text-ink/60">
          El probador está en pausa por ahora. Puedes dejar tus fotos listas para cuando lo activemos.
        </p>
      )}

      {user && <TryOnPhotoManager userId={user.id} />}

      <section className="mt-6">
        <h2 className="font-nm text-lg">Tus pruebas</h2>
        {results?.length ? (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {results.map((r) => (
              <figure key={r.id} className="overflow-hidden rounded-2xl bg-cream">
                <TryOnResultImage src={r.output_url} alt={r.products?.name ?? "Prueba virtual"} className="aspect-[3/4] w-full object-cover" />
                {r.products?.slug && (
                  <figcaption className="p-2 text-center text-[11px]">
                    <Link to="/producto/$slug" params={{ slug: r.products.slug }} className="underline">
                      {r.products.name}
                    </Link>
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Aún no tienes pruebas guardadas"
            description="Abre cualquier producto y pulsa “Probar look” para ver cómo te queda."
          />
        )}
      </section>
    </>
  );
}
