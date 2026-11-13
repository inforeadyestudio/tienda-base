import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const guestCheckoutSchema = z.object({
  items: z.array(z.object({
    variantId: z.string().uuid(),
    qty: z.number().int().min(1).max(10),
  })).min(1).max(20),
  shipTo: z.object({
    firstName: z.string().trim().min(2).max(80),
    lastName: z.string().trim().min(2).max(80),
    documentId: z.string().trim().max(30).regex(/^[A-Za-z0-9.-]*$/).optional().default(""),
    email: z.string().trim().email().max(255),
    phone: z.string().trim().min(7).max(30),
    line1: z.string().trim().max(180),
    line2: z.string().trim().max(120),
    city: z.string().trim().max(100),
    department: z.string().trim().max(100),
    postalCode: z.string().trim().max(12).optional().default(""),
    country: z.string().trim().min(2).max(100),
    deliveryKind: z.enum(["ship", "pickup"]).default("ship"),
    pickupStore: z.string().trim().min(1).max(120).optional(),
  }).superRefine((value, ctx) => {
    if (value.deliveryKind === "pickup") {
      if (!value.pickupStore) ctx.addIssue({ code: "custom", path: ["pickupStore"], message: "Elige dónde recoger tu pedido." });
    } else {
      for (const [key, min] of [["line1", 5], ["city", 2], ["department", 2]] as const) {
        if (value[key].length < min) ctx.addIssue({ code: "custom", path: [key], message: "Completa la dirección de envío." });
      }
    }
  }),
  paymentMethod: z.enum(["card", "transfer"]),
  currency: z.enum(["COP", "USD"]),
  paymentReference: z.string().min(6).max(64).optional(),
  idempotencyKey: z.string().uuid(),
  analyticsSessionId: z.string().uuid().optional(),
  holdToken: z.string().uuid().optional(),
  promotionCode: z.string().trim().min(1).max(80).optional(),
});

export type GuestCheckoutInput = z.infer<typeof guestCheckoutSchema>;

export const placeGuestOrder = createServerFn({ method: "POST" })
  .validator((input: unknown) => guestCheckoutSchema.parse(input))
  .handler(async ({ data }) => {
    const { placeGuestOrderCore } = await import("./guest-order.server");
    return placeGuestOrderCore(data);
  });
