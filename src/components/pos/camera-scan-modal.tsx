import { useEffect, useRef, useState } from "react";
import { X, Camera, ShoppingBag, Truck, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCOP } from "@/lib/format";
import { scannedCodeFilter } from "@/lib/scanned-code";

export type ScannedVariant = {
  id: string;
  sku: string;
  size: string | null;
  color: string | null;
  price_cop: number;
  productId: string;
  productName: string;
};

type Level = { location_id: string; on_hand: number; reserved: number; locations: { name: string; kind: string; code: string } | null };
type Variant = { id: string; sku: string; size: string | null; color: string | null; price_cop: number; compare_at_cop: number | null; barcode: string | null; inventory_levels: Level[] };
type Product = { id: string; name: string; product_type: string | null; description: string | null; hero_image_url: string | null; product_variants: Variant[] };

const avail = (l: Level) => Math.max(0, (l.on_hand ?? 0) - (l.reserved ?? 0));

/** Lector de códigos con la cámara del celular + ficha de producto con stock por bodega y talla. */
export function CameraScanModal({
  onClose,
  storeLocationId,
  onAddToCart,
  onAssisted,
}: {
  onClose: () => void;
  storeLocationId: string;
  onAddToCart: (v: ScannedVariant) => void;
  onAssisted: (v: ScannedVariant) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const [scanning, setScanning] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [product, setProduct] = useState<Product | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const lookup = async (code: string) => {
    const { data: v } = await supabase
      .from("product_variants")
      .select("id, product_id")
      .or(scannedCodeFilter(code))
      .limit(1)
      .maybeSingle();
    if (!v) {
      setNotFound(code);
      return;
    }
    const { data: p } = await supabase
      .from("products")
      .select(
        "id, name, product_type, description, hero_image_url, product_variants(id, sku, size, color, price_cop, compare_at_cop, barcode, active, inventory_levels(location_id, on_hand, reserved, locations(name, kind, code)))",
      )
      .eq("id", v.product_id)
      .maybeSingle();
    if (!p) return setNotFound(code);
    const prod = p as any as Product;
    prod.product_variants = (prod.product_variants ?? []).filter((x: any) => x.active !== false);
    setProduct(prod);
    setSelectedId(v.id);
  };

  useEffect(() => {
    if (!scanning) return;
    let cancelled = false;
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        if (cancelled || !videoRef.current) return;
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: "environment" } }, audio: false },
          videoRef.current,
          (result) => {
            if (!result || cancelled) return;
            cancelled = true;
            controls.stop();
            try { navigator.vibrate?.(120); } catch {}
            beep();
            setScanning(false);
            setNotFound(null);
            lookup(result.getText().trim());
          },
        );
        controlsRef.current = controls;
        if (cancelled) controls.stop();
      } catch (e) {
        setError("No se pudo abrir la cámara. Revisa el permiso de cámara del navegador.");
      }
    })();
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, [scanning]);

  const rescan = () => {
    setProduct(null);
    setNotFound(null);
    setError(null);
    setScanning(true);
  };

  const selected = product?.product_variants.find((v) => v.id === selectedId) ?? null;
  const toScanned = (v: Variant): ScannedVariant => ({
    id: v.id, sku: v.sku, size: v.size, color: v.color, price_cop: v.price_cop,
    productId: product!.id, productName: product!.name,
  });
  const here = (v: Variant) => v.inventory_levels.filter((l) => l.location_id === storeLocationId).reduce((s, l) => s + avail(l), 0);
  const ecom = (v: Variant) => v.inventory_levels.filter((l) => l.locations?.kind === "ecom").reduce((s, l) => s + avail(l), 0);
  const others = (v: Variant) =>
    v.inventory_levels.filter((l) => l.location_id !== storeLocationId && l.locations?.kind !== "ecom" && avail(l) > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 sm:items-center sm:p-4" onMouseDown={onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="max-h-[95dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-ivory p-5 sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Camera className="size-4" />
            <h2 className="font-serif text-2xl italic">{product ? "Ficha del producto" : "Escanear con cámara"}</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-ink/5" aria-label="Cerrar"><X className="size-4" /></button>
        </div>

        {scanning && (
          <div className="relative aspect-[3/4] w-full overflow-hidden rounded-2xl bg-ink sm:aspect-video">
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-1/3 w-4/5 rounded-xl border-2 border-ivory/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
            </div>
            <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-ivory/90">Enfoca el código de barras de la etiqueta</p>
          </div>
        )}
        {error && <p className="mt-3 rounded-xl bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p>}
        {notFound && (
          <div className="space-y-3">
            <p className="rounded-xl bg-clay/10 px-3 py-2 text-sm text-clay">No encontramos el código {notFound}.</p>
            <button onClick={rescan} className="flex w-full items-center justify-center gap-2 rounded-full border border-ink/15 py-3 text-sm"><RotateCcw className="size-4" /> Escanear otra vez</button>
          </div>
        )}

        {product && selected && (
          <div className="space-y-4">
            <div className="flex gap-4">
              {product.hero_image_url && <img src={product.hero_image_url} alt={product.name} className="h-28 w-24 shrink-0 rounded-xl object-cover" />}
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-moss/70">{product.product_type ?? "Producto"}</p>
                <h3 className="text-lg leading-tight">{product.name}</h3>
                <p className="font-mono text-[11px] text-ink/50">{selected.sku}</p>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-lg font-medium">{formatCOP(selected.price_cop)}</span>
                  {selected.compare_at_cop && selected.compare_at_cop > selected.price_cop && (
                    <span className="text-sm text-ink/40 line-through">{formatCOP(selected.compare_at_cop)}</span>
                  )}
                </div>
              </div>
            </div>
            {product.description && <p className="line-clamp-3 text-xs text-moss">{product.description}</p>}

            <div>
              <p className="mb-2 text-[10px] uppercase tracking-widest text-moss/70">Disponibilidad por talla</p>
              <div className="overflow-hidden rounded-xl border border-ink/10 bg-white">
                <table className="w-full text-xs">
                  <thead className="bg-ink/5 text-[10px] uppercase tracking-widest text-ink/60">
                    <tr><th className="px-2 py-2 text-left">Talla</th><th className="px-2 py-2">Esta tienda</th><th className="px-2 py-2">Ecommerce</th><th className="px-2 py-2 text-left">Otras bodegas</th></tr>
                  </thead>
                  <tbody>
                    {product.product_variants.map((v) => (
                      <tr key={v.id} onClick={() => setSelectedId(v.id)} className={"cursor-pointer border-t border-ink/5 " + (v.id === selectedId ? "bg-moss/10" : "")}>
                        <td className="px-2 py-2">{[v.size, v.color].filter(Boolean).join(" · ") || v.sku}</td>
                        <td className="px-2 py-2 text-center font-medium">{here(v)}</td>
                        <td className="px-2 py-2 text-center">{ecom(v)}</td>
                        <td className="px-2 py-2 text-ink/60">
                          {others(v).map((l) => `${(l.locations?.name ?? "").replace("Tienda ", "")} ${avail(l)}`).join(" · ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <button
                disabled={here(selected) <= 0}
                onClick={() => { onAddToCart(toScanned(selected)); onClose(); }}
                className="flex items-center justify-center gap-2 rounded-full bg-ink py-3 text-sm text-ivory disabled:opacity-40"
              >
                <ShoppingBag className="size-4" /> Agregar al carrito POS
              </button>
              <button
                disabled={ecom(selected) <= 0}
                onClick={() => { onAssisted(toScanned(selected)); onClose(); }}
                className="flex items-center justify-center gap-2 rounded-full border border-ink/15 bg-white py-3 text-sm disabled:opacity-40"
              >
                <Truck className="size-4" /> Venta asistida (envío)
              </button>
            </div>
            <button onClick={rescan} className="flex w-full items-center justify-center gap-2 py-2 text-xs text-moss"><RotateCcw className="size-3.5" /> Escanear otra prenda</button>
          </div>
        )}
      </div>
    </div>
  );
}

function beep() {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    o.frequency.value = 1200;
    o.connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.12);
  } catch {}
}
