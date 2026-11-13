import { Heart } from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth-hooks";
import { cn } from "@/lib/utils";

type Props = {
  variantId: string | null;
  /** "light" = sobre fotografía; "ink" = sobre fondo claro */
  tone?: "light" | "ink";
  className?: string;
};

export function FavoriteButton({ variantId, tone = "ink", className }: Props) {
  const { user } = useSession();
  const qc = useQueryClient();

  const { data: ids } = useQuery({
    queryKey: ["wishlist", user?.id ?? "anon"],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("wishlists").select("variant_id");
      if (error) throw error;
      return (data ?? []).map((r) => r.variant_id as string);
    },
  });

  const active = !!variantId && !!ids?.includes(variantId);

  const toggle = useMutation({
    mutationFn: async () => {
      if (!variantId) return;
      if (active) {
        const { error } = await supabase.from("wishlists").delete().eq("variant_id", variantId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("wishlists")
          .insert({ variant_id: variantId, user_id: user!.id });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wishlist", user?.id ?? "anon"] });
      toast.success(active ? "Quitado de tus favoritos" : "Guardado en tus favoritos");
    },
    onError: () => toast.error("No pudimos guardar esta pieza"),
  });

  const onClick = () => {
    if (!user) return toast.info("Inicia sesión para guardar tus favoritos");
    if (!variantId) return toast.info("Elige color y talla primero");
    toggle.mutate();
  };

  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.85 }}
      aria-pressed={active}
      aria-label={active ? "Quitar de favoritos" : "Agregar a favoritos"}
      className={cn(
        "grid size-10 place-items-center bg-transparent transition-colors",
        active
          ? "text-red-600"
          : tone === "light"
            ? "text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
            : "text-ink hover:text-red-600",
        className,
      )}
    >
      <motion.span
        key={String(active)}
        initial={{ scale: 0.7 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", stiffness: 500, damping: 18 }}
        className="grid place-items-center"
      >
        <Heart className="size-6" strokeWidth={1.4} fill={active ? "currentColor" : "none"} />
      </motion.span>
    </motion.button>
  );
}
