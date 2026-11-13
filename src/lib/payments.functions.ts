import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { paymentDraftSchema, type PaymentDraft } from "./checkout/payment-draft";

const SECRET_KEYS = {
  wompi_integrity: "wompi_integrity_secret",
  wompi_private: "wompi_private_key",
  paypal_secret: "paypal_client_secret",
  addi_secret: "addi_client_secret",
  addi_callback: "addi_callback_password",
} as const;

type SecretName = keyof typeof SECRET_KEYS;

type PaymentsRow = {
  wompi?: { enabled?: boolean; mode?: string; publicKey?: string };
  paypal?: { enabled?: boolean; mode?: string; clientId?: string };
};

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function loadPayments() {
  const db = await admin();
  const { data } = await db.from("app_settings").select("value").eq("key", "payment_settings").maybeSingle();
  return (data?.value ?? {}) as PaymentsRow;
}

async function loadSecret(key: string) {
  const { readSecret } = await import("./secrets.server");
  return readSecret(await admin(), key);
}

async function trackAttempt(reference: string, provider: string, currency: string, amount: number, draft: PaymentDraft) {
  const db = await admin();
  const { beginGatewayAttempt } = await import("./payment-guards.server");
  return beginGatewayAttempt(db, reference, provider, currency, amount, draft);
}

/** Busca el pedido creado tras un pago en pasarela; la referencia es un UUID imposible de adivinar. */
export const findOrderByPaymentReference = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => z.object({ reference: z.string().min(6).max(64) }).parse(data))
  .handler(async ({ data }): Promise<{ id: string; number: string } | null> => {
    const db = await admin();
    const { finalizePaidAttempt } = await import("./checkout/guest-order.server");
    await finalizePaidAttempt(data.reference);
    const { data: order } = await db.from("orders").select("id, number").eq("payment_reference", data.reference).eq("payment_status", "paid").neq("status", "draft").maybeSingle();
    return order ? { id: String(order.id), number: String(order.number) } : null;
  });

async function checkOrigin(origin: string) {
  const { safeOrigin } = await import("./payment-guards.server");
  return safeOrigin(origin);
}

// Vence antes que el apartado de 20 min: nunca se cobra una prenda que ya no está apartada.
const WOMPI_LINK_MINUTES = 18;

/** Enlace de Wompi Web Checkout con la firma de integridad calculada en el servidor. */
export const createWompiPayment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      amountCop: z.number().int().positive().max(2_000_000_000),
      reference: z.string().min(6).max(64),
      origin: z.string().url().max(200),
      email: z.string().email().max(255).optional(),
      draft: paymentDraftSchema,
    }).parse(data),
  )
  .handler(async ({ data }): Promise<{ url: string }> => {
    const settings = await loadPayments();
    const publicKey = String(settings.wompi?.publicKey ?? "").trim();
    const integrity = await loadSecret(SECRET_KEYS.wompi_integrity);
    if (!publicKey || !integrity) throw new Error("Wompi aún no está configurado.");
    data.origin = await checkOrigin(data.origin);

    const cents = Math.round(data.amountCop * 100);

    const savedUrl = await trackAttempt(data.reference, "wompi", "COP", data.amountCop, data.draft);
    if (savedUrl) {
      // Reutiliza el enlace solo si aún no vence (los enlaces vencidos se regeneran).
      const exp = new URL(savedUrl).searchParams.get("expiration-time");
      if (!exp || new Date(exp).getTime() - Date.now() > 2 * 60_000) return { url: savedUrl };
    }

    // Vencimiento corto: impide medios de pago diferido (corresponsal/efectivo),
    // que se pagan días después cuando las prendas ya no están apartadas.
    const expiration = new Date(Date.now() + WOMPI_LINK_MINUTES * 60_000).toISOString();
    const raw = `${data.reference}${cents}COP${expiration}${integrity}`;
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(raw));
    const signature = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");

    const params = new URLSearchParams({
      "public-key": publicKey,
      currency: "COP",
      "amount-in-cents": String(cents),
      reference: data.reference,
      "redirect-url": `${data.origin}/api/public/pagos/wompi`,
      "signature:integrity": signature,
      "expiration-time": expiration,
    });
    if (data.email) params.set("customer-data:email", data.email);
    const url = `https://checkout.wompi.co/p/?${params.toString()}`;
    const { storeGatewayUrl } = await import("./payment-guards.server");
    await storeGatewayUrl(await admin(), data.reference, url);
    return { url };
  });

