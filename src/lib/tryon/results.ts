import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TryOnResult = {
  id: string;
  output_url: string;
  created_at: string;
  products: { name: string; slug: string } | null;
};

export function tryOnResultsQuery(userId?: string) {
  return queryOptions({
    queryKey: ["tryon-results", userId ?? "anon"],
    enabled: !!userId,
    staleTime: 45 * 60 * 1000,
    queryFn: async (): Promise<TryOnResult[]> => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("tryon_results")
        .select("id, output_url, created_at, products(name, slug)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      const rows = data ?? [];
      const paths = rows.map((r) => r.output_url).filter((url) => !/^https?:\/\//.test(url));
      const signed = new Map<string, string>();
      if (paths.length) {
        const { data: urls } = await supabase.storage.from("tryon").createSignedUrls(paths, 60 * 60);
        for (const row of urls ?? []) if (row.path && row.signedUrl) signed.set(row.path, row.signedUrl);
      }
      return rows.map((r) => ({ ...r, output_url: signed.get(r.output_url) ?? r.output_url }));
    },
  });
}