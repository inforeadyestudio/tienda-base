import { previewUsdCode } from "@/lib/promotions.functions";
import { documentError } from "@/lib/checkout/document-rule";
import { loyaltyConfigQuery, myPointsQuery, pointsDiscountUsd, redeemablePoints } from "@/lib/loyalty";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { clearAppSettingsBatch } from "@/lib/public-settings";
import { useServerFn } from "@tanstack/react-start";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, ChevronDown, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { track, analyticsSessionId } from "@/lib/analytics";
import { useSession } from "@/lib/auth-hooks";
import { itemUsd, refreshCartPrices, useCart, type CartItem } from "@/lib/cart";
import { EMPTY_SHIP_TO, closeCheckout, computeTotals, dispatchOrigins, pickupDelivery, placeOrder, prepareHostedOrder, shipDelivery, useCheckoutSheet } from "@/lib/checkout/engine";
import { suggestPostalCode } from "@/lib/co-postal";
import { placeGuestOrder } from "@/lib/checkout/guest-checkout.functions";
import { holdToken, resetHoldToken, useCheckoutHold, type HoldState } from "@/lib/checkout/stock-hold";
import { saveCheckoutLead } from "@/lib/email/leads.functions";
import { authorizePayment, type PaymentMethod } from "@/lib/checkout/payment";
import { cn } from "@/lib/utils";
import { includedTax, shippingItemsQuery, shippingSettingsQuery, taxSettingsQuery } from "@/lib/store-settings";
import { intlSettingsQuery, intlShippingUsd, itemsWeightKg } from "@/lib/international";
import { paymentMethodsFor, paymentsSettingsQuery, type PaymentMethodId } from "@/lib/payments";
import { copToUsd, currencyForCountry, formatMoney, isColombia as isColombianCountry, matchCountry, useLocale, visitorAllowsLocalGateways } from "@/lib/locale";
import { HostedPaymentButton } from "@/components/checkout/hosted-payment-button";
import { TransferDetails, TransferProofPicker, TransferProofUpload } from "@/components/checkout/transfer-proof";
import { abandonPreparedCheckout, attachTransferProof, findOrderByPaymentReference } from "@/lib/payments.functions";
import { VoiceFill } from "@/components/checkout/voice-fill";
import { ExitIntent } from "@/components/checkout/exit-intent";
import type { VoiceFields } from "@/lib/checkout/voice-parse";
import addiLogo from "@/assets/addi-logo-black.png";
import { GeoSelect } from "@/components/checkout/geo-select";
import { COUNTRIES, regionsFor } from "@/lib/geo";

type Step = "details" | "delivery" | "payment";
type Form = {
  firstName: string; lastName: string; documentId: string; email: string; phone: string;
  line1: string; line2: string; city: string; department: string; postalCode: string;
  country: string;
};

const EMPTY_FORM: Form = { firstName: "", lastName: "", documentId: "", email: "", phone: "", line1: "", line2: "", city: "", department: "", postalCode: "", country: "Colombia" };
const detailsSchemaFor = (requireDocument: boolean) => z.object({
  firstName: z.string().trim().min(2, "Escribe tu nombre").max(80),
  lastName: z.string().trim().min(2, "Escribe tu apellido").max(80),
  // Obligatorio en todos los países: R-Count no factura sin documento (cédula o pasaporte).
  documentId: z.string().trim().superRefine((value, ctx) => {
    const message = documentError(value, requireDocument);
    if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  }),
  email: z.string().trim().email("Revisa tu correo").max(255),
  phone: z.string().trim().min(7, "Revisa tu teléfono").max(30),
});
const deliverySchema = z.object({
  line1: z.string().trim().min(5, "Escribe tu dirección").max(180),
  line2: z.string().trim().max(120),
  city: z.string().trim().min(2, "Escribe tu ciudad").max(100),
  department: z.string().trim().min(2, "Escribe tu departamento").max(100),
  postalCode: z.string().trim().min(4, "Escribe tu código postal").max(12),
  country: z.string().trim().min(2, "Escribe tu país").max(100),
});