/** Crea la orden en PayPal y devuelve el enlace de aprobación. */
export const createPaypalPayment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      amountUsd: z.number().positive().max(100_000),
      reference: z.string().min(6).max(64),
      origin: z.string().url().max(200),
      draft: paymentDraftSchema,
    }).parse(data),
  )
  .handler(async ({ data }): Promise<{ url: string }> => {
    const settings = await loadPayments();
    const clientId = String(settings.paypal?.clientId ?? "").trim();
    const secret = await loadSecret(SECRET_KEYS.paypal_secret);
    if (!clientId || !secret) throw new Error("PayPal aún no está configurado.");
    data.origin = await checkOrigin(data.origin);
    const base = settings.paypal?.mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";

    const auth = btoa(`${clientId}:${secret}`);
    const tokenResponse = await fetch(`${base}/v1/oauth2/token`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: "grant_type=client_credentials",
    });
    const tokenJson = (await tokenResponse.json()) as { access_token?: string };
    if (!tokenResponse.ok || !tokenJson.access_token) throw new Error("No pudimos conectar con PayPal.");

    const savedUrl = await trackAttempt(data.reference, "paypal", "USD", data.amountUsd, data.draft);
    if (savedUrl) return { url: savedUrl };

    const orderResponse = await fetch(`${base}/v2/checkout/orders`, {
      method: "POST",
      headers: { Authorization: `Bearer ${tokenJson.access_token}`, "Content-Type": "application/json", "PayPal-Request-Id": data.reference },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{ custom_id: data.reference, amount: { currency_code: "USD", value: data.amountUsd.toFixed(2) } }],
        application_context: {
          brand_name: "Tu Marca",
          return_url: `${data.origin}/api/public/pagos/paypal?ref=${encodeURIComponent(data.reference)}`,
          cancel_url: `${data.origin}/carrito?pago=cancelado`,
        },
      }),
    });
    const orderJson = (await orderResponse.json()) as { id?: string; links?: { rel: string; href: string }[]; message?: string };
    const approve = orderJson.links?.find((link) => link.rel === "approve")?.href;
    if (!orderResponse.ok || !approve) {
      // A received client-error response rejects this request; a server error is ambiguous.
      if (orderResponse.status >= 400 && orderResponse.status < 500) {
        const { rejectGatewayAttempt } = await import("./payment-guards.server");
        await rejectGatewayAttempt(await admin(), data.reference);
      }
      throw new Error(orderJson.message ?? "No pudimos iniciar el pago.");
    }

    const db = await admin();
    const { storeGatewayUrl } = await import("./payment-guards.server");
    await storeGatewayUrl(db, data.reference, approve, orderJson.id);
    return { url: approve };
  });

/** Topes de monto de Addi para mostrar el método deshabilitado con aviso si no aplica. */
export const addiLimits = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ amountCop: z.number().int().nonnegative().max(2_000_000_000) }).parse(data))
  .handler(async ({ data }): Promise<{ minAmount: number; maxAmount: number } | null> => {
    const db = await admin();
    const { addiSettings, addiConfig } = await import("./pagos/addi.server");
    const settings = await addiSettings(db);
    if (!settings.allyId) return null;
    const config = await addiConfig(settings.allyId, data.amountCop);
    return config ? { minAmount: config.minAmount, maxAmount: config.maxAmount } : null;
  });

/** Crea la solicitud de crédito en Addi y devuelve la URL de redirección. */
export const createAddiPayment = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      amountCop: z.number().int().positive().max(2_000_000_000),
      shippingCop: z.number().int().nonnegative().max(2_000_000_000).default(0),
      draft: paymentDraftSchema,
      reference: z.string().min(6).max(64),
      origin: z.string().url().max(200),
      email: z.string().email().max(255),
      phone: z.string().min(7).max(30),
      firstName: z.string().min(1).max(80),
      lastName: z.string().min(1).max(80),
      documentId: z.string().min(4).max(30),
      address: z.string().max(200).default(""),
      city: z.string().max(80).default(""),
      items: z.array(z.object({
        sku: z.string().min(1).max(80),
        name: z.string().min(1).max(200),
        quantity: z.number().int().positive().max(999),
        unitPrice: z.number().nonnegative().max(2_000_000_000),
        pictureUrl: z.string().url().max(500).optional(),
      })).min(1).max(100),
    }).parse(data),
  )
  .handler(async ({ data }): Promise<{ url: string }> => {
    data.origin = await checkOrigin(data.origin);
    const db = await admin();
    const { createAddiApplication } = await import("./pagos/addi.server");
    const savedUrl = await trackAttempt(data.reference, "addi", "COP", data.amountCop, data.draft);
    if (savedUrl) return { url: savedUrl };
    const { url } = await createAddiApplication(db, data as never);
    const { storeGatewayUrl } = await import("./payment-guards.server");
    await storeGatewayUrl(db, data.reference, url);
    return { url };
  });

