import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Plus, Sparkles, Loader2 } from "lucide-react";
import { useCloset, CATEGORY_LABELS, SOURCE_LABELS, type ClosetPiece } from "@/lib/closet/queries";
import { ClosetUploadModal } from "./closet-upload-modal";
import { CombinePanel, type CombineBase } from "./combine-panel";
import { ClosetBoard } from "./closet-board";

export function ClosetSection({ userId }: { userId: string }) {
  const { data: pieces, isLoading } = useCloset(userId);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [filter, setFilter] = useState<string>("todo");
  const [base, setBase] = useState<CombineBase | null>(null);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of pieces ?? []) if (p.category) set.add(p.category);
    return ["todo", ...Array.from(set)];
  }, [pieces]);

  const visible = (pieces ?? []).filter((p) => filter === "todo" || p.category === filter);

  return (
    <section className="rounded-2xl border border-ink/5 bg-white/60 p-4 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-brown-sugar text-2xl sm:text-3xl">Mi Closet</h3>
          <p className="mt-0.5 text-[11px] text-moss/70">
            Tu archivo salvaje. Todo lo que amas, compras y vuelves tuyo vive aquí.
          </p>
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          className="flex items-center gap-2 border border-ink px-4 py-2.5 text-[10px] uppercase tracking-[0.25em] transition hover:bg-ink hover:text-ivory"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={1.5} /> Agregar una prenda
        </button>
      </div>

      {categories.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.18em] transition ${
                filter === c ? "bg-ink text-ivory" : "bg-cream text-moss hover:text-ink"
              }`}
            >
              {c === "todo" ? "Todo" : (CATEGORY_LABELS[c] ?? c)}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16 text-moss">
          <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} />
        </div>
      ) : visible.length === 0 ? (
        <button
          onClick={() => setUploadOpen(true)}
          className="mt-5 flex w-full flex-col items-center gap-2 rounded-2xl border border-dashed border-ink/20 px-6 py-14 text-center"
        >
          <Plus className="h-5 w-5 text-moss" strokeWidth={1.5} />
          <p className="text-sm">Tu closet está vacío</p>
          <p className="max-w-xs text-[11px] leading-relaxed text-moss">
            Sube una foto de una prenda que ya tengas y la convertimos en foto de producto.
          </p>
        </button>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {visible.map((p) => (
            <ClosetCard key={`${p.source}-${p.id}`} piece={p} onCombine={setBase} />
          ))}
        </div>
      )}

      <ClosetUploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        userId={userId}
        onSaved={(piece) => {
          setUploadOpen(false);
          setBase({
            id: piece.id,
            name: piece.name,
            kind: "closet",
            garment_type: piece.garment_type,
            color: piece.color,
            category: piece.category,
          });
        }}
      />

      <CombinePanel open={!!base} onClose={() => setBase(null)} base={base} closet={pieces ?? []} />

      <ClosetBoard userId={userId} pieces={pieces ?? []} />
    </section>
  );
}

function ClosetCard({ piece, onCombine }: { piece: ClosetPiece; onCombine: (b: CombineBase) => void }) {
  return (
    <motion.article whileHover={{ y: -3 }} className="group">
      <div className="relative aspect-[3/4] overflow-hidden rounded-xl bg-cream">
        {piece.image ? (
          <img src={piece.image} alt={piece.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-[10px] text-moss">Sin foto</div>
        )}
        <span
          className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[8px] uppercase tracking-[0.15em] ${
            piece.source === "purchase"
              ? "bg-ink/80 text-ivory"
              : piece.source === "wishlist"
                ? "bg-moss/85 text-ivory"
                : "bg-ivory/85 text-moss"
          }`}
        >
          {SOURCE_LABELS[piece.source]}
        </span>
        <button
          onClick={() =>
            onCombine({
              id: piece.id,
              name: piece.name,
              kind: piece.source === "purchase" ? "product" : "closet",
              garment_type: piece.garment_type,
              color: piece.color,
              category: piece.category,
            })
          }
          className="absolute inset-x-2 bottom-2 flex items-center justify-center gap-1.5 rounded-full bg-ivory/90 py-1.5 text-[9px] uppercase tracking-[0.15em] text-ink opacity-0 transition group-hover:opacity-100 focus:opacity-100"
        >
          <Sparkles className="h-3 w-3" strokeWidth={1.5} /> Combinar
        </button>
      </div>
      <p className="mt-2 truncate text-center text-[11px]">{piece.name}</p>
      <p className="truncate text-center text-[10px] text-moss/70">
        {piece.productSlug ? (
          <Link to="/producto/$slug" params={{ slug: piece.productSlug }} className="hover:text-ink">
            {piece.garment_type ?? "Ver producto"}
          </Link>
        ) : (
          [piece.garment_type, piece.color].filter(Boolean).join(" · ")
        )}
      </p>
    </motion.article>
  );
}
