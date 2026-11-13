export type ChannelKey = "online" | "manual" | "b2b" | "pos";

type ChannelOrder = {
  source: string;
  number?: string | null;
  b2b_mode?: string | null;
  is_manual?: boolean;
  pos_sales?: unknown[];
};

/** Classify the purchase itself, never the customer's account role. */
export function channelOf(o: ChannelOrder): ChannelKey {
  if (o.pos_sales?.length || o.source === "pos") return "pos";
  if (o.source === "assisted" || (o.b2b_mode && o.b2b_mode !== "direct") || String(o.number ?? "").startsWith("B2B-")) return "b2b";
  if (o.is_manual) return "manual";
  return "online";
}