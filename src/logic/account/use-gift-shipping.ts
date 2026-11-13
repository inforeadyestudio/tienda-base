// Lógica (Claude NO modifica este archivo). El diseño recibe el resultado como `vm`.
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  EMPTY_SHIP_TO,
  fetchGiftItems,
  giftListUrl,
  makeGiftSlug,
  type GiftList,
  type GiftShipTo,
} from "@/lib/gifts";



export function useGiftShipping({ listId }: { listId: string }) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["gift-shipping", listId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gift_list_shipping")
        .select("ship_to")
        .eq("list_id", listId)
        .maybeSingle();
      if (error) throw error;
      return (data?.ship_to as GiftShipTo | undefined) ?? EMPTY_SHIP_TO;
    },
  });

  const [ship, setShip] = useState<GiftShipTo>(EMPTY_SHIP_TO);
  useEffect(() => {
    if (data) setShip({ ...EMPTY_SHIP_TO, ...data });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("gift_list_shipping")
        .upsert({ list_id: listId, ship_to: ship as unknown as Record<string, string> }, { onConflict: "list_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gift-shipping", listId] });
      toast.success("Dirección guardada");
    },
    onError: () => toast.error("No pudimos guardar la dirección"),
  });

  return { listId, qc, data, ship, setShip, save };
}

export type GiftShippingVM = ReturnType<typeof useGiftShipping>;
