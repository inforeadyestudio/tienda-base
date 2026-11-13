// Lógica (Claude NO modifica este archivo). El diseño recibe el resultado como `vm`.
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useProfile } from "@/lib/auth-hooks";



export function useProfilePage() {
  const { user } = useSession();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setPhone(profile?.phone ?? "");
  }, [profile?.full_name, profile?.phone]);

  const save = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Sesión no disponible");
      const { error } = await supabase
        .from("profiles")
        .update({ full_name: fullName.trim() || null, phone: phone.trim() || null })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Perfil actualizado");
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return { user, profile, qc, fullName, setFullName, phone, setPhone, save };
}

export type ProfilePageVM = ReturnType<typeof useProfilePage>;
