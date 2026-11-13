import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { paymentDraftSchema } from "../checkout/payment-draft";
import { boldAmount, boldIntegrity, type BoldCheckoutConfig } from "./bold";

function requireVerifiedCurrency(currency: string) {
  if (currency === "USD") throw new Error("Bold internacional está pendiente de validar la confirmación del importe original en dólares");
}

export const boldCredentialStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Solo administradores");
    return { configured: Boolean(process.env["BOLD_ONLINE_API_KEY"] && process.env["BOLD_ONLINE_SECRET_KEY"]) };
  });

export const createBoldPayment = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({
    reference: z.string().uuid(), origin: z.string().url().max(200),
    amount: z.number().positive().max(2_000_000_000), currency: z.enum(["COP", "USD"]), draft: paymentDraftSchema,
  }).parse(input))
  .handler(async ({ data }): Promise<BoldCheckoutConfig> => {
    const apiKey = process.env["BOLD_ONLINE_API_KEY"];
    const secret = process.env["BOLD_ONLINE_SECRET_KEY"];
    if (!apiKey || !secret) throw new Error("Bold aún no está configurado");
    const { safeOrigin, beginGatewayAttempt, storeGatewayUrl } = await import("../payment-guards.server");
    const origin = safeOrigin(data.origin);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: setting, error: se } = await db.from("app_settings").select("value").eq("key", "payment_settings").maybeSingle();
    const { normalizePaymentsSettings } = await import("../payments");
    const settings = normalizePaymentsSettings(setting?.value);
    if (se || !settings.bold.enabled || (data.currency === "USD" && !settings.bold.internationalEnabled)) throw new Error("Bold no está disponible para esta compra");
    if (data.draft.currency !== data.currency) throw new Error("La moneda no coincide con el pedido");
    requireVerifiedCurrency(data.currency);
    let draft = data.draft;
    if (!draft.preparedOrderId) {
      const { guestCheckoutSchema } = await import("../checkout/guest-checkout.functions");
      const guest = guestCheckoutSchema.parse({ ...draft, paymentMethod: "card", idempotencyKey: data.reference, paymentReference: data.reference });
      const ids = draft.items.map(i => i.variantId);
      const [{ data: variants, error: ve }, { data: shippingRow }, { data: intlRow }, { data: memberships }] = await Promise.all([
        db.from("product_variants").select("id,price_cop,price_usd,size,color,active,weight_grams,products!inner(id,name,status)").in("id", ids),
        db.from("app_settings").select("value").eq("key", "shipping_settings").maybeSingle(),
        db.from("app_settings").select("value").eq("key", "international_settings").maybeSingle(),
        db.from("collection_products").select("product_id,collection_id"),
      ]);
      if (ve || !variants || variants.length !== ids.length) throw new Error("Una prenda ya no está disponible");
      const lines = variants.map((v: any) => {
        if (!v.active || v.products.status !== "published" || (data.currency === "USD" && !(Number(v.price_usd) > 0))) throw new Error("Una prenda ya no está disponible");
        const qty = draft.items.find(i => i.variantId === v.id)?.qty ?? 0;
        return { variant_id: v.id, qty, product_name: v.products.name, variant_label: [v.color, v.size].filter(Boolean).join(" · "), unit_price_cop: Number(v.price_cop), unit_price_usd: data.currency === "USD" ? Number(v.price_usd) : null };
      });
      const subtotalCop = lines.reduce((s, i) => s + i.unit_price_cop * i.qty, 0);
      const subtotalUsd = lines.reduce((s, i) => s + Number(i.unit_price_usd) * i.qty, 0);
      const { normalizeShippingSettings, quoteShipping } = await import("../store-settings");
      const { normalizeIntlSettings, intlShippingUsd, itemsWeightKg } = await import("../international");
      const { currencyForCountry } = await import("../locale");
      if (currencyForCountry(guest.shipTo.country) !== data.currency) throw new Error("La moneda no coincide con el destino");
      const intl = normalizeIntlSettings(intlRow?.value);
      if (data.currency === "USD" && !intl.enabled) throw new Error("Las compras internacionales están desactivadas");
      const shippingItems = variants.map((v: any) => ({ productId: v.products.id, qty: draft.items.find(i => i.variantId === v.id)?.qty ?? 0, weightGrams: v.weight_grams, collectionIds: (memberships ?? []).filter(m => m.product_id === v.products.id).map(m => m.collection_id) }));
      const ship = data.currency === "USD"
        ? { matched: true, cost: intlShippingUsd(intl, guest.shipTo.country, subtotalCop / intl.usdRate, itemsWeightKg(shippingItems)).costUsd * intl.usdRate }
        : quoteShipping(normalizeShippingSettings(shippingRow?.value), subtotalCop, shippingItems, guest.shipTo.country, guest.shipTo.department, { signedIn: false });
      if (!ship.matched || guest.shipTo.deliveryKind === "pickup") throw new Error("Revisa el envío antes de pagar");
      const s = guest.shipTo;
      const { data: prepared, error } = await db.rpc("prepare_bold_guest_checkout", {
        _reference: data.reference, _draft: draft as never, _items: lines as never, _amount: data.amount,
        _order: { subtotal_cop: subtotalCop, shipping_cop: ship.cost, total_cop: subtotalCop + ship.cost, total_usd: data.currency === "USD" ? Math.round((subtotalUsd + ship.cost / intl.usdRate) * 100) / 100 : null, buyer_country: s.country, contact_email: s.email, contact_phone: s.phone, contact_name: `${s.firstName} ${s.lastName}`, ship_to: { recipient: `${s.firstName} ${s.lastName}`, document_id: s.documentId, email: s.email, phone: s.phone, line1: s.line1, line2: s.line2, city: s.city, department: s.department, country: s.country, postal_code: s.postalCode, delivery_kind: "ship" } } as never,
      });
      if (error) throw new Error(error.message);
      draft = paymentDraftSchema.parse((prepared as { draft: unknown }).draft);
    }
    const saved = await beginGatewayAttempt(db, data.reference, "bold", data.currency, data.amount, draft);
    let expirationDate = Date.now() + 18 * 60_000;
    if (saved) {
      const savedConfig = JSON.parse(saved) as { expirationDate?: number };
      if (savedConfig.expirationDate) expirationDate = savedConfig.expirationDate;
    }
    if (expirationDate <= Date.now()) throw new Error("Este intento venció. Revisa tu pedido antes de pagar otra vez");
    const amount = boldAmount(data.amount, data.currency);
    const config: BoldCheckoutConfig = {
      orderId: data.reference, amount, currency: data.currency, apiKey,
      integritySignature: await boldIntegrity(data.reference, amount, data.currency, secret),
      description: "Pedido Tu Marca", redirectionUrl: `${origin}/api/public/pagos/bold`,
      expirationDate, renderMode: "embedded",
      customerData: JSON.stringify({ email: draft.shipTo.email, fullName: `${draft.shipTo.firstName ?? ""} ${draft.shipTo.lastName ?? ""}`.trim() }),
    };
    // Store only a non-secret expiry marker; identity/signature are generated for the SDK, never persisted or logged.
    if (!saved) await storeGatewayUrl(db, data.reference, JSON.stringify({ expirationDate }));
    return config;
  });