/** Estado del intento de pago registrado por cualquiera de las pasarelas. */
export const hostedPaymentStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ reference: z.string().min(6).max(64) }).parse(data))
  .handler(async ({ data }): Promise<{ status: "pending" | "paid" | "failed"; reference: string }> => {
    const db = await admin();
    const { data: row } = await db
      .from("payment_attempts")
      .select("status, provider, external_id")
      .eq("reference", data.reference)
      .maybeSingle();
    if (row?.status === "pending" && row.provider === "bold") {
      const { reconcileBoldPayment } = await import("./pagos/bold.server");
      try { await reconcileBoldPayment(db, data.reference, process.env["BOLD_ONLINE_API_KEY"] ?? ""); } catch { /* sigue pendiente */ }
      const { data: fresh } = await db.from("payment_attempts").select("status").eq("reference", data.reference).maybeSingle();
      return { status: (fresh?.status as "pending" | "paid" | "failed") ?? "pending", reference: data.reference };
    }
    if (row?.status === "pending" && row.provider === "wompi" && row.external_id) {
      const { confirmWompiTransaction, wompiBase } = await import("./pagos/wompi.server");
      const result = await confirmWompiTransaction(db, await wompiBase(db), row.external_id);
      return { status: result?.paid ? "paid" : result?.pending || !result ? "pending" : "failed", reference: data.reference };
    }
    return {
      status: (row?.status as "pending" | "paid" | "failed") ?? "pending",
      reference: data.reference,
    };
  });

/** Adjunta el comprobante de transferencia al pedido y lo deja en revisión. */
export const attachTransferProof = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      orderNumber: z.string().min(3).max(40),
      path: z.string().min(3).max(300),
    }).parse(data),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await admin();
    const folder = data.path.split("/")[0];
    if ((folder !== data.orderNumber && folder !== "pendientes") || data.path.includes("..")) {
      throw new Error("Comprobante inválido.");
    }
    // Solo se adjunta una vez, a pedidos por transferencia que aún esperan pago.
    const { data: order } = await db
      .from("orders")
      .select("id, payment_status, payment_proof_url, payment_method, created_at")
      .eq("number", data.orderNumber)
      .maybeSingle();
    const method = String(order?.payment_method ?? "").toLowerCase();
    if (!order || order.payment_proof_url || !["pending", "review"].includes(String(order.payment_status)) || !method.startsWith("transfer")) {
      throw new Error("Este pedido no admite comprobante.");
    }
    const { data: signed, error } = await db.storage.from("payment-receipts").createSignedUrl(data.path, 60 * 60 * 24 * 365);
    if (error || !signed?.signedUrl) throw new Error("No pudimos guardar el comprobante.");
    const { error: updateError } = await db
      .from("orders")
      .update({ payment_status: "review", payment_proof_url: signed.signedUrl, payment_proof_at: new Date().toISOString() })
      .eq("id", order.id)
      .is("payment_proof_url", null);
    if (updateError) throw new Error("No pudimos guardar el comprobante.");
    return { ok: true };
  });

/** Guarda (o borra) las credenciales privadas de Wompi y PayPal. */
export const savePaymentSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ name: z.enum(["wompi_integrity", "wompi_private", "paypal_secret", "addi_secret", "addi_callback"]), secret: z.string().max(400) }).parse(data),
  )
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Solo administradores.");
    const db = await admin();
    const key = SECRET_KEYS[data.name as SecretName];
    const value = data.secret.trim();
    if (!value) {
      await db.from("integration_secrets").delete().eq("key", key);
      return { ok: true };
    }
    const { error } = await db
      .from("integration_secrets")
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) throw new Error("No pudimos guardar la credencial.");
    return { ok: true };
  });

