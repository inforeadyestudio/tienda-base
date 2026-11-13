export type PortalStats = {
  accounts: number;
  sessions: number;
  events: number;
  total_accounts: number;
  sections: { section: string; visits: number; accounts: number }[];
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function count(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

// The RPC may arrive as one JSON object or as separate totals/section rows.
export function normalizePortalStats(data: unknown): PortalStats {
  const rows = Array.isArray(data) ? data.map(record) : [record(data)];
  const totals = rows.find((row) => "sessions" in row || "events" in row) ?? {};
  const registered = rows.find((row) => "total_accounts" in row) ?? {};
  const nested = rows.find((row) => Array.isArray(row.sections));
  const sections = nested ? (nested.sections as unknown[]).map(record) : rows.filter((row) => typeof row.section === "string");
  return {
    accounts: count(totals.accounts),
    sessions: count(totals.sessions),
    events: count(totals.events),
    total_accounts: count(registered.total_accounts),
    sections: sections.filter((row) => typeof row.section === "string").map((row) => ({
      section: String(row.section), visits: count(row.visits), accounts: count(row.accounts),
    })),
  };
}