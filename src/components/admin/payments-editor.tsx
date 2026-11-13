import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DEFAULT_PAYMENTS_SETTINGS,
  paymentsSettingsQuery,
  savePaymentsSettings,
  type PaymentMode,
  type PaymentsSettings,
} from "@/lib/payments";
import { paymentSecretStatus, savePaymentSecret } from "@/lib/payments.functions";
import { intlSettingsQuery, saveIntlSettings, type IntlSettings } from "@/lib/international";
import { gatewaySecretStatus, saveGatewaySecret } from "@/lib/international.functions";
import { publicUrl } from "@/lib/site";
import { boldCredentialStatus } from "@/lib/pagos/bold.functions";

type SecretName = "wompi_integrity" | "wompi_private" | "paypal_secret" | "addi_secret" | "addi_callback";

function Field({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-moss">{label}</span>
      <input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} className="w-full rounded-md border border-ink/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-ink" />
    </label>
  );
}

function ModeSelect({ value, onChange }: { value: PaymentMode; onChange: (value: PaymentMode) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-moss">Entorno</span>
      <select value={value} onChange={(event) => onChange(event.target.value as PaymentMode)} className="w-full rounded-md border border-ink/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-ink">
        <option value="sandbox">Pruebas</option>
        <option value="live">Producción</option>
      </select>
    </label>
  );
}

function Card({ title, description, enabled, onToggle, children }: { title: string; description: string; enabled: boolean; onToggle: (value: boolean) => void; children?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-ink/10 p-4">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-nm text-lg uppercase">{title}</h3>
          <p className="mt-1 text-xs text-moss">{description}</p>
        </div>
        <Switch checked={enabled} onCheckedChange={onToggle} />
      </header>
      {enabled && children && <div className="mt-4 grid gap-3 md:grid-cols-2">{children}</div>}
    </section>
  );
}

function SecretField({ label, hint, saved, onSave }: { label: string; hint: string; saved: boolean; onSave: (value: string) => Promise<void> }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="md:col-span-2 rounded-md border border-dashed border-ink/20 p-3">
      <Field label={label} value={value} onChange={setValue} type="password" placeholder={saved ? "Guardada · escribe para reemplazar" : hint} />
      <div className="mt-2 flex items-center gap-3">
        <Button size="sm" variant="outline" disabled={busy || !value.trim()} onClick={async () => { setBusy(true); try { await onSave(value); setValue(""); } finally { setBusy(false); } }}>Guardar credencial</Button>
        <span className="text-[11px] text-moss">{saved ? "Credencial guardada" : "Sin guardar"}</span>
      </div>
    </div>
  );
}

/** URL pública que se pega en el panel del proveedor para recibir sus avisos. */
function CopyField({ label, path, hint }: { label: string; path: string; hint: string }) {
  const url = publicUrl(path);
  return (
    <div className="md:col-span-2 rounded-md border border-ink/10 bg-ink/[0.03] p-3">
      <span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-moss">{label}</span>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate text-xs">{url}</code>
        <Button size="sm" variant="outline" onClick={() => { void navigator.clipboard?.writeText(url).then(() => toast.success("URL copiada")).catch(() => toast.error("No pudimos copiar la URL")); }}>Copiar</Button>
      </div>
      <p className="mt-1 text-[11px] text-moss">{hint}</p>
    </div>
  );
}

