// Diseño (editable desde Claude). Datos y acciones llegan en `vm`; no calcules precios ni stock aquí.
import { Gift, Plus, Link2, Trash2, Search, Check, X, MapPin } from "lucide-react";
import { GiftShippingVM, useGiftShipping } from "@/logic/account/use-gift-shipping";


export function GiftShippingView({ vm }: { vm: GiftShippingVM }) {
  const { ship, setShip, save } = vm;
  return (
    <section className="rounded-2xl border border-ink/5 bg-white/60 p-5 space-y-3">
      <h3 className="flex items-center gap-2 font-nm text-xl leading-tight">
        <MapPin className="h-4 w-4 text-moss" strokeWidth={1.5} /> Dirección de entrega
      </h3>
      <p className="text-[11px] leading-relaxed text-moss/70">
        Quien te regale puede elegir enviártelo aquí. Tu dirección nunca se muestra en el enlace público.
      </p>
      <input className={inp} value={ship.recipient} onChange={(e) => setShip({ ...ship, recipient: e.target.value })} placeholder="Nombre de quien recibe" />
      <input className={inp} value={ship.phone} onChange={(e) => setShip({ ...ship, phone: e.target.value })} placeholder="Teléfono" />
      <input className={inp} value={ship.line1} onChange={(e) => setShip({ ...ship, line1: e.target.value })} placeholder="Dirección" />
      <input className={inp} value={ship.line2} onChange={(e) => setShip({ ...ship, line2: e.target.value })} placeholder="Apto / referencia" />
      <div className="grid grid-cols-2 gap-2">
        <input className={inp} value={ship.city} onChange={(e) => setShip({ ...ship, city: e.target.value })} placeholder="Ciudad" />
        <input className={inp} value={ship.department} onChange={(e) => setShip({ ...ship, department: e.target.value })} placeholder="Departamento" />
      </div>
      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="w-full rounded-full border border-ink/15 py-2.5 text-[11px] uppercase tracking-[0.16em] text-moss hover:border-ink disabled:opacity-50"
      >
        {save.isPending ? "Guardando…" : "Guardar dirección"}
      </button>
    </section>
  );
}

export function ShippingPanel({ listId }: { listId: string }) {
  const vm = useGiftShipping({ listId });
  return <GiftShippingView vm={vm} />;
}
const inp =
  "w-full rounded-xl border border-ink/15 bg-white/70 px-3 py-2.5 text-sm outline-none focus:border-ink";
