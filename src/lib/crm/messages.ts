import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface CustomerMessage {
  id: string;
  user_id: string;
  title: string;
  body: string;
  cta_label: string | null;
  image_url: string | null;
  cta_url: string | null;
  campaign_name: string | null;
  batch_id: string | null;
  read_at: string | null;
  created_at: string;
}

export function myMessagesQuery(userId: string | null | undefined) {
  return {
    queryKey: ["my-messages", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return [] as CustomerMessage[];
      const { data, error } = await supabase
        .from("customer_messages")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CustomerMessage[];
    },
  };
}

export async function markMessageRead(id: string) {
  await supabase.from("customer_messages").update({ read_at: new Date().toISOString() }).eq("id", id);
}

export function useSentDirectMessages() {
  return useQuery({
    queryKey: ["direct-messages-admin"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_messages")
        .select("id, title, campaign_name, batch_id, read_at, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        title: string;
        campaign_name: string | null;
        batch_id: string | null;
        read_at: string | null;
        created_at: string;
      }[];
    },
  });
}
