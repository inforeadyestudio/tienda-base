import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ArrowUp, ArrowDown, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_B2B_SETTINGS, saveB2BSettings, useB2BBaseSettings, type B2BSettings, type B2BSlide } from "@/lib/b2b/portal";

export const Route = createFileRoute("/_authenticated/admin/b2b/portada")({
  component: B2BPortada,
});

async function uploadImage(file: File): Promise<string> {
  const path = `b2b/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, "")}`;
  const { error } = await supabase.storage.from("product-media").upload(path, file, { contentType: file.type });
  if (error) throw error;
  return supabase.storage.from("product-media").getPublicUrl(path).data.publicUrl;
}

function B2BPortada() {
  const { data } = useB2BBaseSettings();
  const qc = useQueryClient();
  const [form, setForm] = useState<B2BSettings>(DEFAULT_B2B_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => { if (data) setForm(data); }, [data]);

  const patch = (p: Partial<B2BSettings>) => setForm((f) => ({ ...f, ...p }));
  const patchSlide = (id: string, p: Partial<B2BSlide>) =>
    patch({ slides: form.slides.map((s) => (s.id === id ? { ...s, ...p } : s)) });

  const move = (i: number, dir: -1 | 1) => {
    const next = [...form.slides];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    const a = next[i]!; const b = next[j]!;
    next[i] = b; next[j] = a;
    patch({ slides: next });
  };

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      await saveB2BSettings(form);
      await qc.invalidateQueries({ queryKey: ["b2b-settings"] });
      setMsg("Guardado.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally { setSaving(false); }
  };

  return (
    <div className="p-6 md:p-10 max-w-4xl">
      <header className="mb-8">
        <p className="text-[10px] uppercase tracking-[0.2em] text-moss/70">Panel B2B</p>
        <h1 className="font-serif text-3xl md:text-4xl text-ink mt-1">Portada del portal</h1>
        <p className="text-sm text-ink/60 mt-2">Banner en carrusel, galería lookbook, fechas clave y condiciones comerciales.</p>
      </header>

      <Section title="Banner (carrusel)">
        <div className="space-y-4">
          {form.slides.map((s, i) => (
            <div key={s.id} className="rounded-2xl border border-ink/10 bg-white p-4 flex gap-4">
              <div className="w-32 shrink-0">
                <div className="aspect-[4/3] rounded-xl bg-ink/5 overflow-hidden">
                  {s.imageUrl && <img src={s.imageUrl} alt="" className="w-full h-full object-cover" />}
                </div>
                <label className="mt-2 flex items-center justify-center gap-1 text-[11px] text-ink/60 border border-ink/15 rounded-full py-1.5 cursor-pointer hover:bg-ink/5">
                  <Upload className="size-3" /> Imagen
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (file) patchSlide(s.id, { imageUrl: await uploadImage(file) });
                  }} />
                </label>
              </div>
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <Input label="Línea superior" value={s.eyebrow} onChange={(v) => patchSlide(s.id, { eyebrow: v })} />
                <Input label="Título" value={s.title} onChange={(v) => patchSlide(s.id, { title: v })} />
                <Input label="Subtítulo" value={s.subtitle} onChange={(v) => patchSlide(s.id, { subtitle: v })} />
                <Input label="Texto del botón" value={s.ctaLabel} onChange={(v) => patchSlide(s.id, { ctaLabel: v })} />
                <label className="flex items-center gap-2 text-[12px] text-ink/70">
                  <input type="checkbox" checked={s.active} onChange={(e) => patchSlide(s.id, { active: e.target.checked })} /> Visible
                </label>
                <div className="flex items-center gap-2 justify-end">
                  <button onClick={() => move(i, -1)} className="p-1.5 border border-ink/12 rounded-lg"><ArrowUp className="size-3.5" /></button>
                  <button onClick={() => move(i, 1)} className="p-1.5 border border-ink/12 rounded-lg"><ArrowDown className="size-3.5" /></button>
                  <button onClick={() => patch({ slides: form.slides.filter((x) => x.id !== s.id) })} className="p-1.5 border border-ink/12 rounded-lg text-[#c85a3a]"><Trash2 className="size-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
          <button
            onClick={() => patch({ slides: [...form.slides, { id: crypto.randomUUID(), imageUrl: "", eyebrow: "NUEVA COLECCIÓN", title: "", subtitle: "", ctaLabel: "Explorar colección", collectionSlug: "", active: true }] })}
            className="flex items-center gap-2 text-[12px] text-ink/70 border border-ink/15 rounded-full px-4 py-2 hover:bg-ink/5"
          >
            <Plus className="size-3.5" /> Agregar diapositiva
          </button>
        </div>
      </Section>

      <Section title="Galería lookbook">
        <div className="flex flex-wrap gap-3">
          {form.lookbook.map((url, i) => (
            <div key={url + i} className="relative w-24">
              <div className="aspect-[3/4] rounded-xl overflow-hidden bg-ink/5"><img src={url} alt="" className="w-full h-full object-cover" /></div>
              <button onClick={() => patch({ lookbook: form.lookbook.filter((_, j) => j !== i) })} className="absolute -top-2 -right-2 bg-white border border-ink/15 rounded-full p-1"><Trash2 className="size-3 text-[#c85a3a]" /></button>
            </div>
          ))}
          <label className="w-24 aspect-[3/4] rounded-xl border border-dashed border-ink/25 flex items-center justify-center cursor-pointer text-ink/40 hover:bg-ink/5">
            <Plus className="size-4" />
            <input type="file" accept="image/*" multiple className="hidden" onChange={async (e) => {
              const files = [...(e.target.files ?? [])];
              const urls = await Promise.all(files.map(uploadImage));
              patch({ lookbook: [...form.lookbook, ...urls] });
            }} />
          </label>
        </div>
      </Section>

      <Section title="Fechas clave">
        <div className="space-y-2">
          {form.keyDates.map((d) => (
            <div key={d.id} className="flex flex-wrap gap-2 items-end">
              <Input label="Hito" value={d.label} onChange={(v) => patch({ keyDates: form.keyDates.map((x) => x.id === d.id ? { ...x, label: v } : x) })} />
              <Input label="Fecha" value={d.date} onChange={(v) => patch({ keyDates: form.keyDates.map((x) => x.id === d.id ? { ...x, date: v } : x) })} />
              <button onClick={() => patch({ keyDates: form.keyDates.filter((x) => x.id !== d.id) })} className="p-2 border border-ink/12 rounded-lg text-[#c85a3a]"><Trash2 className="size-3.5" /></button>
            </div>
          ))}
          <button onClick={() => patch({ keyDates: [...form.keyDates, { id: crypto.randomUUID(), label: "", date: "", color: "#c2b28a" }] })} className="flex items-center gap-2 text-[12px] text-ink/70 border border-ink/15 rounded-full px-4 py-2 hover:bg-ink/5">
            <Plus className="size-3.5" /> Agregar fecha
          </button>
        </div>
      </Section>

      <Section title="Condiciones comerciales">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="text-[11px] text-ink/60">
            Moneda
            <select value={form.currency} onChange={(e) => patch({ currency: e.target.value as "USD" | "COP" })} className="mt-1 w-full border border-ink/15 rounded-lg px-3 py-2 text-[13px] bg-white">
              <option value="USD">USD</option><option value="COP">COP</option>
            </select>
          </label>
          <Input label="Tasa COP por USD" value={String(form.usdRate)} onChange={(v) => patch({ usdRate: Number(v) || 0 })} />
          <Input label="Descuento mayorista (%)" value={String(form.discountPct)} onChange={(v) => patch({ discountPct: Number(v) || 0 })} />
          <Input label="Mínimo de unidades" value={String(form.minUnits)} onChange={(v) => patch({ minUnits: Number(v) || 0 })} />
        </div>
        <div className="mt-3">
          <Input label="Versión de las condiciones" value={form.termsVersion} onChange={(v) => patch({ termsVersion: v })} />
        </div>
        <div className="mt-3">
          <div className="text-[10px] uppercase tracking-[0.14em] text-ink/50 mb-1">Condiciones de pago</div>
          <textarea value={form.paymentTerms} onChange={(e) => patch({ paymentTerms: e.target.value })} rows={8} className="w-full border border-ink/15 rounded-xl px-3 py-2 text-[13px] bg-white outline-none" />
        </div>
      </Section>

      <div className="flex items-center gap-3 mt-8">
        <button onClick={save} disabled={saving} className="bg-ink text-ivory text-sm px-6 py-3 rounded-full disabled:opacity-50">
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
        {msg && <span className="text-[12px] text-ink/60">{msg}</span>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-sm uppercase tracking-[0.18em] text-ink/50 mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Input({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="text-[11px] text-ink/60 block">
      {label}
      <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full border border-ink/15 rounded-lg px-3 py-2 text-[13px] bg-white outline-none" />
    </label>
  );
}
