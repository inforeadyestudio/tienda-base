import { useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, Trash2, Sparkles, Save } from "lucide-react";
import { toast } from "sonner";
import { SLOT_LABELS } from "@/lib/looks/board";
import type { ClosetPiece } from "@/lib/closet/queries";
import {
  defaultPlacement,
  deleteClosetLook,
  saveClosetLook,
  slotForPiece,
  useClosetLooks,
  type BoardItem,
  type ClosetLook,
} from "@/lib/closet/looks";
import { LookTryOnModal } from "./look-tryon-modal";

export function ClosetBoard({ userId, pieces }: { userId: string; pieces: ClosetPiece[] }) {
  const qc = useQueryClient();
  const { data: looks, isLoading } = useClosetLooks(userId);

  const [editing, setEditing] = useState<ClosetLook | null>(null);
  const [open, setOpen] = useState(false);
  const [tryOn, setTryOn] = useState<ClosetLook | null>(null);

  const startNew = () => {
    setEditing(null);
    setOpen(true);
  };

  return (
    <section className="mt-6 rounded-2xl border border-ink/5 bg-white/60 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-brown-sugar text-2xl sm:text-3xl">Mis looks</h3>
          <p className="mt-0.5 text-[11px] text-moss/70">
            Donde tus combinaciones toman forma. Crea, prueba y guarda tus favoritos.
          </p>
        </div>
        <button
          onClick={startNew}
          className="flex items-center gap-2 border border-ink px-4 py-2.5 text-[10px] uppercase tracking-[0.25em] transition hover:bg-ink hover:text-ivory"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> Armar un look
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10 text-moss">
          <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} />
        </div>
      ) : looks?.length ? (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {looks.map((look) => (
            <article key={look.id} className="group">
              <button
                onClick={() => {
                  setEditing(look);
                  setOpen(true);
                }}
                className="relative block aspect-[3/4] w-full overflow-hidden rounded-xl bg-cream"
              >
                {look.items.map((item) => (
                  <img
                    key={item.pieceId}
                    src={item.image}
                    alt=""
                    className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 object-contain"
                    style={{
                      left: `${item.x}%`,
                      top: `${item.y}%`,
                      width: `${42 * item.scale}%`,
                      zIndex: item.z,
                    }}
                  />
                ))}
              </button>
              <p className="mt-2 truncate text-center text-[11px]">{look.name}</p>
              <div className="mt-1 flex items-center justify-center gap-3 text-[10px] text-moss">
                <button onClick={() => setTryOn(look)} className="inline-flex items-center gap-1 hover:text-ink">
                  <Sparkles className="h-3 w-3" strokeWidth={1.5} /> Probármelo
                </button>
                <button
                  onClick={async () => {
                    await deleteClosetLook(look.id);
                    qc.invalidateQueries({ queryKey: ["closet-looks", userId] });
                  }}
                  className="inline-flex items-center gap-1 hover:text-ink"
                >
                  <Trash2 className="h-3 w-3" strokeWidth={1.5} /> Borrar
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <button
          onClick={startNew}
          className="mt-5 flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-ink/20 px-6 py-12 text-center"
        >
          <Sparkles className="h-5 w-5 text-moss" strokeWidth={1.5} />
          <p className="text-sm">Aún no tienes looks</p>
          <p className="max-w-xs text-[11px] leading-relaxed text-moss">
            Combina las prendas de tu closet en un tablero y pruébatelas sobre tu foto.
          </p>
        </button>
      )}

      {open && (
        <BoardEditor
          userId={userId}
          pieces={pieces}
          look={editing}
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            qc.invalidateQueries({ queryKey: ["closet-looks", userId] });
          }}
        />
      )}

      <LookTryOnModal
        open={!!tryOn}
        onClose={() => setTryOn(null)}
        lookName={tryOn?.name ?? "tu look"}
        items={tryOn?.items ?? []}
      />
    </section>
  );
}

