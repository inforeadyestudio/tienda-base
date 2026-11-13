import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_CARRIER_SETTINGS,
  carrierSettingsQuery,
  saveCarrierSettings,
  type CarrierSettings,
} from "@/lib/carriers";
import { carrierSecretStatus, quoteSkydropx, saveCarrierSecret, testCarrierConnection, type SkydropxRate } from "@/lib/carriers.functions";

const input = "w-full px-3 py-2 rounded-lg bg-white border border-ink/10 text-sm focus:outline-none focus:border-ink/30";
const label = "block text-[10px] uppercase tracking-widest text-moss/70 mb-1";

function Field({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={label}>{title}</label>
      {children}
    </div>
  );
}

/** Conexión con Skydropx para cotizar y despachar envíos. */
export function CarriersEditor() {
  const qc = useQueryClient();
  const { data } = useQuery(carrierSettingsQuery());
  const saveSecret = useServerFn(saveCarrierSecret);
  const secretState = useServerFn(carrierSecretStatus);
  const testConnection = useServerFn(testCarrierConnection);
  const quote = useServerFn(quoteSkydropx);

  const [settings, setSettings] = useState<CarrierSettings>(DEFAULT_CARRIER_SETTINGS);
  const [secret, setSecret] = useState("");
  const [savedSecret, setSavedSecret] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [testZip, setTestZip] = useState("");
  const [testCity, setTestCity] = useState("");
  const [testProvince, setTestProvince] = useState("");
  const [rates, setRates] = useState<SkydropxRate[] | null>(null);

  useEffect(() => { if (data) setSettings(data); }, [data]);
  useEffect(() => { secretState({}).then((result) => setSavedSecret(result.saved)).catch(() => setSavedSecret(false)); }, [secretState]);

  const sky = settings.skydropx;
  const patch = (next: Partial<CarrierSettings["skydropx"]>) => setSettings((current) => ({ ...current, skydropx: { ...current.skydropx, ...next } }));
  const patchOrigin = (next: Partial<CarrierSettings["skydropx"]["origin"]>) => patch({ origin: { ...sky.origin, ...next } });
  const { data: locs } = useQuery({
    queryKey: ["carrier-origin-locations"],
    queryFn: async () => (await supabase.from("locations").select("id, name, city, kind").eq("active", true).in("kind", ["store", "warehouse", "ecom"]).order("name")).data ?? [],
  });
  const [openLoc, setOpenLoc] = useState<string | null>(null);
  const patchLocOrigin = (id: string, next: Partial<CarrierSettings["skydropx"]["origin"]>) =>
    patch({ origins: { ...sky.origins, [id]: { ...(sky.origins[id] ?? { ...sky.origin, street1: "", street2: "", city: "", province: "", zip: "" }), ...next } } });
  const patchParcel = (next: Partial<CarrierSettings["skydropx"]["parcel"]>) => patch({ parcel: { ...sky.parcel, ...next } });

  async function persist() {
    setBusy("save");
    try {
      await saveCarrierSettings(settings);
      await qc.invalidateQueries({ queryKey: ["store-settings", "carriers"] });
      toast.success("Configuración de Skydropx guardada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar");
    } finally { setBusy(null); }
  }

  return (
    <section className="rounded-lg border border-ink/10 bg-white p-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="font-nm text-lg uppercase">Skydropx</h3>
          <p className="mt-1 max-w-xl text-xs text-moss">
            Conecta tu cuenta de Skydropx Pro para cotizar guías con varias transportadoras. Copia el Client ID y el Client Secret
            desde tu panel de Skydropx en Conexiones → API.
          </p>
        </div>
        <Switch checked={sky.enabled} onCheckedChange={(enabled) => patch({ enabled })} />
      </header>

      {sky.enabled && (
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field title="Entorno">
              <select className={input} value={sky.mode} onChange={(event) => patch({ mode: event.target.value === "live" ? "live" : "sandbox" })}>
                <option value="sandbox">Pruebas</option>
                <option value="live">Producción</option>
              </select>
            </Field>
            <Field title="Client ID">
              <input className={input} value={sky.clientId} onChange={(event) => patch({ clientId: event.target.value })} placeholder="Client ID de Skydropx" />
            </Field>
            <div className="md:col-span-2 rounded-lg border border-dashed border-ink/20 p-3">
              <Field title="Client Secret">
                <input className={input} type="password" value={secret} onChange={(event) => setSecret(event.target.value)} placeholder={savedSecret ? "Guardado · escribe para reemplazar" : "Client Secret de Skydropx"} />
              </Field>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <Button size="sm" variant="outline" disabled={busy !== null || !secret.trim()} onClick={async () => {
                  setBusy("secret");
                  try { await saveSecret({ data: { secret } }); setSecret(""); setSavedSecret(true); toast.success("Credencial guardada"); }
                  catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo guardar"); }
                  finally { setBusy(null); }
                }}>Guardar credencial</Button>
                <span className="text-[11px] text-moss">{savedSecret ? "Credencial guardada" : "Sin guardar"}</span>
              </div>
            </div>
            <Field title="Transportadoras (opcional, separadas por coma)">
              <input className={input} value={sky.carriers} onChange={(event) => patch({ carriers: event.target.value })} placeholder="servientrega, coordinadora, interrapidisimo" />
            </Field>
            <div className="md:col-span-2 flex flex-wrap items-center gap-4 rounded-lg border border-ink/10 p-3">
              <div className="flex items-center gap-2">
                <Switch checked={sky.insure} onCheckedChange={(insure) => patch({ insure })} />
                <span className="text-sm">Tomar seguro (declarar el total del pedido)</span>
              </div>
              {!sky.insure && (
                <div className="w-48"><Field title="Valor declarado mínimo (COP)">
                  <input className={input} type="number" min="1" value={sky.minDeclaredCop} onChange={(event) => patch({ minDeclaredCop: Number(event.target.value) })} />
                </Field></div>
              )}
              <p className="w-full text-[11px] text-moss">Sin seguro, la guía se cotiza solo con el flete; si un paquete se pierde, la transportadora responde hasta el valor declarado.</p>
            </div>
          </div>

          <div>
            <p className="mb-3 text-[10px] uppercase tracking-widest text-moss/70">Dirección de origen</p>
            <div className="grid gap-4 md:grid-cols-2">
              <Field title="Nombre de quien despacha"><input className={input} value={sky.origin.name} onChange={(event) => patchOrigin({ name: event.target.value })} /></Field>
              <Field title="Empresa"><input className={input} value={sky.origin.company} onChange={(event) => patchOrigin({ company: event.target.value })} /></Field>
              <Field title="Dirección"><input className={input} value={sky.origin.street1} onChange={(event) => patchOrigin({ street1: event.target.value })} /></Field>
              <Field title="Complemento"><input className={input} value={sky.origin.street2} onChange={(event) => patchOrigin({ street2: event.target.value })} /></Field>
              <Field title="Ciudad"><input className={input} value={sky.origin.city} onChange={(event) => patchOrigin({ city: event.target.value })} /></Field>
              <Field title="Departamento / Estado"><input className={input} value={sky.origin.province} onChange={(event) => patchOrigin({ province: event.target.value })} /></Field>
              <Field title="Código postal"><input className={input} value={sky.origin.zip} onChange={(event) => patchOrigin({ zip: event.target.value })} /></Field>
              <Field title="País (2 letras)"><input className={input} value={sky.origin.country} maxLength={2} onChange={(event) => patchOrigin({ country: event.target.value.toUpperCase() })} /></Field>
              <Field title="Teléfono"><input className={input} value={sky.origin.phone} onChange={(event) => patchOrigin({ phone: event.target.value })} /></Field>
              <Field title="Correo"><input className={input} value={sky.origin.email} onChange={(event) => patchOrigin({ email: event.target.value })} /></Field>
            </div>
          </div>

          <div>
            <p className="mb-1 text-[10px] uppercase tracking-widest text-moss/70">Dirección por bodega</p>
            <p className="mb-3 text-[11px] text-moss">Cuando cada bodega despacha lo suyo, la guía sale desde su dirección. Si una bodega no tiene dirección, se usa la de origen.</p>
            <div className="space-y-2">
              {(locs ?? []).map((l: any) => {
                const o = sky.origins[l.id];
                const ready = !!(o?.street1 && o?.city && o?.province && o?.zip);
                return (
                  <div key={l.id} className="rounded-lg border border-ink/10 bg-white">
                    <button type="button" onClick={() => setOpenLoc(openLoc === l.id ? null : l.id)} className="flex w-full items-center justify-between px-3 py-2 text-sm">
                      <span className="text-ink">{l.name}</span>
                      <span className="text-[11px] text-moss">{ready ? `${o!.street1}, ${o!.city}` : "Usa la dirección de origen"}</span>
                    </button>
                    {openLoc === l.id && (
                      <div className="grid gap-3 border-t border-ink/10 p-3 md:grid-cols-2">
                        {([["name", "Nombre de quien despacha"], ["street1", "Dirección"], ["street2", "Complemento"], ["city", "Ciudad"], ["province", "Departamento"], ["zip", "Código postal"], ["phone", "Teléfono"], ["email", "Correo"]] as const).map(([k, t]) => (
                          <Field key={k} title={t}><input className={input} value={o?.[k] ?? ""} onChange={(e) => patchLocOrigin(l.id, { [k]: e.target.value })} /></Field>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-3 text-[10px] uppercase tracking-widest text-moss/70">Paquete estándar</p>
            <div className="grid gap-4 md:grid-cols-4">
              <Field title="Largo (cm)"><input className={input} type="number" min="1" value={sky.parcel.lengthCm} onChange={(event) => patchParcel({ lengthCm: Number(event.target.value) })} /></Field>
              <Field title="Ancho (cm)"><input className={input} type="number" min="1" value={sky.parcel.widthCm} onChange={(event) => patchParcel({ widthCm: Number(event.target.value) })} /></Field>
              <Field title="Alto (cm)"><input className={input} type="number" min="1" value={sky.parcel.heightCm} onChange={(event) => patchParcel({ heightCm: Number(event.target.value) })} /></Field>
              <Field title="Peso (kg)"><input className={input} type="number" min="0.1" step="0.1" value={sky.parcel.weightKg} onChange={(event) => patchParcel({ weightKg: Number(event.target.value) })} /></Field>
            </div>
          </div>

          <div className="rounded-lg bg-cream/60 p-4">
            <p className="mb-3 text-[10px] uppercase tracking-widest text-moss/70">Prueba rápida</p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-40"><Field title="Código postal de destino"><input className={input} value={testZip} onChange={(event) => setTestZip(event.target.value)} placeholder="050001" /></Field></div>
              <div className="w-40"><Field title="Ciudad destino"><input className={input} value={testCity} onChange={(event) => setTestCity(event.target.value)} placeholder="Medellín" /></Field></div>
              <div className="w-40"><Field title="Departamento destino"><input className={input} value={testProvince} onChange={(event) => setTestProvince(event.target.value)} placeholder="Antioquia" /></Field></div>
              <Button size="sm" variant="outline" disabled={busy !== null} onClick={async () => {
                setBusy("test");
                try { const result = await testConnection({}); result.ok ? toast.success(result.message) : toast.error(result.message); }
                finally { setBusy(null); }
              }}>Probar conexión</Button>
              <Button size="sm" variant="outline" disabled={busy !== null || testZip.trim().length < 3 || testCity.trim().length < 2 || testProvince.trim().length < 2} onClick={async () => {
                setBusy("quote");
                setRates(null);
                try { const result = await quote({ data: { zipTo: testZip.trim(), cityTo: testCity.trim(), provinceTo: testProvince.trim() } }); setRates(result.rates); if (!result.rates.length) toast.message("Skydropx no devolvió tarifas para ese destino."); }
                catch (error) { toast.error(error instanceof Error ? error.message : "No pudimos cotizar"); }
                finally { setBusy(null); }
              }}>Cotizar de prueba</Button>
            </div>
            {rates && rates.length > 0 && (
              <ul className="mt-4 space-y-2 text-sm">
                {rates.map((rate) => (
                  <li key={rate.id} className="flex items-center justify-between gap-3 rounded-md bg-white px-3 py-2">
                    <span className="capitalize">{rate.carrier} {rate.service && <span className="text-moss">· {rate.service}</span>}</span>
                    <span>{rate.amount.toLocaleString("es-CO")} {rate.currency}{rate.days ? ` · ${rate.days} días` : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="text-[11px] text-moss">Las credenciales se guardan cifradas en el servidor; nunca viajan al navegador de tus clientas.</p>
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <Button onClick={persist} disabled={busy !== null}>{busy === "save" ? "Guardando…" : "Guardar Skydropx"}</Button>
      </div>
    </section>
  );
}
