import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_INTL_SETTINGS, intlSettingsQuery, saveIntlSettings, type IntlSettings, type IntlZone } from "@/lib/international";
import { gatewaySecretStatus, saveGatewaySecret } from "@/lib/international.functions";
import { translateCatalog } from "@/lib/translate.functions";

const input = "w-full px-3 py-2 rounded-lg bg-white border border-ink/10 text-sm focus:outline-none focus:border-ink/30";
const label = "block text-[10px] uppercase tracking-widest text-moss/70 mb-1";

/** Configuración de la versión internacional: moneda, envíos y pasarelas fuera de Colombia. */
export function InternationalEditor() {
  const qc = useQueryClient();
  const { data: saved } = useQuery(intlSettingsQuery());
  const [settings, setSettings] = useState<IntlSettings>(DEFAULT_INTL_SETTINGS);
  const [paypalSecret, setPaypalSecret] = useState("");
  const [secondarySecret, setSecondarySecret] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const saveSecretFn = useServerFn(saveGatewaySecret);
  const statusFn = useServerFn(gatewaySecretStatus);
  const translateFn = useServerFn(translateCatalog);

  const { data: status } = useQuery({
    queryKey: ["intl-gateway-status"],
    queryFn: () => statusFn({ data: {} as never }),
    retry: false,
  });

  useEffect(() => {
    if (saved) setSettings(saved);
  }, [saved]);

  const patch = (value: Partial<IntlSettings>) => setSettings((current) => ({ ...current, ...value }));
  const patchZone = (id: string, value: Partial<IntlZone>) =>
    setSettings((current) => ({
      ...current,
      shipping: { ...current.shipping, zones: current.shipping.zones.map((zone) => (zone.id === id ? { ...zone, ...value } : zone)) },
    }));

  const addZone = () =>
    setSettings((current) => ({
      ...current,
      shipping: {
        ...current.shipping,
        zones: [...current.shipping.zones, { id: crypto.randomUUID(), name: "Nueva zona", countries: [], priceUsd: 50, enabled: true }],
      },
    }));

  const removeZone = (id: string) =>
    setSettings((current) => ({ ...current, shipping: { ...current.shipping, zones: current.shipping.zones.filter((zone) => zone.id !== id) } }));

  const persist = async () => {
    setBusy("settings");
    try {
      await saveIntlSettings(settings);
      qc.invalidateQueries({ queryKey: ["store-settings", "international"] });
      toast.success("Configuración internacional guardada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No pudimos guardar");
    } finally {
      setBusy(null);
    }
  };

  const persistSecret = async (gateway: "paguelofacil" | "secondary") => {
    setBusy(gateway);
    try {
      await saveSecretFn({ data: { gateway, secret: gateway === "paguelofacil" ? paypalSecret : secondarySecret } });
      gateway === "paguelofacil" ? setPaypalSecret("") : setSecondarySecret("");
      qc.invalidateQueries({ queryKey: ["intl-gateway-status"] });
      toast.success("Credencial guardada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No pudimos guardar la credencial");
    } finally {
      setBusy(null);
    }
  };

  const runTranslation = async () => {
    setBusy("translate");
    try {
      const result = await translateFn({ data: { overwrite: false } });
      toast.success(`Traducidos ${result.products} productos y ${result.collections} colecciones`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No pudimos traducir");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="space-y-4 rounded-lg border border-ink/10 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium">Versión internacional activa</p>
            <p className="mt-1 text-xs text-moss/75">Fuera de Colombia la tienda muestra precios en dólares y textos en inglés.</p>
          </div>
          <Switch checked={settings.enabled} onCheckedChange={(enabled) => patch({ enabled })} />
        </div>
        <label className="block max-w-xs">
          <span className={label}>Tasa de referencia (COP por 1 USD)</span>
          <input
            className={input}
            type="number"
            min={1}
            value={settings.usdRate}
            onChange={(e) => patch({ usdRate: Number(e.target.value) })}
          />
          <span className="mt-1 block text-xs text-moss/70">Solo se usa cuando una talla no tiene precio propio en dólares.</span>
        </label>
      </section>

      <p className="text-xs text-moss/75">Las tarifas de envío internacional ahora están en la pestaña Envíos.</p>

      <section className="space-y-4 rounded-lg border border-ink/10 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium">Páguelo Fácil</p>
            <p className="mt-1 text-xs text-moss/75">
              Disponible solo para clientas fuera de Colombia. {status?.paguelofacil ? "Credencial privada guardada." : "Falta la credencial privada."}
            </p>
          </div>
          <Switch checked={settings.paguelofacil.enabled} onCheckedChange={(enabled) => patch({ paguelofacil: { ...settings.paguelofacil, enabled } })} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label>
            <span className={label}>Entorno</span>
            <select className={input} value={settings.paguelofacil.mode}
              onChange={(e) => patch({ paguelofacil: { ...settings.paguelofacil, mode: e.target.value as "sandbox" | "live" } })}>
              <option value="sandbox">Pruebas</option>
              <option value="live">Real</option>
            </select>
          </label>
          <label>
            <span className={label}>CCLW (código de comercio)</span>
            <input className={input} value={settings.paguelofacil.cclw} onChange={(e) => patch({ paguelofacil: { ...settings.paguelofacil, cclw: e.target.value } })} />
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input className={input} type="password" autoComplete="off" placeholder="Token / Key privado" value={paypalSecret} onChange={(e) => setPaypalSecret(e.target.value)} />
          <Button onClick={() => persistSecret("paguelofacil")} disabled={busy !== null}>{busy === "paguelofacil" ? "Guardando…" : "Guardar credencial"}</Button>
        </div>
      </section>

      <section className="space-y-4 rounded-lg border border-ink/10 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium">Segunda pasarela internacional</p>
            <p className="mt-1 text-xs text-moss/75">
              Escribe el nombre que verá la clienta (por ejemplo Stripe o Mercado Pago) y guarda su credencial privada.{" "}
              {status?.secondary ? "Credencial guardada." : "Aún sin credencial."}
            </p>
          </div>
          <Switch checked={settings.secondary.enabled} onCheckedChange={(enabled) => patch({ secondary: { ...settings.secondary, enabled } })} />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <label>
            <span className={label}>Nombre visible</span>
            <input className={input} value={settings.secondary.name} onChange={(e) => patch({ secondary: { ...settings.secondary, name: e.target.value } })} />
          </label>
          <label>
            <span className={label}>Clave pública / merchant id</span>
            <input className={input} value={settings.secondary.publicKey} onChange={(e) => patch({ secondary: { ...settings.secondary, publicKey: e.target.value } })} />
          </label>
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <input className={input} type="password" autoComplete="off" placeholder="Clave privada" value={secondarySecret} onChange={(e) => setSecondarySecret(e.target.value)} />
          <Button onClick={() => persistSecret("secondary")} disabled={busy !== null}>{busy === "secondary" ? "Guardando…" : "Guardar clave"}</Button>
        </div>
      </section>

      <section className="space-y-3 rounded-lg border border-ink/10 bg-white p-4">
        <div>
          <p className="font-medium">Traducciones al inglés</p>
          <p className="mt-1 text-xs text-moss/75">Traduce nombres y descripciones de productos y colecciones que aún no tienen versión en inglés.</p>
        </div>
        <Button variant="outline" onClick={runTranslation} disabled={busy !== null}>{busy === "translate" ? "Traduciendo…" : "Traducir catálogo"}</Button>
      </section>

      <Button onClick={persist} disabled={busy !== null}>{busy === "settings" ? "Guardando…" : "Guardar configuración internacional"}</Button>
    </div>
  );
}
