import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createB2BAccount } from "@/lib/b2b/admin.functions";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/admin/b2b/solicitudes")({
  component: Solicitudes,
});

type App = {
  id: string; full_name: string; company: string; city: string; country: string; website: string | null;
  email: string; whatsapp: string; business_type: string; sells_other_brands: boolean | null; volume: string | null;
  message: string | null; status: "pending" | "approved" | "rejected"; created_at: string;
};

const TYPE: Record<string, string> = { boutique: "Boutique", concept_store: "Concept store", distribuidor: "Distribuidor", otro: "Otro" };
const STATUS: Record<string, string> = { pending: "Pendiente", approved: "Aprobada", rejected: "Rechazada" };

function Solicitudes() {
  const [tab, setTab] = useState<App["status"]>("pending");
  const { data = [], isLoading } = useQuery({
    queryKey: ["wholesale-applications"],
    queryFn: async () => {
      const { data, error } = await supabase.from("wholesale_applications" as any).select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as App[];
    },
  });
  const rows = data.filter((a) => a.status === tab);

  return (
    <div className="p-6 md:p-10">
      <header className="mb-6">
        <p className="text-[10px] uppercase tracking-[0.2em] text-moss/70">Wholesale</p>
        <h1 className="font-serif text-3xl md:text-4xl text-ink mt-1">Solicitudes de acceso</h1>
        <p className="text-sm text-ink/60 mt-2 max-w-xl">Llegan desde la página pública /wholesale. Al aprobar, se crea la cuenta del portal con la clave que asignes.</p>
      </header>
      <div className="mb-6 flex gap-2">
        {(["pending", "approved", "rejected"] as const).map((s) => (
          <button key={s} onClick={() => setTab(s)} className={`rounded-full px-4 py-1.5 text-xs border ${tab === s ? "bg-ink text-ivory border-ink" : "border-ink/15 text-ink/70"}`}>
            {STATUS[s]} · {data.filter((a) => a.status === s).length}
          </button>
        ))}
      </div>
      {isLoading ? <p className="text-sm text-moss">Cargando…</p> : rows.length === 0 ? <p className="text-sm text-moss/70">No hay solicitudes aquí.</p> : (
        <div className="grid gap-4 xl:grid-cols-2">{rows.map((a) => <AppCard key={a.id} a={a} />)}</div>
      )}
    </div>
  );
}

function AppCard({ a }: { a: App }) {
  const qc = useQueryClient();
  const create = useServerFn(createB2BAccount);
  const [pwd, setPwd] = useState("");
  const done = () => qc.invalidateQueries({ queryKey: ["wholesale-applications"] });

  const approve = useMutation({
    mutationFn: async () => {
      const { userId } = await create({ data: { email: a.email, fullName: a.full_name, company: a.company, password: pwd, phone: a.whatsapp } });
      const { data: s } = await supabase.auth.getUser();
      const { error } = await supabase.from("wholesale_applications" as any)
        .update({ status: "approved", user_id: userId, reviewed_by: s.user?.id ?? null, reviewed_at: new Date().toISOString() }).eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(`Cuenta creada para ${a.email}. Compártele su clave.`); done(); qc.invalidateQueries({ queryKey: ["admin-b2b-accounts"] }); },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo crear la cuenta"),
  });
  const setStatus = useMutation({
    mutationFn: async (status: App["status"]) => {
      const { error } = await supabase.from("wholesale_applications" as any).update({ status, reviewed_at: new Date().toISOString() }).eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: done,
    onError: (e: any) => toast.error(e?.message ?? "Error"),
  });
  const genPwd = () => setPwd(Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 56]).join(""));

  return (
    <div className="rounded-3xl border border-ink/10 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">{a.company}</div>
          <div className="text-sm text-ink/70">{a.full_name} · {a.city}, {a.country}</div>
        </div>
        <span className="shrink-0 text-[11px] text-ink/50">{formatDate(a.created_at)}</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
        <dt className="text-ink/50">Email</dt><dd className="truncate"><a href={`mailto:${a.email}`} className="underline">{a.email}</a></dd>
        <dt className="text-ink/50">WhatsApp</dt><dd><a href={`https://wa.me/${a.whatsapp.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" className="underline">{a.whatsapp}</a></dd>
        <dt className="text-ink/50">Instagram / web</dt><dd className="truncate">{a.website || "—"}</dd>
        <dt className="text-ink/50">Tipo</dt><dd>{TYPE[a.business_type] ?? a.business_type}</dd>
        <dt className="text-ink/50">Otras marcas</dt><dd>{a.sells_other_brands == null ? "—" : a.sells_other_brands ? "Sí" : "No"}</dd>
        <dt className="text-ink/50">Volumen</dt><dd>{a.volume || "—"}</dd>
      </dl>
      {a.message && <p className="mt-3 rounded-2xl bg-ivory p-3 text-[13px] text-ink/80 whitespace-pre-line">{a.message}</p>}
      {a.status === "pending" && (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-ink/10 pt-4">
          <input value={pwd} onChange={(e) => setPwd(e.target.value)} placeholder="Clave (mín. 8)" className="h-9 flex-1 min-w-40 rounded-full border border-ink/15 px-4 text-sm" />
          <button onClick={genPwd} className="h-9 rounded-full border border-ink/15 px-3 text-xs">Generar</button>
          <button disabled={pwd.length < 8 || approve.isPending} onClick={() => approve.mutate()} className="h-9 rounded-full bg-ink px-4 text-xs text-ivory disabled:opacity-40">
            {approve.isPending ? "Creando…" : "Aprobar y crear cuenta"}
          </button>
          <button onClick={() => setStatus.mutate("rejected")} className="h-9 rounded-full px-3 text-xs text-ink/60 hover:text-ink">Rechazar</button>
        </div>
      )}
      {a.status === "rejected" && (
        <button onClick={() => setStatus.mutate("pending")} className="mt-4 text-xs underline text-ink/60">Volver a pendiente</button>
      )}
    </div>
  );
}