/** Configuración de pasarelas y transferencia manual de la tienda. */
export function PaymentsEditor() {
  const client = useQueryClient();
  const { data } = useQuery(paymentsSettingsQuery());
  const { data: intlData } = useQuery(intlSettingsQuery());
  const saveSecret = useServerFn(savePaymentSecret);
  const secretStatus = useServerFn(paymentSecretStatus);
  const boldStatus = useServerFn(boldCredentialStatus);
  const [boldConfigured, setBoldConfigured] = useState(false);
  const saveIntlSecret = useServerFn(saveGatewaySecret);
  const intlSecretStatus = useServerFn(gatewaySecretStatus);
  const [settings, setSettings] = useState<PaymentsSettings>(DEFAULT_PAYMENTS_SETTINGS);
  const [intl, setIntl] = useState<IntlSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<Record<SecretName, boolean>>({ wompi_integrity: false, wompi_private: false, paypal_secret: false, addi_secret: false, addi_callback: false });
  const [pagueloSaved, setPagueloSaved] = useState(false);

  useEffect(() => { if (data) setSettings(data); }, [data]);
  useEffect(() => { if (intlData) setIntl(intlData); }, [intlData]);
  useEffect(() => {
    secretStatus({ data: undefined }).then(setSaved).catch(() => undefined);
    boldStatus().then(s => setBoldConfigured(s.configured)).catch(() => undefined);
    intlSecretStatus({ data: undefined }).then((status) => setPagueloSaved(status.paguelofacil)).catch(() => undefined);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const patch = <K extends keyof PaymentsSettings>(key: K, value: Partial<PaymentsSettings[K]>) =>
    setSettings((current) => ({ ...current, [key]: { ...current[key], ...value } }));

  const save = async () => {
    setSaving(true);
    try {
      await savePaymentsSettings(settings);
      if (intl) await saveIntlSettings(intl);
      await client.invalidateQueries({ queryKey: ["store-settings"] });
      toast.success("Métodos de pago actualizados");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos guardar los pagos");
    } finally { setSaving(false); }
  };

  const storeSecret = async (name: SecretName, secret: string) => {
    try {
      await saveSecret({ data: { name, secret } });
      setSaved((current) => ({ ...current, [name]: Boolean(secret.trim()) }));
      toast.success("Credencial guardada");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No pudimos guardar la credencial");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="font-nm text-xl uppercase">Colombia</h2>
        <p className="text-xs text-moss">Métodos disponibles cuando la entrega es en Colombia.</p>
      </div>

      <Card title="Bold" description="Pago dentro de la tienda. Las ventas se procesan y liquidan en COP." enabled={settings.bold.enabled} onToggle={(enabled) => patch("bold", { enabled })}>
        <p className="text-xs text-moss md:col-span-2">{boldConfigured ? "Llaves guardadas de forma segura" : "Llaves pendientes de configuración segura"}</p>
        <label className="flex items-center justify-between gap-3 text-sm md:col-span-2"><span>Tarjetas internacionales con precio en US$ · pendiente de validar con Bold</span><Switch disabled checked={false} /></label>
        <CopyField label="URL de eventos Bold" path="/api/public/pagos/bold-eventos" hint="Regístrala en Bold después de publicar. No uses la URL de datáfonos del POS." />
      </Card>

      <Card title="Wompi" description="Tarjeta, PSE, Nequi y Bancolombia." enabled={settings.wompi.enabled} onToggle={(enabled) => patch("wompi", { enabled })}>
        <Field label="Llave pública" value={settings.wompi.publicKey} onChange={(publicKey) => patch("wompi", { publicKey })} placeholder="pub_test_..." />
        <ModeSelect value={settings.wompi.mode} onChange={(mode) => patch("wompi", { mode })} />
        <SecretField label="Secreto de integridad" hint="Firma de integridad de Wompi" saved={saved.wompi_integrity} onSave={(value) => storeSecret("wompi_integrity", value)} />
        <SecretField label="Llave privada (opcional)" hint="prv_test_..." saved={saved.wompi_private} onSave={(value) => storeSecret("wompi_private", value)} />
        <CopyField label="URL de eventos (webhook)" path="/api/public/pagos/wompi-eventos" hint="Pégala en el panel de Wompi para que confirme los pagos automáticamente, aunque la clienta cierre el navegador." />
      </Card>

      <Card title="Addi" description="Compra ahora y paga después, solo Colombia." enabled={settings.addi.enabled} onToggle={(enabled) => patch("addi", { enabled })}>
        <Field label="Identificador de aliado (ally slug)" value={settings.addi.allyId} onChange={(allyId) => patch("addi", { allyId })} placeholder="tumarca" />
        <ModeSelect value={settings.addi.mode} onChange={(mode) => patch("addi", { mode })} />
        <Field label="Client ID" value={settings.addi.clientId} onChange={(clientId) => patch("addi", { clientId })} placeholder="Lo entrega Addi al firmar el convenio" />
        <SecretField label="Client secret" hint="Secreto de la API de Addi" saved={saved.addi_secret} onSave={(value) => storeSecret("addi_secret", value)} />
        <Field label="Usuario de notificación" value={settings.addi.callbackUser} onChange={(callbackUser) => patch("addi", { callbackUser })} placeholder="Portal de aliados → Integraciones → Credenciales de notificación" />
        <SecretField label="Contraseña de notificación" hint="Portal de aliados → Integraciones → Credenciales de notificación" saved={saved.addi_callback} onSave={(value) => storeSecret("addi_callback", value)} />
        <CopyField label="URL de notificaciones" path="/api/public/pagos/addi-eventos" hint="Se envía sola en cada compra; guárdala solo como referencia si Addi la pide." />
      </Card>

      <Card title="Transferencia bancaria" description="La clienta transfiere, sube el comprobante y el pedido queda pendiente por confirmar." enabled={settings.transfer.enabled} onToggle={(enabled) => patch("transfer", { enabled })}>
        <Field label="Banco" value={settings.transfer.bankName} onChange={(bankName) => patch("transfer", { bankName })} placeholder="Bancolombia" />
        <Field label="Tipo de cuenta" value={settings.transfer.accountType} onChange={(accountType) => patch("transfer", { accountType })} placeholder="Ahorros" />
        <Field label="Número de cuenta" value={settings.transfer.accountNumber} onChange={(accountNumber) => patch("transfer", { accountNumber })} />
        <Field label="Titular" value={settings.transfer.holder} onChange={(holder) => patch("transfer", { holder })} />
        <Field label="NIT / Cédula" value={settings.transfer.documentId} onChange={(documentId) => patch("transfer", { documentId })} />
        <label className="block md:col-span-2">
          <span className="mb-1 block text-[11px] uppercase tracking-[0.14em] text-moss">Instrucciones</span>
          <textarea value={settings.transfer.instructions} onChange={(event) => patch("transfer", { instructions: event.target.value })} className="min-h-20 w-full rounded-md border border-ink/15 bg-transparent px-3 py-2 text-sm outline-none focus:border-ink" />
        </label>
      </Card>

      <div className="pt-2">
        <h2 className="font-nm text-xl uppercase">Internacional</h2>
        <p className="text-xs text-moss">Métodos disponibles fuera de Colombia, cobrados en dólares.</p>
      </div>

      <Card title="PayPal" description="Saldo PayPal o tarjeta internacional." enabled={settings.paypal.enabled} onToggle={(enabled) => patch("paypal", { enabled })}>
        <Field label="Client ID" value={settings.paypal.clientId} onChange={(clientId) => patch("paypal", { clientId })} />
        <ModeSelect value={settings.paypal.mode} onChange={(mode) => patch("paypal", { mode })} />
        <SecretField label="Client secret" hint="Secreto de la app de PayPal" saved={saved.paypal_secret} onSave={(value) => storeSecret("paypal_secret", value)} />
      </Card>

      {intl && (
        <Card title="Páguelo Fácil" description="Pasarela internacional de Panamá." enabled={intl.paguelofacil.enabled} onToggle={(enabled) => setIntl({ ...intl, paguelofacil: { ...intl.paguelofacil, enabled } })}>
          <Field label="CCLW" value={intl.paguelofacil.cclw} onChange={(cclw) => setIntl({ ...intl, paguelofacil: { ...intl.paguelofacil, cclw } })} />
          <ModeSelect value={intl.paguelofacil.mode === "live" ? "live" : "sandbox"} onChange={(mode) => setIntl({ ...intl, paguelofacil: { ...intl.paguelofacil, mode } })} />
          <SecretField
            label="Token privado"
            hint="Token de Páguelo Fácil"
            saved={pagueloSaved}
            onSave={async (value) => {
              try {
                await saveIntlSecret({ data: { gateway: "paguelofacil", secret: value } });
                setPagueloSaved(Boolean(value.trim()));
                toast.success("Credencial guardada");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "No pudimos guardar la credencial");
              }
            }}
          />
        </Card>
      )}

      <Button disabled={saving} onClick={save}>{saving ? "Guardando…" : "Guardar métodos de pago"}</Button>
    </div>
  );
}
