import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AtSign, Send, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { addTeamNote, listTeamMembers } from "@/lib/team-notes.functions";

type Member = { id: string; name: string; email: string };

/** Notas internas del equipo con menciones @ que avisan por correo. */
export function TeamNotes({ entityType, entityId, label, title = "Notas del equipo", className = "" }: {
  entityType: string; entityId: string; label?: string; title?: string; className?: string;
}) {
  const qc = useQueryClient();
  const fetchMembers = useServerFn(listTeamMembers);
  const save = useServerFn(addTeamNote);
  const ref = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Member[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(null);

  const { data: members = [] } = useQuery({ queryKey: ["team-members"], queryFn: () => fetchMembers(), staleTime: 10 * 60_000 });
  const key = ["team-notes", entityType, entityId];
  const { data: notes = [] } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data: s } = await supabase.auth.getUser(); setMe(s.user?.id ?? null);
      const { data } = await (supabase as any).from("team_notes").select("*").eq("entity_type", entityType).eq("entity_id", entityId).order("created_at", { ascending: false });
      return (data ?? []) as any[];
    },
  });
  const byId = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const onChange = (v: string) => {
    setText(v);
    const pos = ref.current?.selectionStart ?? v.length;
    const m = /(?:^|\s)@([\p{L}\d._-]*)$/u.exec(v.slice(0, pos));
    setQuery(m ? m[1].toLowerCase() : null);
  };
  const suggestions = query === null ? [] : members.filter((m) => (m.name + " " + m.email).toLowerCase().includes(query)).slice(0, 6);
  const choose = (m: Member) => {
    const pos = ref.current?.selectionStart ?? text.length;
    const before = text.slice(0, pos).replace(/@([\p{L}\d._-]*)$/u, `@${m.name} `);
    setText(before + text.slice(pos));
    setPicked((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]));
    setQuery(null);
    requestAnimationFrame(() => { ref.current?.focus(); ref.current?.setSelectionRange(before.length, before.length); });
  };

  const add = useMutation({
    mutationFn: () => {
      const mentions = picked.filter((m) => text.includes(`@${m.name}`)).map((m) => m.id);
      return save({ data: { entityType, entityId, body: text, mentions, label, path: typeof window !== "undefined" ? window.location.pathname : undefined } });
    },
    onSuccess: (r) => {
      setText(""); setPicked([]);
      toast.success(r.notified ? `Nota guardada · se avisó por correo a ${r.notified}` : "Nota guardada");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(e?.message ?? "No se pudo guardar la nota"),
  });

  const remove = async (id: string) => {
    if (!confirm("¿Borrar esta nota?")) return;
    const { error } = await (supabase as any).from("team_notes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: key });
  };

  const render = (body: string) => {
    const names = members.map((m) => m.name).sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!names.length) return body;
    const parts = body.split(new RegExp(`(@(?:${names.join("|")}))`, "g"));
    return parts.map((p, i) => p.startsWith("@") && names.length ? <span key={i} className="font-medium text-moss">{p}</span> : p);
  };

  return (
    <section className={`rounded-2xl border border-ink/10 bg-white p-5 ${className}`}>
      <p className="text-[10px] uppercase tracking-widest text-moss/70">{title}</p>
      <div className="relative mt-3">
        <textarea ref={ref} value={text} onChange={(e) => onChange(e.target.value)} rows={3}
          onKeyDown={(e) => { if (suggestions.length && (e.key === "Enter" || e.key === "Tab")) { e.preventDefault(); choose(suggestions[0]); } else if (e.key === "Escape") setQuery(null); }}
          placeholder="Escribe una nota… usa @ para mencionar a alguien del equipo"
          className="w-full resize-y rounded-xl border border-ink/15 bg-transparent p-3 text-base sm:text-sm outline-none focus:border-ink/40" />
        {suggestions.length > 0 && (
          <ul className="absolute left-0 right-0 z-20 mt-1 max-h-56 overflow-auto rounded-xl border border-ink/10 bg-white shadow-lg">
            {suggestions.map((m) => (
              <li key={m.id}>
                <button type="button" onMouseDown={(e) => { e.preventDefault(); choose(m); }} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-ink/5">
                  <AtSign className="size-3.5 text-moss" /><span className="text-ink">{m.name}</span><span className="truncate text-xs text-moss/60">{m.email}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-2 flex justify-start">
        <button disabled={!text.trim() || add.isPending} onClick={() => add.mutate()} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-xs uppercase tracking-widest text-ivory disabled:opacity-40">
          <Send className="size-3.5" /> {add.isPending ? "Guardando…" : "Agregar nota"}
        </button>
      </div>
      {notes.length > 0 && (
        <ul className="mt-4 space-y-3 border-t border-ink/10 pt-4">
          {notes.map((n) => (
            <li key={n.id} className="text-sm">
              <div className="flex items-center justify-between gap-2 text-[11px] text-moss/70">
                <span>{byId.get(n.author_id)?.name ?? "Equipo"} · {new Date(n.created_at).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" })}</span>
                {n.author_id === me && <button onClick={() => remove(n.id)} aria-label="Borrar nota" className="text-moss/50 hover:text-destructive"><Trash2 className="size-3.5" /></button>}
              </div>
              <p className="mt-1 whitespace-pre-wrap text-ink">{render(n.body)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
