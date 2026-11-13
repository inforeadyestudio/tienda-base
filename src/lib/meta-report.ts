export type MetaAction = { action_type: string; value: string };
export type MetaInsight = {
  campaign_id: string; campaign_name: string; account_currency: string;
  impressions?: string; spend?: string; actions?: MetaAction[];
  action_values?: MetaAction[]; purchase_roas?: MetaAction[];
};
export type MetaCampaign = { id: string; name: string; status: string; objective: string; created_time?: string };
export function metaAction(actions: MetaAction[] | undefined, type: string): number | null {
  const action = actions?.find((a) => a.action_type === type);
  return action && Number.isFinite(Number(action.value)) ? Number(action.value) : null;
}
export function metaMetrics(row?: MetaInsight) {
  const spend = Number(row?.spend ?? 0);
  const value = metaAction(row?.action_values, "offsite_conversion.fb_pixel_purchase");
  return {
    spend, impressions: Number(row?.impressions ?? 0),
    clicks: metaAction(row?.actions, "link_click") ?? 0,
    landingViews: metaAction(row?.actions, "landing_page_view") ?? 0,
    purchases: metaAction(row?.actions, "offsite_conversion.fb_pixel_purchase") ?? 0,
    value,
    roas: value === null || spend <= 0 ? null : value / spend,
  };
}
export function metaDateRange(from: string, to: string, timezone: string) {
  const day = (date: Date) => new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
  return { since: day(new Date(from)), until: day(new Date(new Date(to).getTime() - 1)) };
}
export function resolveMetaName(label: string, campaigns: MetaCampaign[]) {
  return campaigns.find((campaign) => campaign.id === label)?.name ?? label;
}
/** Las campañas más recientes primero, según la fecha de creación de Meta. */
export function latestCampaigns(campaigns: MetaCampaign[], count: number) {
  return [...campaigns]
    .sort((a, b) => (b.created_time ?? "").localeCompare(a.created_time ?? ""))
    .slice(0, count);
}