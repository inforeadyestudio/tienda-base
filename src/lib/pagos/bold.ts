import { z } from "zod";

export const boldEventSchema = z.object({
  id: z.string().min(1).max(150),
  type: z.string().min(1).max(80),
  data: z.object({
    payment_id: z.string().min(1).max(150),
    amount: z.object({ currency: z.enum(["COP", "USD"]), total: z.number().positive().max(2_000_000_000) }),
    metadata: z.object({ reference: z.string().uuid() }),
  }),
});

export function boldAmount(amount: number, currency: "COP" | "USD") {
  return currency === "COP" ? String(Math.round(amount)) : amount.toFixed(2);
}

export function boldAmountMatches(expected: number, currency: string, received: number, receivedCurrency: string) {
  return currency === receivedCurrency && Number.isFinite(received) && received > 0 &&
    Math.round(expected * 100) === Math.round(received * 100);
}

export async function boldIntegrity(reference: string, amount: string, currency: string, secret: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${reference}${amount}${currency}${secret}`));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

/** Bold signs HMAC-SHA256 over base64 of the untouched UTF-8 body. */
export async function verifyBoldSignature(raw: string, signature: string, secret: string) {
  if (!secret || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const bytes = new TextEncoder().encode(raw);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const sig = Uint8Array.from(signature.match(/.{2}/g) ?? [], byte => parseInt(byte, 16));
  return crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(btoa(binary)));
}

export type BoldCheckoutConfig = {
  orderId: string; amount: string; currency: "COP" | "USD"; apiKey: string;
  integritySignature: string; description: string; redirectionUrl: string;
  expirationDate: number; renderMode: "embedded"; customerData?: string;
};