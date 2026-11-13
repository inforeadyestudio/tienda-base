import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Camera, Mail, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { formatCOP, formatDate } from "@/lib/format";
import { displaySize } from "@/lib/size-order";
import { sendReturnCreditNote } from "@/lib/returns/returns.functions";

type OrderItem = { id: string; variant_id: string; qty: number; unit_price_cop: number; product_name: string; variant_label: string | null; product_variants: { sku: string | null; size: string | null; products: { hero_image_url: string | null } | null } | null };
type FoundOrder = { id: string; number: string; source: string; customer_id: string | null; contact_name: string | null; contact_phone: string | null; contact_email: string | null; created_at: string; total_cop: number; order_items: OrderItem[] };
type Reason = "talla" | "decision" | "defecto";
type Pick = { qty: number; reason: Reason | null; condition: "ok" | "defect" | null; file: File | null; preview: string | null };
type Received = { return_id: string; credit_code: string; amount_cop: number; refund_token: string; order_number: string };

const REASONS: { id: Reason; label: string }[] = [
  { id: "talla", label: "Cambio por talla" },
  { id: "decision", label: "Cambio por decisión propia" },
  { id: "defecto", label: "Cambio por defecto" },
];
const REASON_LABEL: Record<Reason, string> = { talla: "Cambio por talla", decision: "Cambio por decisión propia", defecto: "Cambio por defecto" };
const SOURCE_LABEL: Record<string, string> = { ecom: "Online", pos: "Tienda", assisted: "Venta asistida" };
const RETURN_CREDIT_KEY = "pos-return-credit";

