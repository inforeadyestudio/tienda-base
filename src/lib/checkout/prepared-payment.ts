import type { PaymentDraft } from "./payment-draft";

export type PreparedPayment = {
  reference: string;
  draft: PaymentDraft;
  url?: string;
  expiresAt?: string;
};

/** A pending attempt must be resumed, never replaced on popup dismissal. */
export function retryDecision(status: string, sameSnapshot: boolean, sameProvider: boolean) {
  if (status === "paid") return "confirm";
  if (status === "pending") return sameSnapshot && sameProvider ? "resume" : "block";
  return "retry";
}