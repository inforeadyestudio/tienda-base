import { z } from "zod";

export function colombiaMonth(now = new Date()) {
  return new Date(now.getTime() - 5 * 3600000).toISOString().slice(0, 7);
}

export const legacyCreditSchema = z.object({
  requestId: z.string().uuid(), locationId: z.string().uuid(), destinationLocationId: z.string().uuid(),
  saleMonth: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).refine((v) => v < colombiaMonth(), "El mes de la venta debe ser anterior al mes actual"),
  legacyInvoiceNumber: z.string().trim().max(80).optional(), notes: z.string().trim().max(500).optional(),
  resolution: z.enum(["reembolso", "cambio"]),
  paymentMethod: z.enum(["efectivo", "transferencia", "tarjeta_credito", "tarjeta_debito", "datafono"]).optional(),
  customer: z.object({ document_type: z.enum(["CC", "NIT", "CE", "PP"]), document_number: z.string().trim().min(1).max(40), name: z.string().trim().min(1).max(150), email: z.union([z.string().email(), z.literal("")]).optional() }).optional(),
  lines: z.array(z.object({ sku: z.string().trim().min(1).max(80), quantity: z.number().int().min(1).max(1000), unit_price: z.number().positive().max(100000000), tax_rate: z.literal(19).default(19), reason: z.enum(["talla", "decision_propia", "defecto"]), condition: z.enum(["buena", "defectuosa"]) })).min(1).max(100),
}).superRefine((v, ctx) => {
  if (v.resolution === "reembolso" && !v.paymentMethod) ctx.addIssue({ code: "custom", path: ["paymentMethod"], message: "Selecciona el medio de pago original" });
  if (new Set(v.lines.map((l) => l.sku)).size !== v.lines.length) ctx.addIssue({ code: "custom", path: ["lines"], message: "Agrupa cada código en una sola línea" });
});
export type LegacyCreditInput = z.infer<typeof legacyCreditSchema>;

export function legacyCreditPayload(input: LegacyCreditInput, center: string) {
  return { type: "notas_credito", data: { credit_notes: [{
    external_id: `DEV-LEG-${input.requestId}`, without_invoice: true, channel: "pos", operation_center_code: center,
    sale_month: input.saleMonth, resolution: input.resolution,
    ...(input.resolution === "reembolso" ? { payment_method: input.paymentMethod } : {}),
    ...(input.legacyInvoiceNumber ? { legacy_invoice_number: input.legacyInvoiceNumber } : {}),
    ...(input.customer ? { customer: input.customer } : {}),
    ...(input.notes ? { notes: input.notes } : {}), lines: input.lines,
  }] } };
}

export function legacyCreditResult(body: any) {
  const raw = body?.results?.[0] ?? body?.credit_notes?.[0] ?? body?.data?.credit_notes?.[0] ?? body?.data?.[0] ?? body?.accepted?.[0] ?? body?.rejected?.[0] ?? body;
  const approved = raw?.status === "emitida_dian" && Boolean(raw?.numero_dian) && Boolean(raw?.cude);
  return {
    status: approved ? "issued" : raw?.status === "duplicada" ? "duplicate" : raw?.status === "error_dian" ? "error" : "pending",
    numero_dian: raw?.numero_dian ?? null, cude: raw?.cude ?? null, public_url: raw?.public_url ?? null,
    error: approved ? null : raw?.error_dian ?? raw?.error ?? raw?.message ?? (raw?.status === "duplicada" ? "Nota ya recibida; consulta su aprobación DIAN" : "Pendiente de confirmación DIAN"),
  };
}