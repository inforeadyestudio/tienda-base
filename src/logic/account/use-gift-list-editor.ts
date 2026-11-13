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



export function useGiftListEditor({ list }: { list: GiftList }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: list.title,
    owner_name: list.owner_name ?? "",
    occasion: list.occasion ?? "",
    event_date: list.event_date ?? "",
    message: list.message ?? "",
    is_public: list.is_public,
  });

  useEffect(() => {
    setForm({
      title: list.title,
      owner_name: list.owner_name ?? "",
      occasion: list.occasion ?? "",
      event_date: list.event_date ?? "",
      message: list.message ?? "",
      is_public: list.is_public,
    });
  }, [list.id, list.title, list.owner_name, list.occasion, list.event_date, list.message, list.is_public]);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("gift_lists")
        .update({
          title: form.title,
          owner_name: form.owner_name || null,
          occasion: form.occasion || null,
          event_date: form.event_date || null,
          message: form.message || null,
          is_public: form.is_public,
        })
        .eq("id", list.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gift-lists"] });
      toast.success("Lista guardada");
    },
    onError: () => toast.error("No pudimos guardar"),
  });

  const removeList = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("gift_lists").delete().eq("id", list.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["gift-lists"] });
      toast.success("Lista eliminada");
    },
  });

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(giftListUrl(list.slug));
      toast.success("Enlace copiado");
    } catch {
      toast.error("No pudimos copiar el enlace");
    }
  };

  return { list, qc, form, setForm, save, removeList, copyLink };
}

export type GiftListEditorVM = ReturnType<typeof useGiftListEditor>;
