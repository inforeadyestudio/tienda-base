import { useEffect, useRef, useState } from "react";
import { Link2, Loader2, Maximize2, Minus, Plus, Scissors, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cutoutProductImage } from "@/lib/admin/looks.functions";
import { optimizeImageFile } from "@/lib/media";
import {
  DEFAULT_TRANSFORM, FIT_LABELS, LOOK_FITS, LOOK_SLOTS, SLOT_LABELS, clamp, pieceStyle,
  type LookFit, type LookSlot, type LookTransform,
} from "@/lib/looks/board";

export type BoardPiece = {
  key: string;
  id?: string;
  productId: string | null;
  name: string;
  heroUrl: string | null;
  cutoutUrl: string;
  comboImageUrl: string;
  slot: LookSlot;
  transform: LookTransform;
  genericLabel: string;
  genericType: string;
};

export type BoardMatch = { key: string; id?: string; label: string; pieceKeys: string[] };

export type BoardBase = {
  name: string;
  heroUrl: string | null;
  cutoutUrl: string;
  slot: LookSlot;
  /** Corte de la prenda inferior (skinny, bota ancha, recto). */
  fit?: LookFit | null;
  transform: LookTransform;
};

const BASE_KEY = "__base__";

export function LookBoard({
  productId,
  base,
  onBaseChange,
  pieces,
  onPiecesChange,
  matches,
  onMatchesChange,
}: {
  productId?: string;
  base: BoardBase;
  onBaseChange: (patch: Partial<BoardBase>) => void;
  pieces: BoardPiece[];
  onPiecesChange: (next: BoardPiece[]) => void;
  matches: BoardMatch[];
  onMatchesChange: (next: BoardMatch[]) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [busyKind, setBusyKind] = useState<"cutout" | "upload" | null>(null);
  const [progress, setProgress] = useState(0);
  const [uploadTarget, setUploadTarget] = useState<string | null>(null);

  /** Barra de progreso suave mientras la IA recorta (avanza rápido al inicio y se estaciona en ~94%). */
  useEffect(() => {
    if (!busy || busyKind !== "cutout") {
      setProgress(0);
      return;
    }
    const t0 = Date.now();
    setProgress(3);
    const id = setInterval(() => {
      const s = (Date.now() - t0) / 1000;
      setProgress(Math.min(94, Math.round(100 * (1 - Math.exp(-s / 14)))));
    }, 150);
    return () => clearInterval(id);
  }, [busy, busyKind]);

  const patchPiece = (key: string, patch: Partial<BoardPiece>) =>
    onPiecesChange(pieces.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const transformOf = (key: string) => (key === BASE_KEY ? base.transform : pieces.find((p) => p.key === key)?.transform);
  const setTransform = (key: string, t: LookTransform) =>
    key === BASE_KEY ? onBaseChange({ transform: t }) : patchPiece(key, { transform: t });

  const startDrag = (key: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    const rect = boardRef.current?.getBoundingClientRect();
    const start = transformOf(key);
    if (!rect || !start) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      setTransform(key, {
        ...start,
        x: clamp(start.x + ((ev.clientX - x0) / rect.width) * 100, -70, 70),
        y: clamp(start.y + ((ev.clientY - y0) / rect.height) * 100, -70, 70),
      });
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  const toggleSelect = (key: string) =>
    setSelected((s) => (s.includes(key) ? s.filter((k) => k !== key) : [...s, key]));

  const scaleBy = (key: string, delta: number) => {
    const t = transformOf(key);
    if (!t) return;
    setTransform(key, { ...t, scale: clamp(t.scale + delta, 0.3, 3) });
  };

  const setScale = (key: string, scale: number) => {
    const t = transformOf(key);
    if (!t) return;
    setTransform(key, { ...t, scale: clamp(scale, 0.3, 3) });
  };

  /** Arrastrar la esquina para agrandar o achicar la pieza. */
  const startResize = (key: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = boardRef.current?.getBoundingClientRect();
    const start = transformOf(key);
    if (!rect || !start) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const d = (ev.clientX - x0 + (ev.clientY - y0)) / 2;
      setTransform(key, { ...start, scale: clamp(start.scale + (d / rect.width) * 3, 0.3, 3) });
    };
    const up = () => {
      target.removeEventListener("pointermove", move);
      target.removeEventListener("pointerup", up);
    };
    target.addEventListener("pointermove", move);
    target.addEventListener("pointerup", up);
  };

  /** Sube un PNG al bucket público y devuelve su URL. */
  const uploadPng = async (file: File | Blob, name: string) => {
    const path = `looks/${productId ?? "nuevo"}-${Date.now()}-${name}`;
    const { error } = await supabase.storage.from("product-media").upload(path, file, {
      contentType: "image/png",
      cacheControl: "31536000",
      upsert: false,
    });
    if (error) throw error;
    return supabase.storage.from("product-media").getPublicUrl(path).data.publicUrl;
  };

  const runCutout = async (key: string) => {
    const isBase = key === BASE_KEY;
    const source = isBase ? base.heroUrl : pieces.find((p) => p.key === key)?.heroUrl;
    const slot = isBase ? base.slot : (pieces.find((p) => p.key === key)?.slot ?? "full");
    if (!source) {
      toast.error("Esta pieza no tiene foto para recortar.");
      return;
    }
    setBusy(key);
    setBusyKind("cutout");
    try {
      // Reduce la foto a 1024px antes de enviarla: el recorte siempre sale a 1024,
      // así que viaja mucho más liviana y la IA responde antes sin perder calidad.
      const imageB64 = await shrinkToB64(source).catch(() => undefined);
      const { b64 } = await cutoutProductImage({ data: { imageUrl: source, imageB64, slot } });
      if (!b64) throw new Error("La IA no devolvió imagen.");
      const bin = atob(b64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
      const url = await uploadPng(new Blob([bytes], { type: "image/png" }), "cutout.png");
      if (isBase) onBaseChange({ cutoutUrl: url });
      else patchPiece(key, { cutoutUrl: url });
      toast.success("Fondo eliminado");
    } catch (err: any) {
      toast.error(err?.message ?? "No pudimos recortar la imagen.");
    } finally {
      setBusy(null);
      setBusyKind(null);
    }
  };

  const onFile = async (file: File) => {
    const key = uploadTarget;
    setUploadTarget(null);
    if (!key) return;
    setBusy(key);
    setBusyKind("upload");
    try {
      const optimized = file.type === "image/png" ? file : await optimizeImageFile(file);
      const url = await uploadPng(optimized, optimized.name.replace(/[^\w.-]+/g, "-"));
      if (key === BASE_KEY) onBaseChange({ cutoutUrl: url });
      else patchPiece(key, { cutoutUrl: url });
      toast.success("Imagen actualizada");
    } catch (err: any) {
      toast.error(err?.message ?? "No pudimos subir la imagen.");
    } finally {
      setBusy(null);
      setBusyKind(null);
    }
  };

  const createMatch = () => {
    if (selected.length < 2) return;
    onMatchesChange([...matches, { key: crypto.randomUUID(), label: "", pieceKeys: [...selected] }]);
    setSelected([]);
    toast.success("Match creado");
  };

  const nameOf = (key: string) =>
    key === BASE_KEY ? base.name || "Este producto" : pieces.find((p) => p.key === key)?.name ?? "Pieza";

  const rendered: { key: string; label: string; img: string | null; slot: LookSlot; transform: LookTransform }[] = [
    { key: BASE_KEY, label: base.name || "Este producto", img: base.cutoutUrl || base.heroUrl, slot: base.slot, transform: base.transform },
    ...pieces.map((p) => ({ key: p.key, label: p.name, img: p.cutoutUrl || p.heroUrl, slot: p.slot, transform: p.transform })),
  ];

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/webp,image/jpeg"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void onFile(f);
        }}
      />

      {/* Tablero */}
      <div
        ref={boardRef}
        className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl border border-ink/10 bg-[linear-gradient(#f6f4ee,#efece3)]"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) setSelected([]);
        }}
      >
        {rendered.map((r) => {
          const on = selected.includes(r.key);
          return (
            <div
              key={r.key}
              style={pieceStyle(r.slot, r.transform)}
              className="absolute touch-none select-none"
              onPointerDown={startDrag(r.key)}
              onClick={() => toggleSelect(r.key)}
            >
              <div
                className={`relative rounded-xl p-1 transition ${
                  on ? "ring-2 ring-ink" : "ring-1 ring-transparent hover:ring-ink/20"
                }`}
              >
                {r.img ? (
                  <img src={r.img} alt={r.label} draggable={false} className="w-full object-contain" />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-white/70 text-[10px] text-ink/50">
                    Sin imagen
                  </div>
                )}
                {busy === r.key && (
                  <div className="absolute inset-0 grid place-items-center rounded-xl bg-white/70">
                    {busyKind === "cutout" ? (
                      <div className="w-3/4 max-w-[140px]">
                        <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
                          <div
                            className="h-full rounded-full bg-ink transition-[width] duration-200"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <p className="mt-1.5 text-center text-[10px] tabular-nums text-ink/60">
                          Recortando… {progress}%
                        </p>
                      </div>
                    ) : (
                      <Loader2 className="size-5 animate-spin text-ink/70" />
                    )}
                  </div>
                )}
                <span className="pointer-events-none absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-white/85 px-2 py-0.5 text-[9px] uppercase tracking-[0.14em] text-ink/60">
                  {r.key === BASE_KEY ? "Este producto" : SLOT_LABELS[r.slot]}
                </span>
                {on && (
                  <button
                    type="button"
                    onPointerDown={startResize(r.key)}
                    onClick={(e) => e.stopPropagation()}
                    title="Arrastra para cambiar el tamaño"
                    className="absolute -bottom-2 -right-2 grid size-6 cursor-nwse-resize place-items-center rounded-full border border-ink/15 bg-white text-ink/70 shadow"
                  >
                    <Maximize2 className="size-3" />
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {selected.length > 0 && (
          <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-ink px-2 py-1.5 text-ivory shadow-lg">
            <span className="px-2 text-[11px]">{selected.length} seleccionada(s)</span>
            <button type="button" onClick={() => selected.forEach((k) => scaleBy(k, -0.08))} className="rounded-full p-1.5 hover:bg-white/15" aria-label="Reducir">
              <Minus className="size-3.5" />
            </button>
            <button type="button" onClick={() => selected.forEach((k) => scaleBy(k, 0.08))} className="rounded-full p-1.5 hover:bg-white/15" aria-label="Agrandar">
              <Plus className="size-3.5" />
            </button>
            <button
              type="button"
              disabled={selected.length < 2}
              onClick={createMatch}
              className="ml-1 inline-flex items-center gap-1.5 rounded-full bg-ivory px-3 py-1.5 text-[11px] text-ink disabled:opacity-40"
            >
              <Link2 className="size-3.5" /> Match
            </button>
            <button type="button" onClick={() => setSelected([])} className="rounded-full p-1.5 hover:bg-white/15" aria-label="Limpiar">
              <X className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Panel lateral */}
      <div className="space-y-3">
        <PieceCard
          title={base.name || "Este producto"}
          subtitle="Pieza fija del tablero"
          img={base.cutoutUrl || base.heroUrl}
          slot={base.slot}
          onSlot={(slot) => onBaseChange({ slot })}
          fit={base.fit ?? null}
          onFit={(fit) => onBaseChange({ fit })}
          onCutout={() => runCutout(BASE_KEY)}
          onUpload={() => {
            setUploadTarget(BASE_KEY);
            fileRef.current?.click();
          }}
          busy={busy === BASE_KEY}
          cutting={busy === BASE_KEY && busyKind === "cutout"}
          progress={progress}
          hasCutout={Boolean(base.cutoutUrl)}
          scale={base.transform.scale}
          onScale={(s) => setScale(BASE_KEY, s)}
        />

        {pieces.map((p) => (
          <PieceCard
            key={p.key}
            title={p.name}
            subtitle={p.productId ? "Producto del catálogo" : "Pieza de closet"}
            img={p.cutoutUrl || p.heroUrl}
            slot={p.slot}
            onSlot={(slot) => patchPiece(p.key, { slot })}
            onCutout={p.heroUrl ? () => runCutout(p.key) : undefined}
            onUpload={() => {
              setUploadTarget(p.key);
              fileRef.current?.click();
            }}
            onRemove={() => {
              onPiecesChange(pieces.filter((x) => x.key !== p.key));
              onMatchesChange(
                matches
                  .map((m) => ({ ...m, pieceKeys: m.pieceKeys.filter((k) => k !== p.key) }))
                  .filter((m) => m.pieceKeys.length > 1),
              );
            }}
            busy={busy === p.key}
            cutting={busy === p.key && busyKind === "cutout"}
            progress={progress}
            hasCutout={Boolean(p.cutoutUrl)}
            scale={p.transform.scale}
            onScale={(s) => setScale(p.key, s)}
          />
        ))}

        <div className="rounded-2xl border border-ink/10 bg-white p-3">
          <p className="mb-2 text-xs text-ink/60">Matches ({matches.length})</p>
          {matches.length === 0 && (
            <p className="text-xs text-ink/45">
              Selecciona dos o más piezas en el tablero y pulsa <strong>Match</strong> para guardar una combinación válida.
            </p>
          )}
          <div className="space-y-2">
            {matches.map((m, i) => (
              <div key={m.key} className="rounded-xl border border-ink/10 bg-[#faf9f6] p-2">
                <div className="flex items-center gap-2">
                  <input
                    value={m.label}
                    onChange={(e) =>
                      onMatchesChange(matches.map((x) => (x.key === m.key ? { ...x, label: e.target.value } : x)))
                    }
                    placeholder={`Match ${i + 1}`}
                    className="flex-1 rounded-lg border border-ink/10 bg-white px-2 py-1 text-xs outline-none focus:border-ink/40"
                  />
                  <button
                    type="button"
                    onClick={() => onMatchesChange(matches.filter((x) => x.key !== m.key))}
                    className="rounded-full p-1.5 text-ink/50 hover:bg-ink/5 hover:text-destructive"
                    aria-label="Eliminar match"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <p className="mt-1 text-[11px] text-ink/55">{m.pieceKeys.map(nameOf).join(" + ")}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PieceCard({
  title, subtitle, img, slot, onSlot, fit, onFit, onCutout, onUpload, onRemove, busy, cutting, progress, hasCutout, scale, onScale,
}: {
  scale: number;
  onScale: (scale: number) => void;
  title: string;
  subtitle: string;
  img: string | null;
  slot: LookSlot;
  onSlot: (slot: LookSlot) => void;
  fit?: LookFit | null;
  onFit?: (fit: LookFit | null) => void;
  onCutout?: () => void;
  onUpload: () => void;
  onRemove?: () => void;
  busy: boolean;
  cutting: boolean;
  progress: number;
  hasCutout: boolean;
}) {
  return (
    <div className="rounded-2xl border border-ink/10 bg-white p-3">
      <div className="flex items-center gap-3">
        <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-[#f6f6f4]">
          {img && <img src={img} alt="" className="h-full w-full object-contain" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm">{title}</p>
          <p className="text-[11px] text-ink/50">{subtitle}</p>
        </div>
        {onRemove && (
          <button type="button" onClick={onRemove} className="rounded-full p-1.5 text-ink/50 hover:bg-ink/5 hover:text-destructive" aria-label="Quitar pieza">
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <select
          value={slot}
          onChange={(e) => onSlot(e.target.value as LookSlot)}
          className="rounded-full border border-ink/10 bg-white px-2.5 py-1 text-[11px] outline-none"
        >
          {LOOK_SLOTS.map((s) => (
            <option key={s} value={s}>{SLOT_LABELS[s]}</option>
          ))}
        </select>
        {onFit && slot === "bottom" && (
          <select
            value={fit ?? ""}
            onChange={(e) => onFit((e.target.value || null) as LookFit | null)}
            className="rounded-full border border-ink/10 bg-white px-2.5 py-1 text-[11px] outline-none"
            title="Corte de la prenda inferior"
          >
            <option value="">Corte…</option>
            {LOOK_FITS.map((f) => (
              <option key={f} value={f}>{FIT_LABELS[f]}</option>
            ))}
          </select>
        )}
        {onCutout && (
          <button
            type="button"
            disabled={busy}
            onClick={onCutout}
            className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-2.5 py-1 text-[11px] hover:bg-ink/[0.04] disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3 animate-spin" /> : <Scissors className="size-3" />}
            {hasCutout ? "Recortar de nuevo" : "Quitar fondo"}
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onUpload}
          className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 px-2.5 py-1 text-[11px] hover:bg-ink/[0.04] disabled:opacity-50"
        >
          <Upload className="size-3" /> {hasCutout ? "Cambiar PNG" : "Subir PNG"}
        </button>
      </div>
      {cutting && (
        <div className="mt-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
            <div
              className="h-full rounded-full bg-ink transition-[width] duration-200"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] tabular-nums text-ink/55">
            Recortando con IA… {progress}%
          </p>
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <span className="text-[11px] text-ink/50">Tamaño</span>
        <input
          type="range"
          min={0.3}
          max={3}
          step={0.02}
          value={scale}
          onChange={(e) => onScale(Number(e.target.value))}
          className="h-1 flex-1 accent-ink"
        />
        <span className="w-9 text-right text-[11px] tabular-nums text-ink/50">{Math.round(scale * 100)}%</span>
      </div>
      {!hasCutout && (
        <p className="mt-1.5 text-[11px] text-ink/45">Sin PNG propio: se usa la foto del producto.</p>
      )}
    </div>
  );
}

/** Descarga la foto y la devuelve en base64 (webp) reducida a máx. 1024px por lado. */
async function shrinkToB64(url: string): Promise<string | undefined> {
  const res = await fetch(url);
  if (!res.ok) return undefined;
  const blob = await res.blob();
  if (!blob.type.startsWith("image/")) return undefined;
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, 1024 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.85));
  if (!out) return undefined;
  const buf = new Uint8Array(await out.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 1) bin += String.fromCharCode(buf[i]);
  return btoa(bin);
}

export const LOOK_BASE_KEY = BASE_KEY;
export const emptyTransform = () => ({ ...DEFAULT_TRANSFORM });
