import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Eye, Save, Upload, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { optimizeImageFile, uploadOptions } from "@/lib/media";
import { signupSettingsQuery } from "@/lib/signup-discount-query";
import { saveSignupSettings } from "@/lib/signup-discount.functions";
import { signupSettingsSchema, type SignupSettings } from "@/lib/signup-discount";
import { SignupDiscountDialog } from "@/components/storefront/signup-discount-popup";

export function SignupDiscountEditor() {
  const query = useQuery(signupSettingsQuery());
  const qc = useQueryClient();
  const saveSettings = useServerFn(saveSignupSettings);
  const [settings, setSettings] = useState<SignupSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  useEffect(() => { if (query.data) setSettings(query.data); }, [query.data]);
  const subscribers = useQuery({
    queryKey: ["signup-discount-subscribers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("signup_discount_subscribers").select("id,name,email,created_at").order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return data;
    },
  });
  if (query.isError) return <Button variant="outline" onClick={() => void query.refetch()}>Reintentar configuración</Button>;
  if (!settings) return <p className="text-sm text-moss">Cargando…</p>;
  const patch = (value: Partial<SignupSettings>) => setSettings({ ...settings, ...value });
  const fieldClass = "mt-1 w-full rounded-md border border-ink/20 bg-background px-3 py-2 text-sm";
  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-4"><h2 className="font-nm text-xl">Inscripción con descuento</h2><div className="flex gap-2"><Button variant="outline" onClick={() => setPreview(true)}><Eye className="size-4" /> Vista previa</Button><Button disabled={busy} onClick={async () => {
      setBusy(true);
      try { await saveSettings({ data: signupSettingsSchema.parse(settings) }); await qc.invalidateQueries({ queryKey: ["app-settings", "signup_discount"] }); toast.success("Ventana de inscripción guardada"); }
      catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo guardar"); }
      finally { setBusy(false); }
    }}><Save className="size-4" /> {busy ? "Guardando…" : "Guardar"}</Button></div></div>
    <label className="flex items-center gap-3 text-sm"><Switch checked={settings.enabled} onCheckedChange={(enabled) => patch({ enabled })} /> Activar ventana a los 10 segundos</label>
    <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="space-y-4">
        <label className="block text-sm">Descuento (%)<input className={fieldClass} type="number" min={1} max={100} step={1} value={settings.discountPct} onChange={(event) => patch({ discountPct: Number(event.target.value) })} /></label>
        <label className="block text-sm">Título<input className={fieldClass} maxLength={100} value={settings.title} onChange={(event) => patch({ title: event.target.value })} /></label>
        <label className="block text-sm">Texto<textarea className={fieldClass} rows={3} maxLength={400} value={settings.message} onChange={(event) => patch({ message: event.target.value })} /></label>
        <label className="block text-sm">Texto del botón<input className={fieldClass} maxLength={60} value={settings.buttonText} onChange={(event) => patch({ buttonText: event.target.value })} /></label>
        <label className="block text-sm">Mensaje de inscripción completada<textarea className={fieldClass} rows={2} maxLength={300} value={settings.successText} onChange={(event) => patch({ successText: event.target.value })} /></label>
      </div>
      <div className="space-y-3"><p className="text-sm">Imagen</p>{settings.imageUrl && <img src={settings.imageUrl} alt="Imagen de inscripción" className="max-h-80 w-full object-contain" />}<div className="flex flex-wrap gap-2"><Button variant="outline" asChild><label className={busy ? "pointer-events-none opacity-50" : "cursor-pointer"}><Upload className="size-4" /> Subir imagen<input type="file" className="sr-only" accept="image/*" disabled={busy} onChange={async (event) => {
        const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
        if (!file.type.startsWith("image/")) return toast.error("Selecciona una imagen");
        setBusy(true);
        try { const optimized = await optimizeImageFile(file, { maxDim: 1920, quality: 0.78 }); const path = `signup-discount/${crypto.randomUUID()}.webp`; const bucket = supabase.storage.from("product-media"); const { error } = await bucket.upload(path, optimized, uploadOptions(optimized)); if (error) throw error; patch({ imageUrl: bucket.getPublicUrl(path).data.publicUrl }); }
        catch { toast.error("No se pudo subir la imagen"); }
        finally { setBusy(false); }
      }} /></label></Button>{settings.imageUrl && <Button variant="ghost" size="icon" aria-label="Quitar imagen" title="Quitar imagen" onClick={() => patch({ imageUrl: "" })}><Trash2 className="size-4" /></Button>}</div></div>
    </div>
    <section className="border-t border-ink/15 pt-5"><h3 className="font-nm text-lg">Inscripciones</h3>{subscribers.isError ? <Button variant="outline" onClick={() => void subscribers.refetch()}>Reintentar inscripciones</Button> : <div className="mt-3 max-h-72 overflow-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b border-ink/15"><th className="py-2 pr-3">Nombre</th><th className="py-2 pr-3">Correo</th><th className="py-2">Fecha</th></tr></thead><tbody>{subscribers.data?.map((subscriber) => <tr key={subscriber.id} className="border-b border-ink/10"><td className="py-2 pr-3">{subscriber.name}</td><td className="py-2 pr-3 break-all">{subscriber.email}</td><td className="py-2 whitespace-nowrap">{new Date(subscriber.created_at).toLocaleDateString("es-CO")}</td></tr>)}</tbody></table>{subscribers.data?.length === 0 && <p className="py-4 text-sm text-moss">Aún no hay inscripciones.</p>}</div>}</section>
    <SignupDiscountDialog key={String(preview)} settings={settings} open={preview} onOpenChange={setPreview} preview />
  </div>;
}