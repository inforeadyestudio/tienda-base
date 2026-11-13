import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { X, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useProfile } from "@/lib/auth-hooks";
import { formatCOP, formatDate } from "@/lib/format";
import { fetchGuideSettings, printGuide } from "@/lib/returns-guide";
import { loyaltyConfigQuery } from "@/lib/loyalty";

type Kind = "cambio" | "puntos" | "devolucion";

const REASONS = [
  "La talla no me quedó",
  "No me gustó el color",
  "El producto llegó defectuoso",
  "Recibí un producto diferente",
  "Ya no lo necesito",
  "Otro motivo",
];

type OrderRow = {
  id: string;
  number: string;
  status: string;
  total_cop: number;
  created_at: string;
  ship_to: { city?: string; line1?: string } | null;
  order_items: {
    id: string;
    variant_id: string;
    qty: number;
    unit_price_cop: number;
    product_name: string;
    variant_label: string | null;
  }[];
};

type Selected = Record<string, number>;

type VariantOption = { id: string; label: string; available: number; price_cop: number; stores: Record<string, number> };

const STORES = [
  { id: "ebd12951-cf21-4d8a-94dc-977f8ad71930", city: "cali", name: "Tienda Cali" },
  { id: "415ee3ec-81a8-47d4-9b49-58951952d0b2", city: "bogota", name: "Tienda Bogotá" },
];
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

const ECOM_LOCATION_ID = "eef34bcc-b3ad-4224-8d95-25991ca96652";

const STEPS = ["Pedido", "Productos", "Motivo", "Solución", "Confirmar"];