export function ReturnReceiveModal({ locationId, locationName, sede, initialOrderNumber, onClose }: { locationId: string; locationName: string; sede?: string; initialOrderNumber?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const sendNote = useServerFn(sendReturnCreditNote);
  const [q, setQ] = useState(initialOrderNumber ?? "");
  const autoRan = useRef(false);
  useEffect(() => { if (initialOrderNumber && !autoRan.current) { autoRan.current = true; void search(); } }, [initialOrderNumber]);
  const [results, setResults] = useState<FoundOrder[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [order, setOrder] = useState<FoundOrder | null>(null);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [note, setNote] = useState("");
  const [received, setReceived] = useState<Received | null>(null);
  const [defects, setDefects] = useState<{ name: string; label: string; qty: number; reason: string; url: string | null }[]>([]);
  const [refundDone, setRefundDone] = useState(false);

  const { data: contacts } = useQuery({
    queryKey: ["returns-contacts"],
    queryFn: async () => ((await supabase.from("app_settings").select("value").eq("key", "returns_contacts").maybeSingle()).data?.value ?? {}) as { manager?: string; production?: string; accounting?: string },
  });

  const search = async () => {
    const term = q.trim();
    if (!term) return;
    setSearching(true);
    try {
      const sel = "id, number, source, customer_id, contact_name, contact_phone, contact_email, created_at, total_cop, order_items(id, variant_id, qty, unit_price_cop, product_name, variant_label, product_variants(sku, size, products(hero_image_url)))";
      const digits = term.replace(/\D/g, "");
      const ors = [`number.ilike.%${term}%`];
      const { data: invs } = await supabase.from("invoices").select("order_id").or(`number.ilike.%${term}%,external_id.eq.${term.replace(/[,()]/g, "")}`).limit(10);
      const invIds = (invs ?? []).map((i) => i.order_id).filter(Boolean);
      if (invIds.length) ors.push(`id.in.(${invIds.join(",")})`);
      if (digits.length >= 5) {
        ors.push(`contact_phone.ilike.%${digits}%`, `invoice_document.eq.${digits}`);
        const { data: profs } = await supabase.from("profiles").select("id").or(`document_id.eq.${digits},phone.ilike.%${digits}%`).limit(10);
        if (profs?.length) ors.push(`customer_id.in.(${profs.map((p) => p.id).join(",")})`);
      }
      const { data, error } = await supabase.from("orders").select(`${sel}, returns(id, status)`)
        .in("status", ["paid", "preparing", "shipped", "delivered"])
        .or(ors.join(",")).order("created_at", { ascending: false }).limit(15);
      if (error) throw error;
      const all = (data ?? []) as unknown as (FoundOrder & { returns?: { status: string | null }[] })[];
      const list = all.filter((o) => !(o.returns ?? []).some((r) => r.status !== "rechazado"));
      if (all.length && !list.length) toast.error("Este pedido ya tuvo una devolución; no se puede hacer otra.");
      setResults(list);
      if (list.length === 1) choose(list[0]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo buscar");
    } finally { setSearching(false); }
  };

  const choose = (o: FoundOrder) => { setOrder(o); setPicks({}); };
  const selected = useMemo(() => (order?.order_items ?? []).filter((i) => picks[i.id]), [order, picks]);
  const total = selected.reduce((s, i) => s + i.unit_price_cop * picks[i.id].qty, 0);
  const incomplete = selected.some((i) => { const p = picks[i.id]; return !p.reason || !p.condition || (p.condition === "defect" && !p.file); });

  const update = (id: string, patch: Partial<Pick>) => setPicks((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  const receive = useMutation({
    mutationFn: async () => {
      if (!order) throw new Error("Elige el pedido");
      const items = [];
      const defectInfo: typeof defects = [];
      for (const i of selected) {
        const p = picks[i.id];
        let photo_path: string | null = null;
        if (p.condition === "defect" && p.file) {
          const ext = (p.file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
          photo_path = `${order.id}/${Date.now()}-${i.id.slice(0, 6)}.${ext}`;
          const { error } = await supabase.storage.from("returns").upload(photo_path, p.file, { contentType: p.file.type || "image/jpeg" });
          if (error) throw new Error("No se pudo subir la foto: " + error.message);
          const { data: signed } = await supabase.storage.from("returns").createSignedUrl(photo_path, 60 * 60 * 24 * 7);
          defectInfo.push({ name: i.product_name, label: displaySize(i.product_variants?.size ?? i.variant_label), qty: p.qty, reason: REASON_LABEL[p.reason!], url: signed?.signedUrl ?? null });
        }
        items.push({
          variant_id: i.variant_id, qty: p.qty, reason_code: p.reason, condition: p.condition, photo_path,
          unit_price_cop: i.unit_price_cop, name: i.product_name, variant_label: i.variant_label, sku: i.product_variants?.sku ?? null,
        });
      }
      const { data, error } = await supabase.rpc("pos_receive_return" as any, { _location_id: locationId, _order_id: order.id, _items: items, _note: note || null });
      if (error) throw error;
      setDefects(defectInfo);
      return data as unknown as Received;
    },
    onSuccess: (d) => {
      setReceived(d);
      qc.invalidateQueries({ queryKey: ["returns"] });
      qc.invalidateQueries({ queryKey: ["pos-variants"] });
      qc.invalidateQueries({ queryKey: ["pos-inventory"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const refund = useMutation({
    mutationFn: async () => {
      if (!received) return;
      const { error } = await supabase.rpc("resolve_return_refund" as any, { _return_id: received.return_id });
      if (error) throw error;
      const r = await sendNote({ data: { returnId: received.return_id, withPayable: true } });
      if (!r.ok) toast.warning(r.message);
      else toast.success("Nota crédito y cuenta por pagar enviadas a R-Count");
    },
    onSuccess: () => { setRefundDone(true); qc.invalidateQueries({ queryKey: ["returns"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const goExchange = async () => {
    if (!received || !order) return;
    const r = await sendNote({ data: { returnId: received.return_id, withPayable: false } });
    if (!r.ok) toast.warning(r.message);
    else toast.success("Nota crédito enviada a R-Count como cambio");
    qc.invalidateQueries({ queryKey: ["returns"] });
    if (!sede) { onClose(); return; }
    sessionStorage.setItem(RETURN_CREDIT_KEY, JSON.stringify({
      returnId: received.return_id, amount: received.amount_cop, code: received.credit_code, orderNumber: received.order_number,
      customer: { id: order.customer_id, name: order.contact_name ?? "Cliente", email: order.contact_email, phone: order.contact_phone },
    }));
    onClose();
    navigate({ to: "/pos/$sede", params: { sede } });
  };

  const defectMailto = () => {
    const to = [contacts?.manager, contacts?.production].filter(Boolean).join(",");
    const body = [
      `Devolución por defecto recibida en ${locationName}`,
      `Pedido: ${received?.order_number}`,
      `Cliente: ${order?.contact_name ?? "—"}`,
      "",
      ...defects.map((d) => `- ${d.name} · ${d.label} · ${d.qty} und · ${d.reason}${d.url ? `\n  Foto: ${d.url}` : ""}`),
      "",
      "Las prendas ingresaron al inventario de la tienda como Calidad C (Devuelto).",
    ].join("\n");
    return `mailto:${to}?subject=${encodeURIComponent(`Prenda defectuosa · pedido ${received?.order_number}`)}&body=${encodeURIComponent(body)}`;
  };

  const refundLink = received ? `${window.location.origin}/devolucion-dinero/${received.refund_token}` : "";
  const customerMailto = () => {
    const body = [
      `Hola ${order?.contact_name ?? ""},`,
      "",
      `Recibimos la devolución de tu pedido ${received?.order_number} por ${formatCOP(received?.amount_cop ?? 0)}. Para devolverte el dinero necesitamos que envíes al correo ${contacts?.accounting || "de contabilidad"}:`,
      "",
      `1. Carta de solicitud de devolución de dinero. Puedes generarla aquí: ${refundLink}`,
      "2. Fotocopia de tu cédula.",
      "3. Certificación bancaria a tu nombre.",
      "",
      "Una vez recibamos los documentos, contabilidad procesa la devolución.",
      "",
      "Tu Marca",
    ].join("\n");
    return `mailto:${order?.contact_email ?? ""}?subject=${encodeURIComponent("Tu devolución de dinero · Tu Marca")}&body=${encodeURIComponent(body)}`;
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-3xl max-h-[92vh] overflow-y-auto bg-ivory rounded-3xl p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-moss/70">{locationName}</p>
            <h2 className="font-serif italic text-2xl">Recibir cambio o devolución</h2>
          </div>
          <button onClick={onClose} aria-label="Cerrar"><X className="size-5" /></button>
        </div>

        {received ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-ink/10 bg-white p-5 text-center">
              <p className="text-sm">Devolución recibida y prendas ingresadas al inventario.</p>
              <p className="text-xs text-moss/70 mt-1">Saldo a favor del cliente</p>
              <p className="text-3xl mt-1">{formatCOP(received.amount_cop)}</p>
              <p className="font-mono text-xs text-moss mt-1">{received.credit_code}</p>
            </div>

            {defects.length > 0 && (
              <div className="rounded-2xl border border-clay/30 bg-white p-4 text-sm space-y-2">
                <p>Hay prendas con defecto. Avisa a gerencia y producción:</p>
                {contacts?.manager || contacts?.production ? (
                  <a href={defectMailto()} className="inline-flex items-center gap-2 rounded-full border border-ink/15 px-4 py-2 text-xs hover:border-ink"><Mail className="size-3.5" /> Enviar aviso con foto</a>
                ) : (
                  <p className="text-xs text-clay">Falta configurar los correos de gerente y producción en Admin → Cambios y devoluciones.</p>
                )}
              </div>
            )}

            {refundDone ? (
              <div className="rounded-2xl border border-ink/10 bg-white p-4 text-sm space-y-3">
                <p>Devolución de dinero registrada. Nota crédito y cuenta por pagar enviadas a R-Count.</p>
                <p className="text-xs text-moss/70">Envía al cliente el paso a paso con el enlace para generar su carta:</p>
                <div className="flex flex-wrap gap-2">
                  <a href={customerMailto()} className="inline-flex items-center gap-2 rounded-full bg-ink text-ivory px-4 py-2 text-xs"><Mail className="size-3.5" /> Correo al cliente</a>
                  <button onClick={() => { navigator.clipboard.writeText(refundLink); toast.success("Enlace copiado"); }} className="rounded-full border border-ink/15 px-4 py-2 text-xs">Copiar enlace del formulario</button>
                </div>
                <button onClick={onClose} className="w-full mt-2 rounded-full border border-ink/15 py-3 text-sm">Listo</button>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                <button onClick={goExchange} className="rounded-2xl bg-ink text-ivory p-5 text-left">
                  <p className="text-sm font-medium">Cambio por otro producto</p>
                  <p className="text-xs opacity-70 mt-1">{sede ? "Pasa a caja con el saldo aplicado. La prenda nueva debe valer igual o más." : "Envía la nota crédito como cambio; el saldo se usa en la caja de la tienda con el código."}</p>
                </button>
                <button onClick={() => refund.mutate()} disabled={refund.isPending} className="rounded-2xl border border-ink/15 bg-white p-5 text-left disabled:opacity-50">
                  <p className="text-sm font-medium">{refund.isPending ? "Procesando…" : "Devolución del dinero"}</p>
                  <p className="text-xs text-moss/70 mt-1">Genera nota crédito y cuenta por pagar en R-Count.</p>
                </button>
              </div>
            )}
          </div>
        ) : !order ? (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} autoFocus
                placeholder="Número de pedido o de factura (también cédula o teléfono)"
                className="flex-1 px-4 py-3 rounded-2xl border border-ink/15 outline-none focus:border-ink text-sm bg-white" />
              <button onClick={search} disabled={searching} className="rounded-2xl bg-ink text-ivory px-5 flex items-center gap-2 text-sm"><Search className="size-4" /> Buscar</button>
            </div>
            {results?.length === 0 && <p className="text-sm text-moss/70">No encontramos compras con ese dato.</p>}
            <div className="space-y-2">
              {results?.map((o) => (
                <button key={o.id} onClick={() => choose(o)} className="w-full text-left rounded-2xl border border-ink/10 bg-white p-4 hover:border-ink/40">
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{o.number} · <span className="text-moss/70">{SOURCE_LABEL[o.source] ?? o.source}</span></p>
                      <p className="text-xs text-moss/70">{o.contact_name ?? "Cliente"} · {o.contact_phone ?? "—"} · {formatDate(o.created_at)}</p>
                    </div>
                    <span className="text-sm">{formatCOP(o.total_cop)}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="flex justify-between items-center text-sm rounded-2xl bg-white border border-ink/10 p-4">
              <div>
                <p><b>{order.number}</b> · {SOURCE_LABEL[order.source] ?? order.source}</p>
                <p className="text-xs text-moss/70">{order.contact_name ?? "Cliente"} · {order.contact_phone ?? "—"} · {formatDate(order.created_at)}</p>
              </div>
              <button onClick={() => setOrder(null)} className="text-xs underline text-moss">Cambiar pedido</button>
            </div>

            <p className="text-[10px] uppercase tracking-widest text-moss/70">Marca las prendas que devuelve</p>
            <div className="space-y-3">
              {order.order_items.map((i) => {
                const p = picks[i.id];
                const img = i.product_variants?.products?.hero_image_url;
                return (
                  <div key={i.id} className={"rounded-2xl border bg-white p-3 space-y-3 " + (p ? "border-ink/40" : "border-ink/10")}>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input type="checkbox" checked={!!p} onChange={(e) => setPicks((s) => { const n = { ...s }; if (e.target.checked) n[i.id] = { qty: 1, reason: null, condition: null, file: null, preview: null }; else delete n[i.id]; return n; })} />
                      <div className="size-12 rounded-xl bg-ink/5 overflow-hidden shrink-0">{img && <img src={img} alt="" className="size-full object-cover" />}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate">{i.product_name}</p>
                        <p className="text-xs text-moss/70">Talla {displaySize(i.product_variants?.size ?? i.variant_label)} · {formatCOP(i.unit_price_cop)} · {i.qty} und</p>
                      </div>
                      {p && i.qty > 1 && (
                        <select value={p.qty} onClick={(e) => e.stopPropagation()} onChange={(e) => update(i.id, { qty: Number(e.target.value) })} className="rounded-full border border-ink/15 px-3 py-1 text-xs bg-white">
                          {Array.from({ length: i.qty }, (_, k) => k + 1).map((n) => <option key={n} value={n}>{n} und</option>)}
                        </select>
                      )}
                    </label>
                    {p && (
                      <div className="pl-7 space-y-3">
                        <div>
                          <p className="text-[11px] text-moss/70 mb-1.5">Causal</p>
                          <div className="flex flex-wrap gap-1.5">
                            {REASONS.map((r) => (
                              <button key={r.id} onClick={() => update(i.id, { reason: r.id, ...(r.id === "defecto" ? { condition: "defect" as const } : {}) })}
                                className={"px-3 py-1.5 rounded-full text-xs border " + (p.reason === r.id ? "bg-ink text-ivory border-ink" : "bg-white border-ink/15")}>{r.label}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-[11px] text-moss/70 mb-1.5">Estado de la prenda</p>
                          <div className="flex flex-wrap gap-1.5">
                            <button onClick={() => update(i.id, { condition: "ok", file: null, preview: null })} className={"px-3 py-1.5 rounded-full text-xs border " + (p.condition === "ok" ? "bg-ink text-ivory border-ink" : "bg-white border-ink/15")}>Buena · vuelve a su talla</button>
                            <button onClick={() => update(i.id, { condition: "defect" })} className={"px-3 py-1.5 rounded-full text-xs border " + (p.condition === "defect" ? "bg-clay text-ivory border-clay" : "bg-white border-ink/15")}>Defectuosa · entra como Calidad C</button>
                          </div>
                        </div>
                        {p.condition === "defect" && (
                          <label className="flex items-center gap-3 cursor-pointer">
                            <span className="inline-flex items-center gap-2 rounded-full border border-dashed border-ink/30 px-4 py-2 text-xs"><Camera className="size-3.5" /> {p.file ? "Cambiar foto" : "Adjuntar foto (obligatoria)"}</span>
                            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0] ?? null; update(i.id, { file: f, preview: f ? URL.createObjectURL(f) : null }); }} />
                            {p.preview && <img src={p.preview} alt="Foto de la prenda" className="size-14 rounded-xl object-cover" />}
                          </label>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {selected.length > 0 && (
              <>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Observación (opcional)" className="w-full px-4 py-2.5 rounded-2xl border border-ink/15 text-sm bg-white" />
                <div className="flex justify-between rounded-2xl border border-ink/10 bg-white p-4 text-sm">
                  <span>Saldo a favor que queda</span><span className="font-medium">{formatCOP(total)}</span>
                </div>
              </>
            )}

            <button disabled={selected.length === 0 || incomplete || receive.isPending} onClick={() => receive.mutate()}
              className="w-full bg-ink text-ivory py-3.5 rounded-full text-sm disabled:opacity-40">
              {receive.isPending ? "Procesando…" : incomplete ? "Marca causal, estado y foto si es defectuosa" : "Aceptar devolución e ingresar al inventario"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
