import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_TRYON_SETTINGS,
  saveTryOnSettings,
  tryOnSettingsQuery,
  type TryOnSettings,
} from "@/lib/tryon/settings";
import { saveTryOnKey, testTryOnKey, tryOnKeyStatus } from "@/lib/tryon/tryon.functions";

const input = "w-full px-3 py-2 rounded-lg bg-white border border-ink/10 text-sm focus:outline-none focus:border-ink/30";
const label = "block text-[10px] uppercase tracking-widest text-moss/70 mb-1";

/** Configuración del probador virtual (FASHN). */
export function TryOnEditor() {
  const qc = useQueryClient();
  const { data: saved } = useQuery(tryOnSettingsQuery());
  const [settings, setSettings] = useState<TryOnSettings>(DEFAULT_TRYON_SETTINGS);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const keyStatusFn = useServerFn(tryOnKeyStatus);
  const saveKeyFn = useServerFn(saveTryOnKey);
  const testKeyFn = useServerFn(testTryOnKey);

  const { data: keyStatus } = useQuery({
    queryKey: ["tryon-key-status"],
    queryFn: () => keyStatusFn({ data: {} as never }),
    retry: false,
  });

  useEffect(() => {
    if (saved) setSettings(saved);
  }, [saved]);

  const patch = (value: Partial<TryOnSettings>) => setSettings((current) => ({ ...current, ...value }));

  const persist = async () => {
    setBusy("settings");
    try {
      await saveTryOnSettings(settings);
      qc.invalidateQueries({ queryKey: ["tryon-settings"] });
      toast.success("Probador actualizado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No pudimos guardar");
    } finally {
      setBusy(null);
    }
  };

  const persistKey = async () => {
    setBusy("key");
    try {
      await saveKeyFn({ data: { apiKey } });
      setApiKey("");
      qc.invalidateQueries({ queryKey: ["tryon-key-status"] });
      toast.success("Clave guardada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No pudimos guardar la clave");
    } finally {
      setBusy(null);
    }
  };

  const test = async () => {
    setBusy("test");
    try {
      const res = await testKeyFn({ data: {} as never });
      res.ok ? toast.success(res.message) : toast.error(res.message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No pudimos probar la conexión");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-lg border border-ink/10 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium">Probador virtual activo</p>
            <p className="mt-1 text-xs text-moss/75">Muestra el botón “Probar look” en las páginas de producto y en el portal de clientas.</p>
          </div>
          <Switch checked={settings.enabled} onCheckedChange={(enabled) => patch({ enabled })} />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium">Permitir a visitantes sin cuenta</p>
            <p className="mt-1 text-xs text-moss/75">Pueden subir una foto y probar el look sin iniciar sesión. La foto no se guarda.</p>
          </div>
          <Switch checked={settings.guestEnabled} onCheckedChange={(guestEnabled) => patch({ guestEnabled })} />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label>
            <span className={label}>Resolución</span>
            <select className={input} value={settings.resolution} onChange={(e) => patch({ resolution: e.target.value as TryOnSettings["resolution"] })}>
              <option value="1k">Estándar</option>
              <option value="2k">Alta</option>
            </select>
          </label>
          <label>
            <span className={label}>Velocidad</span>
            <select className={input} value={settings.mode} onChange={(e) => patch({ mode: e.target.value as TryOnSettings["mode"] })}>
              <option value="fast">Rápida</option>
              <option value="balanced">Equilibrada</option>
              <option value="quality">Máxima calidad</option>
            </select>
          </label>
        </div>

        <Button onClick={persist} disabled={busy !== null}>{busy === "settings" ? "Guardando…" : "Guardar probador"}</Button>
      </section>

      <section className="space-y-3 rounded-lg border border-ink/10 bg-white p-4">
        <div>
          <p className="font-medium">Clave del proveedor (FASHN)</p>
          <p className="mt-1 text-xs text-moss/75">
            Se guarda cifrada en el servidor y nunca se muestra completa. {keyStatus?.configured ? `Clave activa ${keyStatus.masked ?? ""}` : "Aún no hay clave guardada."}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <input className={input} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="fa-..." type="password" autoComplete="off" />
          <Button onClick={persistKey} disabled={busy !== null}>{busy === "key" ? "Guardando…" : "Guardar clave"}</Button>
          <Button variant="outline" onClick={test} disabled={busy !== null}>{busy === "test" ? "Probando…" : "Probar conexión"}</Button>
        </div>
        <p className="text-xs text-moss/60">Deja el campo vacío y guarda para eliminar la clave actual.</p>
      </section>
    </div>
  );
}
