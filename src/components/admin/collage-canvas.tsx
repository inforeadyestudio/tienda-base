import { useCallback, useRef, useState } from "react";
import { Trash2, RotateCw, Image as ImageIcon, Video, Type } from "lucide-react";
import { Media } from "@/components/scenes/scene-shell";
import { LayerContent, canvasHeight, padBottom, useAutoHeight } from "@/lib/scenes/layer-render";
import { newLayer, type Layer, type LayerBox } from "@/lib/scenes/types";
import { cn } from "@/lib/utils";

export type Device = "desktop" | "mobile";

export function boxOf(l: Layer, device: Device): LayerBox {
  const base = { x: l.x, y: l.y, w: l.w, rotate: l.rotate, size: l.size ?? 4, hidden: !!l.hidden };
  return device === "mobile" ? { ...base, ...(l.mobile ?? {}) } : base;
}

export function patchBox(l: Layer, device: Device, p: Partial<LayerBox>): Layer {
  if (device === "mobile") return { ...l, mobile: { ...boxOf(l, "mobile"), ...p } };
  return { ...l, ...p };
}

type Mode = { kind: "move" | "resize" | "rotate"; id: string; sx: number; sy: number; start: LayerBox } | null;

export function CollageCanvas({
  props,
  layers,
  selectedId,
  device,
  onSelect,
  onLayers,
}: {
  props: Record<string, any>;
  layers: Layer[];
  selectedId: string | null;
  device: Device;
  onSelect: (id: string | null) => void;
  onLayers: (l: Layer[]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<Mode>(null);
  const sorted = [...(layers ?? [])].sort((a, b) => a.z - b.z);
  const auto = props.height === "auto";
  const sig = layers.map((l) => `${l.id}:${l.x},${l.y},${l.w},${l.size ?? 0},${l.url ?? ""},${JSON.stringify(l.mobile ?? {})}`).join("|") + device;
  const { ref: stackRef, height } = useAutoHeight(true, `${sig}|${props.height}|${props.padBottom}`);

  const patch = useCallback(
    (id: string, p: Partial<LayerBox>) => onLayers(layers.map((l) => (l.id === id ? patchBox(l, device, p) : l))),
    [layers, onLayers, device],
  );

  function start(e: React.PointerEvent, kind: "move" | "resize" | "rotate", l: Layer) {
    e.stopPropagation();
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    onSelect(l.id);
    setMode({ kind, id: l.id, sx: e.clientX, sy: e.clientY, start: boxOf(l, device) });
  }

  function onMove(e: React.PointerEvent) {
    if (!mode || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const dx = ((e.clientX - mode.sx) / rect.width) * 100;
    const dy = ((e.clientY - mode.sy) / Math.max(auto ? rect.width : rect.height, 1)) * 100;
    if (mode.kind === "move") {
      patch(mode.id, {
        x: Math.round(Math.max(-30, Math.min(120, mode.start.x + dx)) * 10) / 10,
        y: Math.round(Math.max(-30, Math.min(auto ? 600 : 140, mode.start.y + dy)) * 10) / 10,
      });
    } else if (mode.kind === "resize") {
      patch(mode.id, { w: Math.round(Math.max(3, Math.min(200, mode.start.w + dx)) * 10) / 10 });
    } else {
      const el = ref.current.querySelector<HTMLElement>(`[data-layer="${mode.id}"]`);
      if (!el) return;
      const b = el.getBoundingClientRect();
      const ang = (Math.atan2(e.clientY - (b.top + b.height / 2), e.clientX - (b.left + b.width / 2)) * 180) / Math.PI + 90;
      patch(mode.id, { rotate: Math.round(e.shiftKey ? Math.round(ang / 15) * 15 : ang) });
    }
  }

  function add(kind: Layer["kind"]) {
    const canvas = ref.current;
    const scrollArea = canvas?.closest("main");
    const canvasRect = canvas?.getBoundingClientRect();
    const scrollRect = scrollArea?.getBoundingClientRect();
    const visibleTop = canvasRect && scrollRect ? Math.max(0, scrollRect.top - canvasRect.top) : 0;
    const y = auto && canvasRect
      ? Math.max(30, ((visibleTop + 120) / Math.max(canvasRect.width, 1)) * 100)
      : 30;
    const l = { ...newLayer(kind, layers.length + 1), x: 30, y: Math.round(y * 10) / 10, w: kind === "text" ? 40 : 25 };
    onLayers([...layers, l]);
    onSelect(l.id);
  }

  const contentHeight = canvasHeight(props, height);
  const editorHeight = auto
    ? height == null
      ? "calc(100vh + 480px)"
      : `calc(${height + padBottom(props)}px + 70vh)`
    : `calc(${contentHeight} + 70vh)`;

  return (
    <div className="relative">
      <div className="sticky top-14 z-30 h-0 pointer-events-none flex justify-center px-3">
        <div className="mt-3 flex w-max min-w-max items-center gap-1 bg-ivory/95 backdrop-blur border border-ink/10 rounded-full px-3 py-3.5 shadow-sm pointer-events-auto">
          {([["image", ImageIcon, "Imagen"], ["video", Video, "Video"], ["text", Type, "Texto"]] as const).map(([k, Icon, lbl]) => (
            <button key={k} onClick={() => add(k)} className="flex h-11 w-auto shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-6 text-sm text-ink/70 transition-all duration-200 hover:-translate-y-0.5 hover:text-ink">
              <Icon className="size-4" /> {lbl}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full">
        <div
          ref={ref}
          onPointerMove={onMove}
          onPointerUp={() => setMode(null)}
          onPointerLeave={() => setMode(null)}
          onPointerDown={() => onSelect(null)}
          className="relative w-full select-none touch-none scene-preview"
          style={{ background: props.bgColor || undefined }}
        >
          {props.bgMedia && (
            <Media url={props.bgMedia} className="absolute inset-0 w-full h-full object-cover pointer-events-none" />
          )}
          <div
            ref={stackRef}
            className="relative w-full"
            style={{ height: editorHeight, containerType: auto ? "inline-size" : undefined }}
          >
            {sorted.map((l) => {
              const b = boxOf(l, device);
              const active = l.id === selectedId;
              if (b.hidden) return null;
              return (
                <div
                  key={l.id}
                  data-layer={l.id}
                  onPointerDown={(e) => start(e, "move", l)}
                  className={cn("absolute cursor-move", active && "outline outline-1 outline-ink/60")}
                  style={{
                    left: `${b.x}%`,
                    top: auto
                      ? `${b.y}cqw`
                      : `${(b.y * (props.height === "short" ? 70 : props.height === "tall" ? 140 : 100)) / 100}vh`,
                    width: `${b.w}%`,
                    zIndex: l.z,
                    opacity: l.opacity,
                    transform: `rotate(${b.rotate}deg)`,
                    fontSize: l.kind === "text" ? `${(b.size ?? 4) * (device === "mobile" ? 4.2 : 1)}${device === "mobile" ? "px" : "vw"}` : undefined,
                  }}
                >
                  <div className="pointer-events-none">
                    <LayerContent layer={l} interactive={false} />
                  </div>

                  {active && (
                    <>
                      <div
                        onPointerDown={(e) => start(e, "resize", l)}
                        className="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 rounded-full bg-ink border-2 border-ivory cursor-nwse-resize"
                      />
                      <button
                        onPointerDown={(e) => start(e, "rotate", l)}
                        className="absolute -top-8 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-ink text-ivory flex items-center justify-center cursor-grab"
                      >
                        <RotateCw className="size-3" />
                      </button>
                      <button
                        onPointerDown={(e) => e.stopPropagation()}
                        onClick={(e) => { e.stopPropagation(); onLayers(layers.filter((x) => x.id !== l.id)); onSelect(null); }}
                        className="absolute -top-8 left-1/2 translate-x-4 w-6 h-6 rounded-full bg-ivory border border-ink/15 flex items-center justify-center"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
