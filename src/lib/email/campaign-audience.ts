import { z } from "zod";

const emailSchema = z.string().trim().email().max(200);

export function campaignAudience(rows: { email: string | null; name?: string | null }[]) {
  const unique = new Map<string, { email: string; name: string | null }>();
  for (const row of rows) {
    const parsed = emailSchema.safeParse(row.email);
    if (!parsed.success) continue;
    const email = parsed.data.toLowerCase();
    if (!unique.has(email)) unique.set(email, { email, name: row.name?.slice(0, 120) ?? null });
  }
  return [...unique.values()];
}