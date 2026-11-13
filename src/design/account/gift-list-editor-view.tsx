// Diseño (editable desde Claude). Datos y acciones llegan en `vm`; no calcules precios ni stock aquí.
import { Gift, Plus, Link2, Trash2, Search, Check, X, MapPin } from "lucide-react";
import {
  EMPTY_SHIP_TO,
  fetchGiftItems,
  giftListUrl,
  makeGiftSlug,
  type GiftList,
  type GiftShipTo,
} from "@/lib/gifts";
import { ItemsPanel } from "@/design/account/gift-items-view";
import { ShippingPanel } from "@/design/account/gift-shipping-view";
import { GiftListEditorVM, useGiftListEditor } from "@/logic/account/use-gift-list-editor";


export function GiftListEditorView({ vm }: { vm: GiftListEditorVM }) {
  const { list, form, setForm, save, removeList, copyLink } = vm;
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-5">
        <ItemsPanel listId={list.id} />
      </div>

      <aside className="space-y-5">
        <section className="rounded-2xl border border-ink/5 bg-white/60 p-5 space-y-3">
          <h3 className="font-nm text-xl leading-tight">Tu enlace público</h3>
          <p className="break-all rounded-xl bg-cream/60 px-3 py-2 text-xs text-moss">{giftListUrl(list.slug)}</p>
          <div className="flex gap-2">
            <button
              onClick={copyLink}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-ink px-4 py-2.5 text-[11px] uppercase tracking-[0.16em] text-ivory hover:bg-moss"
            >
              <Link2 className="h-4 w-4" strokeWidth={1.5} /> Copiar
            </button>
            <a
              href={`/regalos/${list.slug}`}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-ink/15 px-4 py-2.5 text-[11px] uppercase tracking-[0.16em] text-moss hover:border-ink"
            >
              Ver
            </a>
          </div>
          <label className="flex items-center gap-2 pt-1 text-xs text-moss">
            <input
              type="checkbox"
              checked={form.is_public}
              onChange={(e) => setForm({ ...form, is_public: e.target.checked })}
            />
            Enlace activo (si lo apagas, nadie puede verla)
          </label>
        </section>

        <section className="rounded-2xl border border-ink/5 bg-white/60 p-5 space-y-3">
          <h3 className="font-nm text-xl leading-tight">Detalles</h3>
          <input className={inp} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Título de la lista" />
          <input className={inp} value={form.owner_name} onChange={(e) => setForm({ ...form, owner_name: e.target.value })} placeholder="Tu nombre" />
          <input className={inp} value={form.occasion} onChange={(e) => setForm({ ...form, occasion: e.target.value })} placeholder="Ocasión (cumpleaños, boda…)" />
          <input type="date" className={inp} value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} />
          <textarea className={inp + " min-h-20"} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} placeholder="Mensaje para quienes visiten tu lista" />
          <button
            onClick={() => save.mutate()}
            disabled={save.isPending}
            className="w-full rounded-full bg-ink py-2.5 text-[11px] uppercase tracking-[0.16em] text-ivory hover:bg-moss disabled:opacity-50"
          >
            {save.isPending ? "Guardando…" : "Guardar"}
          </button>
        </section>

        <ShippingPanel listId={list.id} />

        <button
          onClick={() => {
            if (confirm("¿Eliminar esta lista de regalos?")) removeList.mutate();
          }}
          className="inline-flex items-center gap-2 text-xs text-clay hover:underline"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} /> Eliminar lista
        </button>
      </aside>
    </div>
  );
}

export function ListEditor({ list }: { list: GiftList }) {
  const vm = useGiftListEditor({ list });
  return <GiftListEditorView vm={vm} />;
}
const inp =
  "w-full rounded-xl border border-ink/15 bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-ink";
