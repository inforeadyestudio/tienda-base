import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2, ScanLine } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner";
import { matchScan, isComplete, mergeLines, packVerifyRequired } from "@/lib/pack-verification.js";

type Line = { variantId: string; qty: number; sku: string | null; barcode: string | null; name: string };

function beep(ok: boolean) {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = ok ? 880 : 200; o.connect(g); g.connect(ctx.destination);
    g.gain.value = 0.15; o.start(); o.stop(ctx.currentTime + (ok ? 0.08 : 0.35));
  } catch { /* sin audio */ }
}

export function packScope(boxId?: string, locationId?: string) {
  return boxId ? `box:${boxId}` : locationId ? `loc:${locationId}` : "order";
}

/** Devuelve si la guía puede generarse y el recuadro de verificación. */
export function usePackVerification(orderId: string, boxId?: string, locationId?: string) {
  const scope = packScope(boxId, locationId);
  const q = useQuery({
    queryKey: ["pack-verification", orderId, scope],
    queryFn: async () => {
      const { data } = await supabase.from("packing_verifications" as any).select("skipped, verified_at")
        .eq("order_id", orderId).eq("scope", scope).maybeSingle();
      return (data as any) as { skipped: boolean; verified_at: string } | null;
    },
  });
  const required = packVerifyRequired();
  return { scope, record: q.data ?? null, loading: q.isLoading, canGenerate: !required || !!q.data, required };
}

export function PackVerificationBox({ orderId, boxId, locationId }: { orderId: string; boxId?: string; locationId?: string }) {
  const qc = useQueryClient();
  const { scope, record, required } = usePackVerification(orderId, boxId, locationId);
  const [active, setActive] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [history, setHistory] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const skipPermission = useQuery({
    queryKey: ["can-skip-packing-verification"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("can_skip_packing_verification");
      if (error) throw error;
      return data === true;
    },
  });

  const linesQ = useQuery({
    queryKey: ["pack-lines", orderId, scope],
    queryFn: async (): Promise<Line[]> => {
      if (boxId) {
        const { data, error } = await supabase.from("b2b_box_items")
          .select("variant_id, qty, product_variants(sku, barcode, size, color, products(name))").eq("box_id", boxId);
        if (error) throw error;
        return mergeLines((data ?? []).map((r: any) => ({
          variantId: r.variant_id, qty: Number(r.qty) || 0, sku: r.product_variants?.sku ?? null, barcode: r.product_variants?.barcode ?? null,
          name: [r.product_variants?.products?.name, r.product_variants?.color, r.product_variants?.size].filter(Boolean).join(" · "),
        })));
      }
      let qy = supabase.from("order_items").select("variant_id, qty, product_name, variant_label, product_variants(sku, barcode)").eq("order_id", orderId);
      if (locationId) qy = qy.eq("fulfill_location_id", locationId);
      const { data, error } = await qy;
      if (error) throw error;
      return mergeLines((data ?? []).map((r: any) => ({
        variantId: r.variant_id, qty: Number(r.qty) || 0, sku: r.product_variants?.sku ?? null, barcode: r.product_variants?.barcode ?? null,
        name: [r.product_name, r.variant_label].filter(Boolean).join(" · "),
      })));
    },
    enabled: !record,
  });
  const lines = linesQ.data ?? [];
  const complete = useMemo(() => isComplete(lines, counts), [lines, counts]);

  const save = async (skipped: boolean) => {
    setBusy(true);
    const { error } = await supabase.rpc("record_packing_verification" as any, { _order_id: orderId, _scope: scope, _skipped: skipped } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(skipped ? "Guía habilitada sin verificar" : "Empaque verificado");
    setActive(false);
    void qc.invalidateQueries({ queryKey: ["pack-verification", orderId, scope] });
  };

  const onScan = (code: string) => {
    const r = matchScan(lines, counts, code);
    if (!r.ok) {
      beep(false);
      const msg = r.reason === "excess" ? `Sobra: ${code} ya está completa` : `${code} no es de este ${boxId ? "paquete" : "pedido"}`;
      setLastError(msg); toast.error(msg);
      return;
    }
    beep(true); setLastError(null);
    const variantId = r.variantId;
    if (!variantId) return;
    const next = { ...counts, [variantId]: (counts[variantId] ?? 0) + 1 };
    setCounts(next); setHistory((h) => [...h, variantId]);
    if (isComplete(lines, next)) void save(false);
  };
  useBarcodeScanner(onScan, { enabled: active && !record });

  if (record) {
    return (
      <p className={`mb-3 flex items-center gap-1.5 text-[11px] ${record.skipped ? "text-clay" : "text-moss"}`}>
        <CheckCircle2 className="size-3.5" />
        {record.skipped ? "Guía habilitada sin verificar empaque" : "Empaque verificado"} · {new Date(record.verified_at).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
      </p>
    );
  }

  return (
    <div className="mb-4 rounded-xl border border-ink/10 p-3 space-y-2">
      <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-moss/70">
        <ScanLine className="size-3.5" /> Verificar empaque {!required && <span className="normal-case tracking-normal text-moss/60">(obligatorio desde el lunes 9 de noviembre)</span>}
      </p>
      {linesQ.isLoading ? <Loader2 className="size-4 animate-spin text-moss" /> : (
        <ul className="space-y-1">
          {lines.map((l) => {
            const n = counts[l.variantId] ?? 0; const done = n >= l.qty;
            return (
              <li key={l.variantId} className={`flex items-center justify-between gap-2 text-xs ${done ? "text-moss" : "text-ink"}`}>
                <span className="flex items-center gap-1.5 min-w-0">{done && <CheckCircle2 className="size-3.5 shrink-0" />}<span className="truncate">{l.name || l.sku}</span></span>
                <span className="font-mono shrink-0">{n} / {l.qty}</span>
              </li>
            );
          })}
        </ul>
      )}
      {lastError && <p className="text-xs text-destructive">{lastError}</p>}
      {!active ? (
        <button type="button" onClick={() => setActive(true)} disabled={!lines.length}
          className="w-full rounded-full border border-ink/15 px-4 py-2 text-xs uppercase tracking-widest text-ink disabled:opacity-50">
          Empezar a pistolear
        </button>
      ) : (
        <p className="text-[11px] text-moss">Pistolea cada prenda… {complete && "¡Completo!"}</p>
      )}
      <div className="flex justify-between gap-2 text-[11px] uppercase tracking-widest">
        <button type="button" disabled={!history.length} className="text-moss/70 hover:text-ink disabled:opacity-40"
          onClick={() => { const last = history[history.length - 1]; setHistory((h) => h.slice(0, -1)); setCounts((c) => ({ ...c, [last]: Math.max(0, (c[last] ?? 0) - 1) })); }}>
          Deshacer última
        </button>
        <button type="button" disabled={!history.length} className="text-moss/70 hover:text-ink disabled:opacity-40"
          onClick={() => { setCounts({}); setHistory([]); setLastError(null); }}>Reiniciar</button>
        {required && skipPermission.data === true && (
          <button type="button" disabled={busy} className="text-clay disabled:opacity-40"
            onClick={() => { if (confirm("¿Generar la guía sin verificar el empaque? Queda registrado quién lo hizo.")) void save(true); }}>
            Generar sin verificar
          </button>
        )}
      </div>
    </div>
  );
}
