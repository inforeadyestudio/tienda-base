import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { RCOUNT_PAY_METHODS, RCOUNT_CENTERS, RCOUNT_CENTER_KEYS, RCOUNT_LABEL, RCOUNT_SETTINGS_KEY, normalizeRCountSettings, type RCountEntity, type RCountSettings } from "@/lib/rcount";
import { rcountKeyStatus, saveRCountKey } from "@/lib/rcount.functions";
import { SITE_ORIGIN } from "@/lib/site";

const input = "w-full px-3 py-2 rounded-lg bg-white border border-ink/10 text-sm focus:outline-none focus:border-ink/30";

/** Conexión con R-Count Colombia (COP) y R-Count Panamá (USD). */
export function RCountEditor() {
  const qc = useQueryClient();
  const statusFn = useServerFn(rcountKeyStatus);
  const saveKeyFn = useServerFn(saveRCountKey);
  const { data } = useQuery({
    queryKey: ["app-settings", RCOUNT_SETTINGS_KEY],
    queryFn: async () => normalizeRCountSettings((await supabase.from("app_settings").select("value").eq("key", RCOUNT_SETTINGS_KEY).maybeSingle()).data?.value),
  });
  const { data: keys } = useQuery({ queryKey: ["rcount-keys"], queryFn: () => statusFn() });
  const [s, setS] = useState<RCountSettings | null>(null);
  const [secret, setSecret] = useState<Record<RCountEntity, string>>({ co: "", pa: "" });
  useEffect(() => { if (data) setS(data); }, [data]);
  if (!s) return null;

  const save = async () => {
    const { error } = await supabase.from("app_settings").upsert({ key: RCOUNT_SETTINGS_KEY, value: s as any }, { onConflict: "key" });
    if (error) return toast.error(error.message);
    for (const e of ["co", "pa"] as const) if (secret[e]) await saveKeyFn({ data: { entity: e, secret: secret[e] } });
    setSecret({ co: "", pa: "" });
    qc.invalidateQueries({ queryKey: ["app-settings", RCOUNT_SETTINGS_KEY] });
    qc.invalidateQueries({ queryKey: ["rcount-keys"] });
    toast.success("R-Count guardado");
  };

  const setConsecutive = (key: string, raw: string) => {
    const n = raw ? Math.max(1, Math.floor(Number(raw))) : undefined;
    setS({ ...s, co: { ...s.co, consecutive: { ...s.co.consecutive, [key]: n } } });
  };

  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-5 mt-6">
      <h3 className="font-serif text-xl">R-Count</h3>
      <p className="text-xs text-moss/75 mt-1">
        Pesos van a R-Count Colombia y dólares a R-Count Panamá. Web y POS se envían al confirmar el pago; B2B al despachar.
        Mientras una entidad esté apagada, se factura directo con Ready o eFactura.
      </p>
      <div className="grid md:grid-cols-2 gap-4 mt-4">
        {(["co", "pa"] as const).map((e) => (
          <div key={e} className="rounded-xl border border-ink/10 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{RCOUNT_LABEL[e]}</p>
              <Switch checked={s[e].enabled} onCheckedChange={(v) => setS({ ...s, [e]: { ...s[e], enabled: v } })} />
            </div>
            <input className={input} placeholder="URL del endpoint (https://…)" value={s[e].url}
              onChange={(ev) => setS({ ...s, [e]: { ...s[e], url: ev.target.value } })} />
            <input className={input} type="password" placeholder={keys?.[e] ? "Clave guardada · escribe para reemplazar" : "Clave del API"}
              value={secret[e]} onChange={(ev) => setSecret({ ...secret, [e]: ev.target.value })} />
          </div>
        ))}
      </div>
      <div className="mt-5 rounded-xl border border-ink/10 p-4">
        <p className="text-sm font-medium">Centros de operación y consecutivos (R-Count Colombia)</p>
        <p className="text-xs text-moss/75 mt-1">
          Cada canal factura con la resolución de su centro. Escribe en cada uno el número con el que arranca,
          el mismo rango que asignes a ese centro en R-Count. Ese número es el que se envía y el que Factus/DIAN
          devuelve; sube solo cuando la factura sale bien. B2B solo aplica a clientes en Colombia.
        </p>
        <div className="grid md:grid-cols-3 gap-3 mt-3">
          {RCOUNT_CENTER_KEYS.map(({ key, label }) => (
            <div key={key} className="rounded-xl border border-ink/10 p-3 space-y-2">
              <p className="text-xs font-medium">{label}</p>
              <label className="text-xs space-y-1 block">
                <span className="text-moss/80">Centro</span>
                <select className={input} value={s.centers[key]} onChange={(ev) => setS({ ...s, centers: { ...s.centers, [key]: ev.target.value } })}>
                  {RCOUNT_CENTERS.map((c) => <option key={c.code} value={c.code}>{c.code} · {c.label}</option>)}
                </select>
              </label>
              <label className="text-xs space-y-1 block">
                <span className="text-moss/80">Próximo consecutivo</span>
                <input className={input} type="number" min={1} placeholder="Ej. 1001"
                  value={s.co.consecutive[key] ?? ""} onChange={(ev) => setConsecutive(key, ev.target.value)} />
              </label>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-moss/70 mt-3">R-Count devuelve el número DIAN a: <span className="font-mono">{SITE_ORIGIN}/api/public/hooks/rcount-invoice</span> (encabezado x-rwear-key).</p>
      </div>
      <div className="mt-5 rounded-xl border border-ink/10 p-4">
        <p className="text-sm font-medium">Cuentas de caja y banco por método de pago</p>
        <p className="text-xs text-moss/75 mt-1">
          Cada factura le dice a R-Count a qué cuenta llevar el pago según el centro y el método. Deja vacío lo que no aplica.
        </p>
        <div className="overflow-x-auto mt-3">
          <table className="text-xs w-full">
            <thead><tr><th className="text-left py-1 pr-2">Centro</th>{RCOUNT_PAY_METHODS.map((m) => <th key={m.id} className="text-left px-1">{m.label}</th>)}</tr></thead>
            <tbody>
              {RCOUNT_CENTERS.slice(0, 3).map((c) => (
                <tr key={c.code} className="border-t border-ink/5">
                  <td className="py-1 pr-2 whitespace-nowrap">{c.code} · {c.label}</td>
                  {RCOUNT_PAY_METHODS.map((m) => {
                    const k = `${c.code}:${m.id}`;
                    return (
                      <td key={m.id} className="px-1 py-1">
                        <input className={input + " font-mono min-w-[100px]"} value={s.accounts[k] ?? ""} placeholder="—"
                          onChange={(ev) => setS({ ...s, accounts: { ...s.accounts, [k]: ev.target.value } })} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <button onClick={save} className="mt-4 px-5 py-2.5 rounded-full bg-ink text-ivory text-xs">Guardar</button>
    </section>
  );
}
