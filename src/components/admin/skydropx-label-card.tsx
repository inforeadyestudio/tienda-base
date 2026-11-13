import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Truck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { formatCOP } from "@/lib/format";
import { PARCEL_PRESETS } from "@/lib/carriers";
import {
  quoteOrderShipping, createOrderLabel, refreshOrderLabel, type SkydropxRate,
  stampShippingLabel,
} from "@/lib/carriers.functions";
import { openStampedLabel } from "@/lib/print-label";
import { PackVerificationBox, usePackVerification } from "@/components/admin/pack-verification";

type Props = {
  orderId: string;
  carrier: string | null;
  tracking: string | null;
  labelUrl: string | null;
  shipmentId: string | null;
  /** Guía para una caja B2B: no reemplaza la del pedido. */
  boxId?: string;
  /** «Cada bodega despacha»: cotiza desde esa bodega y guarda la guía en ella. */
  locationId?: string;
  title?: string;
  onCreated?: (r: { tracking: string | null; label: string | null; carrier: string }) => void;
};

export function SkydropxLabelCard({ orderId, carrier, tracking, labelUrl, shipmentId, boxId, locationId, title, onCreated }: Props) {
  const qc = useQueryClient();
  const pack = usePackVerification(orderId, boxId, locationId);
  const quote = useServerFn(quoteOrderShipping);
  const create = useServerFn(createOrderLabel);
  const refresh = useServerFn(refreshOrderLabel);
  const stamp = useServerFn(stampShippingLabel);
  const printLabel = (url: string) => openStampedLabel(stamp, { orderId, boxId: boxId ?? null, url });
  const [rates, setRates] = useState<SkydropxRate[] | null>(null);
  const [quotedOrigin, setQuotedOrigin] = useState<{ id: string; address: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [declared, setDeclared] = useState("");
  const [weight, setWeight] = useState("");
  const [insure, setInsure] = useState(false);
  const [insured, setInsured] = useState(false);
  const [picked, setPicked] = useState<SkydropxRate | null>(null);
  const [preset, setPreset] = useState<string>(boxId ? "caja" : "bolsa");
  const [dims, setDims] = useState({ l: "", w: "", h: "" });
  const [note, setNote] = useState("");

  const reload = () => qc.invalidateQueries({ queryKey: ["admin", "order", orderId] });
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : "Error con Skydropx");

  const parcel = () => {
    const p = PARCEL_PRESETS.find((x) => x.id === preset);
    if (p) return { lengthCm: p.lengthCm, widthCm: p.widthCm, heightCm: p.heightCm };
    if (preset === "manual" && Number(dims.l) > 0 && Number(dims.w) > 0 && Number(dims.h) > 0)
      return { lengthCm: Number(dims.l), widthCm: Number(dims.w), heightCm: Number(dims.h) };
    return {}; // «caja»: medidas guardadas de la caja B2B
  };

  const doQuote = async () => {
    setBusy("quote");
    try {
      const r = await quote({ data: {
        orderId,
        insure,
        ...(insure && Number(declared) > 0 ? { declaredAmount: Number(declared) } : {}),
        ...(Number(weight) > 0 ? { weightKg: Number(weight) } : {}),
        ...parcel(),
        ...(boxId ? { boxId } : {}),
        ...(locationId ? { locationId } : {}),
      } });
      setRates(r.rates);
      setQuotedOrigin({ id: r.originLocationId, address: r.originAddress });
      setInsured(r.insured);
      if (r.insured) setDeclared(String(r.declaredAmount));
      setWeight(String(r.weightKg));
      if (!r.rates.length) toast.error("Skydropx no devolvió tarifas para este destino.");
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const buy = async (rate: SkydropxRate) => {
    setBusy(rate.id);
    try {
      const r = await create({ data: { orderId, rateId: rate.id, carrier: rate.carrier, ...(quotedOrigin ? { quotedOriginLocationId: quotedOrigin.id } : {}), ...(note.trim() ? { note: note.trim() } : {}), ...(boxId ? { boxId } : {}), ...(locationId ? { locationId } : {}) } });
      onCreated?.({ tracking: r.tracking, label: r.label, carrier: rate.carrier });
      toast.success(r.pending ? "Guía creada; la etiqueta se está generando." : "Guía lista");
      if (r.label) void printLabel(r.label);
      setRates(null); setPicked(null);
      reload();
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const Breakdown = ({ r }: { r: SkydropxRate }) => (
    <div className="text-[11px] text-moss/80 space-y-0.5">
      <div className="flex justify-between"><span>Flete</span><span>{formatCOP(r.freight ?? r.amount)}</span></div>
      {insured && <div className="flex justify-between"><span>Seguro</span><span>{r.insurance != null ? formatCOP(r.insurance) : "Incluido en otros"}</span></div>}
      {r.other != null && <div className="flex justify-between"><span>Otros cargos Skydropx</span><span>{formatCOP(r.other)}</span></div>}
      <div className="flex justify-between text-ink font-medium pt-0.5 border-t border-ink/10"><span>Total</span><span>{formatCOP(r.amount)}</span></div>
    </div>
  );

  const orderLevel = !boxId && !locationId;
  const [mCarrier, setMCarrier] = useState("");
  const [mTracking, setMTracking] = useState("");

  const clearLabel = async () => {
    if (!confirm("¿Quitar la guía de este pedido? Podrás generar otra o escribirla a mano.")) return;
    setBusy("clear");
    const { error } = await supabase.from("orders").update({
      skydropx_shipment_id: null, shipping_carrier: null, tracking_number: null, shipping_label_url: null,
    } as any).eq("id", orderId);
    setBusy(null);
    if (error) return fail(error);
    toast.success("Guía eliminada");
    reload();
  };

  const saveManual = async () => {
    if (!mCarrier.trim() || !mTracking.trim()) return toast.error("Escribe transportadora y número de guía");
    setBusy("manual");
    const { data: o } = await supabase.from("orders").select("status").eq("id", orderId).maybeSingle();
    const markDelivered = ["paid", "preparing"].includes(String(o?.status));
    const { error } = await supabase.from("orders").update({
      skydropx_shipment_id: null, shipping_label_url: null,
      shipping_carrier: mCarrier.trim(), tracking_number: mTracking.trim(),
      ...(markDelivered ? { status: "delivered" } : {}),
    } as any).eq("id", orderId);
    setBusy(null);
    if (error) return fail(error);
    setMCarrier(""); setMTracking("");
    toast.success("Guía manual guardada");
    reload();
  };

  const doRefresh = async () => {
    setBusy("refresh");
    try {
      const r = await refresh({ data: { orderId } });
      if (!r.label) toast("La etiqueta aún no está lista, intenta en un momento.");
      reload();
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  return (
    <div className="bg-white border border-ink/10 rounded-2xl p-5">
      <p className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-moss/70 mb-3">
        <Truck className="size-3.5" /> {title ?? "Guía de envío nacional"}
      </p>
      {(rates || picked) && quotedOrigin && <p className="text-xs text-moss mb-3">Origen: {quotedOrigin.address}</p>}

      {orderLevel && !shipmentId && tracking ? (
        <div className="text-sm text-moss space-y-1.5">
          {carrier && <p>Transportadora: <span className="text-ink">{carrier}</span></p>}
          <p>Guía: <span className="text-ink font-mono">{tracking}</span></p>
          <p className="text-[11px] text-moss/70">Guía manual (hecha por fuera de Skydropx)</p>
          <button onClick={clearLabel} disabled={!!busy} className="mt-2 block w-full text-[11px] uppercase tracking-widest text-clay disabled:opacity-50">Quitar guía</button>
        </div>
      ) : shipmentId ? (
        <div className="text-sm text-moss space-y-1.5">
          {carrier && <p>Transportadora: <span className="text-ink">{carrier}</span></p>}
          <p>Guía: <span className="text-ink font-mono">{tracking ?? "generando…"}</span></p>
          {labelUrl ? (
            <button type="button" onClick={() => void printLabel(labelUrl)}
              className="mt-2 block w-full text-center rounded-full bg-ink px-4 py-2 text-xs uppercase tracking-widest text-ivory">
              Imprimir etiqueta
            </button>
          ) : (
            <button onClick={doRefresh} disabled={!!busy}
              className="mt-2 block w-full rounded-full border border-ink/10 px-4 py-2 text-xs uppercase tracking-widest text-ink disabled:opacity-50">
              {busy === "refresh" ? "Consultando…" : "Actualizar etiqueta"}
            </button>
          )}
          {orderLevel && (
            <button onClick={clearLabel} disabled={!!busy} className="mt-2 block w-full text-[11px] uppercase tracking-widest text-clay disabled:opacity-50">
              {busy === "clear" ? "Quitando…" : "Quitar guía"}
            </button>
          )}
        </div>
      ) : picked ? (
        <div className="space-y-3">
          <div className="rounded-xl border border-ink/10 px-3 py-2 space-y-2">
            <div>
              <p className="text-sm text-ink">{picked.carrier}</p>
              <p className="text-[11px] text-moss/70">{picked.service}{picked.days != null ? ` · ${picked.days} día${picked.days === 1 ? "" : "s"}` : ""}</p>
              <p className="text-[11px] text-moss/70">{insured ? `Con seguro · declarado ${formatCOP(Number(declared) || 0)}` : "Sin seguro"}</p>
            </div>
            <Breakdown r={picked} />
          </div>
          <label className="block space-y-1">
            <span className="text-[11px] uppercase tracking-widest text-moss/70">Observación (opcional)</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 120))} rows={2} placeholder="Ej: Entregar en portería, llamar antes"
              className="w-full rounded-xl border border-ink/15 bg-transparent px-3 py-2 text-sm text-ink" />
            <span className="text-[10px] text-moss/60">La guía también lleva los productos del pedido como contenido del paquete.</span>
          </label>
          <button onClick={() => buy(picked)} disabled={!!busy}
            className="w-full rounded-full bg-ink px-4 py-2 text-xs uppercase tracking-widest text-ivory disabled:opacity-50 inline-flex items-center justify-center gap-2">
            {busy === picked.id && <Loader2 className="size-3.5 animate-spin" />} Confirmar y generar guía
          </button>
          <button onClick={() => setPicked(null)} disabled={!!busy} className="w-full text-[11px] uppercase tracking-widest text-moss/70 hover:text-ink">
            Volver a tarifas
          </button>
        </div>
      ) : rates ? (
        <div className="space-y-2">
          <p className="text-[11px] text-moss/70">{insured ? "Cotizado con seguro" : "Cotizado sin seguro"}</p>
          {rates.map((r) => (
            <button key={r.id} onClick={() => setPicked(r)} disabled={!!busy}
              className="w-full rounded-xl border border-ink/10 px-3 py-2 text-left hover:border-ink disabled:opacity-50 space-y-1.5">
              <span className="block text-sm text-ink">{r.carrier}</span>
              <span className="block text-[11px] text-moss/70">{r.service}{r.days != null ? ` · ${r.days} día${r.days === 1 ? "" : "s"}` : ""}</span>
              <Breakdown r={r} />
            </button>
          ))}
          <button onClick={() => setRates(null)} className="w-full text-[11px] uppercase tracking-widest text-moss/70 hover:text-ink pt-1">
            Cancelar
          </button>
        </div>
      ) : (
        <>
        <PackVerificationBox orderId={orderId} boxId={boxId} locationId={locationId} />
        {!pack.canGenerate ? (
          <p className="text-[11px] text-moss/70">Pistolea todas las prendas para habilitar la guía.</p>
        ) : (<>
        <label className="mb-3 flex items-center justify-between gap-2 text-sm text-ink">
          <span>Asegurar envío<span className="block text-[11px] text-moss/70">Apagado = solo flete, sin seguro</span></span>
          <input type="checkbox" checked={insure} onChange={(e) => setInsure(e.target.checked)} className="size-4 accent-current" />
        </label>
        <div className="mb-3">
          <p className="text-[10px] uppercase tracking-widest text-moss/70 mb-1">Tamaño del paquete</p>
          <div className="flex flex-wrap gap-1.5">
            {[...(boxId ? [{ id: "caja", label: "Medidas de la caja" }] : []), ...PARCEL_PRESETS.map((p) => ({ id: p.id, label: `${p.label} ${p.lengthCm}×${p.widthCm}×${p.heightCm}` })), { id: "manual", label: "Otra medida" }].map((p) => (
              <button key={p.id} type="button" onClick={() => setPreset(p.id)}
                className={`rounded-full border px-2.5 py-1 text-[11px] ${preset === p.id ? "bg-ink text-ivory border-ink" : "border-ink/15 text-ink"}`}>{p.label}</button>
            ))}
          </div>
          {preset === "manual" && (
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(["l", "w", "h"] as const).map((k) => (
                <input key={k} type="number" min="1" value={dims[k]} onChange={(e) => setDims((d) => ({ ...d, [k]: e.target.value }))}
                  placeholder={k === "l" ? "Largo cm" : k === "w" ? "Ancho cm" : "Alto cm"}
                  className="w-full rounded-lg border border-ink/10 px-2 py-1.5 text-sm" />
              ))}
            </div>
          )}
          <p className="mt-1 text-[11px] text-moss/70">Coordinadora cobra por el tamaño: un paquete más pequeño sale más barato.</p>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {insure && (
            <label className="text-[10px] uppercase tracking-widest text-moss/70">Valor declarado
              <input type="number" min="1" value={declared} onChange={(e) => setDeclared(e.target.value)} placeholder="Valor del pedido"
                className="mt-1 w-full rounded-lg border border-ink/10 px-2 py-1.5 text-sm normal-case tracking-normal text-ink" />
            </label>
          )}
          <label className="text-[10px] uppercase tracking-widest text-moss/70">Peso (kg)
            <input type="number" min="1" step="0.5" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="Auto"
              className="mt-1 w-full rounded-lg border border-ink/10 px-2 py-1.5 text-sm normal-case tracking-normal text-ink" />
          </label>
        </div>
        <button onClick={doQuote} disabled={!!busy}
          className="w-full rounded-full bg-ink px-4 py-2 text-xs uppercase tracking-widest text-ivory disabled:opacity-50">
          {busy === "quote" ? "Cotizando…" : "Cotizar guía Skydropx"}
        </button>
        {orderLevel && (
          <div className="mt-4 border-t border-ink/10 pt-3 space-y-2">
            <p className="text-[11px] text-moss/70">O escribe una guía hecha por fuera de Skydropx:</p>
            <div className="grid grid-cols-2 gap-2">
              <input value={mCarrier} onChange={(e) => setMCarrier(e.target.value)} placeholder="Transportadora" className="rounded-lg border border-ink/10 px-2 py-1.5 text-sm" />
              <input value={mTracking} onChange={(e) => setMTracking(e.target.value)} placeholder="Número de guía" className="rounded-lg border border-ink/10 px-2 py-1.5 text-sm" />
            </div>
            <button onClick={saveManual} disabled={!!busy} className="w-full rounded-full border border-ink/15 px-4 py-2 text-xs uppercase tracking-widest text-ink disabled:opacity-50">
              {busy === "manual" ? "Guardando…" : "Guardar guía manual"}
            </button>
          </div>
        )}
        </>)}
        </>
      )}
    </div>
  );
}
