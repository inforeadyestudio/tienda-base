import { z } from "zod";

export const publicCopySchema = z.object({
  description: z.string().max(5000).optional().nullable(),
  story: z.string().max(5000).optional().nullable(),
  name_en: z.string().max(200).optional().nullable(),
  description_en: z.string().max(5000).optional().nullable(),
  story_en: z.string().max(5000).optional().nullable(),
});

export function summarizeCopy(value: string): string {
  const text = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.length <= 160 ? text : `${text.slice(0, 159).trimEnd()}…`;
}

/** Omitted/empty translations never erase saved editorial copy. Materials is technical, not public. */
export function productCopy(payload: z.infer<typeof publicCopySchema>) {
  const row: { story?: string; description?: string; story_en?: string; description_en?: string; name_en?: string } = {};
  const es = payload.story?.trim() || payload.description?.trim();
  const en = payload.story_en?.trim() || payload.description_en?.trim();
  if (es) { row.story = es; row.description = summarizeCopy(es); }
  if (en) { row.story_en = en; row.description_en = summarizeCopy(en); }
  if (payload.name_en?.trim()) row.name_en = payload.name_en.trim();
  return row;
}