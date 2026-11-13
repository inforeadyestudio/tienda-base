// Diseño (editable desde Claude). Datos y acciones llegan en `vm`; no calcules precios ni stock aquí.
import { WishlistGiftTabs } from "@/lib/portal-modules";
import { Gift, Plus, Link2, Trash2, Search, Check, X, MapPin } from "lucide-react";
import { PageHeader } from "@/components/cuenta/ui";
import { ListEditor } from "@/design/account/gift-list-editor-view";
import { type GiftListsVM } from "@/logic/account/use-gift-lists";


export function GiftListsView({ vm }: { vm: GiftListsVM }) {
  const { user, setActiveId, lists, active, createList } = vm;
  return (
    <>
      <WishlistGiftTabs active="regalos" />
      <PageHeader
        title="Lista de regalos"
        subtitle="Escoge lo que te encantaría recibir y comparte el enlace con tu familia y amigos. Verás qué te regalaron, nunca quién."
        action={
          <button
            onClick={() => createList.mutate()}
            disabled={createList.isPending || !user}
            className="inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[11px] uppercase tracking-[0.16em] text-ivory hover:bg-moss disabled:opacity-50"
          >
            <Plus className="h-4 w-4" strokeWidth={1.5} /> Nueva lista
          </button>
        }
      />

      {lists.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink/15 bg-white/50 p-10 text-center">
          <Gift className="mx-auto h-6 w-6 text-moss" strokeWidth={1.5} />
          <p className="mt-3 text-sm text-moss">
            Aún no tienes listas. Crea la primera y empieza a agregar piezas.
          </p>
        </div>
      ) : (
        <>
          {lists.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {lists.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setActiveId(l.id)}
                  className={`rounded-full px-4 py-2 text-xs transition ${
                    l.id === active?.id ? "bg-ink text-ivory" : "bg-white/60 text-moss hover:bg-cream"
                  }`}
                >
                  {l.title}
                </button>
              ))}
            </div>
          )}
          {active && <ListEditor list={active} />}
        </>
      )}
    </>
  );
}
