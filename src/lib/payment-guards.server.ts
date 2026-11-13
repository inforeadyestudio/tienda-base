// Protecciones compartidas de las pasarelas de pago.
import { retryDecision } from "./checkout/prepared-payment";
import { isStoreHost } from "./store-hosts.server";

/** Solo se aceptan retornos a los dominios de la propia tienda. */
export function safeOrigin(origin: string): string {
  const u = new URL(origin);
  const h = u.hostname;
  const ok =
    (u.protocol === "https:" && isStoreHost(h)) ||
    h === "localhost";
  if (!ok) throw new Error("Origen de pago no permitido.");
  return u.origin;
}

/** Registra un intento nuevo; nunca reescribe uno existente de otra persona. */
export async function registerAttempt(db: any, reference: string, provider: string, currency: string, amount: number, draft: unknown) {
  if (!draft) throw new Error("No pudimos guardar tu carrito. Intenta de nuevo antes de pagar.");
  if (draft) {
    const { paymentDraftSchema } = await import("./checkout/payment-draft");
    const snapshot = paymentDraftSchema.parse(draft);
    if (snapshot.preparedOrderId) {
      const { getRequestHeader } = await import("@tanstack/react-start/server");
      const token = getRequestHeader("authorization")?.replace(/^Bearer\s+/i, "");
      const { data: order, error: orderError } = await db.from("orders").select("customer_id, status, source, hold_token, payment_reference, currency, total_cop, total_usd:total_usd_exact").eq("id", snapshot.preparedOrderId).maybeSingle();
      const guestBold = provider === "bold" && order?.customer_id === null && order?.source === "ecom" && order?.hold_token === snapshot.holdToken;
      const session = !guestBold && token ? await db.auth.getUser(token) : null;
      const authorized = guestBold || (!session?.error && session?.data?.user && order?.customer_id === session.data.user.id);
      const expected = currency === "COP" ? Number(order?.total_cop) : Number(order?.total_usd);
      if (!authorized || orderError || !order || order.status !== "reserved" || order.payment_reference !== reference || !Number.isFinite(expected) || Math.abs(expected - amount) > (currency === "COP" ? 1 : 0.05)) throw new Error("No pudimos validar el pedido antes del pago.");
    } else {
      const { guestCheckoutSchema } = await import("./checkout/guest-checkout.functions");
      const parsed = guestCheckoutSchema.parse({ ...snapshot, paymentMethod: "card", paymentReference: reference, idempotencyKey: reference });
      if (parsed.promotionCode) {
        const [{ data: promo, error: pe }, { data: variants, error: ve }, {data:settings}] = await Promise.all([
          db.from("promotions").select("kind,value,amount_currency,amount_usd,active,channels,starts_at,ends_at,min_subtotal_cop").eq("code", parsed.promotionCode.toUpperCase()).maybeSingle(),
          db.from("product_variants").select("id,price_cop,price_usd").in("id",parsed.items.map(i=>i.variantId)),
          db.from("app_settings").select("value").eq("key","international_settings").maybeSingle(),
        ]);
        if (pe || ve || !promo || !variants) throw new Error("No pudimos validar el código antes del pago");
        const cop = parsed.items.reduce((s,i)=>s+Number(variants.find((v:any)=>v.id===i.variantId)?.price_cop)*i.qty,0);
        const usd = parsed.items.reduce((s,i)=>s+Number(variants.find((v:any)=>v.id===i.variantId)?.price_usd)*i.qty,0);
        const { promotionDiscount } = await import("./promotions");
        const discount = promotionDiscount(promo,parsed.currency,cop,usd);
        const { normalizeIntlSettings, intlShippingUsd, itemsWeightKg } = await import("./international");
        const cfg=normalizeIntlSettings(settings?.value);
        const {data:weighted,error:we}=await db.from("product_variants").select("id,weight_grams").in("id",parsed.items.map(i=>i.variantId));
        if(we) throw new Error("No pudimos validar el envío");
        const weight=itemsWeightKg(parsed.items.map(i=>({productId:i.variantId,qty:i.qty,weightGrams:weighted?.find((v:any)=>v.id===i.variantId)?.weight_grams})));
        let shippingCop: number;
        if (parsed.currency === "USD") {
          shippingCop = intlShippingUsd(cfg,parsed.shipTo.country,cop/cfg.usdRate,weight).costUsd * cfg.usdRate;
        } else {
          const [{ data: shippingSettings, error: se }, { data: products, error: pre }] = await Promise.all([
            db.from("app_settings").select("value").eq("key", "shipping_settings").maybeSingle(),
            db.from("product_variants").select("id,product_id,weight_grams").in("id", parsed.items.map(i => i.variantId)),
          ]);
          if (se || pre || !products) throw new Error("No pudimos validar el envío");
          const { data: memberships, error: me } = await db.from("collection_products").select("product_id,collection_id").in("product_id", products.map((p: any) => p.product_id));
          if (me) throw new Error("No pudimos validar el envío");
          const { normalizeShippingSettings, quoteShipping } = await import("./store-settings");
          const shippingItems = parsed.items.map(item => {
            const variant = products.find((p: any) => p.id === item.variantId);
            return { productId: variant?.product_id, qty: item.qty, weightGrams: variant?.weight_grams, collectionIds: (memberships ?? []).filter((m: any) => m.product_id === variant?.product_id).map((m: any) => m.collection_id) };
          });
          const quote = quoteShipping(normalizeShippingSettings(shippingSettings?.value), cop, shippingItems, parsed.shipTo.country, parsed.shipTo.department, { signedIn: false });
          if (!quote.matched) throw new Error("No hay una tarifa de envío disponible");
          shippingCop = quote.cost;
        }
        const expectedUsd=Math.round((usd+shippingCop/cfg.usdRate-discount.discountUsd)*100)/100;
        const expectedCop=Math.max(cop+shippingCop-discount.discountCop,shippingCop);
        const expected=currency==='USD' ? expectedUsd : expectedCop;
        if(!Number.isFinite(expected) || Math.abs(expected-amount)>(currency==='USD'?0.05:1)) throw new Error("El total no coincide con el código y la compra");
      }
    }
  }
  const { data: existing, error: readError } = await db.from("payment_attempts").select("provider, currency, amount, status, draft").eq("reference", reference).maybeSingle();
  if (readError) throw new Error("No pudimos comprobar el pago. Intenta de nuevo.");
  if (existing) {
    const sameTerms = existing.currency === currency && Math.abs(Number(existing.amount) - amount) < 0.01 && (!draft || JSON.stringify(existing.draft) === JSON.stringify(draft));
    const same = retryDecision(existing.status, sameTerms, existing.provider === provider) === "resume";
    if (!same) throw new Error("Esta referencia de pago ya existe. Vuelve a iniciar el pago.");
    return;
  }
  const { error } = await db.from("payment_attempts").insert({ reference, provider, currency, amount, status: "pending", ...(draft ? { draft } : {}) });
  if (error) throw new Error("No pudimos registrar el pago.");
}

