import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ANNOUNCEMENTS_KEY, announcementsQuery, DEFAULT_ANNOUNCEMENTS, MarqueeBar, type Announcements } from "@/lib/announcements";

const BARS = [
  { key: "general", title: "Barra general", hint: "Arriba del menú en toda la tienda." },
  { key: "wholesale", title: "Barra de Wholesale", hint: "Debajo del menú en la página Wholesale. Si está activa, ahí no se muestra la general." },
] as const;

export function AnnouncementsEditor() {
  const qc = useQueryClient();
  const { data } = useQuery(announcementsQuery());
  const [s, setS] = useState<Announcements>(DEFAULT_ANNOUNCEMENTS);
  const [text, setText] = useState({ general: "", wholesale: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;
    setS(data);
    setText({ general: data.general.items.join("\n"), wholesale: data.wholesale.items.join("\n") });
  }, [data]);

  const lines = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean);

  async function save() {
    setSaving(true);
    const value = {
      general: { ...s.general, items: lines(text.general) },
      wholesale: { ...s.wholesale, items: lines(text.wholesale) },
    };
    const { error } = await supabase.from("app_settings").upsert({ key: ANNOUNCEMENTS_KEY, value: value as any }, { onConflict: "key" });
    setSaving(false);
    if (error) return toast.error("No se pudo guardar");
    await qc.invalidateQueries({ queryKey: ["app-settings", ANNOUNCEMENTS_KEY] });
    toast.success("Barras de anuncios guardadas");
  }

  return (
    <div className="space-y-5">
      {BARS.map(({ key, title, hint }) => (
        <div key={key} className="space-y-3 rounded-xl border border-ink/10 bg-ivory p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-nm text-base">{title}</p>
              <p className="text-xs text-moss/70">{hint}</p>
            </div>
            <Switch checked={s[key].enabled} onCheckedChange={(v) => setS({ ...s, [key]: { ...s[key], enabled: v } })} />
          </div>
          <div className="grid gap-3 md:grid-cols-[1fr_160px]">
            <label className="space-y-1">
              <span className="text-xs text-moss/70">Textos (uno por línea)</span>
              <Textarea rows={5} value={text[key]} onChange={(e) => setText({ ...text, [key]: e.target.value })} />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-moss/70">Velocidad (segundos por vuelta)</span>
              <Input type="number" min={5} max={120} value={s[key].speed} onChange={(e) => setS({ ...s, [key]: { ...s[key], speed: Number(e.target.value) || 30 } })} />
            </label>
          </div>
          <div className="overflow-hidden rounded-md">
            <MarqueeBar label="Vista previa" config={{ ...s[key], enabled: true, items: lines(text[key]) }} />
          </div>
        </div>
      ))}
      <Button onClick={save} disabled={saving}>{saving ? "Guardando…" : "Guardar barras"}</Button>
    </div>
  );
}
