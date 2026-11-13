// Lógica (Claude NO modifica este archivo). El diseño recibe el resultado como `vm`.
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useSession, useProfile } from "@/lib/auth-hooks";
import { fetchGuideSettings, printGuide } from "@/lib/returns-guide";
import { formatCOP, formatDate } from "@/lib/format";



export function useReturnsPage() {
  const { user } = useSession();
  const { data: profile } = useProfile();
  const [open, setOpen] = useState(false);

  async function onPrint(r: Record<string, unknown>) {
    const settings = await fetchGuideSettings();
    const order = r["orders"] as { number?: string; ship_to?: Record<string, unknown> | null } | null;
    const ship = order?.ship_to ?? null;
    const address = ship
      ? [ship["line1"], ship["line2"], ship["city"]].filter(Boolean).join(", ")
      : ((profile as { address?: string } | undefined)?.address ?? "");
    const ok = printGuide(
      {
        code: `DEV-${String(r["id"]).slice(0, 8).toUpperCase()}`,
        createdAt: formatDate(String(r["created_at"])),
        kind: String(r["kind"]),
        orderNumber: order?.number ?? "—",
        customerName: (r["contact_name"] as string) || (profile?.full_name ?? ""),
        customerEmail: (r["contact_email"] as string) || (user?.email ?? ""),
        customerPhone: (r["contact_phone"] as string) || (profile?.phone ?? ""),
        customerAddress: address,
        items: (r["items"] ?? []) as { name: string; variant_label?: string | null; qty: number }[],
        desired: (r["desired"] as string) ?? "",
      },
      settings,
    );
    if (!ok) toast.error("Permite las ventanas emergentes para imprimir la guía.");
  }

  const { data: rows, isLoading } = useQuery({
    queryKey: ["my-returns", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("returns")
        .select("id, kind, status, reason, refund_cop, created_at, items, desired, contact_name, contact_email, contact_phone, orders(number, ship_to)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  return { user, profile, open, setOpen, rows, isLoading, onPrint };
}

export type ReturnsPageVM = ReturnType<typeof useReturnsPage>;
