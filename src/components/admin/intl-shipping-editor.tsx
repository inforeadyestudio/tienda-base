import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { DEFAULT_INTL_SETTINGS, FEDEX_AVG_RATES, FEDEX_AVG_FALLBACK, type IntlCountryWeightRate, intlSettingsQuery, saveIntlSettings, type IntlSettings, type IntlZone } from "@/lib/international";

const input = "w-full px-3 py-2 rounded-lg bg-white border border-ink/10 text-sm focus:outline-none focus:border-ink/30";
const WEIGHTS = ["0,5", "1", "1,5", "2"];
const label = "block text-[10px] uppercase tracking-widest text-moss/70 mb-1";

/** Tarifas de envío internacional (USD): zonas, mínimo y tarifas por peso. */
export function IntlShippingEditor() {
  const qc = useQueryClient();
  const { data: saved } = useQuery(intlSettingsQuery());
  const [settings, setSettings] = useState<IntlSettings>(DEFAULT_INTL_SETTINGS);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (saved) setSettings(saved); }, [saved]);

  const ship = settings.shipping;
  const setShip = (value: Partial<IntlSettings["shipping"]>) => setSettings((c) => ({ ...c, shipping: { ...c.shipping, ...value } }));
  const patchZone = (id: string, value: Partial<IntlZone>) => setShip({ zones: ship.zones.map((z) => (z.id === id ? { ...z, ...value } : z)) });
  const patchCountry = (idx: number, value: Partial<IntlCountryWeightRate>) => setShip({ byWeight: { ...ship.byWeight, countries: ship.byWeight.countries.map((c, j) => (j === idx ? { ...c, ...value } : c)) } });

  const persist = async () => {
    setBusy(true);
    try {
      await saveIntlSettings(settings);
      await qc.invalidateQueries({ queryKey: ["store-settings", "international"] });
      toast.success("Envío internacional guardado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No pudimos guardar");
    } finally { setBusy(false); }
  };

  return (
    <section className="space-y-5 rounded-lg border border-ink/10 bg-white p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-medium">Envío internacional</p>
          <p className="mt-1 text-xs text-moss/75">Compras online fuera de Colombia. Todos los valores en dólares, incluido Panamá.</p>
        </div>
        <Button onClick={() => void persist()} disabled={busy}>{busy ? "Guardando…" : "Guardar envío internacional"}</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <label><span className={label}>Envío mínimo (USD)</span>
          <input className={input} type="number" min={0} value={ship.minUsd} onChange={(e) => setShip({ minUsd: Math.max(0, Number(e.target.value)) })} /></label>
        <label><span className={label}>Tarifa si ninguna zona coincide (USD)</span>
          <input className={input} type="number" min={0} value={ship.defaultUsd} onChange={(e) => setShip({ defaultUsd: Math.max(0, Number(e.target.value)) })} /></label>
        <label><span className={label}>Envío gratis desde (USD, 0 = nunca)</span>
          <input className={input} type="number" min={0} value={ship.freeFromUsd} onChange={(e) => setShip({ freeFromUsd: Math.max(0, Number(e.target.value)) })} /></label>
      </div>

      <div className="space-y-3">
        <p className={label}>Zonas</p>
        {ship.zones.map((zone) => (
          <div key={zone.id} className="grid gap-3 rounded-lg border border-ink/10 p-3 md:grid-cols-[1.2fr_2fr_7rem_auto_auto] md:items-end">
            <label><span className={label}>Zona</span><input className={input} value={zone.name} onChange={(e) => patchZone(zone.id, { name: e.target.value })} /></label>
            <label><span className={label}>Países (separados por coma; vacío = resto del mundo)</span>
              <input className={input} value={zone.countries.join(", ")} onChange={(e) => patchZone(zone.id, { countries: e.target.value.split(",").map((c) => c.trim()).filter(Boolean) })} /></label>
            <label><span className={label}>USD</span><input className={input} type="number" min={0} value={zone.priceUsd} onChange={(e) => patchZone(zone.id, { priceUsd: Number(e.target.value) })} /></label>
            <div className="pb-2"><Switch checked={zone.enabled} onCheckedChange={(enabled) => patchZone(zone.id, { enabled })} /></div>
            <Button variant="outline" onClick={() => setShip({ zones: ship.zones.filter((z) => z.id !== zone.id) })}>Quitar</Button>
          </div>
        ))}
        <Button variant="outline" onClick={() => setShip({ zones: [...ship.zones, { id: crypto.randomUUID(), name: "Nueva zona", countries: [], priceUsd: 30, enabled: true }] })}>Añadir zona</Button>
      </div>

      <div className="space-y-3 rounded-lg border border-ink/10 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium">Cobrar por peso</p>
            <p className="mt-1 text-xs text-moss/75">Usa el peso de cada tipo de prenda (Configuración → Tipos de prenda). Apagado, se cobra la tarifa de la zona. Nunca baja del envío mínimo.</p>
          </div>
          <Switch checked={ship.byWeight.enabled} onCheckedChange={(enabled) => setShip({ byWeight: { ...ship.byWeight, enabled } })} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="text-left text-[10px] uppercase tracking-widest text-moss/70">
              <th className="py-1">País</th>{WEIGHTS.map((w) => <th key={w} className="py-1">{w} kg (COP)</th>)}<th />
            </tr></thead>
            <tbody>
              {ship.byWeight.countries.map((row, idx) => (
                <tr key={idx}>
                  <td className="pr-2 py-1"><input className={input} value={row.country} onChange={(e) => patchCountry(idx, { country: e.target.value })} /></td>
                  {row.cop.map((v, i) => (
                    <td key={i} className="pr-2 py-1"><input className={input} type="number" min={0} step={1000} value={v} onChange={(e) => { const cop = [...row.cop] as typeof row.cop; cop[i] = Number(e.target.value); patchCountry(idx, { cop }); }} /></td>
                  ))}
                  <td><Button variant="outline" size="sm" onClick={() => setShip({ byWeight: { ...ship.byWeight, countries: ship.byWeight.countries.filter((_, j) => j !== idx) } })}>Quitar</Button></td>
                </tr>
              ))}
              <tr>
                <td className="pr-2 py-1 text-xs text-moss/75">Otros países</td>
                {ship.byWeight.fallbackCop.map((v, i) => (
                  <td key={i} className="pr-2 py-1"><input className={input} type="number" min={0} step={1000} value={v} onChange={(e) => { const f = [...ship.byWeight.fallbackCop] as typeof ship.byWeight.fallbackCop; f[i] = Number(e.target.value); setShip({ byWeight: { ...ship.byWeight, fallbackCop: f } }); }} /></td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-moss/75">Más de 2 kg: tarifa de 2 kg + la diferencia entre 1,5 y 2 kg por cada 0,5 kg extra. El checkout lo muestra en dólares con la tasa configurada.</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setShip({ byWeight: { ...ship.byWeight, countries: [...ship.byWeight.countries, { country: "", cop: [...ship.byWeight.fallbackCop] as typeof ship.byWeight.fallbackCop }] } })}>Añadir país</Button>
          <Button variant="outline" onClick={() => setShip({ byWeight: { ...ship.byWeight, countries: FEDEX_AVG_RATES, fallbackCop: FEDEX_AVG_FALLBACK } })}>Recargar promedios FedEx</Button>
        </div>
      </div>
    </section>
  );
}