/** Indica qué credenciales privadas de pago ya están guardadas. */
export const paymentSecretStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Record<SecretName, boolean>> => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Solo administradores.");
    const db = await admin();
    const { data } = await db.from("integration_secrets").select("key").in("key", Object.values(SECRET_KEYS));
    const { envSecret } = await import("./secrets.server");
    // También cuentan las que están como variables del servidor.
    const keys = [...(data ?? []).map((row) => row.key), ...Object.values(SECRET_KEYS).filter((k) => envSecret(k))];
    return {
      wompi_integrity: keys.includes(SECRET_KEYS.wompi_integrity),
      wompi_private: keys.includes(SECRET_KEYS.wompi_private),
      paypal_secret: keys.includes(SECRET_KEYS.paypal_secret),
      addi_secret: keys.includes(SECRET_KEYS.addi_secret),
      addi_callback: keys.includes(SECRET_KEYS.addi_callback),
    };
  });

/** Guarda en el servidor el carrito y la dirección del pago iniciado, para crear el pedido aunque el navegador no vuelva. */
export const savePaymentDraft = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z.object({
      reference: z.string().uuid(),
      draft: z.object({
        items: z.array(z.object({ variantId: z.string().uuid(), qty: z.number().int().min(1).max(10) })).min(1).max(20),
        shipTo: z.record(z.string(), z.unknown()),
        currency: z.enum(["COP", "USD"]),
        // Apartado del checkout: al crear el pedido desde el servidor se convierte en su reserva.
        holdToken: z.string().uuid().optional(),
      }),
    }).parse(data),
  )
  .handler(async ({ data }) => {
    const db = await admin();
    // Solo se completa una vez y mientras el pago sigue pendiente.
    await db.from("payment_attempts").update({ draft: data.draft as never }).eq("reference", data.reference).eq("status", "pending").is("draft", null);
    return { ok: true };
  });

async function assertStaff(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
  if (!data) throw new Error("No autorizado.");
}

/** Cobros confirmados por la pasarela que aún no tienen pedido. */
export const listOrphanPayments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context);
    const db = await admin();
    const since = new Date(Date.now() - 30 * 86400_000).toISOString();
    const { data: attempts } = await db.from("payment_attempts").select("reference, provider, currency, amount, draft, updated_at").eq("status", "paid").gte("updated_at", since).lte("created_at", new Date(Date.now() - 10 * 60_000).toISOString());
    const refs = (attempts ?? []).map((a) => a.reference);
    if (!refs.length) return [];
    const { data: orders } = await db.from("orders").select("payment_reference").in("payment_reference", refs).neq("status", "draft");
    const used = new Set((orders ?? []).map((o) => o.payment_reference));
    return (attempts ?? []).filter((a) => !used.has(a.reference)).map((a) => {
      const shipTo = ((a.draft as any)?.shipTo ?? {}) as Record<string, string>;
      return { reference: a.reference, provider: a.provider, currency: a.currency, amount: Number(a.amount), at: a.updated_at, hasDraft: !!a.draft, name: [shipTo.firstName, shipTo.lastName].filter(Boolean).join(" "), email: shipTo.email ?? "" };
    });
  });

export const recoverOrphanPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ reference: z.string().min(6).max(64) }).parse(data))
  .handler(async ({ data, context }) => {
    await assertStaff(context);
    const { finalizePaidAttempt } = await import("./checkout/guest-order.server");
    const order = await finalizePaidAttempt(data.reference);
    if (!order) throw new Error("Este cobro no tiene datos del carrito guardados.");
    return order;
  });

/** Releases an abandoned prepared checkout unless the gateway reports an approved or in-process payment. */
export const abandonPreparedCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ token: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }): Promise<{ status: "released" | "paid" | "processing"; reference?: string }> => {
    const db = await admin();
    const { data: order } = await db.from("orders").select("id").eq("hold_token", data.token).eq("customer_id", context.userId).eq("source", "ecom").in("status", ["draft", "reserved"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (order) {
      const { data: attempts } = await db.from("payment_attempts").select("reference, status, provider, external_id").eq("draft->>preparedOrderId", order.id).in("status", ["pending", "paid"]);
      for (const a of attempts ?? []) {
        if (a.status === "paid") return { status: "paid", reference: a.reference };
        if (a.provider === "bold" && a.status === "pending") return { status: "processing" };
        if (a.provider === "wompi" && a.external_id) {
          const { confirmWompiTransaction, wompiBase } = await import("./pagos/wompi.server");
          const result = await confirmWompiTransaction(db, await wompiBase(db), a.external_id);
          if (result?.paid) return { status: "paid", reference: a.reference };
          if (result?.pending || !result) return { status: "processing" };
        }
      }
    }
    const { data: res, error } = await context.supabase.rpc("abandon_prepared_checkout", { _token: data.token });
    if (error) throw new Error(error.message);
    if ((res as { paid?: boolean } | null)?.paid) return { status: "processing" };
    return { status: "released" };
  });
