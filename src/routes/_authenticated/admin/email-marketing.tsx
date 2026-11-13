import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDate } from "@/lib/format";
import { useCrmCustomers } from "@/lib/crm/customers";
import { matchesSegment, describeRules, type CustomerSegment } from "@/lib/crm/segments";
import { Plus, Trash2, X, Mail, Send } from "lucide-react";
import { CampaignBuilder, CampaignStats, type CampaignRow } from "@/components/admin/campaign-builder";
import { DirectMessages } from "@/components/admin/direct-messages";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/admin/email-marketing")({
  component: EmailMarketingPage,
  head: () => ({
    meta: [
      { title: "Email marketing · Tu Marca" },
      { name: "description", content: "Campañas y correos automáticos de la tienda Tu Marca." },
      { property: "og:title", content: "Email marketing · Tu Marca" },
      { property: "og:description", content: "Campañas y correos automáticos de la tienda Tu Marca." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

interface Campaign {
  id: string;
  name: string;
  subject: string;
  preheader: string | null;
  body: string;
  cta_label: string | null;
  cta_url: string | null;
  segment_id: string | null;
  status: string;
  recipients_count: number;
  sent_at: string | null;
  created_at: string;
}

interface Automation {
  id: string;
  key: string;
  name: string;
  description: string | null;
  enabled: boolean;
  subject: string;
  body: string;
}

const inputCls = "w-full bg-white border border-ink/15 rounded-xl px-3 py-2 text-sm outline-none focus:border-ink/40";

function EmailMarketingPage() {
  const [section, setSection] = useState<"campanas" | "automaticos" | "directa">("campanas");

  return (
    <div className="p-10">
      <header className="mb-6">
        <p className="text-[10px] uppercase tracking-widest text-moss/70">Tienda · Email marketing</p>
        <h1 className="text-4xl mt-1">Email marketing</h1>
        <p className="text-sm text-moss mt-2 max-w-xl">
          Configura los correos automáticos de la tienda y envía campañas a los segmentos de clientas.
        </p>
      </header>

      <div className="flex gap-1 bg-white border border-ink/10 rounded-full p-1 w-fit mb-6">
        {([
          ["campanas", "Campañas"],
          ["automaticos", "Correos automáticos"],
          ["directa", "Comunicación directa"],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={`text-xs px-5 py-1.5 rounded-full transition ${
              section === id ? "bg-ink text-ivory" : "text-ink/70 hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {section === "campanas" ? <Campaigns /> : section === "automaticos" ? <Automations /> : <DirectMessages />}
    </div>
  );
}

function useSegments() {
  return useQuery({
    queryKey: ["customer-segments"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_segments")
        .select("id, name, description, rules, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CustomerSegment[];
    },
  });
}

function Campaigns() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<CampaignRow | "new" | null>(null);
  const [viewing, setViewing] = useState<CampaignRow | null>(null);
  const { customers } = useCrmCustomers();
  const { data: segments = [] } = useSegments();

  const { data: campaigns = [], isLoading } = useQuery({
    queryKey: ["email-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("email_campaigns").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as CampaignRow[];
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("email_campaigns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Campaña eliminada"); qc.invalidateQueries({ queryKey: ["email-campaigns"] }); },
  });

  const audience = (segmentId: string | null) => {
    const seg = segments.find((s) => s.id === segmentId);
    const list = seg ? customers.filter((c) => matchesSegment(c, seg.rules ?? {})) : customers;
    return list.filter((c) => c.email).map((c) => ({ email: c.email, name: (c as { name?: string | null }).name ?? null }));
  };

  return (
    <div>
      <button onClick={() => setEditing("new")} className="mb-5 inline-flex items-center gap-2 rounded-full bg-ink text-ivory px-5 py-2 text-xs">
        <Plus className="size-3.5" /> Nueva campaña
      </button>
      <div className="bg-white border border-ink/10 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-moss/70">
            <tr>
              <th className="text-left px-4 py-3">Campaña</th>
              <th className="text-left">Segmento</th>
              <th className="text-right">Enviados / Destinatarias</th>
              <th className="text-left px-4">Estado</th>
              <th className="text-left">Fecha</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => {
              const seg = segments.find((s) => s.id === c.segment_id);
              const done = c.status === "sent" || c.status === "sending";
              return (
                <tr key={c.id} className="border-t border-ink/5">
                  <td className="px-4 py-3">
                    <button onClick={() => (done ? setViewing(c) : setEditing(c))} className="text-left">
                      <div>{c.name}</div>
                      <div className="text-xs text-moss">{c.subject}</div>
                    </button>
                  </td>
                  <td className="text-xs text-moss">{seg?.name ?? "Todas las clientas"}</td>
                  <td className="text-right">{done ? `${c.sent_count} / ${c.recipients_count}` : audience(c.segment_id).length}</td>
                  <td className="px-4">
                    <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full ${done ? "bg-moss/15 text-moss" : "bg-ink/5 text-ink/60"}`}>
                      {c.status === "sent" ? "Enviada" : c.status === "sending" ? "Enviando" : "Borrador"}
                    </span>
                  </td>
                  <td className="text-xs text-moss">{formatDate(c.sent_at ?? c.created_at)}</td>
                  <td className="pr-4 text-right whitespace-nowrap">
                    {done && <button onClick={() => setViewing(c)} className="mr-2 text-xs underline underline-offset-4">Ver resultados</button>}
                    {c.status === "sending" && <Button variant="outline" size="sm" onClick={() => setEditing(c)}><Send /> Reanudar envío</Button>}
                    {!done && <button onClick={() => remove.mutate(c.id)} className="size-8 rounded-full hover:bg-red-50 text-red-500 inline-flex items-center justify-center"><Trash2 className="size-3.5" /></button>}
                  </td>
                </tr>
              );
            })}
            {!isLoading && campaigns.length === 0 && (
              <tr><td colSpan={6} className="px-6 py-10 text-center text-moss/60">Todavía no has creado campañas.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {editing && <CampaignBuilder campaign={editing === "new" ? null : editing} segments={segments} audienceFor={audience} onClose={() => setEditing(null)} />}
      {viewing && <CampaignStats campaign={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function Automations() {
  const qc = useQueryClient();
  const { data: rows = [] } = useQuery({
    queryKey: ["email-automations"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_automations")
        .select("id, key, name, description, enabled, subject, body")
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Automation[];
    },
  });
  const [open, setOpen] = useState<Automation | null>(null);

  const toggle = useMutation({
    mutationFn: async (a: Automation) => {
      const { error } = await supabase.from("email_automations").update({ enabled: !a.enabled }).eq("id", a.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["email-automations"] }),
  });

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {rows.map((a) => (
        <div key={a.id} className="bg-white border border-ink/10 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="size-9 rounded-full bg-ink/5 flex items-center justify-center">
                <Mail className="size-4 text-ink/60" />
              </span>
              <div>
                <div className="text-base">{a.name}</div>
                {a.description && <div className="text-xs text-moss mt-1 max-w-xs">{a.description}</div>}
              </div>
            </div>
            <button
              onClick={() => toggle.mutate(a)}
              className={`shrink-0 w-11 h-6 rounded-full transition ${a.enabled ? "bg-ink" : "bg-ink/15"}`}
              aria-label={a.enabled ? "Desactivar" : "Activar"}
            >
              <span className={`block size-5 rounded-full bg-white transition-transform ${a.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>
          <div className="text-xs text-moss mt-4">{a.subject}</div>
          <button onClick={() => setOpen(a)} className="mt-3 text-xs underline text-ink/70">Editar contenido</button>
        </div>
      ))}
      {open && <AutomationModal automation={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function AutomationModal({ automation, onClose }: { automation: Automation; onClose: () => void }) {
  const qc = useQueryClient();
  const [subject, setSubject] = useState(automation.subject);
  const [body, setBody] = useState(automation.body);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("email_automations").update({ subject, body }).eq("id", automation.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Correo actualizado");
    qc.invalidateQueries({ queryKey: ["email-automations"] });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl p-7">
        <div className="flex items-start justify-between mb-5">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-moss/70">Correo automático</div>
            <div className="text-2xl mt-1">{automation.name}</div>
          </div>
          <button onClick={onClose} className="size-9 rounded-full hover:bg-ink/5 flex items-center justify-center">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-4">
          <Field label="Asunto">
            <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
          </Field>
          <Field label="Contenido">
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={7} className={inputCls + " resize-y"} />
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="rounded-full border border-ink/15 px-5 py-2 text-xs">Cancelar</button>
          <button onClick={save} disabled={saving} className="rounded-full bg-ink text-ivory px-6 py-2 text-xs disabled:opacity-50">
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-moss/70 mb-1.5">{label}</div>
      {children}
    </div>
  );
}
