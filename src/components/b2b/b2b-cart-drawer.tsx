import { optimizedImageUrl } from "@/lib/media";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, Minus, Plus, Trash2, CheckCircle2, ArrowLeft, FileText } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useProfile } from "@/lib/auth-hooks";
import { B2B_CART_OPEN_EVENT, clearB2BCart, setB2BQty, useB2BCart } from "@/lib/b2b/cart";
import { formatMoney, useB2BSettings } from "@/lib/b2b/portal";
import { SignaturePad } from "./signature-pad";
import { Button } from "@/components/ui/button";

export function B2BCartDrawer() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"cart" | "terms" | "done">("cart");
  const items = useB2BCart();
  const { data: settings } = useB2BSettings();
  const { user } = useSession();
  const { data: profile } = useProfile();
  const qc = useQueryClient();

  const [accepted, setAccepted] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [signer, setSigner] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orderNumber, setOrderNumber] = useState("");

  useEffect(() => {
    const handler = () => { setOpen(true); setStep("cart"); };
    window.addEventListener(B2B_CART_OPEN_EVENT, handler);
    return () => window.removeEventListener(B2B_CART_OPEN_EVENT, handler);
  }, []);

  useEffect(() => {
    if (profile?.full_name && !signer) setSigner(profile.full_name);
  }, [profile, signer]);

  if (!settings) return null;
  const currency = settings.currency;
  const units = items.reduce((s, i) => s + i.qty, 0);
  const total = items.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const totalCop = items.reduce((s, i) => s + i.priceCop * i.qty, 0);
  const minOk = units >= settings.minUnits;
  const groupedItems = Object.values(items.reduce<Record<string, { title: string; image: string | null; lines: typeof items }>>((groups, item) => {
    const color = item.variantLabel.split(" · ").slice(1).join(" · ");
    const key = `${item.productId}:${color}`;
    if (!groups[key]) groups[key] = { title: `${item.productName}${color ? ` · ${color}` : ""}`, image: item.imageUrl, lines: [] };
    groups[key].lines.push(item);
    return groups;
  }, {}));

  const approve = async () => {
    if (!user || !items.length || !minOk || !accepted || !signature || !signer.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (items.some((item) => !item.restock)) throw new Error("Una o más tallas ya no tienen unidades disponibles en Ecommerce. Retíralas del pedido para continuar.");
      const { data: res, error: rse } = await (supabase.rpc as any)("create_b2b_restock_order", {
        _items: items.map((i) => ({ variant_id: i.variantId, qty: i.qty, unit_price_cop: i.priceCop, unit_price_usd: currency === "USD" ? i.unitPrice : null, product_name: i.productName, variant_label: i.variantLabel })),
        _currency: currency,
        _total_usd: total,
        _notes: notes || null,
        _signer: signer,
        _signature: signature ?? "",
        _terms_version: settings.termsVersion,
        _terms_text: settings.paymentTerms,
      });
      if (rse) throw rse;
      setOrderNumber((res as any).number);
      clearB2BCart();
      setStep("done");
      setSignature(null);
      setAccepted(false);
      qc.invalidateQueries({ queryKey: ["b2b-my-orders"] });
      qc.invalidateQueries({ queryKey: ["b2b-my-stats"] });
    } catch (e) {
      setError((e as { message?: string })?.message || "No pudimos registrar el pedido.");
      qc.invalidateQueries({ queryKey: ["b2b-restock-products"] });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="fixed inset-0 z-[60] bg-ink/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />
          <motion.aside
            className={`fixed inset-y-0 right-0 z-[61] w-full bg-[#f5f0e6] flex flex-col transition-[max-width] ${step === "terms" ? "sm:max-w-[840px]" : "sm:max-w-[440px]"}`}
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
          >
            <header className="h-14 px-5 flex items-center justify-between border-b border-ink/8">
              <div className="text-[11px] tracking-[0.2em] text-ink/60">
                 {step === "cart" ? "PEDIDO EN CURSO" : step === "terms" ? "HOJA DE PEDIDO WHOLESALE" : "PEDIDO APROBADO"}
              </div>
              <button onClick={() => setOpen(false)} aria-label="Cerrar"><X className="size-4 text-ink/60" /></button>
            </header>

            {step === "cart" && (
              <>
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                  {!items.length && <p className="text-sm text-ink/50 py-10 text-center">Aún no has agregado referencias.</p>}
                  {items.map((i) => (
                    <div key={i.variantId} className="bg-white rounded-2xl border border-ink/8 p-3 flex gap-3">
                      <div className="w-14 h-16 rounded-lg bg-[#f0e6d2] overflow-hidden shrink-0">
                        {i.imageUrl && <img src={optimizedImageUrl(i.imageUrl, 200)} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] truncate">{i.productName}</div>
                        <div className="text-[11px] text-ink/50">{i.variantLabel} · {i.sku}</div>
                        <div className="text-[12px] mt-1">{formatMoney(i.unitPrice, currency)}</div>
                        <div className="flex items-center gap-2 mt-2">
                          <button onClick={() => setB2BQty(i.variantId, i.qty - 1)} className="size-6 rounded-full border border-ink/15 flex items-center justify-center"><Minus className="size-3" /></button>
                          <span className="text-[12px] tabular-nums w-6 text-center">{i.qty}</span>
                          <button onClick={() => setB2BQty(i.variantId, i.qty + 1)} className="size-6 rounded-full border border-ink/15 flex items-center justify-center"><Plus className="size-3" /></button>
                          <button onClick={() => setB2BQty(i.variantId, 0)} className="ml-auto text-ink/40 hover:text-ink"><Trash2 className="size-3.5" /></button>
                        </div>
                      </div>
                      <div className="text-[12px] tabular-nums">{formatMoney(i.unitPrice * i.qty, currency)}</div>
                    </div>
                  ))}
                </div>
                <footer className="border-t border-ink/8 p-5 space-y-2 bg-[#f5f0e6]">
                  <div className="flex justify-between text-[12px] text-ink/60"><span>Unidades</span><span>{units}</span></div>
                  <div className="flex justify-between text-[15px]"><span>Total</span><strong className="font-serif italic">{formatMoney(total, currency)}</strong></div>
                  {!minOk && <p className="text-[11px] text-[#c85a3a]">Mínimo de {settings.minUnits} unidades por pedido.</p>}
                   <Button
                    disabled={!items.length || !minOk}
                    onClick={() => setStep("terms")}
                     className="w-full mt-2 bg-ink text-ivory text-[12px] py-3 rounded-md hover:bg-moss"
                  >
                     <FileText className="size-4" /> Crear nuevo pedido
                   </Button>
                  <p className="text-[10px] text-ink/45 text-center">Este pedido no requiere pago en línea.</p>
                </footer>
              </>
            )}

            {step === "terms" && (
              <>
                 <div className="flex-1 overflow-y-auto p-4 sm:p-8 space-y-6">
                   <Button variant="ghost" size="sm" onClick={() => setStep("cart")} className="text-ink/65 -ml-2"><ArrowLeft className="size-4" /> Volver al carrito</Button>
                   <div className="border-b border-ink/20 pb-5 flex flex-wrap gap-4 justify-between items-end">
                     <div>
                       <p className="text-[10px] tracking-[0.2em] text-ink/50 uppercase">Tu Marca · Wholesale</p>
                       <h2 className="font-serif italic text-3xl sm:text-4xl mt-2">Hoja de pedido</h2>
                       <p className="text-[12px] text-ink/60 mt-2">{profile?.full_name || user?.email || "Cliente mayorista"}</p>
                     </div>
                     <div className="text-right text-[11px] text-ink/60">
                       <p>{new Intl.DateTimeFormat("es-CO", { dateStyle: "long" }).format(new Date())}</p>
                       <p>Precios en {currency}</p>
                     </div>
                   </div>
                   <div className="space-y-5">
                     {groupedItems.map((group) => (
                       <section key={group.title} className="border-b border-ink/15 pb-4">
                         <div className="flex gap-3 items-center mb-3">
                           {group.image && <img src={optimizedImageUrl(group.image, 160)} alt="" className="w-11 h-14 object-cover rounded-sm" />}
                           <h3 className="font-nm text-[14px] font-medium">{group.title}</h3>
                         </div>
                         <div className="overflow-x-auto">
                           <table className="hidden sm:table w-full min-w-[570px] text-[12px] text-left tabular-nums">
                             <thead className="text-[10px] uppercase tracking-[0.12em] text-ink/50 border-b border-ink/10"><tr><th className="pb-2 font-normal">SKU</th><th className="pb-2 font-normal">Talla / color</th><th className="pb-2 font-normal text-center">Cant.</th><th className="pb-2 font-normal text-right">Precio unitario</th><th className="pb-2 font-normal text-right">Subtotal</th></tr></thead>
                             <tbody>{group.lines.map((i) => <tr key={i.variantId} className="border-b border-ink/5 last:border-0">
                               <td className="py-3 pr-3 font-mono text-[11px]">{i.sku}</td>
                               <td className="py-3 pr-3">{i.variantLabel}</td>
                               <td className="py-3 text-center"><input aria-label={`Cantidad de ${i.sku}`} type="number" min={0} value={i.qty} onChange={(e) => setB2BQty(i.variantId, Math.max(0, Math.floor(Number(e.target.value) || 0)))} className="w-16 text-center bg-white border border-ink/15 rounded-sm py-1" /></td>
                               <td className="py-3 text-right">{formatMoney(i.unitPrice, currency)}</td>
                               <td className="py-3 text-right">{formatMoney(i.unitPrice * i.qty, currency)}</td>
                             </tr>)}</tbody>
                           </table>
                         </div>
                         <div className="sm:hidden divide-y divide-ink/10">
                           {group.lines.map((i) => <div key={i.variantId} className="py-3 space-y-2 text-[12px]">
                             <div className="flex justify-between gap-2"><span className="font-mono text-[11px] text-ink/60 break-all">{i.sku} · {i.variantLabel}</span><strong>{formatMoney(i.unitPrice * i.qty, currency)}</strong></div>
                             <div className="flex items-center justify-between gap-2"><span className="text-ink/60">{formatMoney(i.unitPrice, currency)} / unidad</span><label className="flex items-center gap-2">Cant. <input aria-label={`Cantidad de ${i.sku}`} type="number" min={0} value={i.qty} onChange={(e) => setB2BQty(i.variantId, Math.max(0, Math.floor(Number(e.target.value) || 0)))} className="w-16 text-center bg-white border border-ink/15 rounded-sm py-1" /></label></div>
                           </div>)}
                         </div>
                       </section>
                     ))}
                   </div>
                   <div className="flex justify-end"><div className="min-w-[220px] space-y-2 border-t border-ink/30 pt-3 text-[13px]"><div className="flex justify-between"><span>Unidades</span><span>{units}</span></div><div className="flex justify-between text-[16px]"><strong>Total</strong><strong>{formatMoney(total, currency)}</strong></div></div></div>
                   <section className="rounded-2xl border border-moss/40 bg-white p-4 text-[12px] leading-relaxed text-ink/80">
                     <div className="text-[10px] tracking-[0.2em] text-moss mb-1">VENTA EN FIRME</div>
                     Todas las unidades quedan reservadas en Ecommerce al confirmar. El pago se realiza al momento del despacho.
                   </section>
                   <section className="border-t border-ink/15 pt-5">
                     <div className="text-[10px] tracking-[0.2em] text-ink/50 mb-2">CONDICIONES DE PAGO</div>
                     <p className="text-[12px] leading-relaxed text-ink/75 whitespace-pre-line">{settings.paymentTerms}</p>
                   </section>
                  <label className="flex items-start gap-2 text-[12px] text-ink/75">
                    <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5" />
                    He leído y acepto las condiciones de pago ({settings.termsVersion}).
                  </label>
                  <div>
                    <div className="text-[10px] tracking-[0.16em] text-ink/50 mb-1">NOMBRE DE QUIEN APRUEBA</div>
                    <input value={signer} onChange={(e) => setSigner(e.target.value)} className="w-full bg-white border border-ink/15 rounded-xl px-3 py-2 text-[13px] outline-none" />
                  </div>
                  <div>
                    <div className="text-[10px] tracking-[0.16em] text-ink/50 mb-1">FIRMA</div>
                    <SignaturePad value={signature} onChange={setSignature} />
                  </div>
                  <div>
                    <div className="text-[10px] tracking-[0.16em] text-ink/50 mb-1">NOTAS PARA EL EQUIPO (OPCIONAL)</div>
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="w-full bg-white border border-ink/15 rounded-xl px-3 py-2 text-[13px] outline-none" />
                  </div>
                  {error && <p className="text-[12px] text-[#c85a3a]">{error}</p>}
                </div>
                <footer className="border-t border-ink/8 p-5 space-y-2">
                  <div className="flex justify-between text-[15px]"><span>Total</span><strong className="font-serif italic">{formatMoney(total, currency)}</strong></div>
                   {!minOk && <p className="text-[11px] text-destructive">Mínimo de {settings.minUnits} unidades por pedido.</p>}
                   <Button
                     disabled={!items.length || !minOk || !accepted || !signature || !signer.trim() || saving}
                    onClick={approve}
                     className="w-full bg-ink text-ivory text-[12px] py-3 rounded-md hover:bg-moss"
                  >
                     {saving ? "Registrando…" : "Firmar y confirmar pedido"}
                   </Button>
                </footer>
              </>
            )}

            {step === "done" && (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-3">
                <CheckCircle2 className="size-10 text-moss" />
                <div className="font-serif italic text-2xl">Pedido aprobado</div>
                <p className="text-[12px] text-ink/60">Tu pedido <strong>{orderNumber}</strong> quedó registrado, firmado y reservado en Ecommerce. El pago se realiza al momento del despacho.</p>
                <button onClick={() => setOpen(false)} className="mt-3 bg-ink text-ivory text-[12px] px-6 py-3 rounded-full">Cerrar</button>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
