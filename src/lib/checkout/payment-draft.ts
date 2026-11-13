import { z } from "zod";

/** Snapshot required before a provider can receive a payment request. */
export const paymentDraftSchema = z.object({
  items: z.array(z.object({ variantId: z.string().uuid(), qty: z.number().int().min(1).max(10) })).min(1).max(20),
  shipTo: z.record(z.string(), z.unknown()),
  currency: z.enum(["COP", "USD"]),
  holdToken: z.string().uuid(),
  analyticsSessionId: z.string().uuid().optional(),
  preparedOrderId: z.string().uuid().optional(),
  promotionCode: z.string().trim().min(1).max(80).optional(),
});

export type PaymentDraft = z.infer<typeof paymentDraftSchema>;