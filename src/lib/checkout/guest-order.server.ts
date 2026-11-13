import type { GuestCheckoutInput } from "./guest-checkout.functions";

/** Crea el pedido invitado. Lo usan el checkout y el retorno de la pasarela en el servidor. */
export async function placeGuestOrderCore(data: GuestCheckoutInput): Promise<{ id: string; number: string }> {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const variantIds = data.items.map((item) => item.variantId);
    const { data: variants, error: variantsError } = await supabaseAdmin
      .from("product_variants")
      .select("id, price_cop, price_usd, size, color, active, weight_grams, products!inner(id, name, status)")
      .in("id", variantIds);
    if (variantsError) throw variantsError;
    if (!variants || variants.length !== variantIds.length) throw new Error("Una de las piezas ya no está disponible.");

    const quantities = new Map(data.items.map((item) => [item.variantId, item.qty]));
    const lines = variants.map((variant: any) => {
      // Si la pasarela ya cobró, la prenda pudo pasar a borrador al agotarse con el apartado de esta misma clienta.
      if (!(data.paymentMethod === "card" && data.paymentReference) && (!variant.active || variant.products?.status !== "published")) {
        throw new Error("Una de las piezas ya no está disponible.");
      }
      const qty = quantities.get(variant.id) ?? 0;
      return {
        variant_id: variant.id,
        qty,
        unit_price_cop: variant.price_cop,
        product_name: variant.products.name,
        variant_label: [variant.color, variant.size].filter(Boolean).join(" · "),
      };
    });
    const subtotal = lines.reduce((sum, line) => sum + line.unit_price_cop * line.qty, 0);
    const [{ data: shippingRow }, { data: taxRow }, { data: intlRow }, { data: memberships }] = await Promise.all([
      supabaseAdmin.from("app_settings").select("value").eq("key", "shipping_settings").maybeSingle(),
      supabaseAdmin.from("app_settings").select("value").eq("key", "tax_settings").maybeSingle(),
      supabaseAdmin.from("app_settings").select("value").eq("key", "international_settings").maybeSingle(),
      supabaseAdmin.from("collection_products").select("product_id, collection_id").in("product_id", variants.map((variant: any) => variant.products.id)),
    ]);
    const { normalizeShippingSettings, normalizeTaxSettings, quoteShipping, includedTax } = await import("@/lib/store-settings");
    const shippingSettings = normalizeShippingSettings(shippingRow?.value);
    const taxSettings = normalizeTaxSettings(taxRow?.value);
    const shippingItems = variants.map((variant: any) => ({
      productId: variant.products.id,
      qty: quantities.get(variant.id) ?? 0,
      weightGrams: variant.weight_grams,
      collectionIds: (memberships ?? []).filter((row) => row.product_id === variant.products.id).map((row) => row.collection_id),
    }));
    const { normalizeIntlSettings, itemsWeightKg } = await import("@/lib/international");
    const weightKg = itemsWeightKg(shippingItems);
    const international = data.currency === "USD";
    const pickup = data.shipTo.deliveryKind === "pickup";
    if (pickup) {
      const { data: location } = await supabaseAdmin.from("locations").select("id").eq("name", data.shipTo.pickupStore ?? "").eq("kind", "store").maybeSingle();
      if (!location || data.shipTo.country !== "Colombia") throw new Error("La recogida no está disponible en ese destino.");
    }
    if (international !== ((await import("@/lib/locale")).currencyForCountry(data.shipTo.country) === "USD")) throw new Error("La moneda no coincide con el destino.");
    const intlSettings = normalizeIntlSettings(intlRow?.value);
    if (international && !intlSettings.enabled) throw new Error("Las compras internacionales no están disponibles en este momento.");
    const shippingQuote = pickup ? { matched: true, free: true, cost: 0, label: `Recoger en ${data.shipTo.pickupStore}`, rateId: null, weightKg: 0 } : international
        ? { matched: true, free: false, cost: (await import("@/lib/international")).intlShippingUsd(intlSettings, data.shipTo.country, data.promotionCode ? subtotal / intlSettings.usdRate : Math.ceil(subtotal / intlSettings.usdRate), weightKg).costUsd * intlSettings.usdRate, label: "Envío internacional", rateId: null, weightKg: 0 }
        : quoteShipping(shippingSettings, subtotal, shippingItems, data.shipTo.country, data.shipTo.department, { signedIn: false });
    if (!shippingQuote.matched) throw new Error("No hay una tarifa de envío disponible para este destino.");
    const shipping = shippingQuote.cost;
    const tax = includedTax(taxSettings, subtotal, data.shipTo.country);
    // Subtotal en dólares: si la variante tiene precio USD guardado, ese manda; si no, se convierte desde COP.
    const subtotalUsd = lines.reduce((sum, line) => {
      const variant = variants.find((v: any) => v.id === line.variant_id) as any;
      const unitUsd = Number(variant?.price_usd) > 0 ? Number(variant.price_usd) : 0;
      if (international && !unitUsd) throw new Error("Una pieza no tiene precio en dólares todavía.");
      return sum + unitUsd * line.qty;
    }, 0);

    let codeDiscountUsd = 0;
    let codeDiscountCop = 0;
    if (data.promotionCode) {
      const { data: promo, error } = await supabaseAdmin.from("promotions").select("kind,value,amount_currency,amount_usd,active,channels,starts_at,ends_at,min_subtotal_cop").eq("code", data.promotionCode.trim().toUpperCase()).maybeSingle();
      if (error || !promo) throw new Error("No pudimos validar el código");
      const { promotionDiscount } = await import("@/lib/promotions");
      const discount = promotionDiscount(promo, data.currency, subtotal, subtotalUsd);
      codeDiscountUsd = discount.discountUsd;
      codeDiscountCop = discount.discountCop;
    }

    // Una tarjeta solo cuenta como pagada si la pasarela confirmó el cobro completo.
    let paidReference: string | null = null;
    if (data.paymentMethod === "card") {
      if (!data.paymentReference) throw new Error("Falta confirmar el pago con la pasarela.");
      const { data: attempt } = await supabaseAdmin
        .from("payment_attempts")
        .select("status, currency, amount")
        .eq("reference", data.paymentReference)
        .maybeSingle();
      const charged = international ? subtotalUsd + Math.ceil(shipping / intlSettings.usdRate) - codeDiscountUsd : subtotal + shipping - codeDiscountCop;
      if (!attempt || attempt.status !== "paid" || (attempt.currency !== data.currency && !(attempt.currency === "USD" && data.currency === "COP"))) {
        throw new Error("No pudimos confirmar tu pago.");
      }
      // El cobro ya ocurrió: una diferencia de precio (p. ej. precio Sale) no debe dejar el pago sin pedido; se registra para revisión.
      // PayPal cobra en dólares aunque el pedido sea en pesos.
      if (attempt.currency === data.currency && Number(attempt.amount) + (international ? 0.05 : 1) < charged) {
        console.warn("Cobro menor al total recalculado", data.paymentReference, attempt.amount, charged);
      }
      paidReference = data.paymentReference;
    }

    const { data: existing } = await supabaseAdmin
      .from("orders")
      .select("id, number, status")
      .eq("idempotency_key", data.idempotencyKey)
      .maybeSingle();
    if (existing?.status !== "draft" && existing?.status !== "reserved" && existing) return existing;
    if (paidReference) {
      const { data: used } = await supabaseAdmin.from("orders").select("id, number, status").eq("payment_reference", paidReference).maybeSingle();
      if (used) {
        if (data.idempotencyKey === paidReference && used.status !== "draft" && used.status !== "reserved") return used;
        if (!existing || existing.id !== used.id || data.idempotencyKey !== paidReference) throw new Error("Este pago ya se usó en otro pedido.");
      }
    }

    const { data: order, error: orderError } = existing
      ? { data: { id: existing.id, number: existing.number }, error: null }
      : await supabaseAdmin
      .from("orders")
      .insert({
        customer_id: null,
        hold_token: data.holdToken ?? null,
        source: "ecom",
        status: "draft",
        subtotal_cop: subtotal,
        shipping_cop: shipping,
        total_cop: subtotal + shipping,
        currency: data.currency,
        total_usd: international ? subtotalUsd + Math.ceil(shipping / intlSettings.usdRate) : null,
        buyer_country: data.shipTo.country,
        shipping_rule: { id: shippingQuote.rateId, label: shippingQuote.label, country: data.shipTo.country, region: data.shipTo.department },
        shipping_weight_kg: shippingQuote.weightKg,
        tax_included_cop: tax.includedCop,
        tax_rate: tax.ratePct,
        tax_scope: tax.applies ? tax.scope : null,
        idempotency_key: data.idempotencyKey,
        analytics_session_id: data.analyticsSessionId ?? null,
        payment_method: data.paymentMethod,
        payment_reference: paidReference,
        payment_status: data.paymentMethod === "transfer" ? "review" : "paid",
        contact_email: data.shipTo.email,
        contact_phone: data.shipTo.phone,
        contact_name: `${data.shipTo.firstName} ${data.shipTo.lastName}`,
        ship_to: {
          recipient: `${data.shipTo.firstName} ${data.shipTo.lastName}`,
          document_id: data.shipTo.documentId,
          email: data.shipTo.email,
          phone: data.shipTo.phone,
          line1: data.shipTo.line1,
          line2: data.shipTo.line2,
          city: data.shipTo.city,
          department: data.shipTo.department,
          postal_code: data.shipTo.postalCode,
          country: data.shipTo.country,
          delivery_kind: pickup ? "pickup" : "ship",
          delivery_label: shippingQuote.label,
          payment_method: data.paymentMethod,
        },
      })
      .select("id, number")
      .single();
    if (orderError) {
      // La otra pestaña pudo confirmar la misma referencia mientras insertábamos.
      if (paidReference && data.idempotencyKey === paidReference) {
        const { data: retry } = await supabaseAdmin.from("orders").select("id, number, status").eq("idempotency_key", data.idempotencyKey).maybeSingle();
        if (retry && retry.status !== "draft" && retry.status !== "reserved") return retry;
      }
      throw orderError;
    }

    if (!order) throw new Error("No pudimos crear el pedido. Volveremos a intentar la confirmación.");
    const { data: savedItems, error: savedItemsError } = await supabaseAdmin.from("order_items").select("variant_id").eq("order_id", order.id);
    if (savedItemsError) throw savedItemsError;
    const savedVariants = new Set((savedItems ?? []).map((item) => item.variant_id));
    const missingLines = lines.filter((line) => !savedVariants.has(line.variant_id));
    if (missingLines.length) {
    const { error: itemsError } = await supabaseAdmin.from("order_items").insert(
      missingLines.map((line) => {
        const v: any = variants.find((x: any) => x.id === line.variant_id);
        return { ...line, order_id: order.id, unit_price_usd: international && Number(v?.price_usd) > 0 ? Number(v.price_usd) : null };
      }) as any,
    );
    if (itemsError) throw itemsError;
    }

    if (data.promotionCode) {
      const { error } = await supabaseAdmin.rpc("apply_order_usd_code", { _order_id: order.id, _code: data.promotionCode });
      if (error) throw new Error(error.message);
    }
    const { error: reserveError } = await supabaseAdmin.rpc("reserve_stock", {
      _order_id: order.id,
      _minutes: 20,
      _channel: "online",
    });
    if (reserveError) {
      // Si el cobro ya entró, el pedido nunca queda en borrador: se aparta en
      // Ecommerce y queda marcado «Sin inventario asignado» para el equipo.
      if (!paidReference) throw new Error("No hay inventario suficiente para completar tu pedido.");
      console.error("reserve_stock falló en pedido pagado", order.id, reserveError.message);
      const { error: fbError } = await (supabaseAdmin.rpc as any)("reserve_stock_paid_fallback", { _order_id: order.id });
      if (fbError) throw fbError;
    }

    const { error: confirmError } = await supabaseAdmin.rpc("confirm_order", {
      _order_id: order.id,
      _idempotency_key: data.idempotencyKey,
    });
    if (confirmError) throw confirmError;
    return order;
}

