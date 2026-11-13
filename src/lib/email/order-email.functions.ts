import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Reenvía el correo de confirmación de compra de un pedido (solo personal). */
export const resendOrderConfirmation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: staff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!staff) throw new Error("No autorizado");
    const { resendOrderConfirmationEmail } = await import("./events.server");
    return resendOrderConfirmationEmail(data.orderId);
  });

/** Vista previa de un correo automático con el contenido personalizado (solo personal). */
export const previewAutoEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ event: z.enum(["customer_online_confirmed", "customer_abandoned_cart", "customer_welcome", "customer_review_request"]), content: z.record(z.string(), z.any()) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: staff } = await context.supabase.rpc("is_staff", { _user_id: context.userId });
    if (!staff) throw new Error("No autorizado");
    const { layout, p, itemsTable, SITE } = await import("./resend.server");
    const { withCustomContent } = await import("./custom-content");
    const c = data.content as any;
    const sample = [{ name: "Onca Top Ivory", label: "Talla S", qty: 1, price: 289000 }, { name: "Selva Pant", label: "Talla M", qty: 1, price: 439000 }];
    if (data.event === "customer_review_request") {
      const { reviewRequestBody } = await import("./events.server");
      return { html: layout("¿Cómo te quedaron tus prendas?", withCustomContent(reviewRequestBody("Ana"), c), { label: "Dejar mi reseña", href: `${SITE}/cuenta/pedidos` }) };
    }
    if (data.event === "customer_welcome") {
      const { welcomeBody } = await import("./events.server");
      return { html: layout("Bienvenida a Tu Marca", withCustomContent(welcomeBody("Ana"), c), { label: "Explorar la tienda", href: `${SITE}/tienda` }) };
    }
    if (data.event === "customer_abandoned_cart") {
      return { html: layout("Dejaste algo en tu carrito", withCustomContent(p("Hola Ana,") + p("Guardamos tus prendas por un tiempo. Termina tu compra antes de que se agoten.") + itemsTable(sample, 728000), c), { label: "Volver a mi carrito", href: `${SITE}/carrito` }) };
    }
    const { recommendProducts } = await import("./events.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const prods = c.showProducts ? await recommendProducts(supabaseAdmin, []) : [];
    return { html: layout("Gracias por tu compra", withCustomContent(p("Hola Ana,") + p("Recibimos el pago de tu pedido <strong>#1001</strong>. Te avisaremos cuando salga hacia ti.") + itemsTable(sample, 728000), c, prods), { label: "Ver mi pedido", href: `${SITE}/tienda` }) };
  });
