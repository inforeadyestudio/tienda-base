import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Contacts = { manager: string; production: string; accounting: string };
const FIELDS: { key: keyof Contacts; label: string }[] = [
  { key: "manager", label: "Correo del gerente" },
  { key: "production", label: "Correo de producción" },
  { key: "accounting", label: "Correo de contabilidad" },
];

/** Correos que reciben los avisos de devoluciones (defectos y devolución de dinero). */
export function ReturnContactsEditor() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["returns-contacts"],
    queryFn: async () => ((await supabase.from("app_settings").select("value").eq("key", "returns_contacts").maybeSingle()).data?.value ?? {}) as Partial<Contacts>,
  });
  const [v, setV] = useState<Contacts>({ manager: "", production: "", accounting: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (data) setV({ manager: data.manager ?? "", production: data.production ?? "", accounting: data.accounting ?? "" }); }, [data]);

  const save = async () => {
    const bad = FIELDS.find((f) => v[f.key].trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v[f.key].trim()));
    if (bad) { toast.error(`${bad.label} no es válido`); return; }
    setBusy(true);
    const value = { manager: v.manager.trim(), production: v.production.trim(), accounting: v.accounting.trim() };
    const { error } = await supabase.from("app_settings").upsert({ key: "returns_contacts", value }, { onConflict: "key" });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Correos guardados"); qc.invalidateQueries({ queryKey: ["returns-contacts"] }); }
  };

  return (
    <div className="mx-10 mt-8 rounded-2xl border border-ink/10 bg-white p-5">
      <p className="text-[10px] uppercase tracking-widest text-moss/70 mb-3">Correos para avisos de devoluciones</p>
      <div className="grid md:grid-cols-3 gap-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex flex-col gap-1">
            <span className="text-xs text-moss/70">{f.label}</span>
            <input type="email" value={v[f.key]} onChange={(e) => setV((s) => ({ ...s, [f.key]: e.target.value }))} className="rounded-full border border-ink/15 px-4 py-2 text-sm bg-white" />
          </label>
        ))}
      </div>
      <button onClick={save} disabled={busy} className="mt-3 rounded-full bg-ink text-ivory px-5 py-2 text-sm disabled:opacity-50">{busy ? "Guardando…" : "Guardar"}</button>
    </div>
  );
}