/** Si un cobro ya entró y guardamos el carrito al iniciar el pago, crea el pedido sin depender del navegador. */
export async function finalizePaidAttempt(reference: string): Promise<{ id: string; number: string } | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: attempt, error: attemptError } = await supabaseAdmin.from("payment_attempts").select("status, draft").eq("reference", reference).maybeSingle();
  if (attemptError) throw attemptError;
  if (!attempt || attempt.status !== "paid" || !attempt.draft) return null;
  const { data: existing, error: existingError } = await supabaseAdmin.from("orders").select("id, number, status").eq("payment_reference", reference).maybeSingle();
  if (existingError) throw existingError;
  if (existing && !["draft", "reserved"].includes(existing.status)) return { id: existing.id, number: existing.number };
  const { guestCheckoutSchema } = await import("./guest-checkout.functions");
  const draft = attempt.draft as Record<string, unknown>;
  if (draft.preparedOrderId) {
    const { data: confirmed, error } = await supabaseAdmin.rpc("finalize_prepared_checkout", { _reference: reference });
    if (error) throw error;
    return confirmed as { id: string; number: string };
  }
  const parsed = guestCheckoutSchema.parse({ ...draft, paymentMethod: "card", paymentReference: reference, idempotencyKey: reference });
  return placeGuestOrderCore(parsed);
}
