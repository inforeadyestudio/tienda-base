import { metaDateRange, type MetaCampaign, type MetaInsight } from "./meta-report";

/** API de Meta directa, con token propio (usuario del sistema del Business Manager). */
export const META_GRAPH = "https://graph.facebook.com/v26.0";
export const metaToken = () => process.env["META_ACCESS_TOKEN"] || process.env["META_ADS_API_KEY"] || "";

type Page<T> = { data: T[]; paging?: { next?: string; cursors?: { after?: string } } };
export async function readMetaReport(from: string, to: string) {
  const metaKey = metaToken();
  if (!metaKey) throw new Error("La conexión de Meta no está disponible (falta META_ACCESS_TOKEN).");
  const headers = { Authorization: `Bearer ${metaKey}` };
  async function read<T>(path: string, query: Record<string, string>): Promise<T> {
    const url = new URL(`${META_GRAPH}${path}`);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
    const body = await response.text();
    if (!response.ok) {
      console.error(`Meta report [${response.status}]: ${body}`);
      let message = "No se pudo leer el informe de Meta.";
      try { message = JSON.parse(body).error?.message ?? message; } catch { /* non-JSON error */ }
      throw new Error(`Meta (${response.status}): ${message}`);
    }
    const result = JSON.parse(body);
    if (result.error) throw new Error(`Meta: ${result.error.message}`);
    return result as T;
  }
  async function all<T>(path: string, query: Record<string, string>): Promise<T[]> {
    const rows: T[] = [];
    const seen = new Set<string>();
    let after = "";
    for (;;) {
      const page = await read<Page<T>>(path, { ...query, limit: "100", ...(after ? { after } : {}) });
      rows.push(...page.data);
      if (!page.paging?.next) return rows;
      const cursor = page.paging.cursors?.after;
      if (!cursor || seen.has(cursor)) throw new Error("Meta devolvió un informe incompleto. Vuelve a consultar.");
      seen.add(cursor);
      after = cursor;
    }
  }
  const accounts = await all<{ id: string; name: string; currency: string; timezone_name: string }>(
    "/me/assigned_ad_accounts", { fields: "id,name,currency,timezone_name" });
  if (accounts.length !== 1) throw new Error("No se puede determinar una única cuenta publicitaria para este informe.");
  const account = accounts[0];
  if (!account) throw new Error("Meta no devolvió una cuenta publicitaria accesible.");
  const dates = metaDateRange(from, to, account.timezone_name);
  // Sequential reads stop immediately on quota/access errors. Cursor pages use the
  // gateway path, never Meta's upstream next URL (which can contain credentials).
  const campaigns = await all<MetaCampaign>(`/${account.id}/campaigns`, { fields: "id,name,status,objective,created_time" });
  const insights = await all<MetaInsight>(`/${account.id}/insights`, {
    level: "campaign", time_range: JSON.stringify(dates),
    fields: "campaign_id,campaign_name,account_currency,impressions,spend,actions,action_values",
    use_account_attribution_setting: "true",
  });
  return { account: { name: account.name, currency: account.currency, timezone: account.timezone_name },
    dates, campaigns, insights, fetchedAt: new Date().toISOString() };
}

export async function readMetaCampaignName(id: string): Promise<string | null> {
  const metaKey = metaToken();
  if (!metaKey) return null;
  const res = await fetch(`${META_GRAPH}/${id}?fields=name`, {
    headers: { Authorization: `Bearer ${metaKey}` }, signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) return null;
  const body = await res.json() as { name?: string };
  return body.name ?? null;
}
