import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { withRequestTimeout } from "@/lib/tienda/request-timeout";

export const STOREFRONT_HOME_KEY = "storefront_home";

export const storefrontHomeQuery = () => queryOptions({
  queryKey: ["storefront-home"],
  staleTime: 30_000,
  retry: 1,
  queryFn: async () => {
    const { data, error } = await withRequestTimeout(async () => await supabase.from("app_settings").select("value").eq("key", STOREFRONT_HOME_KEY).maybeSingle(), 8_000);
    if (error) throw error;
    const value = data?.value;
    return value && typeof value === "object" && !Array.isArray(value) && typeof (value as { slug?: unknown }).slug === "string"
      ? (value as { slug: string }).slug : "home";
  },
});

export async function saveStorefrontHome(slug: string) {
  const { error } = await supabase.from("app_settings").upsert({ key: STOREFRONT_HOME_KEY, value: { slug } }, { onConflict: "key" });
  if (error) throw error;
}