function BoardEditor({
  userId,
  pieces,
  look,
  onClose,
  onSaved,
}: {
  userId: string;
  pieces: ClosetPiece[];
  look: ClosetLook | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(look?.name ?? "Mi look");
  const [items, setItems] = useState<BoardItem[]>(look?.items ?? []);
  const [active, setActive] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const boardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number } | null>(null);

  const available = useMemo(() => pieces.filter((p) => p.image), [pieces]);
  const selected = items.find((i) => i.pieceId === active) ?? null;

  const addPiece = (piece: ClosetPiece) => {
    if (items.some((i) => i.pieceId === piece.id)) return;
    const slot = slotForPiece(piece);
    const placement = defaultPlacement(slot);
    const item: BoardItem = {
      pieceId: piece.id,
      name: piece.name,
      image: piece.image!,
      slot,
      ...placement,
      z: items.length + 1,
    };
    setItems((prev) => [...prev, item]);
    setActive(piece.id);
  };

  const onPointerDown = (e: React.PointerEvent, item: BoardItem) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = {
      id: item.pieceId,
      dx: ((e.clientX - rect.left) / rect.width) * 100 - item.x,
      dy: ((e.clientY - rect.top) / rect.height) * 100 - item.y,
    };
    setActive(item.pieceId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    const rect = boardRef.current?.getBoundingClientRect();
    if (!d || !rect) return;
    const x = Math.min(98, Math.max(2, ((e.clientX - rect.left) / rect.width) * 100 - d.dx));
    const y = Math.min(98, Math.max(2, ((e.clientY - rect.top) / rect.height) * 100 - d.dy));
    setItems((prev) => prev.map((i) => (i.pieceId === d.id ? { ...i, x, y } : i)));
  };

  const update = (id: string, patch: Partial<BoardItem>) =>
    setItems((prev) => prev.map((i) => (i.pieceId === id ? { ...i, ...patch } : i)));

  const save = async () => {
    if (!items.length) {
      toast.error("Agrega al menos una prenda al tablero.");
      return;
    }
    setSaving(true);
    try {
      await saveClosetLook(userId, name.trim() || "Mi look", items, look?.id);
      toast.success("Look guardado en tu closet.");
      onSaved();
    } catch {
      toast.error("No pudimos guardar el look.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[92] flex items-center justify-center">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative flex max-h-[94svh] w-full max-w-5xl flex-col overflow-hidden bg-shell md:rounded-[2px]">
        <header className="flex items-center justify-between gap-3 border-b border-ink/10 px-5 py-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-52 border-b border-ink/15 bg-transparent py-1 text-sm outline-none focus:border-ink"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 bg-ink px-4 py-2 text-[10px] uppercase tracking-[0.25em] text-ivory disabled:opacity-40"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Guardar
            </button>
            <button onClick={onClose} className="text-[10px] uppercase tracking-[0.25em] text-moss hover:text-ink">
              Cerrar
            </button>
          </div>
        </header>

        <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 md:grid-cols-[1fr_260px]">
          <div
            ref={boardRef}
            onPointerMove={onPointerMove}
            onPointerUp={() => (drag.current = null)}
            className="relative mx-auto aspect-[3/4] w-full max-w-[420px] touch-none overflow-hidden rounded-2xl bg-cream"
          >
            {items.map((item) => (
              <img
                key={item.pieceId}
                src={item.image}
                alt={item.name}
                onPointerDown={(e) => onPointerDown(e, item)}
                className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-grab object-contain ${
                  active === item.pieceId ? "outline outline-1 outline-ink/30" : ""
                }`}
                style={{ left: `${item.x}%`, top: `${item.y}%`, width: `${42 * item.scale}%`, zIndex: item.z }}
              />
            ))}
            {!items.length && (
              <p className="absolute inset-0 flex items-center justify-center px-8 text-center text-[11px] text-moss">
                Toca una prenda de la derecha para ponerla en el tablero.
              </p>
            )}
          </div>

          <aside className="space-y-4">
            {selected && (
              <div className="rounded-2xl border border-ink/10 p-3">
                <p className="truncate text-[11px]">{selected.name}</p>
                <label className="mt-2 block text-[9px] uppercase tracking-[0.2em] text-moss">Tamaño</label>
                <input
                  type="range"
                  min={0.3}
                  max={2.2}
                  step={0.02}
                  value={selected.scale}
                  onChange={(e) => update(selected.pieceId, { scale: Number(e.target.value) })}
                  className="w-full"
                />
                <label className="mt-2 block text-[9px] uppercase tracking-[0.2em] text-moss">Zona</label>
                <select
                  value={selected.slot}
                  onChange={(e) => update(selected.pieceId, { slot: e.target.value as BoardItem["slot"] })}
                  className="mt-1 w-full border border-ink/15 bg-transparent px-2 py-1 text-[11px]"
                >
                  {Object.entries(SLOT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <div className="mt-3 flex items-center justify-between text-[10px] text-moss">
                  <button
                    onClick={() => update(selected.pieceId, { z: selected.z + 1 })}
                    className="hover:text-ink"
                  >
                    Traer al frente
                  </button>
                  <button
                    onClick={() => {
                      setItems((prev) => prev.filter((i) => i.pieceId !== selected.pieceId));
                      setActive(null);
                    }}
                    className="inline-flex items-center gap-1 hover:text-ink"
                  >
                    <Trash2 className="h-3 w-3" strokeWidth={1.5} /> Quitar
                  </button>
                </div>
              </div>
            )}

            <div>
              <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-ink/45">Tu closet</p>
              <div className="mt-2 grid max-h-[46vh] grid-cols-3 gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                {available.map((p) => (
                  <button
                    key={`${p.source}-${p.id}`}
                    onClick={() => addPiece(p)}
                    className="overflow-hidden rounded-lg bg-cream p-1 text-left"
                  >
                    <img src={p.image!} alt={p.name} className="aspect-square w-full object-contain" />
                    <span className="mt-1 block truncate text-[9px] text-moss">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
