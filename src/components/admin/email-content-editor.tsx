import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { previewAutoEmail } from "@/lib/email/order-email.functions";
import { PRODUCT_EVENTS, type EmailContent } from "@/lib/email/custom-content";

type Props = { event: string; title: string; content: EmailContent; onSave: (c: EmailContent) => Promise<void>; onClose: () => void };

export function EmailContentEditor({ event, title, content, onSave, onClose }: Props) {
  const [c, setC] = useState<EmailContent>(content ?? {});
  const [html, setHtml] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = useServerFn(previewAutoEmail);
  const set = (k: keyof EmailContent, v: any) => setC((x) => ({ ...x, [k]: v }));

  const upload = async (k: "heroImage" | "bannerImage", f?: File) => {
    if (!f) return;
    const path = `email/${Date.now()}-${f.name.replace(/[^\w.-]/g, "_")}`;
    const { error } = await supabase.storage.from("product-media").upload(path, f, { contentType: f.type, upsert: true });
    if (error) return toast.error("No se pudo subir la imagen");
    set(k, supabase.storage.from("product-media").getPublicUrl(path).data.publicUrl);
  };
  const runPreview = async () => {
    setBusy(true);
    try { setHtml((await preview({ data: { event: event as any, content: c as any } })).html); }
    catch { toast.error("No se pudo generar la vista previa"); }
    finally { setBusy(false); }
  };

  const input = "h-9 w-full border border-ink/20 bg-transparent px-3 text-sm";
  const area = "w-full border border-ink/20 bg-transparent px-3 py-2 text-sm";
  const Img = ({ k, label }: { k: "heroImage" | "bannerImage"; label: string }) => (
    <div className="space-y-1">
      <p className="text-xs text-ink/70">{label}</p>
      {c[k] && <div className="flex items-center gap-2"><img src={c[k]} alt="" className="h-16 w-auto border border-ink/10" /><button type="button" onClick={() => set(k, "")} className="text-xs underline">Quitar</button></div>}
      <input type="file" accept="image/*" onChange={(e) => upload(k, e.target.files?.[0])} className="text-xs" />
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-ink/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-5xl flex-col bg-ivory md:flex-row" onClick={(e) => e.stopPropagation()}>
        <div className="flex-1 space-y-5 overflow-y-auto p-6">
          <div className="flex items-start justify-between">
            <div><p className="text-[10px] uppercase tracking-[0.2em] text-ink/60">Personalizar correo</p><h2 className="font-nm text-xl uppercase">{title}</h2></div>
            <button onClick={onClose} aria-label="Cerrar"><X className="size-5" /></button>
          </div>
          <fieldset className="space-y-3"><legend className="mb-2 text-xs uppercase tracking-[0.16em]">Encabezado</legend>
            <Img k="heroImage" label="Imagen principal (arriba del saludo)" />
            <input className={input} placeholder="Enlace al tocar la imagen (opcional)" value={c.heroLink ?? ""} onChange={(e) => set("heroLink", e.target.value)} />
            <textarea className={area} rows={3} placeholder="Texto adicional al inicio (opcional)" value={c.intro ?? ""} onChange={(e) => set("intro", e.target.value)} />
          </fieldset>
          {PRODUCT_EVENTS.includes(event) && (
            <fieldset className="space-y-3"><legend className="mb-2 text-xs uppercase tracking-[0.16em]">Productos recomendados</legend>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!c.showProducts} onChange={(e) => set("showProducts", e.target.checked)} /> Mostrar 4 productos recomendados según lo que compró</label>
              <input className={input} placeholder="Título de la sección (ej. Combínalo con)" value={c.productsTitle ?? ""} onChange={(e) => set("productsTitle", e.target.value)} />
            </fieldset>
          )}
          <fieldset className="space-y-3"><legend className="mb-2 text-xs uppercase tracking-[0.16em]">Sección destacada</legend>
            <Img k="bannerImage" label="Imagen de la sección" />
            <input className={input} placeholder="Título" value={c.bannerTitle ?? ""} onChange={(e) => set("bannerTitle", e.target.value)} />
            <textarea className={area} rows={3} placeholder="Texto" value={c.bannerText ?? ""} onChange={(e) => set("bannerText", e.target.value)} />
            <input className={input} placeholder="Enlace (ej. /coleccion/back-to-selva)" value={c.bannerLink ?? ""} onChange={(e) => set("bannerLink", e.target.value)} />
          </fieldset>
          <fieldset className="space-y-3"><legend className="mb-2 text-xs uppercase tracking-[0.16em]">Cierre</legend>
            <textarea className={area} rows={2} placeholder="Texto final (opcional)" value={c.closing ?? ""} onChange={(e) => set("closing", e.target.value)} />
          </fieldset>
          <div className="flex gap-2">
            <button onClick={runPreview} disabled={busy} className="h-9 border border-ink px-4 text-xs uppercase tracking-[0.14em]">{busy ? "Generando…" : "Ver vista previa"}</button>
            <button onClick={async () => { await onSave(c); onClose(); }} className="h-9 bg-ink px-4 text-xs uppercase tracking-[0.14em] text-ivory">Guardar</button>
          </div>
        </div>
        <div className="flex-1 border-l border-ink/10 bg-background">
          {html ? <iframe title="Vista previa" srcDoc={html} className="h-full min-h-[60vh] w-full" /> : <p className="p-6 text-sm text-ink/60">Toca «Ver vista previa» para ver cómo queda el correo.</p>}
        </div>
      </div>
    </div>
  );
}
