import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchBoldTerminals, getBoldTerminalSettings, saveBoldTerminalSettings } from "@/lib/pos/bold-terminal.functions";

type T = { serial: string; model: string; name: string; location_id: string | null };

export function BoldTerminalsSettings() {
  const getSettings = useServerFn(getBoldTerminalSettings);
  const fetchList = useServerFn(fetchBoldTerminals);
  const save = useServerFn(saveBoldTerminalSettings);
  const settings = useQuery({ queryKey: ["bold-terminal-settings"], queryFn: () => getSettings() });
  const { data: locations } = useQuery({
    queryKey: ["bold-locations"],
    queryFn: async () => (await supabase.from("locations").select("id, name, kind").eq("kind", "store").order("name")).data ?? [],
  });
  const [rows, setRows] = useState<T[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (settings.data) setRows(settings.data.terminals); }, [settings.data]);

  const search = async () => {
    setBusy(true);
    try {
      const r = await fetchList();
      if (!r.ok) { toast.error(r.message); return; }
      setRows((prev) => {
        const next = [...prev];
        for (const t of r.terminals) if (!next.some((x) => x.serial === t.serial)) next.push({ serial: t.serial, model: t.model, name: t.name, location_id: null });
        return next;
      });
      toast.success(`${r.terminals.length} datáfono(s) encontrados en Bold`);
    } finally { setBusy(false); }
  };

  const onSave = async () => {
    setBusy(true);
    try { await save({ data: { terminals: rows } }); toast.success("Datáfonos guardados"); settings.refetch(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "No se pudo guardar"); }
    finally { setBusy(false); }
  };

  return (
    <div className="rounded-3xl border border-ink/10 bg-white p-6 space-y-5 max-w-3xl">
      {settings.data && !settings.data.keyConfigured && (
        <p className="text-sm text-destructive">Falta la llave de API datáfono de Bold. Pídele al equipo técnico que la cargue.</p>
      )}
      <div className="flex flex-wrap gap-2">
        <button onClick={search} disabled={busy} className="px-4 py-2 rounded-full border border-ink/15 text-sm hover:bg-ink/5 disabled:opacity-40">Buscar datáfonos en Bold</button>
        <button onClick={onSave} disabled={busy} className="px-4 py-2 rounded-full bg-ink text-ivory text-sm disabled:opacity-40">Guardar</button>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-ink/55">Todavía no hay datáfonos. Toca «Buscar datáfonos en Bold».</p>
      ) : (
        <div className="divide-y divide-ink/5">
          {rows.map((t, i) => (
            <div key={t.serial} className="py-3 grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_220px_auto] gap-3 items-center">
              <div className="min-w-0">
                <input value={t.name} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} className="w-full rounded-full border border-ink/15 px-3 py-1.5 text-sm" placeholder="Nombre" />
                <div className="text-[11px] text-ink/45 mt-1">{t.model} · {t.serial}</div>
              </div>
              <select value={t.location_id ?? ""} onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, location_id: e.target.value || null } : x))} className="rounded-full border border-ink/15 px-3 py-2 text-sm bg-white">
                <option value="">Sin tienda</option>
                {(locations ?? []).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
              <button onClick={() => setRows(rows.filter((_, j) => j !== i))} className="text-xs text-ink/50 hover:text-destructive">Quitar</button>
            </div>
          ))}
        </div>
      )}
      <p className="text-[11px] text-ink/50">Cuando una tienda tiene datáfono asignado, al cobrar con «Datáfono» en el POS el valor llega solo al equipo.</p>
    </div>
  );
}