/** Only one provider request per reference; ambiguous failures remain pending. */
export async function beginGatewayAttempt(db: any, reference: string, provider: string, currency: string, amount: number, draft: unknown): Promise<string | null> {
  await registerAttempt(db, reference, provider, currency, amount, draft);
  const { data: attempt, error } = await db.from("payment_attempts").select("checkout_url, status").eq("reference", reference).maybeSingle();
  if (error) throw new Error("No pudimos comprobar el intento anterior.");
  if (attempt?.checkout_url && attempt.status === "pending") return String(attempt.checkout_url);
  const { data: claimed, error: claimError } = await db.rpc("claim_checkout_payment", { _reference: reference });
  if (claimError || !claimed) throw new Error("Estamos verificando el intento anterior. No inicies otro pago todavía.");
  return null;
}

export async function storeGatewayUrl(db: any, reference: string, url: string, externalId?: string) {
  const { error } = await db.from("payment_attempts").update({ checkout_url: url, ...(externalId ? { external_id: externalId } : {}) }).eq("reference", reference).eq("status", "pending");
  if (error) throw new Error("No pudimos guardar el enlace del pago. Estamos verificando el intento; no pagues otra vez.");
}

/** Use only after an explicit provider rejection, never a timeout or missing response. */
export async function rejectGatewayAttempt(db: any, reference: string) {
  const { error } = await db.from("payment_attempts").update({ status: "failed" }).eq("reference", reference).eq("status", "pending");
  if (error) throw new Error("No pudimos verificar el rechazo. No inicies otro pago todavía.");
}
