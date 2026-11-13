// Lógica (Claude NO modifica este archivo). El diseño recibe el resultado como `vm`.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useProfile } from "@/lib/auth-hooks";
import {
  EMPTY_SHIP_TO,
  fetchGiftItems,
  giftListUrl,
  makeGiftSlug,
  type GiftList,
  type GiftShipTo,
} from "@/lib/gifts";



export function useGiftLists() {
  const { user } = useSession();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const [activeId, setActiveId] = useState<string | null>(null);

  const listsQuery = useQuery({
    queryKey: ["gift-lists", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gift_lists")
        .select("*")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as GiftList[];
    },
  });

  const lists = listsQuery.data ?? [];
  const active = lists.find((l) => l.id === activeId) ?? lists[0] ?? null;

  useEffect(() => {
    if (!activeId && lists[0]) setActiveId(lists[0].id);
  }, [lists, activeId]);

  const createList = useMutation({
    mutationFn: async () => {
      const title = "Mi lista de regalos";
      const { data, error } = await supabase
        .from("gift_lists")
        .insert({
          user_id: user!.id,
          title,
          slug: makeGiftSlug(profile?.full_name ?? title),
          owner_name: profile?.full_name ?? null,
        })
        .select("*")
        .single();
      if (error) throw error;
      return data as GiftList;
    },
    onSuccess: (row) => {
      setActiveId(row.id);
      qc.invalidateQueries({ queryKey: ["gift-lists"] });
      toast.success("Lista creada");
    },
    onError: () => toast.error("No pudimos crear la lista"),
  });

  return { user, profile, qc, activeId, setActiveId, listsQuery, lists, active, createList };
}

export type GiftListsVM = ReturnType<typeof useGiftLists>;
