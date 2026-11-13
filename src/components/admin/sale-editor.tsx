import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { saleSettingsQuery, saveSaleSettings } from "@/lib/store-settings";
import { DEFAULT_SALE_SETTINGS, saleBogotaInput, saleBogotaToISO } from "@/lib/product-sale";

export function SaleEditor() {
  const qc = useQueryClient();
  const { data, isPending, error } = useQuery(saleSettingsQuery());
  const [settings, setSettings] = useState(DEFAULT_SALE_SETTINGS);
  const [end, setEnd] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (data) { setSettings(data); setEnd(saleBogotaInput(data.endsAt)); } }, [data]);
  async function save() {
    const endsAt = saleBogotaToISO(end);
    if (settings.enabled && (!endsAt || Date.parse(endsAt) <= Date.now())) {
      toast.error("Elige una fecha y hora de finalización futura"); return;
    }
    setSaving(true);
    try {
      await saveSaleSettings({ ...settings, endsAt });
      await qc.invalidateQueries({ queryKey: ["store-settings", "sale"] });
      toast.success("Sale actualizado");
    } catch { toast.error("No se pudo guardar el Sale"); }
    finally { setSaving(false); }
  }
  return <section className="max-w-2xl space-y-6">
    <h2 className="font-nm text-xl">Sale</h2>
    {error && <p className="text-sm text-destructive">No se pudo cargar la configuración.</p>}
    <label className="flex items-center justify-between gap-4 text-sm"><span>Activar cuenta regresiva</span><Switch checked={settings.enabled} onCheckedChange={(enabled) => setSettings((s) => ({ ...s, enabled }))} /></label>
    <label className="block space-y-2"><span className="block text-sm">Fecha y hora de finalización · Colombia (UTC−5)</span><input aria-label="Finalización del Sale" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm" /></label>
    <label className="flex items-center justify-between gap-4 text-sm"><span>Mostrar visitantes conectados en el producto</span><Switch checked={settings.showViewers} onCheckedChange={(showViewers) => setSettings((s) => ({ ...s, showViewers }))} /></label>
    <Button onClick={() => void save()} disabled={saving || isPending || Boolean(error)}>{saving ? "Guardando…" : "Guardar Sale"}</Button>
  </section>;
}