export function CheckoutSheet() {
  const { open, buyNow } = useCheckoutSheet();
  const cart = useCart();
  const { user } = useSession();
  const createGuestOrder = useServerFn(placeGuestOrder);
  const navigate = useNavigate();
  const attachProof = useServerFn(attachTransferProof);
  const findPaidOrder = useServerFn(findOrderByPaymentReference);
  const abandonPrepared = useServerFn(abandonPreparedCheckout);
  const [releasing, setReleasing] = useState(false);
  const [proofPath, setProofPath] = useState<string | null>(null);
  const items: CartItem[] = buyNow ? [buyNow] : cart.items;
  const [step, setStep] = useState<Step>("details");
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [placing, setPlacing] = useState(false);
  const holdReady = useRef(false);
  const [done, setDone] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [policyOpen, setPolicyOpen] = useState(false);
  const locale = useLocale();
  const { data: shippingSettings } = useQuery(shippingSettingsQuery());
  const { data: taxSettings } = useQuery(taxSettingsQuery());
  const { data: shippingItems } = useQuery(shippingItemsQuery(items));
  const { data: intl } = useQuery(intlSettingsQuery());

  const isColombia = isColombianCountry(form.country);
  const international = currencyForCountry(form.country) === "USD";
  const detailsSchema = useMemo(() => detailsSchemaFor(isColombia), [isColombia]);
  const rate = intl?.usdRate ?? 4000;
  const money = (cop: number, usd?: number | null) => formatMoney(cop, international ? "USD" : "COP", usd ?? null, rate);

  const subtotalCop = items.reduce((sum, item) => sum + item.priceCop * item.qty, 0);
  const subtotalUsd = items.reduce((sum, item) => sum + itemUsd(item, rate) * item.qty, 0);
  const missingUsd = international && items.some((item) => !itemUsd(item));
  const nationalDelivery = shipDelivery(subtotalCop, shippingSettings, shippingItems ?? items, form.country, form.department, !!user);
  const intlQuote = intl && international ? intlShippingUsd(intl, form.country, copToUsd(subtotalCop, rate), itemsWeightKg(shippingItems)) : null;
  const shipBasedDelivery = intlQuote
    ? { ...nationalDelivery, cost: intlQuote.costUsd * rate, label: intlQuote.costUsd === 0 ? "Free international shipping" : `${intlQuote.label} · international shipping`, eta: "10 – 15 business days" }
    : nationalDelivery;

  // Si alguna pieza solo existe en una tienda, se puede recoger allí o pedir envío.
  const variantIds = items.map((item) => item.variantId).filter((id) => !id.endsWith("-look"));
  const { data: pickupStores = [] } = useQuery({
    queryKey: ["checkout-pickup-stores", variantIds.join(",")],
    enabled: open && isColombia && variantIds.length > 0,
    queryFn: () => dispatchOrigins(variantIds),
  });
  const [deliveryMode, setDeliveryMode] = useState<"ship" | "pickup">("ship");
  const pickupStore = pickupStores[0] ?? null;
  // Recoger en tienda no se ofrece: el origen de la tienda es solo interno.
  const pickupActive = false && deliveryMode === "pickup" && Boolean(pickupStore) && isColombia;
  const delivery = pickupActive && pickupStore ? pickupDelivery(pickupStore) : shipBasedDelivery;
  const totals = computeTotals(items, delivery);
  const { data: loyaltyCfg } = useQuery(loyaltyConfigQuery());
  const { data: pointsBalance = 0 } = useQuery(myPointsQuery(user?.id));
  const validateCode = useServerFn(previewUsdCode);
  const { data: codeExceptions = [] } = useQuery({
    queryKey: ["points-code-exceptions", user?.id],
    enabled: open && Boolean(user?.id),
    staleTime: 0,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase.from("points_code_exceptions").select("code").eq("customer_id", user.id).eq("active", true).is("used_order_id", null).is("claimed_order_id", null);
      if (error) throw error;
      return data ?? [];
    },
  });
  const [promoCode, setPromoCode] = useState("");
  const [appliedCode, setAppliedCode] = useState<{code:string;discountUsd:number; discountCop:number; subtotalUsd:number; subtotalCop:number; key:string} | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);
  const promoKey = items.map(i => `${i.variantId}:${i.qty}`).sort().join("|") + `:${user?.id ?? "guest"}:${international}:${subtotalCop}:${subtotalUsd}`;
  const validCode = appliedCode?.key === promoKey ? appliedCode : null;
  const codeUsd = international ? validCode?.discountUsd ?? 0 : 0;
  const codeCop = validCode?.discountCop ?? 0;
  const canCombine = Boolean(validCode && codeExceptions.some(e => e.code === validCode.code));
  const applyCode = async () => { setCodeBusy(true); try { const result = await validateCode({data:{code:promoCode,currency:international ? "USD" : "COP",items:items.map(i=>({variantId:i.variantId,qty:i.qty}))}}); if (Math.abs(result.subtotalUsd-subtotalUsd)>0.01 || result.subtotalCop !== subtotalCop) throw new Error("Los precios cambiaron; vuelve a abrir tu compra."); setAppliedCode({...result,key:promoKey}); if (!codeExceptions.some(e => e.code === result.code)) { setUsePoints(false); setPointsInput(""); } toast.success("Código aplicado"); } catch(e) {setAppliedCode(null);toast.error(e instanceof Error ? e.message : "No pudimos aplicar el código");} finally {setCodeBusy(false);} };
  const [usePoints, setUsePoints] = useState(false);
  const [pointsInput, setPointsInput] = useState("");
  const saleBlocksPoints = !!loyaltyCfg?.sale_no_points && items.some((i) => (i.compareCop ?? 0) > i.priceCop || (i.compareUsd ?? 0) > (i.priceUsd ?? 0));
  const availablePoints = redeemablePoints(loyaltyCfg, pointsBalance, totals.subtotal, "online");
  const combinedMax = loyaltyCfg && loyaltyCfg.point_value_cop > 0 ? Math.min(availablePoints, Math.floor(Math.max(subtotalCop-codeCop,0)/loyaltyCfg.point_value_cop), Math.floor(Math.max(subtotalUsd-codeUsd,0)*rate/loyaltyCfg.point_value_cop)) : 0;
  const redeemPts = user && !saleBlocksPoints && (!validCode || canCombine) ? (canCombine ? (combinedMax >= (loyaltyCfg?.min_redeem_points ?? 0) ? combinedMax : 0) : availablePoints) : 0;
  const minimumPoints = loyaltyCfg?.min_redeem_points ?? 0;
  const requestedPoints = Math.max(0, Math.floor(Number(pointsInput) || 0));
  const pointsToUse = usePoints ? Math.min(requestedPoints, redeemPts) : 0;
  const validPointRedemption = !usePoints || (pointsToUse >= minimumPoints && pointsToUse <= redeemPts);
  const pointsDiscount = pointsToUse ? Math.floor(pointsToUse * (loyaltyCfg?.point_value_cop ?? 0)) : 0;
  const earnedPoints = !usePoints && !saleBlocksPoints && user && loyaltyCfg?.enabled && loyaltyCfg.point_value_cop > 0
    ? Math.floor(totals.subtotal * loyaltyCfg.earn_pct / 100 / loyaltyCfg.point_value_cop)
    : 0;
  const payable = Math.max(totals.total - pointsDiscount - codeCop, 0);
  const tax = taxSettings ? includedTax(taxSettings, totals.subtotal, form.country) : null;

  const { data: payments } = useQuery(paymentsSettingsQuery());
  const [allowLocal, setAllowLocal] = useState(true);
  useEffect(() => { if (open) setAllowLocal(visitorAllowsLocalGateways()); }, [open]);
  useEffect(() => { if (open) void refreshCartPrices(); }, [open]);
  // Ajustes de envío, impuestos, pagos e internacional en vivo al abrir el pago (sin caché).
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!open) return;
    clearAppSettingsBatch();
    void queryClient.refetchQueries({ queryKey: ["store-settings"], type: "all" });
  }, [open, queryClient]);
  const gateways = paymentMethodsFor(form.country, payments, intl, allowLocal);
  const [gateway, setGateway] = useState<PaymentMethodId>("wompi");
  const selectedGateway = gateways.some((option) => option.id === gateway) ? gateway : gateways[0]?.id;
  const gatewayAvailable = Boolean(selectedGateway);
  useEffect(() => {
    if (selectedGateway && selectedGateway !== gateway) setGateway(selectedGateway);
  }, [gateways, gateway, selectedGateway]);
  const method: PaymentMethod = selectedGateway === "addi" ? "cod" : selectedGateway === "transfer" ? "transfer" : "card";
  const totalUsd = subtotalUsd + (totals.shipping ? copToUsd(totals.shipping, rate) : 0);
  const pointsUsd = international ? pointsDiscountUsd(pointsDiscount, rate) : 0;
  const payableUsd = Math.max(Math.round((totalUsd - pointsUsd - codeUsd) * 100) / 100, 0);
  const [doneMethod, setDoneMethod] = useState<PaymentMethodId | null>(null);

  const { data: account } = useQuery({
    queryKey: ["checkout-account", user?.id],
    enabled: open && Boolean(user?.id),
    queryFn: async () => {
      const [{ data: profile }, { data: addresses }] = await Promise.all([
        supabase.from("profiles").select("full_name, phone, document_id").eq("id", user?.id ?? "").maybeSingle(),
        supabase.from("addresses").select("recipient, phone, line1, line2, city, department, postal_code").order("is_default", { ascending: false }).limit(1),
      ]);
      return { profile, address: addresses?.[0] ?? null };
    },
  });

  useEffect(() => {
    if (!open) return;
    setStep("details"); setDone(null); setErrors({}); setSummaryOpen(false); setDeliveryMode("ship"); setUsePoints(false); setPointsInput(""); setAppliedCode(null); setPromoCode("");
    setForm((current) => ({ ...current, country: locale.country === "Rest of world" ? "" : locale.country }));
    track("checkout_started", { value: totals.subtotal, items: items.length });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !account) return;
    const names = (account.profile?.full_name ?? account.address?.recipient ?? "").trim().split(/\s+/);
    setForm((current) => ({
      ...current,
      firstName: current.firstName || names[0] || "",
      lastName: current.lastName || names.slice(1).join(" "),
      documentId: current.documentId || account.profile?.document_id || "",
      email: current.email || user?.email || "",
      phone: current.phone || account.address?.phone || account.profile?.phone || "",
      line1: current.line1 || account.address?.line1 || "",
      line2: current.line2 || account.address?.line2 || "",
      city: current.city || account.address?.city || "",
      department: current.department || account.address?.department || "",
      postalCode: current.postalCode || (account.address as any)?.postal_code || "",
    }));
  }, [account, open, user?.email]);

  // Si escriben un país distinto al detectado, la tienda entera pasa a dólares (o vuelve a pesos).
  useEffect(() => {
    if (!open) return;
    const typed = form.country.trim();
    if (typed.length < 2) return;
    const canonical = matchCountry(typed);
    const timer = window.setTimeout(() => {
      if (canonical !== locale.country) locale.setCountry(canonical);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [form.country, open]); // eslint-disable-line react-hooks/exhaustive-deps


  const formRef = useRef(form);
  formRef.current = form;
  const stepRef = useRef(step);
  stepRef.current = step;

  const setField = (key: keyof Form, value: string) => {
    setForm((current) => {
      const next = { ...current, [key]: value };
      // Sugerimos el código postal base de la ciudad si el cliente aún no escribió uno.
      if (key === "city" && /colombia/i.test(current.country)) {
        const prev = suggestPostalCode(current.city);
        if (!current.postalCode || current.postalCode === prev) next.postalCode = suggestPostalCode(value) || current.postalCode;
      }
      return next;
    });
    setErrors((current) => ({ ...current, [key]: "" }));
  };
  const geoRegions = regionsFor(form.country);
  const departmentOptions = geoRegions ? Object.keys(geoRegions) : [];
  const cityOptions = geoRegions ? (geoRegions[form.department] ?? []) : [];
  const setCountry = (value: string) => {
    setForm((current) => ({ ...current, country: value, department: "", city: "" }));
    setErrors((current) => ({ ...current, country: "", department: "", city: "" }));
    // El país elegido manda: si no es Colombia, toda la tienda pasa a dólares al instante.
    locale.setCountry(value);
  };
  const setDepartment = (value: string) => {
    setForm((current) => ({ ...current, department: value, city: "" }));
    setErrors((current) => ({ ...current, department: "", city: "" }));
  };
  const validate = (schema: z.ZodTypeAny) => {
    const result = schema.safeParse(form);
    if (result.success) { setErrors({}); return true; }
    setErrors(Object.fromEntries(result.error.issues.map((issue: z.ZodIssue) => [String(issue.path[0]), issue.message])));
    return false;
  };
  const applyVoice = (fields: VoiceFields) => {
    const entries = Object.entries(fields).filter(([, value]) => typeof value === "string" && value.trim());
    if (!entries.length) return;
    setForm((current) => ({ ...current, ...Object.fromEntries(entries) }));
    setErrors((current) => { const next = { ...current }; entries.forEach(([key]) => { next[key] = ""; }); return next; });
  };
  const voiceAdvance = () => {
    const current = formRef.current;
    if (stepRef.current === "details") { if (detailsSchemaFor(isColombianCountry(current.country)).safeParse(current).success) nextDetails(); return; }
    if (stepRef.current === "delivery" && (pickupActive || deliverySchema.safeParse(current).success)) nextDelivery();
  };
  const saveLead = useServerFn(saveCheckoutLead);
  const nextDetails = () => {
    if (!validate(detailsSchema)) return;
    setStep("delivery");
    try {
      const key = sessionStorage.getItem("tb-lead") ?? crypto.randomUUID();
      sessionStorage.setItem("tb-lead", key);
      void saveLead({ data: {
        sessionKey: key, email: form.email.trim(), name: `${form.firstName} ${form.lastName}`.trim(),
        items: items.slice(0, 40).map((i) => ({ name: i.productName, label: i.variantLabel || undefined, qty: i.qty, price: i.priceCop, image: i.imageUrl?.startsWith("http") ? i.imageUrl : undefined })),
      } }).catch(() => {});
    } catch { /* sin bloqueo */ }
  };
  const nextDelivery = () => { if (pickupActive || validate(deliverySchema)) { if (delivery.label === "Envío por confirmar" || (international && (!intl || !intl.enabled))) { toast.error("No hay una tarifa disponible para este destino."); return; } track("shipping_completed", { city: pickupActive ? (pickupStore ?? "") : form.city }); track("payment_started", { value: totals.total }); setStep("payment"); } };

  const stockHold = useCheckoutHold(open && step === "payment" && !done, items, international);
  holdReady.current = stockHold.state.status === "held";
  const holdBlocked = !holdReady.current && !stockHold.prepared;
  const confirm = async (paidReference?: string) => {
    if (!paidReference && stockHold.prepared) { toast.error("Tienes un pago pendiente. Usa «Cambiar mi compra» para pagar con transferencia."); return; }
    if (!paidReference && !holdReady.current) { toast.error("Tus prendas ya no están apartadas. Vuelve a apartarlas para pagar."); return; }
    if (!validate(detailsSchema) || (!pickupActive && !validate(deliverySchema)) || !items.length) return;
    if (!gatewayAvailable) { toast.error("No hay un medio de pago disponible para este destino."); return; }
    if (selectedGateway === "transfer" && !proofPath) { toast.error("Adjunta el comprobante de la transferencia."); return; }
    setPlacing(true);
    try {
      if (!paidReference && gateway !== "transfer") {
        const authorization = await authorizePayment(method, payable);
        if (!authorization.ok) throw new Error(authorization.message);
      }
      let order: { number: string; id: string };
      const recoveredOrder = paidReference ? await findPaidOrder({ data: { reference: paidReference } }) : null;
      if (recoveredOrder) {
        order = recoveredOrder;
      } else if (user) {
        order = await placeOrder({
          items,
          shipTo: { ...EMPTY_SHIP_TO, recipient: `${form.firstName} ${form.lastName}`, document_id: form.documentId, phone: form.phone, email: form.email, country: form.country, line1: form.line1, line2: form.line2, city: form.city, department: form.department, postal_code: form.postalCode },
          delivery,
          shippingSettings,
          intlSettings: intl,
          taxSettings,
          shippingItems,
          userId: user.id,
          email: user.email ?? form.email,
          pointsToUse,
          promotionCode: validCode?.code,
          payment: { currency: international ? "USD" : "COP", totalUsd: international ? totalUsd : null, method: selectedGateway, reference: paidReference ?? null, status: paidReference ? "paid" : "pending" },
        });
      } else {
        order = await createGuestOrder({ data: {
          items: items.map((item) => ({ variantId: item.variantId, qty: item.qty })),
          shipTo: form,
          ...(paidReference ? { paymentReference: paidReference } : {}),
          paymentMethod: method,
          currency: international ? "USD" : "COP",
          promotionCode: validCode?.code,
          idempotencyKey: paidReference ?? crypto.randomUUID(),
          ...(holdToken() ? { holdToken: holdToken()! } : {}),
          ...(analyticsSessionId() ? { analyticsSessionId: analyticsSessionId()! } : {}),
        } });
      }
      if (selectedGateway === "transfer" && proofPath) {
        try { await attachProof({ data: { orderNumber: order.number, path: proofPath } }); }
        catch { toast.error("Guardamos tu pedido, pero no pudimos adjuntar el comprobante."); }
      }
      track("purchase", { value: totals.total, order: order.number, items: items.length });
      resetHoldToken();
      if (!buyNow) cart.clear(); else cart.remove(buyNow.variantId);
      if (paidReference) {
        try { localStorage.removeItem(`tb-payment-return-${paidReference}`); localStorage.removeItem(`tb-payment-items-${paidReference}`); } catch { /* almacenamiento no disponible */ }
      }
      setDoneMethod(selectedGateway ?? null);
      setDone(order.number);
      closeCheckout();
      navigate({ to: "/gracias/$id", params: { id: order.id } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo completar la compra");
    } finally { setPlacing(false); }
  };

  // Aviso al intentar salir: aparece en cada intento cuando ya escribió algo y hay piezas.
  const [exitOpen, setExitOpen] = useState(false);
  const requestClose = () => {
    const current = formRef.current;
    const here = stepRef.current;
    const typed = here === "details"
      ? Boolean(current.firstName || current.email || current.phone || current.documentId)
      : here === "delivery"
        ? Boolean(current.line1 || current.city || current.department)
        : true;
    if (done || placing || !items.length || !typed) { closeCheckout(); return; }
    track("checkout_exit_intent", { step: stepRef.current, value: totals.total });
    setExitOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    // Solo "atrás" del navegador; cambiar de pestaña (p. ej. al abrir la pasarela) no es abandono.
    const onBack = () => requestClose();
    window.addEventListener("popstate", onBack);
    return () => window.removeEventListener("popstate", onBack);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const stepNumber = step === "details" ? 1 : step === "delivery" ? 2 : 3;
  const title = useMemo(() => step === "details" ? "Tus datos" : step === "delivery" ? "Entrega" : "Finaliza tu compra", [step]);
  return (
    <AnimatePresence>
      {open && <>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] bg-ink/55 backdrop-blur-[2px]" onClick={requestClose} />
         <motion.aside initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 34, stiffness: 300 }} className="sheet-scroll fixed inset-x-0 bottom-0 z-[81] max-h-[82svh] overflow-y-auto overscroll-contain rounded-t-2xl bg-ivory text-ink shadow-2xl sm:left-auto sm:right-6 sm:top-auto sm:max-h-[94svh] sm:w-[680px] sm:rounded-2xl sm:mb-6" role="dialog" aria-modal="true" aria-label={title}>
          <div className="sticky top-0 z-10 bg-ivory/95 px-5 pb-3 pt-3 backdrop-blur sm:px-7">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink/15" />
            <div className="grid grid-cols-[36px_minmax(0,1fr)_36px] items-center">
              <Button variant="ghost" size="icon" className={cn("h-9 w-9", (step === "details" || done) && "invisible")} onClick={() => setStep(step === "payment" ? "delivery" : "details")} aria-label="Volver"><ArrowLeft /></Button>
              <div className="min-w-0 text-center"><p className="text-[10px] uppercase tracking-[0.16em] text-moss">{done ? "Pedido confirmado" : `Checkout · 0${stepNumber} / 03`}</p>{!done && <p className="mt-0.5 font-nm text-base uppercase">{locale.t(title)}</p>}</div>
              <Button variant="ghost" size="icon" className="h-9 w-9" onClick={requestClose} aria-label="Cerrar"><X /></Button>
            </div>
            {!done && <div className="mt-3 grid grid-cols-3 gap-1">{["details", "delivery", "payment"].map((item, index) => <div key={item} className={cn("h-1 rounded-full", index < stepNumber ? "bg-clay" : "bg-ink/10")} />)}</div>}
          </div>

          <div className="px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 sm:px-7">
            {done ? <div className="py-12 text-center"><Check className="mx-auto size-9 text-moss" /><h2 className="mt-5 font-nm text-3xl">Gracias por tu compra</h2><p className="mt-2 text-sm text-moss">Pedido {done}. {doneMethod === "transfer" ? "Queda pendiente por confirmar el pago." : "Te enviaremos la confirmación al correo."}</p>{doneMethod === "transfer" && payments && <div className="mx-auto mt-6 max-w-sm text-left"><TransferDetails transfer={payments.transfer} /><TransferProofUpload orderNumber={done} /></div>}<Button variant="outline" className="mt-7 w-full" onClick={closeCheckout}>Seguir viendo</Button></div>
            : !items.length ? <p className="py-12 text-center text-sm text-moss">{locale.t("Tu carrito está vacío.")}</p>
            : <>
               <Button variant="ghost" onClick={() => setSummaryOpen((value) => !value)} className="mb-5 flex h-auto w-full items-center justify-between rounded-none border-y border-ink/10 px-0 py-3 text-left font-normal"><span className="text-[11px] uppercase tracking-[0.15em]">{countPieces(items)} · {money(totals.total, totalUsd)}</span><ChevronDown className={cn("size-4 transition-transform", summaryOpen && "rotate-180")} /></Button>
               <AnimatePresence initial={false}>{summaryOpen && <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="mb-5 overflow-hidden"><div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{items.map((item) => <div key={item.variantId} className="grid min-w-52 grid-cols-[44px_minmax(0,1fr)] gap-2 rounded-md bg-cream p-2"><div className="h-14 overflow-hidden rounded-sm">{item.imageUrl && <img src={item.imageUrl} alt={item.productName} className="h-full w-full object-cover" />}</div><div className="min-w-0"><p className="truncate text-xs">{item.productName}</p><p className="truncate text-[10px] text-moss">{item.variantLabel} · ×{item.qty}</p><p className="mt-1 text-xs">{money(item.priceCop * item.qty, item.priceUsd ? item.priceUsd * item.qty : null)}</p></div></div>)}</div></motion.div>}</AnimatePresence>
               {step === "details" && <StepPane><div className="grid grid-cols-2 gap-3"><Field label={locale.t("Nombre")} value={form.firstName} error={errors.firstName} onChange={(value) => setField("firstName", value)} autoComplete="given-name" /><Field label={locale.t("Apellido")} value={form.lastName} error={errors.lastName} onChange={(value) => setField("lastName", value)} autoComplete="family-name" /></div><Field label={locale.t("Cédula")} value={form.documentId} error={errors.documentId} onChange={(value) => setField("documentId", value)} inputMode="numeric" autoComplete="off" /><Field label={locale.t("Correo")} value={form.email} error={errors.email} onChange={(value) => setField("email", value)} type="email" autoComplete="email" /><Field label={locale.t("Teléfono")} value={form.phone} error={errors.phone} onChange={(value) => setField("phone", value)} inputMode="tel" autoComplete="tel" /><Button className="mt-3 h-12 w-full uppercase tracking-[0.16em]" onClick={nextDetails}>{locale.t("Continuar")}</Button>{!user && <p className="mt-4 text-center text-xs text-moss">Puedes pagar como invitada. Si ya tienes cuenta, <a href="/auth?redirect=/" className="underline underline-offset-4">ingresa aquí</a>.</p>}</StepPane>}
                {step === "delivery" && <StepPane><GeoSelect label={locale.t("País")} value={form.country} options={COUNTRIES} error={errors.country} placeholder="Selecciona tu país" onChange={setCountry} /><p className="-mt-1 text-[11px] text-moss">{!international ? "Precios y pago en pesos colombianos (COP)." : "Envío internacional: precios y pago en dólares (USD)."}</p>{false && isColombia && pickupStores.length > 0 && <div className="space-y-2"><p className="text-[11px] text-moss">Tu pedido sale de {pickupStores.join(" y ")}. Elige cómo recibirlo:</p><PaymentOption active={!pickupActive} title="Envío a domicilio" detail={nationalDelivery.cost ? `${nationalDelivery.label} · ${money(nationalDelivery.cost)}` : `${nationalDelivery.label} · Gratis`} onClick={() => setDeliveryMode("ship")} /><PaymentOption active={pickupActive} title={`Recoger en ${pickupStores.join(" y ")}`} detail="Gratis · Lista en 24 horas" onClick={() => setDeliveryMode("pickup")} /></div>}{!pickupActive && <><div className="grid grid-cols-2 gap-3">{geoRegions ? <GeoSelect label={locale.t("Departamento / región")} value={form.department} options={departmentOptions} error={errors.department} placeholder="Selecciona" onChange={setDepartment} /> : <Field label={locale.t("Departamento / región")} value={form.department} error={errors.department} onChange={(value) => setField("department", value)} />}{geoRegions ? <GeoSelect label={locale.t("Ciudad")} value={form.city} options={cityOptions} error={errors.city} placeholder={form.department ? "Selecciona" : "Elige departamento"} disabled={!form.department} onChange={(value) => setField("city", value)} /> : <Field label={locale.t("Ciudad")} value={form.city} error={errors.city} onChange={(value) => setField("city", value)} />}</div><Field label={locale.t("Dirección")} value={form.line1} error={errors.line1} onChange={(value) => setField("line1", value)} autoComplete="street-address" /><Field label={locale.t("Complemento (opcional)")} value={form.line2} error={errors.line2} onChange={(value) => setField("line2", value)} /><Field label={locale.t("Código postal")} value={form.postalCode} error={errors.postalCode} onChange={(value) => setField("postalCode", value)} autoComplete="postal-code" />{isColombia && form.postalCode && form.postalCode === suggestPostalCode(form.city) && <p className="-mt-1 text-[11px] text-moss">Sugerido según tu ciudad. Si conoces el tuyo, cámbialo.</p>}</>}<div className="rounded-md border border-ink bg-cream px-4 py-3"><p className="text-sm">{delivery.label}</p><p className="mt-0.5 text-[11px] text-moss">{delivery.eta}</p></div><Button className="mt-3 h-12 w-full uppercase tracking-[0.16em]" onClick={nextDelivery}>{locale.t("Continuar")}</Button></StepPane>}
                {step === "payment" && <StepPane><div className="py-2"><p className="font-nm text-3xl uppercase">{locale.t("Todo listo.")}</p><p className="mt-2 font-nm text-2xl">{money(payable, payableUsd)}</p></div><HoldNotice state={stockHold.state} items={items} onRenew={() => void stockHold.renew()} />{<div className="space-y-2"><div className="flex gap-2"><input aria-label="Código de descuento" placeholder="Código de descuento" value={promoCode} onChange={e=>setPromoCode(e.target.value.toUpperCase())} disabled={stockHold.prepared || codeBusy} className="min-w-0 flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm" /><Button variant="outline" onClick={()=>void applyCode()} disabled={!promoCode.trim() || codeBusy || stockHold.prepared}>{codeBusy ? "Validando…" : "Aplicar"}</Button></div>{validCode && <div className="flex justify-between gap-2 text-sm"><span>{validCode.code} · − {money(codeCop,codeUsd)}</span><Button size="sm" variant="ghost" disabled={stockHold.prepared} onClick={()=>setAppliedCode(null)}>Quitar</Button></div>}</div>}{user && stockHold.prepared && <p className="text-center text-[11px] text-moss">¿Cerraste la ventana de pago sin pagar? <button type="button" disabled={releasing} className="underline underline-offset-4" onClick={async () => { const token = holdToken(); if (!token) return; setReleasing(true); try { const result = await abandonPrepared({ data: { token } }); if (result.status === "paid" && result.reference) { await confirm(result.reference); } else if (result.status === "processing") { toast.error("Tu pago anterior aún está en proceso. Espera unos minutos antes de cambiar tu compra."); } else { toast.success("Listo, puedes cambiar tu compra o tu medio de pago."); await stockHold.renew(); } } catch (error) { toast.error(error instanceof Error ? error.message : "No pudimos liberar el pago anterior."); } finally { setReleasing(false); } }}>{releasing ? "Revisando…" : "Cambiar mi compra"}</button></p>}{redeemPts > 0 && <PointsChoice points={redeemPts} pointsInput={pointsInput} minimumPoints={minimumPoints} discount={pointsDiscount} earnedPoints={earnedPoints} valid={validPointRedemption} money={money} usePoints={usePoints} onPointsChange={setPointsInput} onChange={setUsePoints} />}{user && redeemPts === 0 && earnedPoints > 0 && <p className="text-xs text-moss">Esta compra acumulará {earnedPoints.toLocaleString("es-CO")} puntos Wild Circle{international && loyaltyCfg ? ` (≈ US$${pointsDiscountUsd(earnedPoints * loyaltyCfg.point_value_cop, rate).toFixed(2)})` : ""}.</p>}{user && saleBlocksPoints && <p className="text-xs text-moss">Las prendas en Sale no suman puntos ni se pueden pagar con puntos.</p>}{!user && loyaltyCfg?.enabled && <p className="text-xs text-moss"><a href="/auth?redirect=/" className="underline underline-offset-4">Inicia sesión</a> para pagar con puntos o acumular con esta compra.</p>}<div className="mt-3 space-y-2">{gateways.map((option) => <PaymentOption key={option.id} active={gateway === option.id} title={option.title} detail={option.detail} logo={option.id === "addi" ? addiLogo : undefined} onClick={() => setGateway(option.id)} />)}</div>{selectedGateway === "transfer" && payments && <><TransferDetails transfer={payments.transfer} /><TransferProofPicker onUploaded={setProofPath} /></>}<div className="mt-5 space-y-2 border-t border-ink/10 pt-4 text-sm"><TotalRow label={locale.t("Subtotal")} value={money(totals.subtotal, subtotalUsd)} />{tax?.applies && <TotalRow label={`${locale.t("Impuesto incluido")} (${tax.ratePct}%)`} value={money(tax.includedCop)} />}{codeCop > 0 && <TotalRow label={`Código ${validCode?.code}`} value={`− ${money(codeCop,codeUsd)}`} />}{pointsDiscount > 0 && <TotalRow label={`Pago con puntos (${pointsToUse.toLocaleString("es-CO")})`} value={`− ${money(pointsDiscount, international ? pointsUsd : null)}`} />}<TotalRow label={locale.t("Envío")} value={totals.shipping ? money(totals.shipping, copToUsd(totals.shipping, rate)) : locale.t("Gratis")} /></div>{missingUsd && <p className="mt-4 text-sm text-destructive">Una de las piezas aún no tiene precio en dólares. Quítala del carrito para continuar.</p>}{!missingUsd && gatewayAvailable && (selectedGateway === "wompi" || selectedGateway === "paypal" || selectedGateway === "paguelofacil" || selectedGateway === "addi" || selectedGateway === "bold") ? <div className={cn("mt-5", holdBlocked && "pointer-events-none opacity-40")} aria-disabled={holdBlocked}><HostedPaymentButton provider={selectedGateway} amountCop={payable} amountUsd={payableUsd} email={form.email} label={`${locale.t("Confirmar y pagar")} · ${money(payable, payableUsd)}`} customer={{ phone: form.phone, firstName: form.firstName, lastName: form.lastName, documentId: form.documentId, address: [form.line1, form.line2].filter(Boolean).join(" "), city: form.city }} shippingCop={totals.shipping} items={items.map((item) => ({ sku: item.variantId, name: `${item.productName} ${item.variantLabel}`.trim(), quantity: item.qty, unitPrice: item.priceCop, ...(item.imageUrl ? { pictureUrl: item.imageUrl } : {}) }))} prepareDraft={async (reference) => {
                  if (!user && (!holdReady.current || !await stockHold.extend())) throw new Error("Tus prendas ya no están apartadas. Vuelve a apartarlas para pagar.");
                  const token = holdToken();
                  if (!token) throw new Error("No pudimos guardar tu apartado. Intenta de nuevo.");
                  const session = analyticsSessionId();
                  const draft = { items: items.map((item) => ({ variantId: item.variantId, qty: item.qty })).sort((a, b) => a.variantId.localeCompare(b.variantId)), shipTo: { ...form, ...(pickupActive ? { deliveryKind: "pickup", pickupStore } : {}) }, currency: international ? "USD" as const : "COP" as const, ...(validCode ? {promotionCode:validCode.code} : {}), holdToken: token, ...(session ? { analyticsSessionId: session } : {}) };
                  if (user) {
                    if (!validPointRedemption) throw new Error("Revisa los puntos que quieres usar.");
                    const prepared = await prepareHostedOrder({ items, shipTo: { ...EMPTY_SHIP_TO, recipient: `${form.firstName} ${form.lastName}`, document_id: form.documentId, phone: form.phone, email: form.email, country: form.country, line1: form.line1, line2: form.line2, city: form.city, department: form.department, postal_code: form.postalCode }, delivery, shippingSettings, intlSettings: intl, taxSettings, shippingItems, userId: user.id, email: user.email ?? form.email, pointsToUse, promotionCode: validCode?.code, deferConfirmation: true, payment: { currency: international ? "USD" : "COP", totalUsd, method: selectedGateway, reference, status: "pending" } }, draft, selectedGateway, reference, selectedGateway === "wompi" || selectedGateway === "addi" || (selectedGateway === "bold" && !international) ? payable : payableUsd, selectedGateway === "wompi" || selectedGateway === "addi" || (selectedGateway === "bold" && !international) ? "COP" : "USD");
                    stockHold.adoptPrepared(prepared.expiresAt);
                    return prepared;
                  }
                  // El retorno abre en otra pestaña: conserva el pedido hasta que la pasarela vuelva.

                  try {
                    const purchased = items.map((item) => ({ variantId: item.variantId, qty: item.qty }));
                    localStorage.setItem(`tb-payment-return-${reference}`, JSON.stringify({ savedAt: Date.now(), items: purchased, shipTo: form, currency: international ? "USD" : "COP" }));
                    localStorage.setItem(`tb-payment-items-${reference}`, JSON.stringify(purchased));
                  } catch { /* almacenamiento no disponible */ }
                  return draft;
                }} onPaid={(reference: string) => confirm(reference)} /></div> : <Button className="mt-5 h-12 w-full uppercase tracking-[0.16em]" disabled={placing || holdBlocked || missingUsd || !validPointRedemption || !gatewayAvailable || (selectedGateway === "transfer" && !proofPath)} onClick={() => confirm()}>{placing && <Loader2 className="animate-spin" />}{placing ? locale.t("Procesando…") : selectedGateway === "transfer" ? "Ya hice la transferencia" : `${locale.t("Confirmar y pagar")} · ${money(payable, payableUsd)}`}</Button>}<PaymentLogos /><p className="mt-3 text-center text-[11px] text-moss">{locale.t("No guardamos datos de tu tarjeta.")}</p><button type="button" onClick={() => setPolicyOpen(true)} className="mx-auto mt-1 block text-[11px] text-moss underline underline-offset-4 hover:text-ink">Garantía, cambios y devoluciones</button><PolicyModal open={policyOpen} onClose={() => setPolicyOpen(false)} /></StepPane>}
            </>}
          </div>
        </motion.aside>
        <ExitIntent
          key={step}
          open={exitOpen}
          step={step}
          city={form.city}
          deliveryLabel={delivery.label}
          deliveryEta={delivery.eta}
          onContinue={() => setExitOpen(false)}
          onLeave={() => { setExitOpen(false); closeCheckout(); }}
        />
      </>}
    </AnimatePresence>
  );
}

function StepPane({ children }: { children: React.ReactNode }) { return <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">{children}</motion.div>; }
function Field({ label, error, onChange, ...props }: { label: string; error?: string; onChange: (value: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "placeholder">) { return <label className="block"><span className="mb-1.5 block text-[11px] text-moss">{label}</span><input {...props} onChange={(event) => onChange(event.target.value)} className={cn("w-full rounded-md border bg-transparent px-3 py-3 text-base outline-none focus:border-ink sm:text-sm", error ? "border-destructive" : "border-ink/15")} />{error && <span className="mt-1 block text-[11px] text-destructive">{error}</span>}</label>; }
function PaymentOption({ active, title, detail, logo, onClick }: { active: boolean; title: string; detail: string; logo?: string; onClick: () => void }) { return <Button variant="outline" className={cn("h-auto w-full justify-start gap-3 whitespace-normal px-4 py-3 text-left", active && "border-ink bg-cream")} onClick={onClick}><span className={cn("grid size-4 shrink-0 place-items-center rounded-full border", active ? "border-ink" : "border-ink/25")}>{active && <span className="size-2 rounded-full bg-ink" />}</span><span>{logo ? <img src={logo} alt={title} className="block h-3 w-auto" /> : <span className="block text-sm">{title}</span>}<span className="block text-[11px] font-normal text-moss">{detail}</span></span></Button>; }
function TotalRow({ label, value }: { label: string; value: string }) { return <div className="flex justify-between"><span className="text-moss">{label}</span><span>{value}</span></div>; }
function countPieces(items: CartItem[]) { const count = items.reduce((sum, item) => sum + item.qty, 0); return `${count} ${count === 1 ? "pieza" : "piezas"}`; }

// Logos de medios de pago en negro minimalista (trazados propios, sin marcas a color).
function PaymentLogos() {
  return (
    <div className="mt-4 flex items-center justify-center gap-4 text-ink" aria-label="Medios de pago aceptados">
      <span className="font-nm text-[13px] font-bold italic tracking-tight">VISA</span>
      <span className="flex items-center" aria-label="Mastercard"><span className="size-4 rounded-full bg-ink" /><span className="-ml-1.5 size-4 rounded-full border border-ink bg-transparent" /></span>
      <span className="font-nm text-[10px] font-bold tracking-wide">AMEX</span>
      <span className="font-nm text-[10px] font-bold tracking-wide">PSE</span>
      <span className="font-nm text-[10px] font-bold tracking-wide">Nequi</span>
    </div>
  );
}

function PolicyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[80] grid place-items-center bg-ink/40 p-4" onClick={onClose}>
          <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 24, opacity: 0 }} className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-xl bg-background p-6" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <h3 className="font-nm text-xl uppercase">Garantía, cambios y devoluciones</h3>
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose} aria-label="Cerrar"><X /></Button>
            </div>
            <div className="mt-4 space-y-4 text-[13px] leading-relaxed text-moss">
              <div><p className="mb-1 text-ink">Derecho de retracto</p><p>En compras por internet tienes cinco (5) días hábiles desde la entrega para retractarte. Devolvemos el valor pagado dentro de los treinta (30) días calendario siguientes a recibir la prenda en buen estado.</p></div>
              <div><p className="mb-1 text-ink">Cambios de talla o producto</p><p>Solicita el cambio desde tu cuenta. Si eliges otra talla de la misma referencia, reservamos la prenda mientras revisamos y aprobamos la solicitud.</p></div>
              <div><p className="mb-1 text-ink">Garantía por defectos</p><p>Si la prenda presenta un defecto de fabricación aplica la garantía legal: reparación, cambio o devolución del dinero. No cubre desgaste por uso normal ni daños por lavado distinto al indicado en la etiqueta.</p></div>
              <div><p className="mb-1 text-ink">Productos sin cambio</p><p>Por higiene, no se aceptan cambios de ropa interior, vestidos de baño ni accesorios de uso personal, salvo defecto de fabricación.</p></div>
              <a href="/cambios-y-devoluciones" target="_blank" rel="noreferrer" className="inline-block text-ink underline underline-offset-4">Ver la política completa</a>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PointsChoice({ points, pointsInput, minimumPoints, discount, earnedPoints, valid, money, usePoints, onPointsChange, onChange }: { points: number; pointsInput: string; minimumPoints: number; discount: number; earnedPoints: number; valid: boolean; money: (cop: number) => string; usePoints: boolean; onPointsChange: (value: string) => void; onChange: (v: boolean) => void }) {
  const opt = (on: boolean, title: string, detail: string) => (
    <button type="button" onClick={() => onChange(on)} aria-pressed={usePoints === on} className={cn("flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left transition", usePoints === on ? "border-ink bg-ink/5" : "border-ink/10 hover:bg-ink/5")}>
      <span className={cn("mt-0.5 grid size-4 shrink-0 place-items-center rounded-md border", usePoints === on ? "border-ink bg-ink text-ivory" : "border-ink/25")}>{usePoints === on && <Check className="size-3" />}</span>
      <span className="min-w-0">
        <span className="block text-sm text-ink">{title}</span>
        <span className="block text-xs text-moss">{detail}</span>
      </span>
    </button>
  );
  return (
    <div className="mt-4 space-y-2">
      <p className="text-[11px] uppercase tracking-[0.15em] text-moss">Wild Circle</p>
      {opt(false, "Acumular puntos", `Esta compra suma ${earnedPoints.toLocaleString("es-CO")} puntos a tu cuenta.`)}
      {opt(true, "Pagar con puntos", `Tienes ${points.toLocaleString("es-CO")} puntos disponibles.`)}
      {usePoints && <div className="rounded-md border border-ink/10 p-3"><label htmlFor="checkout-points" className="text-xs text-moss">Puntos a gastar</label><input id="checkout-points" autoFocus inputMode="numeric" value={pointsInput} onChange={(event) => onPointsChange(event.target.value.replace(/\D/g, "").slice(0, 9))} onBlur={() => { const value = Math.floor(Number(pointsInput) || 0); if (value > points) onPointsChange(String(points)); else if (value > 0 && value < minimumPoints) onPointsChange(String(minimumPoints)); }} placeholder={`Máximo ${points.toLocaleString("es-CO")}`} className="mt-2 w-full rounded-md border border-ink/15 bg-transparent px-3 py-3 text-base outline-none focus:border-ink sm:text-sm" /><div className="mt-2 flex justify-between text-[11px] text-moss"><span>Mínimo {minimumPoints.toLocaleString("es-CO")} puntos</span><span>{discount > 0 ? `− ${money(discount)}` : ""}</span></div>{!valid && <p className="mt-1 text-[11px] text-clay">Ingresa entre {minimumPoints.toLocaleString("es-CO")} y {points.toLocaleString("es-CO")} puntos.</p>}<p className="mt-2 text-[11px] text-clay">Esta compra no acumula puntos nuevos.</p></div>}
    </div>
  );
}

function HoldNotice({ state, items, onRenew }: { state: HoldState; items: CartItem[]; onRenew: () => void }) {
  if (state.status === "idle") return null;
  if (state.status === "holding") return <p className="mt-3 text-xs text-moss">Apartando tus prendas…</p>;
  if (state.status === "held") {
    const m = Math.floor(state.seconds / 60), sec = state.seconds % 60;
    return <p className="mt-3 flex items-center justify-between gap-3 border-y border-ink/10 py-2 text-xs" role="timer" aria-live="off">
      <span className="text-moss">Tus prendas están apartadas por</span>
      <span className="font-nm text-base tabular-nums">{String(m).padStart(2, "0")}:{String(sec).padStart(2, "0")}</span>
    </p>;
  }
  if (state.status === "unavailable") {
    const it = items.find((i) => i.variantId === state.variantId);
    return <p className="mt-3 text-sm text-destructive">{it ? `${it.productName} ${it.variantLabel}`.trim() : "Una prenda"} se acaba de agotar. Quítala del carrito para continuar.</p>;
  }
  return <div className="mt-3 flex items-center justify-between gap-3 text-sm">
    <span className="text-destructive">{state.status === "expired" ? "El tiempo terminó y las prendas se liberaron." : "No pudimos apartar tus prendas."}</span>
    <button type="button" onClick={onRenew} className="shrink-0 border-b border-ink/40 text-xs uppercase tracking-[0.16em]">Apartar de nuevo</button>
  </div>;
}
