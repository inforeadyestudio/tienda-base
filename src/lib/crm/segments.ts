import type { CrmCustomer } from "./customers";

export interface SegmentRules {
  min_orders?: number | null;
  min_spend?: number | null;
  store?: string | null;
  last_purchase_days?: number | null;
  inactive_days?: number | null;
  with_email?: boolean;
  min_shopify_orders?: number | null;
  min_shopify_spend?: number | null;
  city?: string | null;
}

export interface CustomerSegment {
  id: string;
  name: string;
  description: string | null;
  rules: SegmentRules;
  created_at: string;
}

export const DEFAULT_RULES: SegmentRules = { with_email: true };

export function matchesSegment(c: CrmCustomer, rules: SegmentRules): boolean {
  if (rules.with_email && !c.email) return false;
  if (rules.min_orders && c.count < rules.min_orders) return false;
  if (rules.min_spend && c.total < rules.min_spend) return false;
  if (rules.min_shopify_orders && c.shopifyOrders < rules.min_shopify_orders) return false;
  if (rules.min_shopify_spend && c.shopifySpent < rules.min_shopify_spend) return false;
  if (rules.store && rules.store !== "all" && !c.stores.includes(rules.store)) return false;
  if (rules.city && !(c.city ?? "").toLowerCase().includes(rules.city.trim().toLowerCase())) return false;
  const days = c.last ? (Date.now() - new Date(c.last).getTime()) / 86400000 : Infinity;
  if (rules.last_purchase_days && days > rules.last_purchase_days) return false;
  if (rules.inactive_days && days < rules.inactive_days) return false;
  return true;
}

export function describeRules(rules: SegmentRules): string {
  const parts: string[] = [];
  if (rules.min_orders) parts.push(`${rules.min_orders}+ pedidos`);
  if (rules.min_spend) parts.push(`gasto desde $${rules.min_spend.toLocaleString("es-CO")}`);
  if (rules.min_shopify_orders) parts.push(`${rules.min_shopify_orders}+ compras históricas`);
  if (rules.min_shopify_spend) parts.push(`gasto histórico desde $${rules.min_shopify_spend.toLocaleString("es-CO")}`);
  if (rules.store && rules.store !== "all") parts.push(`canal ${rules.store}`);
  if (rules.city) parts.push(`ciudad ${rules.city}`);
  if (rules.last_purchase_days) parts.push(`compró en ${rules.last_purchase_days} días`);
  if (rules.inactive_days) parts.push(`sin comprar hace ${rules.inactive_days}+ días`);
  if (rules.with_email) parts.push("con correo");
  return parts.length ? parts.join(" · ") : "Todas las clientas";
}
