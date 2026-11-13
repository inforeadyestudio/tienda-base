import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ShieldCheck, ShieldOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useB2BAccounts } from "@/lib/b2b/admin";
import { formatDate } from "@/lib/format";
import { B2BAccountForm } from "@/components/admin/b2b-account-form";

export const Route = createFileRoute("/_authenticated/admin/b2b/accesos")({
  component: B2BAccesos,
});

function B2BAccesos() {
  const { data, isLoading } = useB2BAccounts();
  const qc = useQueryClient();

  const revoke = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", "b2b");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Acceso al portal revocado");
      qc.invalidateQueries({ queryKey: ["admin-b2b-accounts"] });
    },
    onError: (e: any) => toast.error(e.message ?? "No se pudo revocar"),
  });

  return (
    <div className="p-6 md:p-10">
      <header className="mb-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-moss/70">Control de accesos</p>
        <h1 className="font-serif text-3xl md:text-4xl text-ink mt-1">Accesos al portal B2B</h1>
        <p className="text-sm text-ink/60 mt-2 max-w-xl">
          Cada cuenta listada puede iniciar sesión en <span className="font-medium">/b2b</span>. Revocar el acceso
          elimina el permiso mayorista sin borrar el histórico de pedidos.
        </p>
      </header>

      <B2BAccountForm />

      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
        {(data ?? []).map((a) => (
          <div key={a.userId} className="p-5 rounded-3xl bg-white border border-ink/10">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{a.name}</div>
                <div className="text-[11px] text-ink/50 mt-1">Activo desde {formatDate(a.since)}</div>
              </div>
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.15em] text-moss bg-moss/10 px-2.5 py-1 rounded-full">
                <ShieldCheck className="size-3" /> Activo
              </span>
            </div>
            <div className="text-xs text-ink/50 mt-4 font-mono truncate">{a.userId}</div>
            <button
              onClick={() => revoke.mutate(a.userId)}
              disabled={revoke.isPending}
              className="mt-4 w-full py-2 rounded-full border border-ink/15 text-xs flex items-center justify-center gap-2 hover:bg-ink hover:text-ivory transition-colors"
            >
              <ShieldOff className="size-3.5" /> Revocar acceso
            </button>
          </div>
        ))}
      </div>

      {isLoading && <div className="text-sm text-ink/50">Cargando…</div>}
      {!isLoading && !data?.length && (
        <div className="bg-white border border-ink/10 rounded-3xl px-6 py-10 text-sm text-ink/55">
          Todavía no hay cuentas con acceso mayorista. Crea la primera cuenta con el botón de arriba.
        </div>
      )}
    </div>
  );
}