export function ReturnWizard({ onClose }: { onClose: () => void }) {
  const { user } = useSession();
  const { data: profile } = useProfile();
  const qc = useQueryClient();

  const [step, setStep] = useState(0);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected>({});
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [kind, setKind] = useState<Kind>("cambio");
  const [desired, setDesired] = useState("");
  const [phone, setPhone] = useState("");
  const [desiredVariantId, setDesiredVariantId] = useState<string | null>(null);
  const [reserve, setReserve] = useState(true);
  const [scope, setScope] = useState<"misma" | "otra">("misma");
  const [size, setSize] = useState<string | null>(null);

  const { data: orders, isLoading } = useQuery({
    queryKey: ["my-orders-returnable", user?.id],
    queryFn: async () => {
      if (!user) return [] as OrderRow[];
      const { data, error } = await supabase
        .from("orders")
        .select("id, number, status, total_cop, created_at, ship_to, order_items(id, variant_id, qty, unit_price_cop, product_name, variant_label), returns(id, status)")
        .eq("customer_id", user.id)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      const all = (data ?? []) as unknown as (OrderRow & { returns?: { status: string | null }[] })[];
      return all.filter((o) => !(o.returns ?? []).some((r) => r.status !== "rechazado")) as OrderRow[];
    },
    enabled: !!user,
  });

  const order = useMemo(() => orders?.find((o) => o.id === orderId) ?? null, [orders, orderId]);

  const lines = useMemo(() => {
    if (!order) return [];
    return order.order_items
      .filter((it) => (selected[it.id] ?? 0) > 0)
      .map((it) => ({
        order_item_id: it.id,
        variant_id: it.variant_id,
        name: it.product_name,
        variant_label: it.variant_label,
        qty: selected[it.id],
        unit_price_cop: it.unit_price_cop,
      }));
  }, [order, selected]);

  const refund = lines.reduce((s, l) => s + l.qty * l.unit_price_cop, 0);

  const variantIds = lines.map((l) => l.variant_id);

  const { data: options, isLoading: loadingOptions } = useQuery({
    queryKey: ["exchange-options", variantIds.join(",")],
    queryFn: async () => {
      if (variantIds.length === 0) return [] as VariantOption[];
      const { data: base, error: e1 } = await supabase
        .from("product_variants")
        .select("product_id")
        .in("id", variantIds);
      if (e1) throw e1;
      const productIds = Array.from(new Set((base ?? []).map((b) => b.product_id)));
      if (productIds.length === 0) return [] as VariantOption[];
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, size, color, price_cop, active, products(name), inventory_levels(location_id, on_hand, reserved)")
        .in("product_id", productIds)
        .eq("active", true);
      if (error) throw error;
      return (data ?? []).map((v) => {
        const lvl = ((v.inventory_levels ?? []) as { location_id: string; on_hand: number; reserved: number }[]).find(
          (l) => l.location_id === ECOM_LOCATION_ID,
        );
        return {
          id: v.id,
          label: [(v.products as { name: string } | null)?.name, v.size, v.color].filter(Boolean).join(" · "),
          available: Math.max(0, (lvl?.on_hand ?? 0) - (lvl?.reserved ?? 0)),
          price_cop: v.price_cop,
          stores: Object.fromEntries(STORES.map((st) => {
            const l = ((v.inventory_levels ?? []) as { location_id: string; on_hand: number; reserved: number }[]).find((x) => x.location_id === st.id);
            return [st.id, Math.max(0, (l?.on_hand ?? 0) - (l?.reserved ?? 0))];
          })),
        } as VariantOption;
      });
    },
    enabled: kind === "cambio" && variantIds.length > 0,
  });

  const { data: loyaltyCfg } = useQuery(loyaltyConfigQuery());
  const refundPoints = loyaltyCfg && loyaltyCfg.point_value_cop > 0 ? Math.floor(refund / loyaltyCfg.point_value_cop) : 0;

  const { data: sizes = [] } = useQuery({
    queryKey: ["exchange-sizes", variantIds.join(",")],
    enabled: kind === "cambio" && variantIds.length > 0,
    queryFn: async () => {
      const { data: own } = await supabase.from("product_variants").select("size").in("id", variantIds);
      const { data: all } = await supabase.from("product_variants").select("size").eq("active", true).not("size", "is", null).limit(1000);
      const mine = Array.from(new Set((own ?? []).map((v) => v.size).filter(Boolean) as string[]));
      const rest = Array.from(new Set((all ?? []).map((v) => v.size).filter(Boolean) as string[])).filter((x) => !mine.includes(x));
      return [...mine, ...rest];
    },
  });
  const activeSize = size ?? sizes[0] ?? null;

  const { data: otherOptions, isLoading: loadingOther } = useQuery({
    queryKey: ["exchange-other", activeSize, variantIds.join(",")],
    enabled: kind === "cambio" && scope === "otra" && !!activeSize,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, size, color, price_cop, product_id, products!inner(name, status), inventory_levels(location_id, on_hand, reserved)")
        .eq("active", true)
        .eq("size", activeSize!)
        .eq("products.status", "published")
        .limit(200);
      if (error) throw error;
      type Lvl = { location_id: string; on_hand: number; reserved: number };
      return (data ?? []).filter((v) => !variantIds.includes(v.id)).map((v) => {
        const lv = (v.inventory_levels ?? []) as Lvl[];
        const free = (id: string) => { const l = lv.find((x) => x.location_id === id); return Math.max(0, (l?.on_hand ?? 0) - (l?.reserved ?? 0)); };
        return {
          id: v.id,
          label: [(v.products as { name: string } | null)?.name, v.color, v.size].filter(Boolean).join(" · "),
          available: free(ECOM_LOCATION_ID),
          price_cop: v.price_cop,
          stores: Object.fromEntries(STORES.map((st) => [st.id, free(st.id)])),
        } as VariantOption;
      }).filter((o) => o.available > 0 || Object.values(o.stores).some((n) => n > 0));
    },
  });

  const chosenOpt = [...(options ?? []), ...(otherOptions ?? [])].find((o) => o.id === desiredVariantId) ?? null;
  const city = norm(String(order?.ship_to?.city ?? profile?.address ?? ""));
  const localStore = STORES.find((st) => city.includes(st.city)) ?? null;
  const storeRoute = kind === "cambio" && localStore && (!chosenOpt || (chosenOpt.stores[localStore.id] ?? 0) > 0) ? localStore : null;

  const canNext =
    (step === 0 && !!orderId) ||
    (step === 1 && lines.length > 0) ||
    (step === 2 && reason.trim().length > 0) ||
    (step === 3 && (kind !== "cambio" || !!desiredVariantId || desired.trim().length > 0)) ||
    step === 4;

  const submit = useMutation({
    mutationFn: async () => {
      if (!user || !order) throw new Error("Falta información");
      const chosen = chosenOpt;
      const desiredText = kind === "cambio" ? (chosen ? `${chosen.label}${desired ? ` · ${desired}` : ""}` : desired) : null;
      const { data: created, error } = await supabase.from("returns").insert({
        order_id: order.id,
        source: "ecom",
        kind,
        status: "pendiente",
        reason,
        notes: notes || null,
        refund_cop: kind === "cambio" ? 0 : refund,
        items: lines as never,
        desired: desiredText,
        contact_name: profile?.full_name ?? null,
        contact_email: user.email ?? null,
        contact_phone: phone || profile?.phone || null,
        created_by: user.id,
        route_to: kind === "cambio" ? (storeRoute ? storeRoute.city : "wild_house") : "wild_house",
        location_id: storeRoute ? storeRoute.id : null,
      } as never).select("id").single();
      if (error) throw error;

      if (kind === "cambio" && desiredVariantId && reserve && created && !storeRoute) {
        const { error: rErr } = await supabase.rpc("reserve_exchange", {
          _return_id: created.id,
          _variant_id: desiredVariantId,
          _qty: 1,
          _days: 7,
        });
        if (rErr) return { warning: rErr.message };
      }
      if (!storeRoute && created) {
        const settings = await fetchGuideSettings();
        printGuide({
          code: `DEV-${created.id.slice(0, 8).toUpperCase()}`,
          createdAt: new Date().toLocaleDateString("es-CO"),
          kind,
          orderNumber: order.number,
          customerName: profile?.full_name ?? "",
          customerEmail: user.email ?? "",
          customerPhone: phone || profile?.phone || "",
          customerAddress: [order.ship_to?.line1, order.ship_to?.city].filter(Boolean).join(", "),
          items: lines.map((l) => ({ name: l.name, variant_label: l.variant_label, qty: l.qty })),
          desired: desiredText ?? "",
        }, settings);
      }
      return { store: storeRoute?.name };
    },
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["my-returns"] });
      if (res?.store) toast.success(`Acércate a ${res.store} y haz tu cambio de inmediato, sin esperas ni fletes.`);
      else if (res?.warning) toast.warning(`Solicitud creada, pero no pudimos reservar la talla: ${res.warning}`);
      else if (kind === "puntos") toast.success("Solicitud creada. Al recibir y aprobar tu prenda, los puntos se suman de inmediato.");
      else if (kind === "devolucion") toast.success("Solicitud creada. Al recibir y aprobar tu prenda inicia el reembolso (10-15 días hábiles).");
      else toast.success("Recibimos tu solicitud. Te escribimos pronto.");
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 w-full sm:max-w-2xl max-h-[92vh] overflow-hidden rounded-t-3xl sm:rounded-3xl bg-ivory shadow-2xl flex flex-col"
        role="dialog"
        aria-label="Cambios y devoluciones"
      >
        <header className="flex items-start justify-between gap-4 px-6 pt-6 pb-4 border-b border-ink/10">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-moss/70">Cambios y devoluciones</p>
            <h2 className="font-serif italic text-2xl mt-1">{STEPS[step]}</h2>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="text-moss"><X className="w-5 h-5" strokeWidth={1.5} /></button>
        </header>

        <div className="px-6 pt-4">
          <div className="flex items-center gap-1.5">
            {STEPS.map((s, i) => (
              <div key={s} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-ink" : "bg-ink/10"}`} />
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">
          <AnimatePresence mode="wait">
            <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}>
              {step === 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-moss mb-3">Elige el pedido sobre el que quieres hacer la solicitud.</p>
                  {isLoading && <p className="text-xs text-moss/70">Cargando pedidos…</p>}
                  {!isLoading && (orders?.length ?? 0) === 0 && (
                    <p className="text-sm text-moss/70">Aún no tienes pedidos para cambiar o devolver.</p>
                  )}
                  {orders?.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => { setOrderId(o.id); setSelected({}); }}
                      className={`w-full text-left rounded-2xl border p-4 transition ${orderId === o.id ? "border-ink bg-white" : "border-ink/10 bg-white/60 hover:border-ink/30"}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">Pedido {o.number}</p>
                          <p className="text-[11px] text-moss/70">{formatDate(o.created_at)} · {o.order_items?.length ?? 0} artículo(s)</p>
                        </div>
                        <span className="text-sm">{formatCOP(o.total_cop ?? 0)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {step === 1 && order && (
                <div className="space-y-2">
                  <p className="text-sm text-moss mb-3">Selecciona los productos y las cantidades.</p>
                  {order.order_items.map((it) => {
                    const qty = selected[it.id] ?? 0;
                    return (
                      <div key={it.id} className="rounded-2xl border border-ink/10 bg-white/60 p-4 flex items-center gap-3">
                        <button
                          onClick={() => setSelected((s) => ({ ...s, [it.id]: qty > 0 ? 0 : 1 }))}
                          className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${qty > 0 ? "bg-ink border-ink text-ivory" : "border-ink/25"}`}
                          aria-label="Seleccionar producto"
                        >
                          {qty > 0 && <Check className="w-3.5 h-3.5" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm truncate">{it.product_name}</p>
                          <p className="text-[11px] text-moss/70">{it.variant_label ?? "—"} · {formatCOP(it.unit_price_cop)}</p>
                        </div>
                        {qty > 0 && (
                          <div className="flex items-center gap-2">
                            <button onClick={() => setSelected((s) => ({ ...s, [it.id]: Math.max(1, qty - 1) }))} className="w-7 h-7 rounded-full border border-ink/15">−</button>
                            <span className="text-sm w-5 text-center">{qty}</span>
                            <button onClick={() => setSelected((s) => ({ ...s, [it.id]: Math.min(it.qty, qty + 1) }))} className="w-7 h-7 rounded-full border border-ink/15">+</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <p className="text-sm text-moss mb-3">¿Qué pasó con tu compra?</p>
                  <div className="grid gap-2">
                    {REASONS.map((r) => (
                      <button
                        key={r}
                        onClick={() => setReason(r)}
                        className={`text-left rounded-2xl border px-4 py-3 text-sm transition ${reason === r ? "border-ink bg-white" : "border-ink/10 bg-white/60 hover:border-ink/30"}`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Cuéntanos más detalles (opcional)"
                    className="w-full rounded-2xl border border-ink/10 bg-white/60 p-4 text-sm outline-none focus:border-ink"
                  />
                </div>
              )}

              {step === 3 && (
                <div className="space-y-3">
                  <p className="text-sm text-moss mb-3">¿Cómo quieres resolverlo?</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => setKind("cambio")}
                      className={`text-left rounded-2xl border p-4 transition ${kind === "cambio" ? "border-ink bg-white" : "border-ink/10 bg-white/60"}`}
                    >
                      <p className="text-sm font-medium">Cambio</p>
                      <p className="text-[11px] text-moss/70 mt-1">Otra talla, otro color u otra prenda.</p>
                    </button>
                    <button
                      onClick={() => setKind("puntos")}
                      className={`text-left rounded-2xl border p-4 transition ${kind === "puntos" ? "border-ink bg-white" : "border-ink/10 bg-white/60"}`}
                    >
                      <p className="text-sm font-medium">Devolución en Puntos Tu Marca</p>
                      <p className="text-[11px] text-moss/70 mt-1">
                        {refundPoints > 0 ? `Recibes ${refundPoints.toLocaleString("es-CO")} puntos (${formatCOP(refund)}) para tu próxima compra.` : `Recibes ${formatCOP(refund)} en puntos para tu próxima compra.`}
                      </p>
                    </button>
                  </div>
                  <button
                    onClick={() => setKind("devolucion")}
                    className={`text-xs underline underline-offset-4 ${kind === "devolucion" ? "text-ink" : "text-moss/70 hover:text-ink"}`}
                  >
                    {kind === "devolucion" ? `Devolución de dinero seleccionada · ${formatCOP(refund)}` : "Prefiero devolución de dinero"}
                  </button>
                  {kind !== "cambio" && <RefundFlowNote kind={kind} />}
                  {kind === "cambio" && (
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        {(["misma", "otra"] as const).map((sc) => (
                          <button key={sc} onClick={() => { setScope(sc); setDesiredVariantId(null); }}
                            className={`rounded-full border px-4 py-1.5 text-[11px] uppercase tracking-[0.14em] ${scope === sc ? "bg-ink text-ivory border-ink" : "border-ink/15 text-moss"}`}>
                            {sc === "misma" ? "Misma referencia" : "Otra prenda"}
                          </button>
                        ))}
                      </div>
                      {scope === "otra" && (
                        <div>
                          <p className="text-[10px] uppercase tracking-[0.2em] text-moss/70 mb-2">¿Qué talla buscas?</p>
                          <div className="flex flex-wrap gap-1.5">
                            {sizes.map((sz) => (
                              <button key={sz} onClick={() => { setSize(sz); setDesiredVariantId(null); }}
                                className={`rounded-full border px-3 py-1 text-xs ${activeSize === sz ? "border-ink bg-white" : "border-ink/10 text-moss"}`}>{sz}</button>
                            ))}
                          </div>
                        </div>
                      )}
                      <p className="text-[10px] uppercase tracking-[0.2em] text-moss/70">
                        {scope === "misma" ? "Disponible de esta referencia" : `Prendas disponibles en talla ${activeSize ?? ""}`}
                      </p>
                      {(scope === "misma" ? loadingOptions : loadingOther) && <p className="text-xs text-moss/70">Consultando inventario…</p>}
                      {scope === "misma" && !loadingOptions && (options?.length ?? 0) === 0 && (
                        <p className="text-xs text-moss/70">No encontramos otras tallas de esta referencia.</p>
                      )}
                      {scope === "otra" && !loadingOther && (otherOptions?.length ?? 0) === 0 && (
                        <p className="text-xs text-moss/70">No hay prendas disponibles en esta talla ahora mismo.</p>
                      )}
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
                        {(scope === "misma" ? options : otherOptions)?.map((o) => {
                          const inStore = localStore && (o.stores[localStore.id] ?? 0) > 0;
                          const out = o.available <= 0 && !inStore;
                          const active = desiredVariantId === o.id;
                          return (
                            <button
                              key={o.id}
                              disabled={out}
                              onClick={() => setDesiredVariantId(active ? null : o.id)}
                              className={`text-left rounded-2xl border px-3 py-2.5 text-xs transition ${
                                active ? "border-ink bg-white" : "border-ink/10 bg-white/60 hover:border-ink/30"
                              } ${out ? "opacity-40 cursor-not-allowed" : ""}`}
                            >
                              <span className="block truncate">{o.label}</span>
                              <span className="block text-[10px] text-moss/70 mt-0.5">
                                {out ? "Agotado" : inStore ? `Disponible en ${localStore!.name}` : `${o.available} disponible${o.available === 1 ? "" : "s"}`}
                                {scope === "otra" && ` · ${formatCOP(o.price_cop)}`}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {chosenOpt && chosenOpt.price_cop !== refund && lines.length === 1 && lines[0].qty === 1 && (
                        <p className="text-[11px] text-moss">
                          {chosenOpt.price_cop > refund ? `Diferencia a pagar: ${formatCOP(chosenOpt.price_cop - refund)}.` : `Te queda un saldo a favor de ${formatCOP(refund - chosenOpt.price_cop)}.`}
                        </p>
                      )}
                      {desiredVariantId && (
                        <label className="flex items-start gap-2 rounded-2xl border border-ink/10 bg-white/60 p-3 text-xs">
                          <input type="checkbox" checked={reserve} onChange={(e) => setReserve(e.target.checked)} className="mt-0.5" />
                          <span className="text-moss">Apartar esta prenda mientras revisamos y aprobamos el cambio (reserva por 7 días).</span>
                        </label>
                      )}
                      <textarea
                        value={desired}
                        onChange={(e) => setDesired(e.target.value)}
                        rows={2}
                        placeholder="Algún detalle adicional (opcional)"
                        className="w-full rounded-2xl border border-ink/10 bg-white/60 p-4 text-sm outline-none focus:border-ink"
                      />
                    </div>
                  )}
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={profile?.phone ? `Teléfono (${profile.phone})` : "Teléfono de contacto"}
                    className="w-full rounded-2xl border border-ink/10 bg-white/60 px-4 py-3 text-sm outline-none focus:border-ink"
                  />
                </div>
              )}

              {step === 4 && (
                <div className="space-y-4">
                  <div className="rounded-2xl border border-ink/10 bg-white/60 p-4 space-y-2 text-sm">
                    <Row label="Pedido" value={order?.number ?? "—"} />
                    <Row label="Tipo" value={kind === "cambio" ? "Cambio" : kind === "puntos" ? "Devolución en Puntos Tu Marca" : "Devolución de dinero"} />
                    <Row label="Motivo" value={reason} />
                    {kind === "cambio" && (chosenOpt || desired) && <Row label="Quiero" value={[chosenOpt?.label, desired].filter(Boolean).join(" · ")} />}
                    {kind === "puntos" && <Row label="Puntos a recibir" value={refundPoints > 0 ? `${refundPoints.toLocaleString("es-CO")} pts` : formatCOP(refund)} />}
                    {kind === "devolucion" && <Row label="Reembolso estimado" value={formatCOP(refund)} />}
                  </div>
                  <div className="rounded-2xl border border-ink/10 bg-white/60 p-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-moss/70 mb-2">Productos</p>
                    <ul className="space-y-1 text-sm">
                      {lines.map((l) => (
                        <li key={l.order_item_id} className="flex justify-between gap-3">
                          <span className="truncate">{l.qty} × {l.name} {l.variant_label ? `· ${l.variant_label}` : ""}</span>
                          <span>{formatCOP(l.qty * l.unit_price_cop)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  {kind !== "cambio" && <RefundFlowNote kind={kind} />}
                  {storeRoute ? (
                    <div className="rounded-2xl border border-moss/40 bg-moss/10 p-4 text-sm">
                      <p className="font-medium">Cambio inmediato en {storeRoute.name}</p>
                      <p className="text-xs text-moss mt-1">La prenda que quieres está disponible en tu ciudad. Acércate con la prenda y tu cédula: la asesora hace el cambio al momento, sin esperas ni fletes.</p>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-ink/15 bg-white p-4 text-sm">
                      <p className="font-medium">Envío a Bodega Central (Cali)</p>
                      <p className="text-xs text-moss mt-1">Al enviar la solicitud se abre tu guía de devolución lista para imprimir. Pégala en el paquete y entrégalo a la transportadora.</p>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <footer className="flex items-center justify-between gap-3 px-6 py-4 border-t border-ink/10 bg-ivory">
          <button
            onClick={() => (step === 0 ? onClose() : setStep((s) => s - 1))}
            className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.2em] text-moss"
          >
            <ChevronLeft className="w-4 h-4" /> {step === 0 ? "Cancelar" : "Atrás"}
          </button>
          {step < STEPS.length - 1 ? (
            <button
              disabled={!canNext}
              onClick={() => setStep((s) => s + 1)}
              className="inline-flex items-center gap-1 rounded-full bg-ink text-ivory px-6 py-3 text-[10px] uppercase tracking-[0.25em] disabled:opacity-40"
            >
              Continuar <ChevronRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              disabled={submit.isPending}
              onClick={() => submit.mutate()}
              className="rounded-full bg-ink text-ivory px-6 py-3 text-[10px] uppercase tracking-[0.25em] disabled:opacity-40"
            >
              {submit.isPending ? "Enviando…" : "Enviar solicitud"}
            </button>
          )}
        </footer>
      </motion.div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-moss/70 text-[11px] uppercase tracking-[0.18em]">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function RefundFlowNote({ kind }: { kind: "puntos" | "devolucion" }) {
  const steps = [
    {
      title: "Primero recibimos tu prenda",
      body: "Debe llegar a Bodega Central (Cali) con la guía de devolución que se genera al enviar la solicitud.",
    },
    {
      title: "La revisamos",
      body: "Verificamos que esté sin uso, con sus etiquetas y en el estado que nos contaste. Si algo no cuadra, te escribimos antes de seguir.",
    },
    {
      title: "Se genera tu devolución",
      body:
        kind === "puntos"
          ? "Aprobada la revisión, los Puntos Tu Marca se suman de inmediato a tu cuenta y puedes usarlos en tu próxima compra."
          : "Aprobada la revisión iniciamos el reembolso, que normalmente tarda entre 10 y 15 días hábiles según tu banco.",
    },
  ];

  return (
    <div className="rounded-2xl border border-ink/15 bg-white p-4">
      <p className="text-[10px] uppercase tracking-[0.2em] text-moss/70 mb-3">
        {kind === "puntos" ? "Cómo funciona la devolución en puntos" : "Cómo funciona la devolución de dinero"}
      </p>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-ink/20 text-[10px] text-moss">
              {i + 1}
            </span>
            <div>
              <p className="text-[13px] text-ink">{s.title}</p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-moss/80">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
